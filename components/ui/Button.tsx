'use client';

import styles from './Button.module.css';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  className,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'warn';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={`${styles.btn} ${styles[variant]} ${className ?? ''}`}
    >
      {label}
    </button>
  );
}
