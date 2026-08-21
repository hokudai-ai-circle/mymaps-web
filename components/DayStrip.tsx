'use client';

import { DAYS } from '@/data/event';
import styles from './DayStrip.module.css';

/** DAYS に現れる月。ふつうは1つだけ */
const MONTHS = [...new Set(DAYS.map((d) => d.id.split('/')[0]))];

/**
 * 日付の選択帯。曜日を上、日にちを下に積む。
 *
 * NoMaps 2026 は 9/23〜9/27 の5日。CSS Grid で等分しているので
 * 日数が増減しても収まるが、日数が大きく増えると1つが窮屈になる。
 */
export function DayStrip({
  day,
  onSelect,
}: {
  /** 選択中の日付ID（DAYS の id） */
  day: string;
  onSelect: (day: string) => void;
}) {
  return (
    <div className={styles.strip}>
      {/*
        帯には日にちしか出さないので、月はここで補う。
        DAYS が月をまたぐ場合はこの表示が嘘になるが、NoMapsは会期が5日で
        月をまたいだことがない。またぐ年が来たら、日にち側に月を戻すこと。
      */}
      <p className={styles.month}>{`${MONTHS.join('・')}月`}</p>

      <nav className={styles.row}>
        {DAYS.map((d) => {
          const active = day === d.id;
          const dayNumber = d.id.split('/')[1] ?? d.id;

          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelect(d.id)}
              className={styles.item}
              aria-pressed={active}
              aria-label={`${d.label}（${d.weekday}）`}
            >
              <span className={`${styles.weekday} ${active ? styles.weekdayActive : ''}`}>
                {d.weekday}
              </span>
              <span className={`${styles.numberWrap} ${active ? styles.numberWrapActive : ''}`}>
                <span className={`${styles.number} ${active ? styles.numberActive : ''}`}>
                  {dayNumber}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
