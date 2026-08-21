/**
 * 判定エンジンのテスト。
 *
 * `lib/schedule.ts` は「UIから独立して検証できるように」純粋関数へ切り出してあるが、
 * これまで一度も検証していなかった。`npm run typecheck` は仕様の誤りを1件も検出しない
 * （型が通ることと、答えが正しいことは無関係）。
 *
 * 実行: npm test
 *
 * セッションの中身には依存しないが、**会場IDと徒歩時間には依存している**。
 * #58 で判定エンジンがデータセットを引数に取るようになったので、
 * 徒歩時間はここから注入できる。**大域を引く隠れた依存は無くなった。**
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { Dataset, Session } from '@/lib/dataset';
import { missingWalks, walkMinutesBetween } from '@/lib/dataset';
import { BUNDLED, SESSIONS, VENUES } from '@/data/event';
import {
  buildPlan,
  checkAdd,
  evaluateTravel,
  findAlternatives,
  findFreeSlots,
  findSlotCandidates,
  isProblem,
  travelLabel,
  validateSessions,
} from '@/lib/schedule';

// 実際の徒歩時間（NoMaps2026の実会場・3ペア）:
//   akarenga|nissay=3   hokuyo|nissay=6   akarenga|hokuyo=9

let seq = 0;
function mk(
  venueId: string,
  start: string,
  end: string,
  extra: Partial<Session> = {},
): Session {
  seq += 1;
  return {
    id: `t${seq}`,
    day: 'D1',
    start,
    end,
    venueId,
    title: `テスト${seq}`,
    speaker: 'テスト',
    category: 'SOCIAL',
    moods: [],
    desc: '',
    ...extra,
  };
}

describe('walkMinutesBetween', () => {
  test('同一会場は0分', () => {
    assert.equal(walkMinutesBetween(BUNDLED, 'akarenga', 'akarenga'), 0);
  });

  test('登録済みのペアは登録値を返す', () => {
    assert.equal(walkMinutesBetween(BUNDLED, 'akarenga', 'hokuyo'), 9);
  });

  test('会場の順番を入れ替えても同じ値', () => {
    assert.equal(
      walkMinutesBetween(BUNDLED, 'hokuyo', 'akarenga'),
      walkMinutesBetween(BUNDLED, 'akarenga', 'hokuyo'),
    );
  });

  test('未登録のペアは null を返す（既定値をでっち上げない）', () => {
    // 実データで会場が増えたとき、ここが既定値を返すと
    // 「実測した値」と「勝手に補われた値」が見分けられなくなる
    assert.equal(walkMinutesBetween(BUNDLED, 'akarenga', 'shin-sapporo'), null);
  });
});

describe('evaluateTravel — 基本の5状態', () => {
  test('直前の予定がなければ first', () => {
    const t = evaluateTravel(null, mk('akarenga', '10:00', '11:00'), BUNDLED);
    assert.equal(t.status, 'first');
    assert.equal(t.from, null);
  });

  test('余裕があれば ok', () => {
    // 赤れんが 10:00-11:00 → 日本生命 11:30。徒歩3分、余裕27分
    const t = evaluateTravel(
      mk('akarenga', '10:00', '11:00'),
      mk('nissay', '11:30', '12:00'),
      BUNDLED,
    );
    assert.equal(t.status, 'ok');
    assert.equal(t.walkMinutes, 3);
    assert.equal(t.slackMinutes, 27);
  });

  test('ぴったりなら exact', () => {
    // 赤れんが 10:00-11:00 → 日本生命 11:03。徒歩3分、余裕0分
    const t = evaluateTravel(
      mk('akarenga', '10:00', '11:00'),
      mk('nissay', '11:03', '12:00'),
      BUNDLED,
    );
    assert.equal(t.status, 'exact');
    assert.equal(t.slackMinutes, 0);
  });

  test('足りなければ short', () => {
    // 赤れんが 10:00-11:00 → 北洋銀行 11:05。徒歩9分、4分不足
    const t = evaluateTravel(
      mk('akarenga', '10:00', '11:00'),
      mk('hokuyo', '11:05', '12:00'),
      BUNDLED,
    );
    assert.equal(t.status, 'short');
    assert.equal(t.slackMinutes, -4);
  });

  test('前の予定にほぼ出られないほど重なっていれば overlap', () => {
    // 赤れんが 10:00-11:00 → 北洋銀行 10:05。10:05に着くには9:56に出る必要があり、
    // 前の予定の開始(10:00)より前になるので両立不可能
    const t = evaluateTravel(
      mk('akarenga', '10:00', '11:00'),
      mk('hokuyo', '10:05', '11:00'),
      BUNDLED,
    );
    assert.equal(t.status, 'overlap');
  });

  test('重なっていても早退で間に合うなら short で、退出時刻を出す', () => {
    // 赤れんが 10:00-11:00 → 北洋銀行 10:50。10:41に抜ければ間に合う
    const t = evaluateTravel(
      mk('akarenga', '10:00', '11:00'),
      mk('hokuyo', '10:50', '11:30'),
      BUNDLED,
    );
    assert.equal(t.status, 'short');
    assert.equal(t.leaveBy, '10:41');
    assert.equal(t.earlyLeaveMinutes, 19);
  });
});

describe('evaluateTravel — 受付締切（このアプリが生まれた理由のケース）', () => {
  // 赤れんが 15:00-16:00 → 北洋銀行 16:20開始・受付16:05締切。徒歩9分。
  // 16:00に出ると16:09着で、受付に4分遅れる。
  const prev = () => mk('akarenga', '15:00', '16:00');
  const next = () => mk('hokuyo', '16:20', '17:30', { reception: '16:05' });

  test('受付に間に合わなければ reception', () => {
    const t = evaluateTravel(prev(), next(), BUNDLED);
    assert.equal(t.status, 'reception');
    assert.equal(t.receptionShortMinutes, 4);
  });

  test('受付締切から逆算した退出時刻を提示する', () => {
    // ここが壊れていた。開始時刻(16:20)から逆算していたため earlyLeave が常に0になり、
    // leaveBy が null で「前の予定を○○に抜ける」ボタンが出なかった。
    // 受付締切(16:05)から逆算すれば 15:56 に抜ければ解決すると分かる。
    const t = evaluateTravel(prev(), next(), BUNDLED);
    assert.equal(t.leaveBy, '15:56');
    assert.equal(t.earlyLeaveMinutes, 4);
  });

  test('提示された時刻に早退すると、実際に解決する', () => {
    // 提示するだけして実は解決しない、では意味がない
    const t = evaluateTravel(prev(), next(), BUNDLED, '15:56');
    assert.equal(t.status, 'ok');
    assert.equal(t.slackMinutes, 15);
  });

  test('受付締切が無いセッションでは、開始時刻から逆算する', () => {
    // 日本生命 12:15-13:00 → 赤れんが 13:03開始。徒歩3分でちょうど13:03着
    const t = evaluateTravel(
      mk('nissay', '12:15', '13:00'),
      mk('akarenga', '13:03', '14:30'),
      BUNDLED,
    );
    assert.equal(t.status, 'exact');
    assert.equal(t.earlyLeaveMinutes, 0);
  });
});

describe('データの検証', () => {
  test('reception が開始より後なら不整合として報告する', () => {
    // これを許すと、実際には間に合う移動を「N分足りません」と誤警告する。
    // 「開始後もこの時刻までなら入れる」という猶予は reception では表現できない
    const bad = mk('akarenga', '13:06', '14:30', { reception: '13:15' });
    const problems = validateSessions([bad], VENUES);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /受付締切/);
  });

  test('終了が開始より前なら報告する', () => {
    const bad = mk('akarenga', '14:00', '13:00');
    assert.match(validateSessions([bad], VENUES).join(), /終了/);
  });

  test('会場一覧に無い会場を使っていたら報告する', () => {
    const bad = mk('shin-sapporo', '10:00', '11:00');
    assert.match(validateSessions([bad], VENUES).join(), /会場/);
  });

  test('同梱データに不整合がない', () => {
    // 実データに差し替えたら、まずこのテストを通すこと
    assert.deepEqual(validateSessions(SESSIONS, VENUES), []);
  });

  /**
   * 徒歩時間が未登録のペア。
   *
   * **2026-08-11に会場が4つ目（ACU）に増え、ここが実際に壊れた。**
   * 「会場が増えたときに真っ先に壊れる場所」という当初の想定どおりに壊れたので、
   * テストとしては正しく働いている。
   *
   * ⚠️ **概算で埋めて緑にしないこと。** 実測（#61）が入るまでは欠落が正しい状態で、
   * このテストは「いま何が欠けているか」を記録する役目に変わっている。
   * 実測が入ったら期待値を [] に戻すこと。
   */
  const KNOWN_MISSING_PAIRS = ['akarenga ↔ acu', 'nissay ↔ acu', 'hokuyo ↔ acu'];

  test('未登録の徒歩時間は、把握しているぶんだけ（勝手に増えていない）', () => {
    assert.deepEqual(missingWalks(BUNDLED), KNOWN_MISSING_PAIRS);
  });

  test('会場を1つ足すと、その会場ぶんの未登録ペアが増える', () => {
    // 増えた数だけを見る。既存の欠落数に依存させると、#61 で実測が入ったときに
    // 「何を検証したかったのか」が分からない形で落ちる
    const extra: Dataset = {
      ...BUNDLED,
      venues: [
        ...BUNDLED.venues,
        { id: 'shin-sapporo', name: '新札幌', letter: 'E', desc: '', address: '', x: 0, y: 0 },
      ],
    };
    const before = missingWalks(BUNDLED).length;
    const after = missingWalks(extra).length;
    assert.equal(after - before, BUNDLED.venues.length);
  });
});

