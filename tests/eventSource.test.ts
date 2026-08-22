/**
 * 取得層。**ネットワークと保存に触る唯一の場所なので、失敗の場合を全部並べる。**
 *
 * 実際に通信はしない。`fetch` を差し替えて、起こりうる応答を作って渡す。
 * 端末ストレージ（AsyncStorage）に触る関数はここでは扱わない
 * （Node上で動かすには実装の差し替えが要り、確かめたいのは判断の方であるため）。
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { fetchDataset, REFETCH_INTERVAL_MS, shouldRefetch } from '@/lib/eventSource';
import { SCHEMA_VERSION } from '@/lib/dataset';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function validPayload(dataVersion = 5) {
  return {
    schemaVersion: SCHEMA_VERSION,
    dataVersion,
    generatedAt: '2026-09-22T09:00:00Z',
    eventYear: 2026,
    days: [{ id: '9/25', label: '9/25', weekday: '金' }],
    venues: [{ id: 'a', name: '会場A', letter: 'A', desc: '', address: '', x: 0.1, y: 0.1 }],
    walks: [],
    sessions: [
      {
        id: 's1',
        day: '9/25',
        start: '10:00',
        end: '11:00',
        venueId: 'a',
        title: 'セッション',
        speaker: '',
        category: 'SOCIAL',
        desc: '',
      },
    ],
  };
}

/** 応答を差し替える。保存には触らせない */
function stubFetch(impl: () => Promise<unknown>) {
  globalThis.fetch = (async () => {
    const r = await impl();
    return r as Response;
  }) as typeof fetch;
}

describe('fetchDataset', () => {
  it('取れて検証を通れば ok', async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => validPayload(7) }));
    const out = await fetchDataset('https://example.invalid/event.json', 1234);
    assert.equal(out.status, 'ok');
    if (out.status === 'ok') {
      assert.equal(out.dataset.dataVersion, 7);
      assert.equal(out.fetchedAt, 1234);
    }
  });

  it('サーバーが 404 を返せば unavailable', async () => {
    stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const out = await fetchDataset('https://example.invalid/event.json');
    assert.equal(out.status, 'unavailable');
  });

  it('通信できなければ unavailable（落ちない）', async () => {
    // 圏外・機内モード・DNS不達。**どれも異常ではない**
    stubFetch(async () => {
      throw new Error('Network request failed');
    });
    const out = await fetchDataset('https://example.invalid/event.json');
    assert.equal(out.status, 'unavailable');
  });

  it('JSONとして壊れていても落ちない', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }));
    const out = await fetchDataset('https://example.invalid/event.json');
    assert.equal(out.status, 'unavailable');
  });

  it('形が違えば invalid にし、理由を残す', async () => {
    // 公開した人が何を直せばよいか分かること
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ...validPayload(), venues: [] }),
    }));
    const out = await fetchDataset('https://example.invalid/event.json');
    assert.equal(out.status, 'invalid');
    if (out.status === 'invalid') assert.ok(out.reasons.length > 0);
  });

  it('🔴 一部だけ採用しない', async () => {
    // セッションだけ新しく会場は古い、という状態を作らないこと。
    // 1件でも壊れていればデータ全体を捨てる
    const payload = validPayload();
    payload.sessions.push({
      id: 's2',
      day: '9/25',
      start: '12時',
      end: '13:00',
      venueId: 'a',
      title: '時刻が壊れている',
      speaker: '',
      category: 'SOCIAL',
      desc: '',
    });
    stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));
    const out = await fetchDataset('https://example.invalid/event.json');
    assert.equal(out.status, 'invalid');
  });
});

describe('shouldRefetch', () => {
  it('一度も取っていなければ取りに行く', () => {
    assert.equal(shouldRefetch(null, 0), true);
  });

  it('間隔を空けずに取りに行かない', () => {
    // 画面に戻るたびの通信を防ぐ。会期中ずっと通信し続けることになる
    assert.equal(shouldRefetch(1000, 1000 + REFETCH_INTERVAL_MS - 1), false);
  });

  it('間隔が空けば取りに行く', () => {
    assert.equal(shouldRefetch(1000, 1000 + REFETCH_INTERVAL_MS), true);
  });
});
