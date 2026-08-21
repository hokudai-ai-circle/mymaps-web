import styles from './MoodChip.module.css';

/** 雰囲気タグ（#がっつり系 など）。内容ではなく場の温度感を伝える */
export function MoodChip({ label }: { label: string }) {
  return <span className={styles.mood}>{`#${label}`}</span>;
}
