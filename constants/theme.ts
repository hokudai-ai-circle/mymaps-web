/**
 * MyMaps デザイントークン
 *
 * 出典: 瑠偉さんのCompassプロトタイプから採取したパレット。
 *
 * 重要な設計判断（2026-08-05）:
 * Compass原案ではイエロー #F2B705 をアクセントに使っていたが、合体版では
 * **警告専用色に格上げ**した。マイスケジュールの主役は「間に合わない」という
 * 事前警告であり、アクセントと警告が同じ色だと警告が埋もれるため。
 * アクセントが必要な場面はティール側で表現する。
 */

export const colors = {
  // ブランド（ティール系）
  teal: '#0E7C7B',
  tealDark: '#0A5958',
  tealPale: '#E7F2F1',
  tealLine: '#D5DEDE',

  /*
    会場マップ（#4）。**淡い色どうしを重ねると画面上では消える。**
    以前 tealLine(#D5DEDE) を淡い地(#E7F2F1)に引いたところ、
    実機で線が1本も見えず「ただの緑単色」という報告になった（比 1.20）。
    地図らしく見えるかどうかは、街区・通り・公園・川の塗り分けで決まる。
  */
  mapBlock: '#DED6C8',
  mapRoad: '#FFFFFF',
  mapPark: '#A8CF9A',
  mapRiver: '#8FBEDF',
  mapLabel: '#7A7268',
  mapHere: '#1B72E8',

  // 警告（イエロー/アンバー系）— 警告以外に使わないこと
  warn: '#F2B705',
  warnPale: '#FFF6DC',
  warnInk: '#8A6800',

  // 基本
  white: '#FFFFFF',
  ink: '#111111',
  bg: '#F1F5F5',
  surface: '#FFFFFF',

  // テキスト
  textSecondary: '#556666',
  textMuted: '#889999',

  // 罫線
  border: '#E2E9E9',
  borderStrong: '#D5DEDE',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '700' as const },
  heading: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '600' as const },
};

/**
 * セッションのカテゴリ。**NoMaps公式の表記をそのまま使う。**
 *
 * 以前はこちらで考えた5種（ビジネス／スチューデンツ／フード／ソーシャル／カルチャー）
 * だったが、公式の分類と一致していなかった。公式サイトを見てきた人が同じ言葉を
 * 見つけられるよう、公式に合わせた（2026-08-09）。
 *
 * **公式がプログラムを追加公開すると、ここに無いカテゴリが出てくる。**
 * その場合は型エラーになるので、気づいたらここへ追加すること
 * （黙って通ってしまうより、止まる方が良い）。
 * 2025年には CONFERENCE / WELLNESS / EDU / FOOD / TECH / SPORTS / GLOBAL /
 * EXECUTIVE / KIDS / U35 / STUDENTS / GOVERNMENT / MEETUP なども存在した。
 *
 * **2026-08-11、実際に GOVERNMENT が現れて型エラーになった。**
 * 「気づいたら追加する」ではなく「気づかされる」形になっていたので、
 * この仕掛けは残す価値がある。**既定値で吸収する作りにしないこと。**
 */
export const CATEGORIES = [
  'SOCIAL',
  'CAREER',
  'SUPER WELFARE',
  'GOVERNMENT',
] as const;
export type Category = (typeof CATEGORIES)[number];
