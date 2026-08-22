/**
 * 外から来たデータの検証と選択。
 *
 * **ここが通るかどうかで、アプリが嘘をつくかどうかが決まる。**
 * 判定エンジンは入力が正しい前提で動くので、壊れた入力はここで止めるしかない。
 *
 * 実データの中身には依存させない。公式のプログラムは会期の数日前まで増え続けるので、
 * 件数や会場名を見張るテストは、正しさではなく現時点の値を固定するだけになる。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Dataset } from '@/lib/dataset';
import {
  categoriesOf,
  missingWalks,
  parseDataset,
  SCHEMA_VERSION,
  selectDataset,
  sessionById,
  venueById,
  walkMinutesBetween,
} from '@/lib/dataset';

/** 最小の正しいデータ。各テストはここから1箇所だけ壊す */
function valid(): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    dataVersion: 3,
    generatedAt: '2026-09-22T09:00:00Z',
    eventYear: 2026,
    days: [
      { id: '9/25', label: '9/25', weekday: '金' },
      { id: '9/26', label: '9/26', weekday: '土' },
    ],
    venues: [
      { id: 'a', name: '会場A', letter: 'A', desc: '', address: '', x: 0.2, y: 0.3 },
      { id: 'b', name: '会場B', letter: 'B', desc: '', address: '', x: 0.5, y: 0.4 },
      {
        id: 'c',
        name: '会場C',
        letter: 'C',
        desc: '',
        address: '',
        x: 0.8,
        y: 0.6,
        coords: { lat: 43.06, lng: 141.35 },
      },
    ],
    walks: [{ from: 'a', to: 'b', minutes: 9 }],
    sessions: [
      {
        id: 's1',
        day: '9/25',
        start: '14:00',
        end: '15:30',
        venueId: 'a',
        title: 'セッション1',
        speaker: '',
        category: 'SOCIAL',
        desc: '',
      },
      {
        id: 's2',
        day: '9/25',
        start: '15:00',
        end: '16:00',
        venueId: 'b',
        title: 'セッション2',
        speaker: '',
        category: 'CAREER',
        desc: '',
      },
    ],
  };
}

function parsed(): Dataset {
  const r = parseDataset(valid());
  assert.ok(r.ok, '前提: 素のデータは通ること');
  return r.dataset;
}

/** 1箇所だけ差し替える */
function broken(patch: Record<string, unknown>): ReturnType<typeof parseDataset> {
  return parseDataset({ ...valid(), ...patch });
}

describe('parseDataset — 通すべきもの', () => {
  it('正しいデータは通る', () => {
    const r = parseDataset(valid());
    assert.ok(r.ok);
    assert.equal(r.dataset.sessions.length, 2);
    assert.equal(r.dataset.venues.length, 3);
  });

  it('🔴 徒歩時間が足りなくても通す', () => {
    // **これが最も重要。** 未登録は想定内の状態で、UI側が「未登録」と表示する。
    // ここで落とすと、新しい会場が1つ増えただけでデータ全体が拒否され、
    // アプリが二度と更新されなくなる
    const r = broken({ walks: [] });
    assert.ok(r.ok, r.ok ? '' : r.reasons.join(' / '));
    assert.equal(walkMinutesBetween(r.dataset, 'a', 'b'), null);
  });

  it('🔴 知らないカテゴリでも通す', () => {
    // 会期中に公式が新しいカテゴリを出したとき、拒否するとその
    // セッションが利用者から見えなくなる。受け入れて表示する方が害が小さい
    const s = valid().sessions as Record<string, unknown>[];
    s[0].category = 'まったく新しいカテゴリ';
    const r = broken({ sessions: s });
    assert.ok(r.ok, r.ok ? '' : r.reasons.join(' / '));
    assert.equal(r.dataset.sessions[0].category, 'まったく新しいカテゴリ');
  });

  it('座標が無い会場があっても通す', () => {
    // 座標は「無い」ことが正常。推測で埋めない方針（#61）
    const r = parseDataset(valid());
    assert.ok(r.ok);
    assert.equal(r.dataset.venues[0].coords, undefined);
    assert.deepEqual(r.dataset.venues[2].coords, { lat: 43.06, lng: 141.35 });
  });

  it('知らない項目が増えても落ちない', () => {
    // 公開側が先に項目を足しても、古いアプリが壊れないこと
    const s = valid().sessions as Record<string, unknown>[];
    s[0].未来の項目 = 'なにか';
    assert.ok(broken({ sessions: s }).ok);
  });
});

