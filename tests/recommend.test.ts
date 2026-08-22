/**
 * ホームの「おすすめ」の並べ方。
 *
 * ここで守りたいのは1点。**間に合わない予定を、興味が近いという理由で上に出さないこと。**
 * 以前は重みを足し合わせて一発で順位を決めていたため、この逆転が起きていた。
 *
 * 実データではなく専用のセッションを組んでテストする。data/event.ts が変わるたびに
 * 落ちるテストは、判定の正しさではなくデータを見張っているだけになる。
 * カテゴリも直書きせず CATEGORIES から借りる（#45 と同じ方針）。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Session } from '@/lib/dataset';
import { BUNDLED } from '@/data/event';
import { CATEGORIES } from '@/constants/theme';
import type { Profile } from '@/store/AppContext';
import {
  feasibilityOf,
  interestScore,
  recommend,
  RECOMMEND_LIMIT,
} from '@/lib/recommend';

// 実際の徒歩時間: akarenga|nissay=3  akarenga|hokuyo=9  hokuyo|nissay=6

let seq = 0;
function mk(
  venueId: string,
  start: string,
  end: string,
  extra: Partial<Session> = {},
): Session {
  seq += 1;
  return {
    id: `r${seq}`,
    day: 'D1',
    start,
    end,
    venueId,
    title: `候補${seq}`,
    speaker: '',
    category: CATEGORIES[0],
    desc: '',
    ...extra,
  };
}

const base = { dataset: BUNDLED, earlyLeaves: {}, day: 'D1' };

/** 'スタートアップ' は CAREER に対応する。CAREER のセッションだけ +3 される */
const careerFan: Profile = { tags: ['スタートアップ'] };
const CAREER = 'CAREER' as const;

describe('interestScore（従来のスコア。挙動を変えていないことの確認）', () => {
  it('興味タグがカテゴリに一致すると +3', () => {
    assert.equal(interestScore(mk('akarenga', '10:00', '11:00', { category: CAREER }), careerFan), 3);
  });

  it('一致しなければ 0', () => {
    assert.equal(interestScore(mk('akarenga', '10:00', '11:00'), careerFan), 0);
  });

  it('プロフィールが無くても例外にならない', () => {
    assert.equal(interestScore(mk('akarenga', '10:00', '11:00'), null), 0);
  });
});

describe('feasibilityOf', () => {
  const planned = [mk('hokuyo', '10:00', '11:00')];

  it('余裕をもって入るなら fits', () => {
    assert.equal(feasibilityOf(mk('hokuyo', '13:00', '14:00'), planned, BUNDLED, {}), 'fits');
  });

  it('ちょうど間に合うだけなら tight（積極的には勧めない）', () => {
    // hokuyo→akarenga は徒歩9分。11:00終了 → 11:09開始
    assert.equal(feasibilityOf(mk('akarenga', '11:09', '12:00'), planned, BUNDLED, {}), 'tight');
  });

  it('移動時間が足りなければ misses', () => {
    assert.equal(feasibilityOf(mk('akarenga', '11:05', '12:00'), planned, BUNDLED, {}), 'misses');
  });

  it('受付締切に間に合わなければ misses', () => {
    const late = [mk('hokuyo', '11:00', '11:55')];
    const s = mk('akarenga', '13:00', '14:00', { reception: '12:00' });
    assert.equal(feasibilityOf(s, late, BUNDLED, {}), 'misses');
  });

  it('時間が完全に重なれば conflict', () => {
    assert.equal(feasibilityOf(mk('hokuyo', '10:30', '11:30'), planned, BUNDLED, {}), 'conflict');
  });

  it('徒歩時間が未登録なら tight（分からないものを上位に置かない）', () => {
    const unknown = [mk('nowhere', '10:00', '11:00')];
    assert.equal(feasibilityOf(mk('hokuyo', '13:00', '14:00'), unknown, BUNDLED, {}), 'tight');
  });
});

