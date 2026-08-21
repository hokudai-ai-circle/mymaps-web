'use client';

import styles from './Chip.module.css';

/** ピル型のチップ。カテゴリ絞り込み・タグ選択に使う */
export function Chip({
  label,
  active = false,
  onPress,
  tone = 'teal',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'teal' | 'plain';
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={!onPress}
      aria-pressed={active}
      className={`${styles.chip} ${active ? (tone === 'teal' ? styles.chipActive : styles.chipActivePlain) : ''}`}
    >
      {label}
    </button>
  );
}
