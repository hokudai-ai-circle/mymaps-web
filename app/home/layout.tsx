'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavIcon, NavIconName } from '@/components/NavIcon';
import styles from './layout.module.css';

const TABS: { href: string; label: string; icon: NavIconName }[] = [
  { href: '/home', label: 'ホーム', icon: 'home' },
  { href: '/home/map', label: 'マップ', icon: 'map' },
  { href: '/home/schedule', label: '予定', icon: 'calendar' },
  { href: '/home/profile', label: 'プロフィール', icon: 'person' },
];

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.root}>
      <div className={styles.content}>{children}</div>

      <nav className={styles.tabBar}>
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={styles.tab}
              aria-current={active ? 'page' : undefined}
            >
              <NavIcon
                name={t.icon}
                color={active ? 'var(--color-teal)' : 'var(--color-text-muted)'}
                focused={active}
                size={24}
              />
              <span className={`${styles.tabLabel} ${active ? styles.tabLabelActive : ''}`}>
                {t.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
