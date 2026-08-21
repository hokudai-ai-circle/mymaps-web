/**
 * イベントデータの取得と保存。**ネットワークと端末ストレージとの境界。**
 *
 * 判断は持たない。検証も選択も `lib/dataset.ts` の純粋関数が行う。
 * `lib/location.ts`（ブラウザとの境界）と `lib/geo.ts`（計算）の関係と同じ作り。
 *
 * ## 何を送っているか
 *
 * **「このファイルをください」だけ。** クエリも独自ヘッダーも識別子も付けない。
 * 予定・プロフィール・位置情報は**一切送らない**。
 *
 * ⚠️ サーバー側にはIPアドレスが見える（どんな通信でも相手に見える）。
 * ストアの申告を書くときは、その1点だけを見て判断すること。
 *
 * ## 失敗しても壊れない
 *
 * 取れないことは異常ではなく**通常の状態のひとつ**。会場は電波が弱く、
 * 機内モードの人もいる。取れなければ前回のもの、それも無ければ同梱データで動く。
 */

import type { Dataset } from '@/lib/dataset';
import { parseDataset } from '@/lib/dataset';

/**
 * 取得先。**URLに形の版（v1）を含めている。**
 *
 * 公開したアプリは凍結され、勝手には更新されない。形を変えたくなったら
 * `event-v2.json` を**別のURLに置く**こと。古いアプリは v1 を読み続けて壊れない。
 * **同じURLの中身の形を変えてはいけない。**
 */
export const DATASET_URL =
  'https://hokudai-ai-circle.github.io/mymaps-site/data/event-v1.json';

/**
 * 保存キー。アプリの状態（`mymaps:state:v1`）とは**別にする。**
 *
 * 予定やプロフィールと寿命が違う。データの更新で利用者の予定が消えたり、
 * 逆に予定を消したらデータまで消えたりするのは筋が悪い。
 */
const CACHE_KEY = 'mymaps:dataset:v1';

/**
 * 打ち切りまでの時間。
 *
 * **会場のWi-Fiは遅い。** 応答を待ち続けると、その間ずっと「取得中」のままになる。
 * 画面は同梱データで既に出ているので、**待たせる価値がない。**
 */
const TIMEOUT_MS = 8000;

/**
 * 取り直すまでの最短間隔。
 *
 * 画面に戻るたびに取りに行くと、会期中ずっと通信し続けることになる。
 * 一方で**プログラムは会期の数日前まで変わる**ので、1日1回では遅い。
 */
export const REFETCH_INTERVAL_MS = 15 * 60 * 1000;

export type Cached = {
  dataset: Dataset;
  /** 取得した時刻（epochミリ秒）。**「いつ時点の情報か」を人に見せるために持つ** */
  fetchedAt: number;
};

/** `localStorage` の読み書き。SSR中（`window` が無い）は何もしない。 */
function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 容量超過・プライベートモードなど。保存できなくても今回の起動中は動く
  }
}

function removeStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 無視してよい
  }
}

/**
 * 端末に保存してある前回の取得結果を読む。
 *
 * **保存してあるものも信用しない。** アプリを更新して形が変わっていることも、
 * 保存が壊れていることもある。読み込み時にもう一度 `parseDataset` を通す。
 */
export async function readCache(): Promise<Cached | null> {
  try {
    const raw = readStorage(CACHE_KEY);
    if (!raw) return null;

    const saved = JSON.parse(raw) as { fetchedAt?: unknown; dataset?: unknown };
    const parsed = parseDataset(saved?.dataset);
    if (!parsed.ok) {
      // 読めないものを持ち続けても意味がない。次の取得に賭ける
      console.warn('保存済みのデータが読めませんでした', parsed.reasons.join(' / '));
      removeStorage(CACHE_KEY);
      return null;
    }

    const fetchedAt = typeof saved.fetchedAt === 'number' ? saved.fetchedAt : 0;
    return { dataset: parsed.dataset, fetchedAt };
  } catch (e) {
    // 読めなくてもアプリは同梱データで動く。落とさない
    console.warn('保存済みのデータの読み込みに失敗しました', e);
    return null;
  }
}

async function writeCache(dataset: Dataset, fetchedAt: number): Promise<void> {
  try {
    writeStorage(CACHE_KEY, JSON.stringify({ dataset, fetchedAt }));
  } catch (e) {
    // 保存できなくても、今回の起動中は取得したデータで動く
    console.warn('データの保存に失敗しました', e);
  }
}

export type FetchOutcome =
  | { status: 'ok'; dataset: Dataset; fetchedAt: number }
  /** 通信できなかった・遅すぎた・サーバーが返さなかった */
  | { status: 'unavailable'; reason: string }
  /** 届いたが、検証を通らなかった。**公開側の誤りなので、内容を残す** */
  | { status: 'invalid'; reasons: string[] };

/**
 * 取りに行く。**取れて検証を通ったときだけ保存する。**
 *
 * 一部だけ採用することはしない。**セッションは新しいのに会場は古い、という
 * 状態を作らないため。** 落ちたときは呼び出し側が何もしなければよく、
 * 画面には同梱データかキャッシュがそのまま残る。
 *
 * 再試行はしない。**次にアプリを開いたときに取り直す**方が、
 * 電池にも電波にも優しく、作りも単純になる。
 */
export async function fetchDataset(
  url: string = DATASET_URL,
  now: number = Date.now(),
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      /*
        🔴 **独自のヘッダーを付けないこと。**

        以前ここで `headers: { 'cache-control': 'no-cache' }` を付けていた。
        独自ヘッダーが1つでも付くと、ブラウザは本体の前に OPTIONS を投げる。
        **GitHub Pages は OPTIONS に 405 を返す**ので、そこで止まる。
        単純な GET なら `Access-Control-Allow-Origin: *` が返り、問題なく通る。

        鮮度は `cache` の指定で確保する。**これはヘッダーではないので
        事前確認を誘発しない。** GitHub Pages 側は max-age=600 を返すが、
        公開のたびに配信側が入れ替わるうえ、こちらも15分ごとに取り直す。
      */
      cache: 'no-store',
    });
    if (!res.ok) return { status: 'unavailable', reason: `HTTP ${res.status}` };

    const json: unknown = await res.json();
    const parsed = parseDataset(json);
    if (!parsed.ok) return { status: 'invalid', reasons: parsed.reasons };

    await writeCache(parsed.dataset, now);
    return { status: 'ok', dataset: parsed.dataset, fetchedAt: now };
  } catch (e) {
    // 圏外・機内モード・DNS不達・打ち切り。**どれも異常ではない**
    const reason = e instanceof Error ? e.message : String(e);
    return { status: 'unavailable', reason };
  } finally {
    clearTimeout(timer);
  }
}

/** 前回の取得から十分に時間が経ったか。**画面に戻るたびの通信を防ぐ** */
export function shouldRefetch(lastFetchedAt: number | null, now: number): boolean {
  if (lastFetchedAt === null) return true;
  return now - lastFetchedAt >= REFETCH_INTERVAL_MS;
}