describe('evaluateTravel — 徒歩時間が未登録のとき', () => {
  test('判定せず unknown を返し、分数をでっち上げない', () => {
    const t = evaluateTravel(
      mk('akarenga', '10:00', '11:00'),
      mk('shin-sapporo', '11:30', '12:30'),
      BUNDLED,
    );
    assert.equal(t.status, 'unknown');
    assert.equal(t.walkMinutes, null);
  });

  test('unknown は「問題あり」側に分類する（黙って大丈夫にしない）', () => {
    assert.equal(isProblem('unknown'), true);
  });
});

describe('buildPlan', () => {
  test('渡した順番に関わらず開始時刻順に並べる', () => {
    const a = mk('akarenga', '10:00', '11:00');
    const b = mk('nissay', '13:00', '14:00');
    const c = mk('hokuyo', '11:30', '12:30');
    const plan = buildPlan([b, c, a], BUNDLED);
    assert.deepEqual(
      plan.map((p) => p.session.start),
      ['10:00', '11:30', '13:00'],
    );
    assert.equal(plan[0].travel.status, 'first');
  });

  test('早退を登録すると警告が消える', () => {
    const prev = mk('akarenga', '15:00', '16:00');
    const next = mk('hokuyo', '16:20', '17:30', { reception: '16:05' });

    const before = buildPlan([prev, next], BUNDLED);
    assert.equal(before[1].travel.status, 'reception');

    const after = buildPlan([prev, next], BUNDLED, { [prev.id]: '15:56' });
    assert.equal(after[1].travel.status, 'ok');
    assert.equal(after[1].travel.appliedLeaveAt, '15:56');
  });
});

