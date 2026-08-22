'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlternativeSheet } from '@/components/AlternativeSheet';
import { DayStrip } from '@/components/DayStrip';
import { SessionCard } from '@/components/SessionCard';
import { TravelBlock } from '@/components/TravelBlock';
import { Snackbar } from '@/components/Snackbar';
import { Chip } from '@/components/ui';
import type { Session } from '@/lib/dataset';
import { findAlternatives, findFreeSlots, findSlotCandidates, isProblem, toMinutes } from '@/lib/schedule';
import { useApp } from '@/store/AppContext';
import styles from './page.module.css';

/** 本来の終了時刻と退出時刻の差＝早退の分数 */
function earlyLeaveMinutes(scheduledEnd: string, leaveAt: string): number {
  return Math.max(0, toMinutes(scheduledEnd) - toMinutes(leaveAt));
}

/**
 * 予定タブ。
 *
 * セッションとセッションの「間」に移動ブロックが挟まり、
 * 間に合わない場合はその場で解決アクションを出す。このアプリの中心画面。
 */
export default function ScheduleTab() {
  const router = useRouter();
  const {
    dataset,
    categories,
    day,
    setDay,
    plan,
    problemCount,
    removeSession,
    swapSession,
    plannedIds,
    earlyLeaves,
    setEarlyLeave,
    clearEarlyLeave,
  } = useApp();

  const [snack, setSnack] = useState<string | null>(null);
  /** 「代わりの候補」シートの対象。null なら閉じている */
  const [altTarget, setAltTarget] = useState<Session | null>(null);
  /** カテゴリ絞り込み。ホームと同じ仕組み（選んだものだけ表示、未選択なら全件） */
  const [cats, setCats] = useState<string[]>([]);
  const toggleCat = (c: string) =>
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const visible = cats.length === 0 ? plan : plan.filter((p) => cats.includes(p.session.category));
  const freeSlots = findFreeSlots(plan);

  const notify = (msg: string) => {
    setSnack(msg);
    setTimeout(() => setSnack(null), 3200);
  };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1 className={styles.title}>予定</h1>
        <span className={styles.count}>{`${plan.length}件`}</span>
      </div>

      <DayStrip day={day} onSelect={setDay} />

      {problemCount > 0 && (
        <div className={styles.summary}>
          <span className={styles.summaryIcon} aria-hidden="true">
            ⚠
          </span>
          <span className={styles.summaryText}>
            {`移動が厳しい区間が${problemCount}件あります。下のスケジュールで確認してください。`}
          </span>
        </div>
      )}

      <div className={styles.filterBar}>
        {categories.map((c) => (
          <Chip key={c} label={c} active={cats.includes(c)} onPress={() => toggleCat(c)} />
        ))}
        {cats.length > 0 && <Chip label="解除" tone="plain" onPress={() => setCats([])} />}
      </div>

      <div className={styles.content}>
        {visible.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              {cats.length > 0 && plan.length > 0 ? '条件に合う予定がありません。' : 'まだ予定がありません。'}
            </p>
            <p className={styles.emptyText}>
              {cats.length > 0 && plan.length > 0
                ? 'カテゴリの絞り込みを外してみてください。'
                : 'ホームのおすすめから追加してみよう。'}
            </p>
          </div>
        )}

        {visible.map((item) => (
          <div key={item.session.id}>
            <TravelBlock
              travel={item.travel}
              onResolve={
                isProblem(item.travel.status)
                  ? (action) => {
                      if (action === 'remove') {
                        removeSession(item.session.id);
                        notify('予定から外しました');
                      } else if (action === 'leave-early') {
                        if (item.travel.from && item.travel.leaveBy) {
                          setEarlyLeave(item.travel.from.id, item.travel.leaveBy);
                          notify(`「${item.travel.from.title}」を${item.travel.leaveBy}に抜ける予定にしました`);
                        }
                      } else {
                        setAltTarget(item.session);
                      }
                    }
                  : undefined
              }
            />
            <SessionCard
              session={item.session}
              onPress={() => router.push(`/session?id=${item.session.id}`)}
              right={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSession(item.session.id);
                    notify('予定から外しました');
                  }}
                  className={styles.removeBtn}
                >
                  外す
                </button>
              }
            />

            {earlyLeaves[item.session.id] && (
              <div className={styles.earlyLeave}>
                <span className={styles.earlyLeaveText}>
                  {`${earlyLeaves[item.session.id]}に退出予定（早退${earlyLeaveMinutes(
                    item.session.end,
                    earlyLeaves[item.session.id],
                  )}分）`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    clearEarlyLeave(item.session.id);
                    notify('早退の予定を取り消しました');
                  }}
                  className={styles.earlyLeaveCancel}
                >
                  取り消す
                </button>
              </div>
            )}
          </div>
        ))}

        {freeSlots.length > 0 && (
          <div className={styles.freeBlock}>
            <p className={styles.freeTitle}>空き時間</p>
            {freeSlots.map((slot, i) => {
              // 時刻が空いているだけで勧めない。移動が間に合うものだけを出す
              const { reachable, unreachableCount } = findSlotCandidates(
                slot,
                day,
                dataset.sessions.filter((s) => plannedIds.includes(s.id)),
                dataset.sessions,
                dataset,
                2,
                earlyLeaves,
              );

              return (
                <div key={i} className={styles.freeCard}>
                  {/*
                    範囲と候補は**まったく別の意味**なので、区切らずに縦へ並べない。
                  */}
                  <p className={styles.freeRange}>{`${slot.start}–${slot.end} が空いています（${slot.minutes}分）`}</p>
                  {reachable.length > 0 ? (
                    <>
                      <div className={styles.freeDivider} />
                      <p className={styles.freeHeading}>ここに入れられるセッション（移動が間に合うもの）</p>
                      {reachable.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => router.push(`/session?id=${c.id}`)}
                          className={styles.freeCandidate}
                        >
                          {`・${c.title}`}
                        </button>
                      ))}
                      {unreachableCount > 0 && (
                        <p className={styles.freeNone}>{`（ほかに${unreachableCount}件ありますが、移動が間に合いません）`}</p>
                      )}
                    </>
                  ) : unreachableCount > 0 ? (
                    <p className={styles.freeNone}>{`この時間のセッション${unreachableCount}件は、移動が間に合いません`}</p>
                  ) : (
                    <p className={styles.freeNone}>この時間に入る候補はありません</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {altTarget && (
        <AlternativeSheet
          target={altTarget}
          alternatives={findAlternatives(
            altTarget,
            dataset.sessions.filter((s) => plannedIds.includes(s.id)),
            dataset.sessions,
            dataset,
          )}
          onSwap={(altId) => {
            const alt = dataset.sessions.find((s) => s.id === altId);
            swapSession(altTarget.id, altId);
            setAltTarget(null);
            notify(`「${alt?.title ?? ''}」に差し替えました`);
          }}
          onClose={() => setAltTarget(null)}
        />
      )}

      {snack && <Snackbar text={snack} />}
    </div>
  );
}
