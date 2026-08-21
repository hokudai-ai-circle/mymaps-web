import styles from './Avatar.module.css';

export function Avatar({ initial, size = 44 }: { initial: string; size?: number }) {
  return (
    <div className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initial}
    </div>
  );
}