describe('parseDataset — 落とすべきもの', () => {
  it('形の版が違えば拒否する', () => {
    const r = broken({ schemaVersion: 99 });
    assert.equal(r.ok, false);
  });

  it('存在しない会場を指すセッションは拒否する', () => {
    // 通すと、会場名の表示も徒歩時間の判定も破綻する
    const s = valid().sessions as Record<string, unknown>[];
    s[0].venueId = 'いない会場';
    assert.equal(broken({ sessions: s }).ok, false);
  });

  it('days に無い日付のセッションは拒否する', () => {
    const s = valid().sessions as Record<string, unknown>[];
    s[0].day = '9/30';
    assert.equal(broken({ sessions: s }).ok, false);
  });

  it('時刻が HH:MM でなければ拒否する', () => {
    const s = valid().sessions as Record<string, unknown>[];
    s[0].start = '14時';
    assert.equal(broken({ sessions: s }).ok, false);
  });

  it('終了が開始以前なら拒否する', () => {
    const s = valid().sessions as Record<string, unknown>[];
    s[0].end = '13:00';
    assert.equal(broken({ sessions: s }).ok, false);
  });

  it('受付締切が開始以降なら拒否する', () => {
    // 判定エンジンは reception を締切としてしか読めない。開始より後の値を通すと、
    // 実際には間に合う移動を「N分足りません」と誤って警告する
    const s = valid().sessions as Record<string, unknown>[];
    s[0].reception = '14:30';
    assert.equal(broken({ sessions: s }).ok, false);
  });

  it('セッションのIDが重複していれば拒否する', () => {
    const s = valid().sessions as Record<string, unknown>[];
    s[1].id = s[0].id;
    assert.equal(broken({ sessions: s }).ok, false);
  });

  it('存在しない会場を指す徒歩時間は拒否する', () => {
    assert.equal(broken({ walks: [{ from: 'a', to: 'いない会場', minutes: 5 }] }).ok, false);
  });

  it('徒歩時間が負なら拒否する', () => {
    assert.equal(broken({ walks: [{ from: 'a', to: 'b', minutes: -1 }] }).ok, false);
  });

  it('会場が空なら拒否する', () => {
    assert.equal(broken({ venues: [] }).ok, false);
  });

  it('オブジェクトでなければ拒否する', () => {
    assert.equal(parseDataset(null).ok, false);
    assert.equal(parseDataset('文字列').ok, false);
    assert.equal(parseDataset([]).ok, false);
  });

  it('落ちた理由が分かる', () => {
    // 公開した人が何を直せばいいか分かること
    const r = broken({ walks: [{ from: 'a', to: 'いない会場', minutes: 5 }] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.reasons[0].includes('いない会場'));
  });
});

describe('selectDataset — どれを使うか', () => {
  const at = (dataVersion: number): Dataset => ({ ...parsed(), dataVersion });

  it('dataVersion が最大のものを選ぶ', () => {
    assert.equal(selectDataset([at(1), at(5), at(3)])?.dataVersion, 5);
  });

  it('同点なら先に渡されたものを選ぶ', () => {
    // 同じ版なら、通信で取り直したものより手元にあるものを使う方が速い
    const first = at(4);
    assert.equal(selectDataset([first, at(4)]), first);
  });

  it('取れなかったものは無視する', () => {
    assert.equal(selectDataset([null, at(2), undefined])?.dataVersion, 2);
  });

  it('同梱の方が新しければ同梱が勝つ', () => {
    // アプリを更新した直後。古いキャッシュに引きずられないこと
    const bundled = at(9);
    const cached = at(3);
    assert.equal(selectDataset([bundled, cached]), bundled);
  });

  it('全部無ければ null', () => {
    assert.equal(selectDataset([null, undefined]), null);
  });
});

describe('参照', () => {
  it('venueById は知らないIDに undefined を返す', () => {
    // 以前は1番目の会場を返していた。walkMinutesBetween の `?? 10` と同じ欠陥
    assert.equal(venueById(parsed(), 'いない会場'), undefined);
    assert.equal(venueById(parsed(), 'b')?.name, '会場B');
  });

  it('sessionById は知らないIDに undefined を返す', () => {
    assert.equal(sessionById(parsed(), 'いないセッション'), undefined);
    assert.equal(sessionById(parsed(), 's1')?.title, 'セッション1');
  });

  it('walkMinutesBetween は向きを問わない', () => {
    const d = parsed();
    assert.equal(walkMinutesBetween(d, 'a', 'b'), 9);
    assert.equal(walkMinutesBetween(d, 'b', 'a'), 9);
  });

  it('walkMinutesBetween は同じ会場を0、未登録を null にする', () => {
    const d = parsed();
    assert.equal(walkMinutesBetween(d, 'a', 'a'), 0);
    assert.equal(walkMinutesBetween(d, 'a', 'c'), null);
  });
});

describe('カテゴリと欠落の把握', () => {
  it('カテゴリはデータから作り、出現順を保つ', () => {
    // 定数から作ると、公式が会期中に新カテゴリを出したとき絞り込めなくなる
    assert.deepEqual(categoriesOf(parsed()), ['SOCIAL', 'CAREER']);
  });

  it('未登録の徒歩時間を数え上げられる', () => {
    // 落とすためではなく、表示と公開前の点検のため
    assert.deepEqual(missingWalks(parsed()), ['a ↔ c', 'b ↔ c']);
  });
});
