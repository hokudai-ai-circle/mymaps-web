/**
 * 建物内の縦移動にかかる時間。
 *
 * **水平の徒歩時間とは別の話なので、別のファイルに置く。**
 * `lib/geo.ts` は緯度経度から水平距離を出すところで、こちらは階数しか見ない。
 *
 * ## なぜ要るのか
 *
 * 会場は「建物」の単位で持っているが、実際の部屋は建物の中に散らばっている。
 * ACU（アスティ45）は12階と16階の両方が使われ、赤れんが庁舎は2階、
 * 日本生命札幌ビルは4階にある。
 *
 * **同じ建物なら徒歩0分、という扱いでは足りない。**
 *
 *   9/25 16:00-16:50  ACU 12階
 *   9/25 17:00-       ACU 16階   ← あいだは10分。エレベーターで4階分上がる
 *
 * Google マップの徒歩時間は**建物の入口まで**なので、ここは自前で足す。
 *
 * ## エレベーターを前提にしている
 *
 * **階段のほうが速いことがある。** それでも遅い側で見積もるのは、
 * このアプリが「間に合わない」の見逃しを出さないため。
 * 画面には「エレベーターを使う想定」と明記すること。
 */

/** エレベーターを待つ時間（分）。呼んでから乗るまで */
export const ELEVATOR_WAIT_MINUTES = 1;

/** 1分で移動できる階数。3階層ごとに1分ずつ増える */
export const FLOORS_PER_MINUTE = 3;

/** 建物の出入口がある階。建物をまたぐときは、いったんここへ降りる */
export const GROUND_FLOOR = 1;

/**
 * 階から階への移動にかかる分。
 *
 * **階が分からない会場では 0 を返す。** 公式に階の記載が無い会場があり
 * （北洋銀行本店セミナーホール）、**分からないものを推測で埋めない。**
 * 0分を返すのは「縦移動が無い」と断言しているのではなく、
 * 「上乗せする根拠が無い」という意味。
 *
 *   同じ階            → 0分
 *   1〜3階分の移動    → 待ち1分 + 1分 = 2分
 *   4〜6階分の移動    → 待ち1分 + 2分 = 3分
 *   以降3階層ごとに +1分
 */
export function verticalMinutes(from?: number, to?: number): number {
  if (from === undefined || to === undefined) return 0;

  const floors = Math.abs(from - to);
  if (floors === 0) return 0;

  return ELEVATOR_WAIT_MINUTES + Math.ceil(floors / FLOORS_PER_MINUTE);
}

/**
 * 予定から予定への縦移動にかかる分。
 *
 * **建物が違うときは、降りて・歩いて・上がる。**
 * 水平の徒歩時間は建物の入口までなので、その前後を足す形になる。
 *
 *   ACU 12階 → 赤れんが 2階
 *     = 5分（12階→1階） + 徒歩 + 2分（1階→2階）
 */
export function verticalMinutesBetween(
  sameBuilding: boolean,
  fromFloor?: number,
  toFloor?: number,
): number {
  if (sameBuilding) return verticalMinutes(fromFloor, toFloor);
  return verticalMinutes(fromFloor, GROUND_FLOOR) + verticalMinutes(GROUND_FLOOR, toFloor);
}
