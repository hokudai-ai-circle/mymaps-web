import styles from './Snackbar.module.css';

export function Snackbar({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={styles.snack} role="status">
      <span className={styles.text}>{text}</span>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className={styles.action}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
