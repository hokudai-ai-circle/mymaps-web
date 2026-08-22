/**
 * 建物内の縦移動のテスト。
 *
 * **判定エンジンに直接効く数字なので、境界を1つずつ押さえる。**
 * 3階層ごとに1分増える式は、境目（4階分と5階分、7階分と8階分）で
 * 間違えやすい。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ELEVATOR_WAIT_MINUTES,
  GROUND_FLOOR,
  verticalMinutes,
  verticalMinutesBetween,
} from '@/lib/elevator';
import { evaluateTravel } from '@/lib/schedule';
import type { Session } from '@/lib/dataset';
import { BUNDLED } from '@/data/event';

describe('verticalMinutes', () => {
  test('同じ階なら0分。待ち時間も足さない', () => {
    assert.equal(verticalMinutes(12, 12), 0);
    assert.equal(verticalMinutes(1, 1), 0);
  });

  test('階が分からなければ0分。推測で埋めない', () => {
    // 北洋銀行本店セミナーホールは公式に階の記載が無い
    assert.equal(verticalMinutes(undefined, 5), 0);
    assert.equal(verticalMinutes(5, undefined), 0);
    assert.equal(verticalMinutes(undefined, undefined), 0);
  });

  test('1〜3階分の移動は、待ち1分＋1分', () => {
    assert.equal(verticalMinutes(1, 2), 2);
    assert.equal(verticalMinutes(1, 4), 2);
  });

  test('4〜6階分の移動は、待ち1分＋2分', () => {
    assert.equal(verticalMinutes(1, 5), 3);
    assert.equal(verticalMinutes(1, 7), 3);
  });

  test('3階層ごとに1分ずつ増える', () => {
    assert.equal(verticalMinutes(1, 8), 4); // 7階分 → 3分
    assert.equal(verticalMinutes(1, 10), 4); // 9階分 → 3分
    assert.equal(verticalMinutes(1, 11), 5); // 10階分 → 4分
    assert.equal(verticalMinutes(1, 13), 5); // 12階分 → 4分
    assert.equal(verticalMinutes(1, 16), 6); // 15階分 → 5分
  });

  test('上りと下りは同じ。向きで変えない', () => {
    assert.equal(verticalMinutes(12, 1), verticalMinutes(1, 12));
  });

  test('待ち時間は1回の乗車につき1回だけ', () => {
    // 12階→16階は4階分。待ち1分 + 2分 = 3分（降りて乗り直さない）
    assert.equal(verticalMinutes(12, 16), ELEVATOR_WAIT_MINUTES + 2);
  });
});

describe('verticalMinutesBetween', () => {
  test('同じ建物なら、階の差だけを見る', () => {
    // ACU 12階 → 16階
    assert.equal(verticalMinutesBetween(true, 12, 16), 3);
  });

  test('建物が違えば、降りてから上がる。待ちは2回ぶん', () => {
    // ACU 12階 → 赤れんが 2階 = 5分（12→1） + 2分（1→2）
    assert.equal(verticalMinutesBetween(false, 12, 2), 7);
  });

  test('1階どうしなら、建物が違っても0分', () => {
    assert.equal(verticalMinutesBetween(false, GROUND_FLOOR, GROUND_FLOOR), 0);
  });

  test('片方の階が不明なら、分かるほうだけを足す', () => {
    // 階が不明な会場 → ACU 12階。上りぶんだけ乗る
    assert.equal(verticalMinutesBetween(false, undefined, 12), 5);
  });
});

let seq = 0;
function mk(venueId: string, start: string, end: string, extra: Partial<Session> = {}): Session {
  seq += 1;
  return {
    id: `e${seq}`,
    day: 'D1',
    start,
    end,
    venueId,
    title: `テスト${seq}`,
    speaker: '',
    category: 'SOCIAL',
    desc: '',
    ...extra,
  };
}

describe('evaluateTravel に縦移動が乗る', () => {
  test('同じ会場の階違いでも、移動時間が0にならない', () => {
    // 同一会場は徒歩0分として扱われるが、階が違えば縦移動が乗る
    const t = evaluateTravel(
      mk('acu', '16:00', '16:50', { floor: 12 }),
      mk('acu', '17:00', '18:00', { floor: 16 }),
      BUNDLED,
    );
    assert.equal(t.horizontalMinutes, 0);
    assert.equal(t.verticalMinutes, 3);
    assert.equal(t.walkMinutes, 3);
    assert.equal(t.slackMinutes, 7); // 10分の間に3分かかる
  });

  test('建物をまたぐと、徒歩に縦移動が上乗せされる', () => {
    // 赤れんが 2階 → 日本生命 4階。徒歩3分 + 降り2分 + 上り2分 = 7分
    const t = evaluateTravel(
      mk('akarenga', '10:00', '11:00', { floor: 2 }),
      mk('nissay', '11:30', '12:00', { floor: 4 }),
      BUNDLED,
    );
    assert.equal(t.horizontalMinutes, 3);
    assert.equal(t.verticalMinutes, 4);
    assert.equal(t.walkMinutes, 7);
    assert.equal(t.slackMinutes, 23); // 30分の間に7分
  });

  test('階を持たないセッションは、これまでどおり徒歩だけ', () => {
    const t = evaluateTravel(
      mk('akarenga', '10:00', '11:00'),
      mk('nissay', '11:30', '12:00'),
      BUNDLED,
    );
    assert.equal(t.verticalMinutes, 0);
    assert.equal(t.walkMinutes, 3);
    assert.equal(t.slackMinutes, 27);
  });

  test('徒歩時間が未登録なら、縦移動があっても判定しない', () => {
    // 分からないものに、分かるぶんだけ足して答えを出さない。
    // BUNDLED では acu↔nissay の徒歩時間は未登録
    const t = evaluateTravel(
      mk('acu', '10:00', '11:00', { floor: 12 }),
      mk('nissay', '11:30', '12:00', { floor: 4 }),
      BUNDLED,
    );
    assert.equal(t.status, 'unknown');
    assert.equal(t.walkMinutes, null);
  });
});
