import styles from './VenueDot.module.css';

/**
 * 会場を表す丸。
 *
 * `tone` は**省略可能で、既定の見た目は変えていない。**
 * この部品はセッションカードとセッション詳細でも使っているので、
 * 既定を変えるとマップ以外の画面まで巻き込んで変わる。
 *
 * `selected` / `muted` はマップ専用。**色だけで区別しない。**
 * 色覚特性によっては伝わらないので、呼び出し側でサイズも一緒に変えること。
 */
export function VenueDot({
  letter,
  size = 26,
  tone = 'default',
}: {
  letter: string;
  size?: number;
  tone?: 'default' | 'selected' | 'muted';
}) {
  return (
    <div
      className={`${styles.dot} ${tone === 'selected' ? styles.selected : ''} ${tone === 'muted' ? styles.muted : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
    >
      {letter}
    </div>
  );
}
