'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DayStrip } from '@/components/DayStrip';
import { SessionCard } from '@/components/SessionCard';
import { NavIcon } from '@/components/NavIcon';
import { Snackbar } from '@/components/Snackbar';
import { Button, Chip, Segment } from '@/components/ui';
import { PRIVACY_POLICY_URL } from '@/constants/links';
import { venueById } from '@/lib/dataset';
import { travelLabel } from '@/lib/schedule';
import { RECOMMEND_LIMIT, useApp } from '@/store/AppContext';
import styles from './page.module.css';

const MODES = ['おすすめ', 'すべてのイベント'] as const;
type Mode = (typeof MODES)[number];

/**
 * ホーム。
 *
 * 上から ロゴ／日付／おすすめ・すべて／カテゴリ の順に絞り込みが並び、
 * その下に結果が出る。
 *
 * **「さがす」タブをここへ畳んだ画面**でもある。日付・カテゴリで絞れる
 * 一覧がホームにできた以上、同じものをタブでもう1つ持つ理由が無い。
 * キーワード検索だけは右上の虫眼鏡から別画面（/search）で開く。
 *
 * 予定に追加した瞬間に判定エンジンが走り、「間に合うか」を即座に返す。
 * その導線がこの画面の本題で、絞り込みはそこへ辿り着くための道具でしかない。
 */