describe('checkAdd', () => {
  test('時間が完全に重なる予定があれば追加を止める', () => {
    const planned = [mk('akarenga', '10:00', '11:00')];
    const r = checkAdd(mk('akarenga', '10:30', '11:30'), planned, BUNDLED);
    assert.equal(r.ok, false);
    assert.equal(r.conflictWith?.id, planned[0].id);
  });

  test('追加すると後続が壊れる場合、壊れる相手を指し示す', () => {
    // 赤れんが 10:00-11:00 と 北洋銀行 11:55-13:00 の間に 日本生命 11:10-11:50 を入れる。
    // 入るところまでは間に合うが、そこから北洋銀行(徒歩6分)へは5分しかなく後続が壊れる
    const p1 = mk('akarenga', '10:00', '11:00');
    const p2 = mk('hokuyo', '11:55', '13:00');
    const r = checkAdd(mk('nissay', '11:10', '11:50'), [p1, p2], BUNDLED);

    assert.equal(r.conflictWith, null);
    assert.equal(r.incoming.status, 'ok');
    assert.equal(r.breaksNext?.session.id, p2.id);
    assert.equal(r.ok, false);
  });

  test('問題がなければ ok', () => {
    const planned = [mk('akarenga', '10:00', '11:00')];
    const r = checkAdd(mk('nissay', '11:30', '12:30'), planned, BUNDLED);
    assert.equal(r.ok, true);
    assert.equal(r.breaksNext, null);
  });
});

