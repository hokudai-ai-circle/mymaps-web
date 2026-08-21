/**
 * アプリ共通のアイコン。
 *
 * 文字グリフやフォント依存の記号は使わず、意味が見ただけで分かる
 * 一般的なアプリの慣習に合わせた形をベクターで描いている。
 *
 * タブバー以外でも使う汎用のアイコン。
 */

export type NavIconName = 'home' | 'search' | 'map' | 'calendar' | 'person' | 'chevron-left';

const PATHS: Record<NavIconName, () => React.ReactNode> = {
  home: () => (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.4V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.4" />
      <path d="M9.5 21v-6.2h5V21" />
    </>
  ),
  search: () => (
    <>
      <circle cx={10.5} cy={10.5} r={6.6} />
      <path d="M15.4 15.4 20.6 20.6" />
    </>
  ),
  map: () => (
    <>
      <path d="M9 3.8 3 6.4v13.8l6-2.6 6 2.6 6-2.6V3.8l-6 2.6-6-2.6z" />
      <path d="M9 3.8v13.8" />
      <path d="M15 6.4v13.8" />
    </>
  ),
  calendar: () => (
    <>
      <path d="M4.4 5.6h15.2a1.4 1.4 0 0 1 1.4 1.4v12.6a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 19.6V7a1.4 1.4 0 0 1 1.4-1.4z" />
      <path d="M3 10.4h18" />
      <path d="M7.8 3v4.6" />
      <path d="M16.2 3v4.6" />
    </>
  ),
  'chevron-left': () => (
    <>
      <path d="M15 4.5 7.5 12l7.5 7.5" />
    </>
  ),
  person: () => (
    <>
      <circle cx={12} cy={7.8} r={3.9} />
      <path d="M4.6 20.8c0-4 3.3-6.6 7.4-6.6s7.4 2.6 7.4 6.6" />
    </>
  ),
};

/**
 * @param focused 選択中は線を太くする。色だけの差だと、色覚特性によっては差が伝わらない
 */
export function NavIcon({
  name,
  color,
  focused,
  size = 26,
}: {
  name: NavIconName;
  color: string;
  focused?: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={focused ? 2.4 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]()}
    </svg>
  );
}
