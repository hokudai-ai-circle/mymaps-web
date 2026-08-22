/**
 * 興味タグの重みづけのテスト。
 *
 * **おすすめの並びに直接効くので、表そのものではなく「仕組み」を検証する。**
 * 表の中身（どの語が何点か）は変わり続ける前提なので、
 * ここで固定してしまうと、表を育てるたびにテストが落ちる。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeTagWeights,
  sessionsWithoutTagWeight,
  TAG_KEYWORDS,
  TAG_WEIGHT_CAP,
} from '@/data/tag-keywords';
import { BUNDLED } from '@/data/event';
import { interestScore } from '@/lib/recommend';
import type { Session } from '@/lib/dataset';
import type { Profile } from '@/store/AppContext';

function mk(extra: Partial<Session> = {}): Session {
  return {
    id: 't1',
    day: 'D1',
    start: '10:00',
    end: '11:00',
    venueId: 'akarenga',
    title: 'テスト',
    speaker: '',
    category: 'SOCIAL',
    desc: '',
    ...extra,
  };
}

describe('computeTagWeights', () => {
  test('語が無ければ、そのタグは付かない', () => {
    assert.deepEqual(computeTagWeights('関係のない文章です'), {});
  });

  test('当たった語のぶんだけ加点する', () => {
    const w = computeTagWeights('AIとDXの話');
    assert.ok((w['テクノロジー・AI'] ?? 0) > 0);
  });

  test('同じ語が何度出ても1回だけ数える', () => {
    // 説明文が長いセッションが、内容ではなく文字数で上位に来るのを防ぐ
    const once = computeTagWeights('AI');
    const many = computeTagWeights('AI AI AI AI AI AI');
    assert.deepEqual(once, many);
  });

  test('1つのタグにつく点には上限がある', () => {
    // 表の語を全部並べても、上限を超えない
    const all = TAG_KEYWORDS['フード'].map((k) => k.word).join(' ');
    assert.equal(computeTagWeights(all)['フード'], TAG_WEIGHT_CAP);
  });

  test('複数のタグに同時に付く', () => {
    const w = computeTagWeights('学生がAIで起業する');
    assert.ok((w['学生の活動'] ?? 0) > 0);
    assert.ok((w['テクノロジー・AI'] ?? 0) > 0);
    assert.ok((w['スタートアップ'] ?? 0) > 0);
  });
});

describe('interestScore', () => {
  const profile: Profile = { tags: ['フード'] };

  test('tagWeights があれば、そちらを使う', () => {
    const s = mk({ tagWeights: { フード: 4 } });
    assert.equal(interestScore(s, profile), 4);
  });

  test('🔴 カテゴリを一切見ない。新しいカテゴリでも点が付く', () => {
    // これが目的。公式が新しいカテゴリを出しても、おすすめの質が落ちない
    const s = mk({ category: 'CONFERENCE', tagWeights: { フード: 3 } });
    assert.equal(interestScore(s, profile), 3);
  });

  test('選んでいないタグの重みは足されない', () => {
    const s = mk({ tagWeights: { デザイン: 4 } });
    assert.equal(interestScore(s, profile), 0);
  });

  test('tagWeights が空のセッションは0点。カテゴリに落ちない', () => {
    // 重みが1つも付かなかったセッションは、書き出し側が tagWeights ごと省く。
    // 省かれた場合だけ従来の経路に落ちる
    const s = mk({ tagWeights: {} });
    assert.equal(interestScore(s, profile), 0);
  });

  test('tagWeights が無ければ、従来どおりカテゴリで加点する（移行中も壊れない）', () => {
    const p: Profile = { tags: ['地方創生'] };
    const s = mk({ category: 'SOCIAL' });
    assert.equal(interestScore(s, p), 3);
  });

  test('タグを選んでいなければ、興味の点は0（並びは「間に合うか」だけで決まる）', () => {
    const none: Profile = { tags: [] };
    assert.equal(interestScore(mk({ tagWeights: { フード: 4 } }), none), 0);
  });
});

describe('重みが1つも付かないセッションを見張る', () => {
  /*
    🔴 **「どの興味タグからも指されないカテゴリがあると、そのカテゴリの
    セッションは誰のおすすめにも上がらない」という考え方の移植。**
    加点をカテゴリ単位からセッション単位へ変えたあとも、同じ形の穴が空きうる。
    語の表に当たる語が1つも無いセッションは、誰の上位にも来ない。

    ⚠️ **落ちたら、語の表に語を足すこと。** セッションを消すのではない。
  */
  test('🔴 同梱データに、重みが1つも付かないセッションは無い', () => {
    const orphans = sessionsWithoutTagWeight(BUNDLED.sessions);
    assert.deepEqual(
      orphans,
      [],
      `どのタグを選んでも0点のセッション: ${orphans.join(', ')}`,
    );
  });

  test('語が1つも当たらなければ、ちゃんと検出する', () => {
    // 検査そのものが働いていることを確かめる。空配列を返すだけの関数では意味がない
    const dummy = [{ id: 'x', title: 'あああ', desc: 'いいい' }];
    assert.deepEqual(sessionsWithoutTagWeight(dummy), ['x']);
  });
});