describe('findAlternatives', () => {
  test('移動が破綻する候補は返さない', () => {
    const p1 = mk('akarenga', '10:00', '11:00');
    const target = mk('hokuyo', '11:05', '12:00');
    const reachable = mk('nissay', '11:10', '11:50'); // 徒歩3分・余裕7分
    const unreachable = mk('hokuyo', '11:02', '11:50'); // 徒歩9分・7分不足

    const alts = findAlternatives(
      target,
      [p1, target],
      [p1, target, reachable, unreachable],
      BUNDLED,
    );

    const ids = alts.map((a) => a.session.id);
    assert.ok(ids.includes(reachable.id), '間に合う候補は返すべき');
    assert.ok(!ids.includes(unreachable.id), '間に合わない候補を混ぜてはいけない');
  });
});

describe('findSlotCandidates — 空き時間の提案', () => {
  // 赤れんが 10:00-11:00 と 北洋銀行 15:00-16:00 の間が空いている
  const p1 = mk('akarenga', '10:00', '11:00');
  const p2 = mk('hokuyo', '15:00', '16:00');
  const planned = [p1, p2];
  const slot = findFreeSlots(buildPlan(planned, BUNDLED))[0];

  test('前提: 11:00–15:00 の空きが検出される', () => {
    assert.equal(slot.start, '11:00');
    assert.equal(slot.end, '15:00');
  });

  test('歩いて間に合わない候補を勧めない', () => {
    // 北洋銀行 11:05 開始。赤れんがから徒歩9分で4分足りない。
    // 上のスケジュールで「4分足りません」と警告している、まさにその区間
    const unreachable = mk('hokuyo', '11:05', '12:00');
    const r = findSlotCandidates(slot, 'D1', planned, [...planned, unreachable], BUNDLED);

    assert.deepEqual(r.reachable, []);
    assert.equal(r.unreachableCount, 1);
  });

  test('間に合う候補は勧める', () => {
    // 日本生命 11:30 開始。赤れんがから徒歩3分で余裕27分
    const reachable = mk('nissay', '11:30', '12:30');
    const r = findSlotCandidates(slot, 'D1', planned, [...planned, reachable], BUNDLED);

    assert.deepEqual(
      r.reachable.map((s) => s.id),
      [reachable.id],
    );
    assert.equal(r.unreachableCount, 0);
  });

  test('間に合わない件数を黙って捨てず、数だけは残す', () => {
    // 「候補がありません」とだけ出すと、開催されているのに何も無いように見える
    const ok1 = mk('nissay', '11:30', '12:30');
    const ng1 = mk('hokuyo', '11:05', '12:00');
    const ng2 = mk('hokuyo', '11:02', '11:50');
    const r = findSlotCandidates(slot, 'D1', planned, [...planned, ok1, ng1, ng2], BUNDLED);

    assert.equal(r.reachable.length, 1);
    assert.equal(r.unreachableCount, 2);
  });

  test('別の日のセッションは混ざらない', () => {
    const otherDay = mk('nissay', '11:30', '12:30', { day: 'D2' });
    const r = findSlotCandidates(slot, 'D1', planned, [...planned, otherDay], BUNDLED);
    assert.equal(r.reachable.length, 0);
    assert.equal(r.unreachableCount, 0);
  });

  test('すでに予定に入っているセッションは候補にしない', () => {
    const r = findSlotCandidates(slot, 'D1', planned, planned, BUNDLED);
    assert.equal(r.reachable.length, 0);
    assert.equal(r.unreachableCount, 0);
  });
});

describe('travelLabel', () => {
  test('不足分をマイナス表記にしない', () => {
    const t = evaluateTravel(
      mk('akarenga', '10:00', '11:00'),
      mk('hokuyo', '11:05', '12:00'),
      BUNDLED,
    );
    assert.equal(travelLabel(t), '徒歩9分・4分足りません');
    assert.ok(!travelLabel(t).includes('-'));
  });

  test('未登録のときは徒歩の分数を出さない', () => {
    const t = evaluateTravel(
      mk('akarenga', '10:00', '11:00'),
      mk('shin-sapporo', '11:30', '12:30'),
      BUNDLED,
    );
    assert.ok(!/徒歩\d/.test(travelLabel(t)));
  });
});
