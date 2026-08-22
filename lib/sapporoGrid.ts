/**
 * 会場マップの座標系。
 *
 * ## この地図が引き受ける範囲
 *
 * **会場どうしの位置関係が一目で分かること。それだけ。**
 * 道案内はしない。実際の道順は、住所をコピーして地図アプリに渡す。
 *
 * 本物の地図タイルを敷く案は採らない。**タイルはネットワークが要る。**
 * 会場は電波が弱く、「オフラインでも使えます」はこのアプリの約束なので、
 * 会場マップだけ圏外で真っ白になるのは受け入れられない。
 *
 * ## 会場は住所ではなく、実測の緯度経度で置く
 *
 * 🔴 **住所の「北3条西6丁目」は敷地の代表住所で、建物の実際の位置とは
 * 最大150mずれる。** 赤れんが庁舎は敷地が広く、建物は南東寄りにある。
 * 住所どおりの格子点へ置くと、その分だけ嘘の位置になる。
 *
 * **建物は街区の中にあって、交差点の上には無い。** 実測で置けば、
 * 会場が通りと通りのあいだに収まり、見た目としても正しくなる。
 */
import type { LatLng } from '@/lib/geo';

/** 大通（0条）の緯度。会場6点の実測から最小二乗で合わせた */
export const ODORI_LAT = 43.0616363;
/** 西0丁目の経度。同上 */
export const CHOME0_LNG = 141.3557985;

/** 1条ぶんの南北距離。札幌の街区の実寸 */
export const JOU_METERS = 110;
/** 1丁目ぶんの東西距離。札幌の街区の実寸 */
export const CHOME_METERS = 100;

const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = 111_320 * Math.cos((43.064 * Math.PI) / 180);

/** 北◯条の緯度（大通は 0、南は負） */
export function latOfJou(jou: number): number {
  return ODORI_LAT + (jou * JOU_METERS) / M_PER_DEG_LAT;
}

/** 西◯丁目の経度（東は 0 以下） */
export function lngOfChome(chome: number): number {
  return CHOME0_LNG - (chome * CHOME_METERS) / M_PER_DEG_LNG;
}

/** 条の表示名。大通だけ番号で呼ばない */
export function jouLabel(jou: number): string {
  if (jou === 0) return '大通';
  return jou > 0 ? `北${jou}条` : `南${-jou}条`;
}

/** 丁目の表示名 */
export function chomeLabel(chome: number): string {
  return chome > 0 ? `西${chome}` : `東${1 - chome}`;
}

/** 東西の通り（条）。大通は公園なので別扱い */
export type Street = { at: number; label: string; park: boolean };
/** 南北の通り（丁目）。創成川は川なので別扱い */
export type Avenue = { at: number; label: string; river: boolean };

export type MapView = {
  /** 緯度経度を、枠の中の 0〜1 に置く */
  place: (p: LatLng) => { x: number; y: number };
  streets: Street[];
  avenues: Avenue[];
  /** 1街区の大きさ（枠に対する比）。通りの太さを決めるのに使う */
  blockWidth: number;
  blockHeight: number;
};

/**
 * 端に取る余白。会場の丸と名前が枠から出ないように。
 *
 * **大きくしすぎると、会場が中央に小さく固まって空白ばかりになる。**
 * 90m は約1街区ぶん。
 */
const MARGIN_METERS = 90;

/**
 * 会場が全部入る枠を決めて、通りを数え上げる。
 *
 * **縦横の縮尺を必ず揃える。** 枠いっぱいに引き伸ばすと、
 * 「北へ5分・東へ5分」が同じ長さに見えなくなり、
 * **方角の感覚が狂う。** このアプリは「どっちへ何分か」を扱うので、
 * そこを崩すと地図の意味が無くなる。余白が出るほうがまし。
 *
 * @param aspect 描画領域の 横 ÷ 縦
 */
export function buildMapView(points: LatLng[], aspect: number): MapView {
  const usable = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const base = usable.length > 0 ? usable : [{ lat: ODORI_LAT, lng: lngOfChome(4) }];

  const lats = base.map((p) => p.lat);
  const lngs = base.map((p) => p.lng);

  // メートルの世界で箱を作る。原点は大通・西0丁目
  const toM = (p: LatLng) => ({
    east: (p.lng - CHOME0_LNG) * M_PER_DEG_LNG,
    north: (p.lat - ODORI_LAT) * M_PER_DEG_LAT,
  });

  let minE = Math.min(...lngs.map((lng) => (lng - CHOME0_LNG) * M_PER_DEG_LNG)) - MARGIN_METERS;
  let maxE = Math.max(...lngs.map((lng) => (lng - CHOME0_LNG) * M_PER_DEG_LNG)) + MARGIN_METERS;
  let minN = Math.min(...lats.map((lat) => (lat - ODORI_LAT) * M_PER_DEG_LAT)) - MARGIN_METERS;
  let maxN = Math.max(...lats.map((lat) => (lat - ODORI_LAT) * M_PER_DEG_LAT)) + MARGIN_METERS;

  /*
    縦横の縮尺を揃える。**足りないほうを広げる**（縮めない）。
    縮めると会場が枠からはみ出す。
  */
  const widthM = maxE - minE;
  const heightM = maxN - minN;
  if (widthM / heightM < aspect) {
    const want = heightM * aspect;
    const pad = (want - widthM) / 2;
    minE -= pad;
    maxE += pad;
  } else {
    const want = widthM / aspect;
    const pad = (want - heightM) / 2;
    minN -= pad;
    maxN += pad;
  }

  const spanE = maxE - minE;
  const spanN = maxN - minN;

  const place = (p: LatLng) => {
    const { east, north } = toM(p);
    return {
      x: (east - minE) / spanE,
      // 北が上。緯度が大きいほど y は小さい
      y: (maxN - north) / spanN,
    };
  };

  // 枠に入る条・丁目を数え上げる
  const streets: Street[] = [];
  const jouHigh = Math.floor(maxN / JOU_METERS);
  const jouLow = Math.ceil(minN / JOU_METERS);
  for (let j = jouHigh; j >= jouLow; j -= 1) {
    const at = (maxN - j * JOU_METERS) / spanN;
    streets.push({ at, label: jouLabel(j), park: j === 0 });
  }

  const avenues: Avenue[] = [];
  const chomeHigh = Math.ceil(-minE / CHOME_METERS);
  const chomeLow = Math.floor(-maxE / CHOME_METERS);
  for (let c = chomeHigh; c >= chomeLow; c -= 1) {
    const at = (-c * CHOME_METERS - minE) / spanE;
    // 創成川は西1丁目と東1丁目のあいだ（西0丁目の線）を流れる
    avenues.push({ at, label: chomeLabel(c), river: c === 0 });
  }

  return {
    place,
    streets,
    avenues,
    blockWidth: CHOME_METERS / spanE,
    blockHeight: JOU_METERS / spanN,
  };
}