export default function HomeTab() {
  const router = useRouter();
  const {
    dataset,
    categories,
    day,
    setDay,
    recommendations,
    addSession,
    removeSession,
    isPlanned,
    check,
    problemCount,
    saveError,
  } = useApp();

  const [mode, setMode] = useState<Mode>('おすすめ');
  const [cats, setCats] = useState<string[]>([]);
  /** 画面下の帯。`undoId` があるときだけ「取り消す」を出す。 */
  const [snack, setSnack] = useState<{ text: string; undoId?: string } | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((text: string, undoId?: string) => {
    // 前の帯のタイマーを消す。**残しておくと、続けて2件追加したときに
    // 1件目のタイマーが2件目の帯を早く閉じてしまう**
    if (snackTimer.current) clearTimeout(snackTimer.current);
    setSnack({ text, undoId });
    snackTimer.current = setTimeout(() => setSnack(null), 5000);
  }, []);

  useEffect(
    () => () => {
      if (snackTimer.current) clearTimeout(snackTimer.current);
    },
    [],
  );

  const toggleCat = (c: string) =>
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  /** その日のすべてのセッション。日付は上で選んでいるので、カードには出さない */
  const allOfDay = useMemo(
    () => dataset.sessions.filter((s) => s.day === day).sort((a, b) => a.start.localeCompare(b.start)),
    [dataset, day],
  );

  const base = mode === 'おすすめ' ? recommendations : allOfDay;
  const list = useMemo(
    () => (cats.length === 0 ? base : base.filter((s) => cats.includes(s.category))),
    [base, cats],
  );

  /**
   * その日の、予定に入れられないプログラム（#2）。
   *
   * 徒歩圏外・複数日にまたがるため通常のセッションとして持てないが、
   * その日にプログラムが無いわけではない。出さないと「この日はまだありません」と
   * 事実と違う表示になる（9/23がまさにこのケース）。
   */
  const offsiteToday = useMemo(
    () => dataset.offsitePrograms.filter((o) => o.days.includes(day)),
    [dataset, day],
  );

  /**
   * 「その他のおすすめも見る」を出すか。
   *
   * おすすめが上限に達していて、かつその日にまだ他がある場合だけ。
   */
  const hasMore =
    mode === 'おすすめ' && recommendations.length >= RECOMMEND_LIMIT && allOfDay.length > recommendations.length;

  /**
   * 予定に追加する。
   *
   * **どの文言のときも「取り消す」を出す。** むしろ警告が出たときこそ
   * 取り消したいので、警告つきの場合を外してはいけない。
   */
  const handleAdd = (id: string) => {
    const result = check(id);
    addSession(id);

    const text = result.conflictWith
      ? `追加しました。ただし「${result.conflictWith.title}」と重なっています`
      : result.incoming.status !== 'first' && result.incoming.status !== 'ok'
        ? `追加しました。${travelLabel(result.incoming)}`
        : result.breaksNext
          ? `追加しました。次の「${result.breaksNext.session.title}」に間に合わなくなります`
          : '予定に追加しました';

    notify(text, id);
  };

  /** 予定から外す。カードのボタンと、帯の「取り消す」の両方から呼ぶ。 */
  const handleRemove = (id: string) => {
    removeSession(id);
    notify('予定から外しました');
  };

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        {/* 中央のロゴと左右のバランスを取るため、左側に同じ幅の空きを置く */}
        <span className={styles.headerSide} />
        <span className={styles.brand}>MyMaps</span>
        <button
          type="button"
          onClick={() => router.push('/search')}
          className={styles.headerSide}
          aria-label="さがす"
        >
          <NavIcon name="search" color="var(--color-teal)" size={24} />
        </button>
      </header>

      <DayStrip day={day} onSelect={setDay} />

      <div className={styles.controls}>
        <Segment options={MODES} value={mode} onChange={setMode} />

        <div className={styles.catBar}>
          {categories.map((c) => (
            <Chip key={c} label={c} active={cats.includes(c)} onPress={() => toggleCat(c)} />
          ))}
          {cats.length > 0 && <Chip label="解除" tone="plain" onPress={() => setCats([])} />}
        </div>
      </div>

      <div className={styles.content}>
        {saveError && (
          <div className={styles.alert}>
            <span className={styles.alertIcon} aria-hidden="true">
              ⚠
            </span>
            <span className={styles.alertText}>{saveError}</span>
          </div>
        )}

        {problemCount > 0 && (
          <button
            type="button"
            className={styles.alertButton}
            onClick={() => router.push('/home/schedule')}
          >
            <span className={styles.alertIcon} aria-hidden="true">
              ⚠
            </span>
            <span className={styles.alertText}>
              {`移動が厳しい区間が${problemCount}件あります。予定タブで確認してください。`}
            </span>
          </button>
        )}

        {list.length === 0 && offsiteToday.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              {cats.length > 0
                ? '条件に合うものがありません'
                : mode === 'おすすめ' && allOfDay.length > 0
                  ? 'おすすめはありません'
                  : 'この日はまだありません'}
            </p>
            <p className={styles.emptyText}>
              {cats.length > 0
                ? 'カテゴリの絞り込みを外すか、別の日を選んでみてください。'
                : mode === 'おすすめ' && allOfDay.length > 0
                  ? // recommendations は予定済みのセッションを除いて出す。ここまで来たなら、
                    // この日のイベントはもう全部予定に入っている
                    'この日のイベントは、もう予定に入っています。「すべてのイベント」から確認できます。'
                  : 'NoMaps公式サイトで公開済みのプログラムを掲載しています。まだ公開されていない日もあります。'}
            </p>
          </div>
        )}

        {list.map((s) => {
          const planned = isPlanned(s.id);
          const pre = check(s.id);
          const warn =
            !planned &&
            (pre.conflictWith ||
              pre.incoming.status === 'short' ||
              pre.incoming.status === 'reception' ||
              pre.incoming.status === 'overlap');

          return (
            <div key={s.id} className={styles.item}>
              <SessionCard session={s} onPress={() => router.push(`/session?id=${s.id}`)} />
              {warn && (
                <div className={styles.preWarn}>
                  <span className={styles.preWarnText}>
                    {pre.conflictWith
                      ? `「${pre.conflictWith.title}」と時間が重なります`
                      : travelLabel(pre.incoming)}
                  </span>
                </div>
              )}
              <div className={styles.actions}>
                {/*
                  追加後は「予定から外す」に変える。以前は「予定に入っています」の
                  **押せないボタン**になり、ホームから外す手段が無かった。
                  ラベルは必ず「押したら何が起きるか」にする
                */}
                <Button
                  label={planned ? '予定から外す' : '予定に追加'}
                  onPress={() => (planned ? handleRemove(s.id) : handleAdd(s.id))}
                  variant={planned ? 'outline' : 'primary'}
                  className={styles.actionBtn}
                />
                <Button
                  label="地図で見る"
                  variant="outline"
                  // 会場IDを渡す。渡さないと、どのセッションから飛んでも
                  // 1番目の会場が選ばれた状態で開き、「反応していない」ように見える
                  onPress={() => router.push(`/home/map?venue=${s.venueId}`)}
                  className={styles.actionBtn}
                />
              </div>
              <span className={styles.venue}>
                {`${s.start} ・ ${venueById(dataset, s.venueId)?.name ?? ''}`}
              </span>
            </div>
          );
        })}

        {hasMore && (
          <Button label="その他のおすすめも見る" variant="ghost" onPress={() => setMode('すべてのイベント')} />
        )}

        {offsiteToday.length > 0 && (
          <div className={styles.offsiteBox}>
            <p className={styles.offsiteHead}>予定に入れられないプログラム</p>
            {offsiteToday.map((o) => (
              <div key={o.id} className={styles.offsite}>
                <span className={styles.offsiteWhen}>
                  {o.timeLabel ? `${o.dayLabel} ${o.timeLabel}` : o.dayLabel}
                </span>
                <p className={styles.offsiteTitle}>{o.title}</p>
                <span className={styles.offsiteVenue}>{o.venueLabel}</span>
                {o.ticket && <span className={styles.offsiteTicket}>{o.ticket}</span>}
                <p className={styles.offsiteReason}>{o.reason}</p>
                {o.url && (
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className={styles.offsiteLink}>
                    公式ページで詳細を見る
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/*
          プライバシーポリシーへの導線。オンボーディングは初回しか通らないので、
          常に到達できる場所にも置く。
        */}
        <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className={styles.policyRow}>
          プライバシーポリシー
        </a>
      </div>

      {snack && (
        <Snackbar
          text={snack.text}
          actionLabel={snack.undoId ? '取り消す' : undefined}
          onAction={snack.undoId ? () => handleRemove(snack.undoId!) : undefined}
        />
      )}
    </div>
  );
}
