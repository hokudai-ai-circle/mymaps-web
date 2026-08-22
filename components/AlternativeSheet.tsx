'use client';

import { useEffect } from 'react';
import type { Session } from '@/lib/dataset';
import { venueById } from '@/lib/dataset';
import { useApp } from '@/store/AppContext';
import { Alternative, travelLabel } from '@/lib/schedule';
import { VenueDot } from './ui';
import styles from './AlternativeSheet.module.css';

/**
 * 「代わりの候補を見る」で開くシート。
 *
 * 単に同じ時間帯を並べるのではなく、**入れ替えても移動が破綻しないものだけ**を出す。
 * 候補が無いときに黙って空にせず、なぜ無いのかを伝える。
 */
export function AlternativeSheet({
  target,
  alternatives,
  onSwap,
  onClose,
}: {
  target: Session;
  alternatives: Alternative[];
  onSwap: (altId: string) => void;
  onClose: () => void;
}) {
  const { dataset } = useApp();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay}>
      <button
        type="button"
        className={styles.backdrop}
        onClick={onClose}
        aria-label="閉じる"
      />

      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="代わりの候補">
        <div className={styles.handle} />

        <h2 className={styles.title}>代わりの候補</h2>
        <p className={styles.lead}>
          {`「${target.title}」の代わりに、無理なく行けるセッションです。`}
        </p>

        {alternatives.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>この時間に行ける候補がありません</p>
            <p className={styles.emptyText}>
              前後の予定との移動時間を考えると、入れ替えられるセッションが見つかりませんでした。
              前の予定を早めに抜けるか、この予定を外すことを検討してください。
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {alternatives.map((alt) => {
              const venue = venueById(dataset, alt.session.venueId);
              return (
                <div key={alt.session.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.time}>
                      {`${alt.session.start}–${alt.session.end}`}
                    </span>
                    {alt.sameCategory && (
                      <span className={styles.sameCat}>同じカテゴリ</span>
                    )}
                  </div>

                  <p className={styles.cardTitle}>{alt.session.title}</p>
                  <p className={styles.speaker}>{alt.session.speaker}</p>

                  {venue && (
                    <div className={styles.venueRow}>
                      <VenueDot letter={venue.letter} size={18} />
                      <span className={styles.venueName}>{venue.name}</span>
                    </div>
                  )}

                  <p className={styles.travel}>{travelLabel(alt.travel)}</p>

                  <button
                    type="button"
                    className={styles.swapBtn}
                    onClick={() => onSwap(alt.session.id)}
                  >
                    これに差し替える
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button type="button" className={styles.closeBtn} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
