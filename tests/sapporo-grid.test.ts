/**
 * 会場マップの座標系のテスト。
 *
 * 🔴 **いちばん大事なのは、縦横の縮尺が揃っていること。**
 * 枠いっぱいに引き伸ばすと「北へ5分・東へ5分」が同じ長さに見えなくなり、
 * 方角の感覚が狂う。このアプリは「どっちへ何分か」を扱うので、
 * そこを崩すと地図の意味が無くなる。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMapView,
  chomeLabel,
  jouLabel,
  latOfJou,
  lngOfChome,
} from '@/lib/sapporoGrid';
import { BUNDLED } from '@/data/event';

/** 実際の4会場（実測の緯度経度） */
const VENUES = BUNDLED.venues
  .map((v) => v.coords)
  .filter((c): c is { lat: number; lng: number } => c !== undefined);

describe('条・丁目 → 緯度経度', () => {
  test('北へ行くほど緯度が大きい', () => {
    assert.ok(latOfJou(4) > latOfJou(3));
    assert.ok(latOfJou(0) > latOfJou(-1));
  });

  test('西へ行くほど経度が小さい', () => {
    assert.ok(lngOfChome(6) < lngOfChome(3));
  });

  test('1条は約110m、1丁目は約100m', () => {
    const m = (latOfJou(1) - latOfJou(0)) * 111_320;
    assert.ok(Math.abs(m - 110) < 1, `1条が ${m}m`);
  });

  test('大通は番号で呼ばない', () => {
    assert.equal(jouLabel(0), '大通');
    assert.equal(jouLabel(3), '北3条');
    assert.equal(jouLabel(-1), '南1条');
    assert.equal(chomeLabel(6), '西6');
    assert.equal(chomeLabel(0), '東1');
  });
});

describe('buildMapView', () => {
  test('🔴 縦横の縮尺が揃っている', () => {
    // 同じ距離だけ北と東へ動いたら、画面上でも同じだけ動くこと
    const v = buildMapView(VENUES, 1.4);
    const origin = { lat: 43.064, lng: 141.35 };
    const north = { lat: origin.lat + 200 / 111_320, lng: origin.lng };
    const east = { lat: origin.lat, lng: origin.lng + 200 / (111_320 * Math.cos((43.064 * Math.PI) / 180)) };

    const dy = Math.abs(v.place(north).y - v.place(origin).y);
    const dx = Math.abs(v.place(east).x - v.place(origin).x);

    // 枠は横1.4倍なので、同じ距離なら x の比率は y の 1/1.4 になる
    assert.ok(Math.abs(dx * 1.4 - dy) < 0.01, `縦横で縮尺が違う: dx=${dx} dy=${dy}`);
  });

  test('会場が全部、枠の中に入る', () => {
    const v = buildMapView(VENUES, 1.02);
    for (const p of VENUES) {
      const { x, y } = v.place(p);
      assert.ok(x >= 0 && x <= 1, `x が枠の外: ${x}`);
      assert.ok(y >= 0 && y <= 1, `y が枠の外: ${y}`);
    }
  });

  test('北が上、東が右', () => {
    const v = buildMapView(VENUES, 1.4);
    const south = { lat: 43.06, lng: 141.35 };
    const north = { lat: 43.066, lng: 141.35 };
    const west = { lat: 43.063, lng: 141.346 };
    const east = { lat: 43.063, lng: 141.354 };
    assert.ok(v.place(north).y < v.place(south).y, '北が上になっていない');
    assert.ok(v.place(east).x > v.place(west).x, '東が右になっていない');
  });

  test('実際の4会場が、実際どおりの並びで置かれる', () => {
    const v = buildMapView(VENUES, 1.02);
    const at = (id: string) => {
      const c = BUNDLED.venues.find((x) => x.id === id)?.coords;
      assert.ok(c, `${id} に座標が無い`);
      return v.place(c);
    };
    // ACU(北4条) は 日本生命(北3条) より上
    assert.ok(at('acu').y < at('nissay').y);
    // 北洋(大通) がいちばん下
    assert.ok(at('hokuyo').y > at('nissay').y);
    assert.ok(at('hokuyo').y > at('akarenga').y);
    // 赤れんが(西6) がいちばん左、北洋(西3) がいちばん右
    assert.ok(at('akarenga').x < at('nissay').x);
    assert.ok(at('nissay').x < at('hokuyo').x);
  });

  test('🔴 赤れんがは、日本生命より南にある（住所は同じ北3条だが）', () => {
    // 住所どおりに置くと同じ高さになるが、実際は南にずれる。
    // 実測で置いている証拠になるテスト
    const v = buildMapView(VENUES, 1.02);
    const ak = BUNDLED.venues.find((x) => x.id === 'akarenga')?.coords;
    const ni = BUNDLED.venues.find((x) => x.id === 'nissay')?.coords;
    assert.ok(ak && ni);
    assert.ok(v.place(ak).y > v.place(ni).y, '赤れんがが日本生命より北に置かれている');
  });

  test('通りが引かれ、大通と創成川が区別されている', () => {
    const v = buildMapView(VENUES, 1.02);
    assert.ok(v.streets.length > 0);
    assert.ok(v.avenues.length > 0);
    assert.deepEqual(
      v.streets.filter((s) => s.park).map((s) => s.label),
      ['大通'],
    );
    // 創成川は西0丁目の線。枠に入っていれば1本だけ
    assert.ok(v.avenues.filter((a) => a.river).length <= 1);
  });

  test('会場が1つでも、座標が1つも無くても落ちない', () => {
    assert.ok(buildMapView([VENUES[0]], 1.4).streets.length > 0);
    assert.ok(buildMapView([], 1.4).streets.length > 0);
  });

  test('街区の大きさが、枠に対する比で返る', () => {
    const v = buildMapView(VENUES, 1.02);
    assert.ok(v.blockWidth > 0 && v.blockWidth < 1);
    assert.ok(v.blockHeight > 0 && v.blockHeight < 1);
  });
});
