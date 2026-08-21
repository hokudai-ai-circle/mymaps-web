'use client';

import type { Session } from '@/lib/dataset';
import { venueById } from '@/lib/dataset';
import { useApp } from '@/store/AppContext';
import { MoodChip, VenueDot } from './ui';
import styles from './SessionCard.module.css';

export function SessionCard({
  session,
  onPress,
  right,
  compact = false,
}: {
  session: Session;
  onPress?: () => void;
  right?: React.ReactNode;
  compact?: boolean;
}) {
  // **同梱データを直接見ない。** データは外から差し替わるので、
  // いま使っているデータセットから引かないと、古い会場名を出しうる
  const { dataset } = useApp();
  const venue = venueById(dataset, session.venueId);

  const content = (
    <>
      <div className={styles.head}>
        <span className={styles.time}>{`${session.start}–${session.end}`}</span>
        <span className={styles.cat}>{session.category}</span>
        {right}
      </div>

      <p className={styles.title}>{session.title}</p>
      <p className={styles.speaker}>{session.speaker}</p>

      <div className={styles.venueRow}>
        {/* 会場が引けないことは検証で弾いているが、引けなければ何も出さない */}
        {venue && <VenueDot letter={venue.letter} size={20} />}
        <span className={styles.venueName}>{venue?.name ?? ''}</span>
        {session.reception && (
          <span className={styles.reception}>{`受付 ${session.reception}まで`}</span>
        )}
        {/*
          参加条件。公式に明記されている情報をそのまま出す。
          「行きたいか」ではなく「行けるか」に関わるので、一覧の時点で見せる。
        */}
        {session.ticket && <span className={styles.ticket}>{session.ticket}</span>}
      </div>

      {!compact && session.moods.length > 0 && (
        <div className={styles.moods}>
          {session.moods.map((m) => (
            <MoodChip key={m} label={m} />
          ))}
        </div>
      )}
    </>
  );

  if (onPress) {
    // ここは <button> にしない。`right` に外すボタンなど別の押せる要素が
    // 乗ることがあり、<button> の中に <button> は無効なHTMLになるため。
    // クリック領域としては role="button" で代替し、キーボード操作も自前で足す。
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onPress}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPress();
          }
        }}
        className={styles.card}
      >
        {content}
      </div>
    );
  }

  return <article className={styles.card}>{content}</article>;
}