describe('recommend', () => {
  it('間に合う候補が、興味が近いだけで間に合わない候補より上に来る', () => {
    const planned = [mk('hokuyo', '10:00', '11:00')];
    // 興味に刺さる（+3）が、移動が9分必要なところ5分しかない
    const tempting = mk('akarenga', '11:05', '12:00', { category: CAREER });
    // 興味には刺さらない（0）が、余裕をもって入る
    const reachable = mk('hokuyo', '13:00', '14:00');

    const out = recommend({ ...base, sessions: [tempting, reachable], planned, profile: careerFan });

    assert.equal(out[0].id, reachable.id);
    assert.equal(out[1].id, tempting.id);
  });

  it('時間が完全に重なる候補は最後に回る', () => {
    const planned = [mk('hokuyo', '10:00', '11:00')];
    const overlapping = mk('hokuyo', '10:30', '11:30', { category: CAREER });
    const missing = mk('akarenga', '11:05', '12:00');

    const out = recommend({
      ...base,
      sessions: [overlapping, missing],
      planned,
      profile: careerFan,
    });

    assert.equal(out[out.length - 1].id, overlapping.id);
  });

  it('同じ段の中では従来どおりスコアの高い順に並ぶ', () => {
    const plain = mk('akarenga', '13:00', '14:00');
    const liked = mk('akarenga', '15:00', '16:00', { category: CAREER });

    const out = recommend({ ...base, sessions: [plain, liked], planned: [], profile: careerFan });
    assert.equal(out[0].id, liked.id);
  });

  it('スコアが同じなら開始が早い順', () => {
    const late = mk('akarenga', '15:00', '16:00');
    const early = mk('akarenga', '13:00', '14:00');
    const out = recommend({ ...base, sessions: [late, early], planned: [], profile: null });
    assert.deepEqual(out.map((s) => s.id), [early.id, late.id]);
  });

  it('プロフィールが無くても（オンボーディングを飛ばしても）返す', () => {
    const sessions = [mk('akarenga', '10:00', '10:30'), mk('akarenga', '11:00', '11:30')];
    assert.equal(recommend({ ...base, sessions, planned: [], profile: null }).length, 2);
  });

  it('既に予定に入れたものは出さない', () => {
    const already = mk('akarenga', '10:00', '10:30');
    const other = mk('akarenga', '12:00', '12:30');
    const out = recommend({
      ...base,
      sessions: [already, other],
      planned: [already],
      profile: careerFan,
    });
    assert.deepEqual(out.map((s) => s.id), [other.id]);
  });

  it('別の日のセッションは混ざらない（#33）', () => {
    const today = mk('akarenga', '10:00', '10:30');
    const tomorrow = mk('akarenga', '10:00', '10:30', { day: 'D2' });
    const out = recommend({ ...base, sessions: [today, tomorrow], planned: [], profile: null });
    assert.deepEqual(out.map((s) => s.id), [today.id]);
  });

  it('上限に満たない日は、あるだけ返す（別日から借りてこない）', () => {
    // 実データでは9/26が1件しかない。6件に足りなくても、そのまま出すのが正
    const sessions = [mk('akarenga', '10:00', '10:30'), mk('akarenga', '11:00', '11:30')];
    assert.equal(recommend({ ...base, sessions, planned: [], profile: null }).length, 2);
  });

  it(`上限は${RECOMMEND_LIMIT}件で、それ以上は返さない`, () => {
    const sessions = Array.from({ length: RECOMMEND_LIMIT + 3 }, (_, i) =>
      mk('akarenga', `${String(9 + i).padStart(2, '0')}:00`, `${String(9 + i).padStart(2, '0')}:30`),
    );
    const out = recommend({ ...base, sessions, planned: [], profile: null });
    assert.equal(out.length, RECOMMEND_LIMIT);
  });

  it('何度呼んでも同じ並びを返す（reshuffleは持たない）', () => {
    // 「別の◯件を見る」を廃止した。押すたびに並びが変わると、
    // さっき見たものを探せなくなるため
    const sessions = Array.from({ length: RECOMMEND_LIMIT + 3 }, (_, i) =>
      mk('akarenga', `${String(9 + i).padStart(2, '0')}:00`, `${String(9 + i).padStart(2, '0')}:30`),
    );
    const first = recommend({ ...base, sessions, planned: [], profile: null });
    const second = recommend({ ...base, sessions, planned: [], profile: null });
    assert.deepEqual(first.map((s) => s.id), second.map((s) => s.id));
  });

  it('同じ入力なら必ず同じ順序を返す', () => {
    const sessions = [
      mk('akarenga', '10:00', '10:30'),
      mk('akarenga', '10:00', '10:30'),
      mk('akarenga', '10:00', '10:30'),
    ];
    const a = recommend({ ...base, sessions, planned: [], profile: null });
    const b = recommend({ ...base, sessions, planned: [], profile: null });
    assert.deepEqual(a.map((s) => s.id), b.map((s) => s.id));
  });

  it('候補が無ければ空を返す', () => {
    assert.deepEqual(recommend({ ...base, sessions: [], planned: [], profile: null }), []);
  });
});
