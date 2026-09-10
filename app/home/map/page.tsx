'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, VenueDot } from '@/components/ui';
import { DayStrip } from '@/components/DayStrip';
import { walkMinutesBetween } from '@/lib/dataset';
import { isLocationStale, minutesSince, walkMinutesToVenue } from '@/lib/geo';
import { buildMapView } from '@/lib/sapporoGrid';
import { useApp } from '@/store/AppContext';
import styles from './page.module.css';

/**
 * 選択中の丸の直径。**ピンの枠の高さでもある。**
 * `.pin` の translateY はこの値を前提に位置を合わせてある。片方だけ変えないこと。
 */
const PIN_DOT_MAX = 44;

/**
 * 会場マップの高さ。
 *
 * **会場は南北に長く並んでいる**（ACU 北4条 〜 北洋銀行 大通）。
 * 横長の枠に収めると、縦横の縮尺を揃えるために左右へ大きく余白が要り、
 * **会場が中央に小さく固まる。** 縦を伸ばすほうが素直。
 */
const CANVAS_HEIGHT = 360;

/**
 * 地図の倍率。**3段しかない。**
 *
 * 🔴 **公式が会場を15に増やし、等倍では街区が20px前後になった。**
 * **会場ピンの丸は24px。街区より大きい。** どの会場がどの区画にあるのか、
 * 等倍では読めない。会場が4つだった頃は36px前後あった。
 *
 * ⚠️ **「その日に使う会場だけを枠に入れる」案では足りない**（アプリ側で実測）。
 * 5日のうち3日が、その日の会場だけに絞っても足りないままだった。
 *
 * ## なぜピンチではなく3段なのか
 *
 * **ピンは絶対配置のまま、地図の実寸だけを倍にしている。**
 * だから拡大してもピンと会場名の大きさは変わらず、**逆スケールの補正が要らない。**
 * スクロールは `overflow: auto` に任せるので、**境界の制限も自前で書かなくていい。**
 * ピンのクリックとドラッグの取り合いも起きない。
 *
 * 自由な倍率は要らない。**この地図の目的は「会場どうしの位置関係が
 * 一目で分かること」だけ**（lib/sapporoGrid.ts 冒頭）。
 */
const ZOOMS = [
  { scale: 1, label: '広域' },
  { scale: 2, label: '標準' },
  { scale: 3, label: '拡大' },
] as const;

/**
 * 会場マップ。
 *
 * 会場の位置関係と、徒歩時間（判定エンジンの入力）を確認できることを優先する（#4）。
 *
 * ## この地図が引き受ける範囲
 *
 * **Googleマップに勝とうとはしていない。ドメインが違う。**
 * 経路案内も詳細な道のりも狙わない。**「地図らしさ」を出すこと**が目的で、
 * 実際の道順は住所をコピーして、いつも使っている地図アプリに渡す。
 *
 * ## 現在地について
 *
 * **押さなければ位置情報を取りに行かない。** 起動しただけで許可を求めると、
 * 何のために使うのか分からないまま断られる。ここで「現在地から測る」を
 * 押した人にだけ聞く。**拒否されても壊れない。**
 */
export default function MapTab() {
  return (
    <Suspense fallback={null}>
      <MapTabContent />
    </Suspense>
  );
}

function MapTabContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dataset, day, setDay, plan, location, locationStatus, locationAt, requestLocation } = useApp();

  /**
   * 画面を開いたら取り直す。**すでに許可されている場合だけ。**
   *
   * 位置情報を一度きりしか取らないと、利用者が歩いたあとも古い座標で
   * 「現在地から徒歩3分」と言い続けることになる。
   * 許可されていない状態では何もしない（押されるまで許可を求めない約束を破らない）。
   */
  useEffect(() => {
    if (locationStatus === 'granted') void requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ageMinutes = locationAt === null ? null : minutesSince(locationAt, Date.now());
  const stale = locationAt !== null && isLocationStale(locationAt, Date.now());
  const [pickedId, setPickedId] = useState(dataset.venues[0].id);
  /*
    住所をコピーしたか。**会場を切り替えたら消す。**
    別の会場を見ているのに「コピーしました」が残っていると、
    どちらの住所が入っているのか分からなくなる。
  */
  const [copiedFor, setCopiedFor] = useState<string | null>(null);

  /**
   * 「地図で見る」から渡された会場を選ぶ。
   *
   * 適用したらクエリパラメータを消す。**同じ会場から続けて飛べるようにするため**で、
   * 残したままだと値が変わらず、手で別の会場を選んだあとに同じ会場から飛んでも
   * 何も起きない。消すことで undefined → 会場ID と必ず変化する。
   */
  const venueParam = searchParams.get('venue');
  useEffect(() => {
    if (!venueParam) return;
    if (dataset.venues.some((v) => v.id === venueParam)) setPickedId(venueParam);
    router.replace('/home/map');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueParam]);

  // データが差し替わって選択中の会場が消えることがある。その場合は先頭に戻す
  const picked = dataset.venues.find((v) => v.id === pickedId) ?? dataset.venues[0];
  const copied = copiedFor === picked.id;
  const todays = dataset.sessions.filter((s) => s.day === day && s.venueId === picked.id);
  const plannedHere = plan.filter((p) => p.session.venueId === picked.id);

  // 起点は「現在地」→「その日の最初の予定の会場」の順。
  const originVenueId = plan.length > 0 ? plan[0].session.venueId : null;
  const origin = originVenueId ? dataset.venues.find((v) => v.id === originVenueId) ?? null : null;

  const fromHere = walkMinutesToVenue(location, picked);
  const walkFromPlan = originVenueId ? walkMinutesBetween(dataset, originVenueId, picked.id) : null;

  /*
    描画領域の実寸。**縦横の縮尺を揃えるのに要る**ので、測ってから組み立てる。
    測る前の1フレームだけ、仮の比で描く。
  */
  const canvasRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 320, height: CANVAS_HEIGHT });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      // 端数で毎フレーム組み直さない
      setBox((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /*
    倍率と、窓の内側の幅。**窓は倍率で変わらない**ので box とは別に測る。
    box は中身（拡大後の地図）の実寸で、窓はそれを覗く枠。
  */
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOMS[zoomIndex].scale;
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(320);

  /*
    🔴 **通りの名前を、窓の縁に貼り付けておくために要る。**

    「北4条」は地図の左端、「西7」は下端に置いている。地図と一緒に流れると
    **拡大した瞬間に窓の外へ出て、「条」だけが見える壊れた表示になる。**
    スクロールした量だけ内側へずらして、常に窓の縁に見えるようにする。

    ⚠️ **会場のピンは追随させない。** あれは場所そのものなので、
    地図と一緒に動くのが正しい。動かしてはいけないのは**目盛りのほう。**
  */
  const [scroll, setScroll] = useState({ left: 0, top: 0 });

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setFrameW((prev) => (Math.abs(prev - width) < 1 ? prev : width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /*
    会場と現在地が全部入る枠を決める。

    🔴 **会場は実測の緯度経度で置く。** 住所どおりの格子点に置くと、
    建物の実際の位置と最大150mずれる（赤れんが庁舎は敷地が広く、建物は南東寄り）。
    実測で置けば、会場が通りと通りのあいだ＝街区の中に収まり、見た目としても正しい。
  */
  const view = useMemo(() => {
    const points = dataset.venues
      .map((v) => v.coords)
      .filter((c): c is { lat: number; lng: number } => c !== undefined);
    if (location) points.push(location);
    return buildMapView(points, box.width / box.height);
  }, [dataset.venues, location, box.width, box.height]);

  /*
    🔴 **座標が無い会場を、地図に嘘の位置で描かない。**

    以前は座標が無ければ `x`/`y`（手で置いた相対座標）に落としていたが、
    **新しい会場の x/y は 0 なので、全部が左上の角に重なった。**
    公式は会期が近づくほど会場を足す。**「まだ測っていない」は通常の状態。**

    地図から消したままにもしない。**消えたことに気づけないと
    「載っていない＝無い」と読まれる。** 地図のすぐ下に名前を並べ、
    押せば選べるようにする。会場カードの中身は地図に出ているものと変わらない。
  */
  const onMap = dataset.venues.filter(
    (v): v is typeof v & { coords: NonNullable<typeof v.coords> } =>
      v.coords !== undefined,
  );
  const offMap = dataset.venues.filter((v) => v.coords === undefined);

  /** 通りの太さ。街区の1割ほど。**枠が広がると相対的に細くなる** */
  const roadW = Math.max(3, Math.round(box.width * view.blockWidth * 0.22));
  const roadH = Math.max(3, Math.round(box.height * view.blockHeight * 0.22));

  /*
    🔴 **通りの名前を、読める間隔まで間引く。**

    会場が4つだった頃は範囲が狭く、全部の通りに名前を出しても重ならなかった。
    **15会場では北9条〜南9条・西18〜西1が入り、名前が団子になって
    1本も読めなくなった**（実機で確認）。

    街区の実寸から、文字が重ならない本数を出して間引く。
    **拡大すれば街区が広がるので、自動的に本数が戻る。**

    ⚠️ **間引くのは名前だけ。通りそのものは全部描く。**
    地図らしく見えるかどうかは塗り分けで決まるので、線を減らすと地図でなくなる。
  */
  const blockPxY = box.height * view.blockHeight;
  const blockPxX = box.width * view.blockWidth;
  /** 文字の高さぶん（約14px）と、「西18」の幅ぶん（約30px）を空ける */
  const labelStepY = Math.max(1, Math.ceil(14 / Math.max(1, blockPxY)));
  const labelStepX = Math.max(1, Math.ceil(30 / Math.max(1, blockPxX)));

  /*
    🔴 **倍率を上げたら、選んでいる会場を窓の中央へ持ってくる。**

    そうしないと、拡大した瞬間に**左上の隅**が映る。会場を選んでから
    拡大するのは「そこを大きく見たい」ときなので、
    **選んだ会場が画面の外にある拡大は、使えない拡大になる。**

    ⚠️ **なめらかに動かさない（behavior は既定の 'auto'）。**
    smooth は毎フレーム進む方式で、**タブが裏にあるあいだ止まる。**
    倍率のボタンは「そこを見たい」ときに押すので、待たせる意味もない。

    ⚠️ **依存は倍率だけ。** 会場を選び直すたびに動かすと、
    **もう見えているピンのために地図が動く。**
  */
  useEffect(() => {
    const el = scrollRef.current;
    const c = picked?.coords;
    if (!el || !c) return;
    const at = view.place(c);
    el.scrollTo({
      left: Math.max(0, at.x * frameW * zoom - frameW / 2),
      top: Math.max(0, at.y * CANVAS_HEIGHT * zoom - CANVAS_HEIGHT / 2),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  return (
    <div className={styles.screen}>
      {/*
        🔴 **倍率のボタンは、行を増やさずに見出しの行へ入れる。**

        地図の中に浮かせるのは駄目（枠は会場が全部入るように決めているので
        **どの隅にもピンが来て**、重なって押せなくなる）。
        地図の下に1行足すと、その分だけ下の中身が画面から出る。
      */}
      <div className={styles.header}>
        <h1 className={styles.title}>会場マップ</h1>
        <div className={styles.zoomBar}>
          {ZOOMS.map((z, i) => (
            <button
              key={z.scale}
              type="button"
              onClick={() => setZoomIndex(i)}
              aria-pressed={i === zoomIndex}
              aria-label={`地図の倍率 ${z.label}${i === zoomIndex ? '（選択中）' : ''}`}
              className={`${styles.zoomChip} ${i === zoomIndex ? styles.zoomChipActive : ''}`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/*
        🔴 **地図らしく見えるかどうかは、線の有無ではなく塗り分けで決まる。**
        地が街区の色、通りが白、大通公園が緑、創成川が青。
        以前は淡い地に淡い線を1本引いていて、実機では何も見えなかった。

        描く順は 下から 通り → 公園 → 川 → 名前 → 会場。
      */}
      {/*
        🔴 **窓と中身を分ける。** 外の div が窓（高さ固定・角丸・枠線）、
        中の div が地図そのもので、倍率のぶんだけ実寸が大きくなる。
        スクロールは `overflow: auto` に任せる。**境界の制限を自前で書かない。**
      */}
      <div className={styles.canvasFrame} ref={frameRef}>
        <div
          className={styles.canvasScroll}
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setScroll({ left: el.scrollLeft, top: el.scrollTop });
          }}
          // 等倍のときは全部入っているので、動かせないほうが迷わない
          style={{ overflow: zoom > 1 ? 'auto' : 'hidden' }}
        >
          <div
            className={styles.canvas}
            ref={canvasRef}
            style={{ width: frameW * zoom, height: CANVAS_HEIGHT * zoom }}
          >
            {view.streets.map((st) => (
              <div
                key={`s-${st.label}`}
                className={`${styles.road} ${st.park ? styles.park : ''}`}
                style={{
                  top: `${st.at * 100}%`,
                  height: st.park ? roadH * 2.4 : roadH,
                  marginTop: -(st.park ? roadH * 2.4 : roadH) / 2,
                }}
              />
            ))}
            {view.avenues.map((av) => (
              <div
                key={`a-${av.label}`}
                className={`${styles.roadV} ${av.river ? styles.river : ''}`}
                style={{
                  left: `${av.at * 100}%`,
                  width: av.river ? roadW * 1.2 : roadW,
                  marginLeft: -(av.river ? roadW * 1.2 : roadW) / 2,
                }}
              />
            ))}
            {view.streets.map((st, i) => (
              <span
                key={`sl-${st.label}`}
                hidden={i % labelStepY !== 0}
                className={styles.streetLabel}
                style={{ top: `${st.at * 100}%`, left: scroll.left + 4 }}
              >
                {st.label}
              </span>
            ))}
            {view.avenues.map((av, i) => (
              <span
                key={`al-${av.label}`}
                hidden={i % labelStepX !== 0}
                className={styles.avenueLabel}
                style={{
                  left: `${av.at * 100}%`,
                  top: scroll.top + CANVAS_HEIGHT - 12,
                }}
              >
                {av.label}
              </span>
            ))}

            {/*
              現在地。**押した瞬間の座標を1点だけ打つ。** 追いかけない。
              「◯分前に取得した位置です」と時点を出す作りと揃える。
            */}
            {location && (
              <div
                className={`${styles.youAreHere} ${stale ? styles.youAreHereStale : ''}`}
                style={{ left: `${view.place(location).x * 100}%`, top: `${view.place(location).y * 100}%` }}
              />
            )}

            {/*
              選択中は「大きさ・色・縁取り・名前の濃さ」を同時に変える。
              **色だけで区別しない。** 色覚特性によっては伝わらないので、
              サイズと縁取りを必ず併用する
            */}
            {onMap.map((v) => {
              const active = pickedId === v.id;
              const pos = view.place(v.coords);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setPickedId(v.id)}
                  aria-pressed={active}
                  aria-label={`${v.name}${active ? '（選択中）' : ''}`}
                  className={`${styles.pin} ${active ? styles.pinActive : ''}`}
                  style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                >
                  <span className={styles.pinDotSlot}>
                    <VenueDot letter={v.letter} size={active ? PIN_DOT_MAX : 24} tone={active ? 'selected' : 'muted'} />
                  </span>
                  <span className={`${styles.pinName} ${active ? styles.pinNameActive : ''}`}>{v.name}</span>
                </button>
              );
            })}

          </div>
        </div>

        {/*
          🔴 **方角と起点は、スクロールの外に置く。**

          地図の中に置いていたら、**拡大して動かした瞬間に画面から流れ出る。**
          倍率を上げるほど方角が要るのに、上げるほど見えなくなってしまう。
        */}
        <div className={styles.compass}>
          <span className={styles.compassArrow}>▲</span>
          <span className={styles.compassText}>北</span>
        </div>

        <div className={styles.here}>
          <span className={styles.hereText}>
            {location ? '起点: 現在地' : origin ? `起点: ${origin.name}` : '起点がありません'}
          </span>
        </div>
      </div>

      {offMap.length > 0 && (
        <div className={styles.offMapBar}>
          <p className={styles.offMapHead}>{`地図に出せていない会場（${offMap.length}）`}</p>
          <div className={styles.offMapRow}>
            {offMap.map((v) => {
              const active = pickedId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setPickedId(v.id)}
                  aria-pressed={active}
                  aria-label={`${v.name}${active ? '（選択中）' : ''}`}
                  className={`${styles.offMapChip} ${active ? styles.offMapChipActive : ''}`}
                >
                  {v.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.content}>
        {/* 位置情報の導線。**押されるまで許可を求めない。** */}
        {location ? (
          <div className={`${styles.locBox} ${stale ? styles.locBoxStale : ''}`}>
            <p className={`${styles.locText} ${stale ? styles.locTextStale : ''}`}>
              {ageMinutes === null
                ? '現在地を使っています。'
                : stale
                  ? `${ageMinutes}分前に取得した位置を使っています。移動したなら取り直してください。`
                  : ageMinutes === 0
                    ? 'たった今の現在地を使っています。'
                    : `${ageMinutes}分前の現在地を使っています。`}
            </p>
            <Button
              label={locationStatus === 'loading' ? '取得中…' : '現在地を取り直す'}
              variant="outline"
              disabled={locationStatus === 'loading'}
              onPress={() => requestLocation()}
            />
          </div>
        ) : (
          <div className={styles.locBox}>
            <p className={styles.locText}>
              {locationStatus === 'denied'
                ? 'ブラウザの設定から位置情報の許可を確認してください。許可すると、いまいる場所から各会場までの徒歩時間が出ます。'
                : locationStatus === 'unavailable'
                  ? '現在地を取得できませんでした。屋内では取れないことがあります。'
                  : 'いまいる場所から各会場まで、徒歩で何分かかるかを出せます。位置情報はブラウザの中だけで使い、外部に送信しません。'}
            </p>
            <Button
              label={locationStatus === 'loading' ? '取得中…' : '現在地から測る'}
              variant="outline"
              disabled={locationStatus === 'loading'}
              onPress={() => requestLocation()}
            />
          </div>
        )}

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <VenueDot letter={picked.letter} size={30} />
            <div className={styles.cardHeadText}>
              <p className={styles.cardTitle}>{picked.name}</p>
              <p className={styles.cardWalk}>
                {location
                  ? fromHere === null
                    ? 'この会場は座標が未登録のため、現在地からの徒歩時間を出せません'
                    : stale
                      ? `${ageMinutes}分前の位置から徒歩およそ${fromHere}分（取り直してください）`
                      : `現在地から徒歩およそ${fromHere}分`
                  : !origin
                    ? '予定を入れると、最初の予定の会場からの徒歩時間が出ます'
                    : origin.id === picked.id
                      ? '最初の予定と同じ会場です'
                      : walkFromPlan === null
                        ? '徒歩時間が未登録です'
                        : `${origin.name}から徒歩${walkFromPlan}分`}
              </p>
            </div>
          </div>
          {/*
            🔴 **徒歩時間のすぐ下に置く。** ここは「この数字をどう受け取るか」で、
            会場の紹介文（desc）より先に読まれないと意味がない。
            **点で表せない会場（ホコテン）のためにある。** 無い会場では何も出ない。
          */}
          {picked.note && <p className={styles.cardNote}>{picked.note}</p>}
          <p className={styles.cardDesc}>{picked.desc}</p>

          {/*
            🔴 **道案内は自前で持たない。**
            このアプリの役割は「間に合うかの判定」であって道案内ではない。
            **判定に要る情報はこちらが持ち、実際の道案内は地図アプリに渡す。**
            住所を渡せば、その人がいつも使っているアプリで開ける。
          */}
          {picked.address !== '' && (
            <div className={styles.addressBox}>
              <span className={styles.addressLabel}>住所</span>
              <p className={styles.address}>{picked.address}</p>
              <Button
                label={copied ? 'コピーしました' : '住所をコピー'}
                variant="outline"
                onPress={async () => {
                  try {
                    await navigator.clipboard.writeText(picked.address);
                    setCopiedFor(picked.id);
                  } catch (e) {
                    console.warn('クリップボードへのコピーに失敗しました', e);
                  }
                }}
              />
              <p className={styles.addressHint}>
                お使いの地図アプリに貼り付けると、そこまでの道順が出せます。
              </p>
            </div>
          )}

          {plannedHere.length > 0 && (
            <div className={styles.plannedBox}>
              <p className={styles.plannedTitle}>この会場の自分の予定</p>
              {plannedHere.map((p) => (
                <p key={p.session.id} className={styles.plannedItem}>
                  {`${p.session.start} ${p.session.title}`}
                </p>
              ))}
            </div>
          )}
        </div>

        <DayStrip day={day} onSelect={setDay} />
        <p className={styles.listTitle}>この会場のセッション</p>
        {todays.length === 0 && <p className={styles.none}>この日、この会場のセッションはありません。</p>}
        {todays.map((s) => (
          <button key={s.id} type="button" className={styles.row} onClick={() => router.push(`/session?id=${s.id}`)}>
            <span className={styles.rowTime}>{s.start}</span>
            <span className={styles.rowTitle}>{s.title}</span>
          </button>
        ))}

        {/*
          🔴 **どう見積もった数字なのかを書く。**
          このアプリは「間に合う／間に合わない」を断言する。断言する以上、
          何を前提にした数字なのかを見せないと、外れたときに何も説明できない。
        */}
        <div className={styles.basis}>
          <p className={styles.basisText}>
            徒歩時間は建物の入口までの目安です。建物の中の移動は、エレベーターを使う想定で別に足しています。階段のほうが速いことがあります。
          </p>
        </div>
      </div>
    </div>
  );
}
