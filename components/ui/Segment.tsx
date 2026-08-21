'use client';

import styles from './Segment.module.css';

/**
 * 2択の切り替え。ホームの「おすすめ / すべてのイベント」に使う。
 *
 * タブを増やすのではなく1つの画面の中で切り替えるのは、日付とカテゴリの
 * 絞り込みを共有したいため。タブに分けると、切り替えるたびに絞り込みが
 * リセットされたのか維持されているのかが分からなくなる。
 */
export function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.segment} role="tablist">
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o)}
            className={`${styles.item} ${active ? styles.itemActive : ''}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
