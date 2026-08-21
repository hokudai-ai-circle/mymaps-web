'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, VenueDot } from '@/components/ui';
import { walkMinutesBetween } from '@/lib/dataset';
import { isLocationStale, minutesSince, walkMinutesToVenue } from '@/lib/geo';
import { useApp } from '@/store/AppContext';
import styles from './page.module.css';

/**
 * 選択中の丸の直径。**ピンの枠の高さでもある。**
 * `.pin` の translateY はこの値を前提に位置を合わせてある。片方だけ変えないこと。
 */
const PIN_DOT_MAX = 44;

/**
 * 会場マップ。
 *
 * 会場の位置関係と、徒歩時間（判定エンジンの入力）を確認できることを優先する。
 *
 * ## 現在地について
 *
 * **押さなければ位置情報を取りに行かない。** 起動しただけで許可を求めると、
 * 何のために使うのか分からないまま断られる。ここで「現在地から測る」を
 * 押した人にだけ聞く。
 *
 * **拒否されても壊れない。** 現在地が無ければ、これまでどおり
 * 「その日の最初の予定の会場」を起点に表示する。
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
  const { dataset, day, plan, location, locationStatus, locationAt, requestLocation } = useApp();

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
  const todays = dataset.sessions.filter((s) => s.day === day && s.venueId === picked.id);
  const plannedHere = plan.filter((p) => p.session.venueId === picked.id);

  // 起点は「現在地」→「その日の最初の予定の会場」の順。
  const originVenueId = plan.length > 0 ? plan[0].session.venueId : null;
  const origin = originVenueId ? dataset.venues.find((v) => v.id === originVenueId) ?? null : null;

  const fromHere = walkMinutesToVenue(location, picked);
  const walkFromPlan = originVenueId ? walkMinutesBetween(dataset, originVenueId, picked.id) : null;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1 className={styles.title}>会場マップ</h1>
      </div>

      <div className={styles.canvas}>
        <span className={styles.canvasLabel}>大通公園エリア</span>

        {/*
          選択中は「大きさ・色・縁取り・名前の濃さ」を同時に変える。
          **色だけで区別しない。** 色覚特性によっては伝わらないので、
          サイズと縁取りを必ず併用する
        */}
        {dataset.venues.map((v) => {
          const active = pickedId === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setPickedId(v.id)}
              aria-pressed={active}
              aria-label={`${v.name}${active ? '（選択中）' : ''}`}
              className={`${styles.pin} ${active ? styles.pinActive : ''}`}
              style={{ left: `${v.x * 100}%`, top: `${v.y * 100}%` }}
            >
              <span className={styles.pinDotSlot}>
                <VenueDot letter={v.letter} size={active ? PIN_DOT_MAX : 24} tone={active ? 'selected' : 'muted'} />
              </span>
              <span className={`${styles.pinName} ${active ? styles.pinNameActive : ''}`}>{v.name}</span>
            </button>
          );
        })}

        <div className={styles.here}>
          <span className={styles.hereText}>
            {location ? '起点: 現在地' : origin ? `起点: ${origin.name}` : '起点がありません'}
          </span>
        </div>
      </div>

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
          <p className={styles.cardDesc}>{picked.desc}</p>

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

        <p className={styles.listTitle}>{`${day} のセッション`}</p>
        {todays.length === 0 && <p className={styles.none}>この日、この会場のセッションはありません。</p>}
        {todays.map((s) => (
          <button key={s.id} type="button" className={styles.row} onClick={() => router.push(`/session/${s.id}`)}>
            <span className={styles.rowTime}>{s.start}</span>
            <span className={styles.rowTitle}>{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
