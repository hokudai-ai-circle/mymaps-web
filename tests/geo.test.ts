/**
 * 現在地からの距離・徒歩時間。
 *
 * 実データの座標には依存させない。会場の座標は現地で実測して入れ替える予定
 * （#61）で、そのたびに落ちるテストは計算の正しさではなく数値を見張るだけになる。
 * ここで確かめるのは**式が正しいこと**に絞る。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DETOUR_FACTOR,
  distanceMeters,
  isLocationStale,
  LOCATION_STALE_MINUTES,
  minutesSince,
  WALK_SPEED_M_PER_MIN,
  walkMinutesFrom,
  walkMinutesToVenue,
} from '@/lib/geo';

/** 札幌あたりの緯度。経度1度あたりの距離が緯度で変わるため、現実的な値で試す */
const SAPPORO_LAT = 43.06;

describe('distanceMeters', () => {
  it('同じ地点なら0', () => {
    const p = { lat: SAPPORO_LAT, lng: 141.35 };
    assert.equal(distanceMeters(p, p), 0);
  });

  it('緯度1度の差はおよそ111km', () => {
    const d = distanceMeters({ lat: 43, lng: 141.35 }, { lat: 44, lng: 141.35 });
    // 球体近似なので厳密値とは数百m違う。桁と概数が合っていればよい
    assert.ok(d > 110_000 && d < 112_000, `${d}m`);
  });

  it('北緯43度では経度1度がおよそ81km（緯度より短い）', () => {
    const d = distanceMeters({ lat: 43, lng: 141 }, { lat: 43, lng: 142 });
    assert.ok(d > 80_000 && d < 82_500, `${d}m`);
  });

  it('向きを入れ替えても同じ距離', () => {
    const a = { lat: 43.0639, lng: 141.348 };
    const b = { lat: 43.0592, lng: 141.3535 };
    assert.equal(distanceMeters(a, b), distanceMeters(b, a));
  });

  it('日付変更線や経度の符号違いでも破綻しない', () => {
    const d = distanceMeters({ lat: 0, lng: 179.99 }, { lat: 0, lng: -179.99 });
    // 東西に0.02度＝約2.2km。18万度ぶんの距離を返してはいけない
    assert.ok(d < 5_000, `${d}m`);
  });
});

describe('walkMinutesFrom', () => {
  /** 東西方向に指定メートルだけ離れた点を作る */
  const eastOf = (from: { lat: number; lng: number }, meters: number) => ({
    lat: from.lat,
    lng: from.lng + meters / (111_320 * Math.cos((from.lat * Math.PI) / 180)),
  });

  const here = { lat: SAPPORO_LAT, lng: 141.35 };

  it('迂回係数と徒歩速度のとおりに計算する', () => {
    // 400m 離れていれば 400×1.3÷80 = 6.5分 → 切り上げて7分
    const minutes = walkMinutesFrom(here, eastOf(here, 400));
    assert.equal(minutes, 7);
    assert.equal(DETOUR_FACTOR, 1.3);
    assert.equal(WALK_SPEED_M_PER_MIN, 80);
  });

  it('端数は切り上げる（「ちょうど間に合う」と嘘をつかない）', () => {
    // 100m → 100×1.3÷80 = 1.625分。1分と答えてはいけない
    assert.equal(walkMinutesFrom(here, eastOf(here, 100)), 2);
  });

  it('同じ地点でも0分は返さない（部屋まで歩く時間がある）', () => {
    assert.equal(walkMinutesFrom(here, here), 1);
  });

  it('遠いほど大きくなる', () => {
    const near = walkMinutesFrom(here, eastOf(here, 200));
    const far = walkMinutesFrom(here, eastOf(here, 800));
    assert.ok(far > near, `${near} → ${far}`);
  });

  it('会場間くらいの距離で、実測の徒歩時間と桁がずれない', () => {
    // data/event.ts の実測（予定）値は 3〜9分。
    // 200m〜700m の範囲がその帯に収まることを確認する
    assert.ok(walkMinutesFrom(here, eastOf(here, 200)) <= 4);
    assert.ok(walkMinutesFrom(here, eastOf(here, 700)) <= 12);
  });
});

describe('walkMinutesToVenue', () => {
  const here = { lat: SAPPORO_LAT, lng: 141.35 };
  const withCoords = { coords: { lat: SAPPORO_LAT, lng: 141.355 } };
  const noCoords = {};

  it('現在地と会場の座標が揃っていれば分数を返す', () => {
    const m = walkMinutesToVenue(here, withCoords);
    assert.ok(m !== null && m > 0, String(m));
  });

  it('現在地が無ければ null（許可されていない・取得できない）', () => {
    assert.equal(walkMinutesToVenue(null, withCoords), null);
  });

  it('**会場の座標が未登録なら null**（推測で埋めない）', () => {
    // data/event.ts には座標未登録の会場が実際に2つある（#61で実測する）。
    // ここで 0 や適当な数字を返すと、根拠のない徒歩時間を断言することになる
    assert.equal(walkMinutesToVenue(here, noCoords), null);
  });

  it('どちらも無ければ null', () => {
    assert.equal(walkMinutesToVenue(null, noCoords), null);
  });
});

describe('位置の古さ', () => {
  const MIN = 60_000;
  const now = 1_000_000_000_000;

  it('経過分数を切り捨てで返す', () => {
    assert.equal(minutesSince(now - 3 * MIN, now), 3);
    // 3分59秒は「3分前」。切り上げて4分前と言うと、実際より古く見せることになる
    assert.equal(minutesSince(now - (3 * MIN + 59_000), now), 3);
  });

  it('取得直後は0分', () => {
    assert.equal(minutesSince(now, now), 0);
  });

  it('端末の時計がずれて未来になっても負を返さない', () => {
    // 「-3分前の位置です」と表示するくらいなら 0 に丸めたほうが害がない
    assert.equal(minutesSince(now + 5 * MIN, now), 0);
  });

  it('不正な値では0', () => {
    assert.equal(minutesSince(NaN, now), 0);
    assert.equal(minutesSince(now, NaN), 0);
  });

  it(`${LOCATION_STALE_MINUTES}分で古いと判定する`, () => {
    assert.equal(isLocationStale(now - (LOCATION_STALE_MINUTES - 1) * MIN, now), false);
    assert.equal(isLocationStale(now - LOCATION_STALE_MINUTES * MIN, now), true);
  });

  it('古さの閾値は、徒歩でずれる距離から決めてある', () => {
    // 5分 × 80m/分 = 400m。会場間が220〜660mのこの街では、
    // 400mのずれが「間に合う／間に合わない」を反転させうる
    assert.equal(LOCATION_STALE_MINUTES * WALK_SPEED_M_PER_MIN, 400);
  });
});
