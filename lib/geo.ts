/**
 * 現在地と会場のあいだの距離・徒歩時間。
 *
 * **通信しない。** 経路APIは使わず、緯度経度から端末内で計算する。
 * 位置情報を外部に送らないための制約であって、手抜きではない。
 * 会場は3つで、いずれも徒歩10分圏内。経路探索に払うコスト（課金・
 * 電波の悪い会場での失敗・プライバシー）に見合う精度差が出ない。
 *
 * 副作用を持たないので、`lib/schedule.ts` と同じくテストで検証できる。
 */

export type LatLng = { lat: number; lng: number };

/** 地球の半径（メートル）。球体近似で十分な距離しか扱わない */
const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * 2点間の直線距離（メートル）。ヒュベニではなくハバサイン。
 * 数百メートルの範囲なら差は誤差以下で、式が短いぶん読める方を採った。
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 直線距離に対する実際の歩行距離の比。
 *
 * 札幌の中心部は完全な碁盤の目で、斜めには歩けない。最悪の場合（真南東へ
 * 向かうとき）の比は √2 ≒ 1.41 で、真東・真南なら 1.0。実際の経路は
 * その中間に散らばるので 1.3 を採った。
 *
 * **信号待ちと地下歩行空間はこの係数に含まれていない。**
 * 会場間の徒歩時間（data/event.ts の WALK）は実測値に置き換える予定で、
 * こちらは「実測できない任意の地点から」の概算にしか使わない。
 */
export const DETOUR_FACTOR = 1.3;

/** 徒歩の速さ（メートル毎分）。data/event.ts の WALK の算出と同じ値 */
export const WALK_SPEED_M_PER_MIN = 80;

/**
 * 現在地から目的地までの徒歩時間（分）。**切り上げる。**
 *
 * 切り上げるのは、このアプリが「間に合うか」を判定するため。
 * 端数を切り捨てて「ちょうど間に合う」と言い、実際には間に合わない、
 * という誤りだけは出してはいけない。
 *
 * 0分は返さない。同じ建物にいても、部屋まで歩く時間はある。
 */
export function walkMinutesFrom(from: LatLng, to: LatLng): number {
  const meters = distanceMeters(from, to) * DETOUR_FACTOR;
  return Math.max(1, Math.ceil(meters / WALK_SPEED_M_PER_MIN));
}

/**
 * 現在地から会場までの徒歩時間。**出せないときは null。**
 *
 * 出せない場合が2つある。どちらも「それらしい数字で埋めない」。
 *
 *   1. 現在地が無い（許可されていない・取得できない）
 *   2. **会場の座標が未登録**（#61で実測するまで残る）
 *
 * `walkMinutesBetween` が未登録のペアで null を返すのと同じ考え方。
 * 画面はこの null を受けて「出せません」と言う。
 *
 * 判断を画面から切り出しているのは、**許可された場合の経路が実機でしか
 * 通らない**ため。ここが純粋関数なら、端末が無くても検証できる。
 */
export function walkMinutesToVenue(
  location: LatLng | null,
  venue: { coords?: LatLng },
): number | null {
  if (!location || !venue.coords) return null;
  return walkMinutesFrom(location, venue.coords);
}

/**
 * 取得してから何分経ったか。**未来の時刻や不正な値では 0 を返す。**
 *
 * 端末の時計がずれていると負の値が出る。「-3分前の位置です」と表示するくらいなら
 * 0 に丸めたほうがまだ害がない。
 */
export function minutesSince(atMs: number, nowMs: number): number {
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.floor((nowMs - atMs) / 60_000));
}

/**
 * これを過ぎたら「古い位置」として扱う分数。
 *
 * 5分。徒歩80m/分なので、5分あれば400m動ける。会場間が220〜660mのこの街で、
 * 400mのずれは「間に合う／間に合わない」を反転させうる。
 *
 * **位置情報を取り直す手段を画面から消してはいけない。**
 * 一度取ったきりの座標で「現在地から徒歩3分」と言い続けるのは、
 * 根拠のない起点を「現在地」と呼んでいた頃（#28）と同じ誤りになる。
 */
export const LOCATION_STALE_MINUTES = 5;

/** その位置を「間に合うかの判断」に使ってよいか */
export function isLocationStale(atMs: number, nowMs: number): boolean {
  return minutesSince(atMs, nowMs) >= LOCATION_STALE_MINUTES;
}
