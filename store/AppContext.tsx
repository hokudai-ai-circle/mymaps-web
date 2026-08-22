'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BUNDLED } from '@/data/event';
import type { Dataset, Session } from '@/lib/dataset';
import { categoriesOf, selectDataset } from '@/lib/dataset';
import { fetchDataset, readCache, shouldRefetch } from '@/lib/eventSource';
import {
  buildPlan,
  checkAdd,
  countProblems,
  EarlyLeaves,
  PlanItem,
} from '@/lib/schedule';

import { recommend } from '@/lib/recommend';
import type { LatLng } from '@/lib/geo';
import { getCurrentLocation, LocationStatus } from '@/lib/location';

/**
 * 保存キー。将来スキーマを変えたときに古いデータで壊れないよう、値にversionを持たせる。
 * ブラウザの `localStorage` を使う。
 */
const STORAGE_KEY = 'mymaps:state:v1';

type Persisted = {
  version: 1;
  profile: Profile | null;
  plannedIds: string[];
  earlyLeaves: EarlyLeaves;
};

/**
 * 興味タグ。
 *
 * 当初の8個は5個がビジネス系に偏っており、セッションのカテゴリが5つある
 * （ビジネス／スチューデンツ／フード／ソーシャル／カルチャー）のに対して
 * カルチャー・学生系に繋がるタグが薄かった。カテゴリ全体を均等に拾えるよう組み直した。
 * 「越境EC」と「海外展開」はどちらもビジネス1カテゴリに寄るだけだったので統合した。
 */
export const INTEREST_TAGS = [
  '地方創生',
  'スタートアップ',
  '海外・越境',
  'テクノロジー・AI',
  'まちづくり',
  '教育・学び',
  '学生の活動',
  'デザイン',
  '映像・音楽・アート',
  'フード',
] as const;
export type InterestTag = (typeof INTEREST_TAGS)[number];

/** 保存済みデータに、廃止したタグが残っていても壊れないようにする */
function keepKnownTags(tags: unknown): InterestTag[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is InterestTag =>
    (INTEREST_TAGS as readonly string[]).includes(t),
  );
}

export type Profile = {
  tags: InterestTag[];
};

/**
 * おすすめの上限は `lib/recommend.ts` が持つ。
 * 画面側が推薦ロジックの都合を知らずに済むよう、ここから再エクスポートする。
 */
export { RECOMMEND_LIMIT } from '@/lib/recommend';

type AppState = {
  /**
   * いま使っているデータ一式。**画面はここからセッションと会場を取る。**
   *
   * `data/event.ts` から直接 import してはいけない。同梱データは起動直後の初期値で、
   * 外から新しいものが届けば差し替わる。**import すると差し替えが反映されない。**
   */
  dataset: Dataset;
  /**
   * いま存在するカテゴリ。**絞り込みの選択肢はここから作る。**
   * 定数から作ると、公式が会期中に新カテゴリを出したとき絞り込めなくなる
   */
  categories: string[];

  /** データを取りに行っている最中か。**画面はその間も止めない** */
  datasetChecking: boolean;
  /**
   * 最後に確認を試みた時刻。**成功しても失敗しても必ず入る。**
   */
  datasetCheckedAt: number | null;
  /**
   * 直前の確認の結果。**成功も失敗も必ず入れる。**
   */
  datasetResult: { ok: boolean; text: string; detail?: string } | null;
  /** 利用者が押したときの更新。起動時の自動取得とは経路を分けない */
  refreshDataset: () => Promise<void>;

  /** 保存済みデータの読み込みが完了したか。完了前に画面を出すと一瞬初期状態が見える */
  hydrated: boolean;
  /** 保存に失敗したときのメッセージ。無言で失敗させないために持つ */
  saveError: string | null;

  profile: Profile | null;
  completeOnboarding: (p: Profile) => void;
  /** プロフィールタブからの変更。オンボーディングと区別したいので別名にしている */
  updateProfile: (p: Profile) => void;

  /** 選択中の日付 */
  day: string;
  setDay: (d: string) => void;

  /** 予定に入れたセッションID */
  plannedIds: string[];
  addSession: (id: string) => void;
  removeSession: (id: string) => void;
  /** 間に合わない予定を、代わりの候補に入れ替える */
  swapSession: (removeId: string, addId: string) => void;
  isPlanned: (id: string) => boolean;

  /** 「このセッションをこの時刻に抜ける」の記録 */
  earlyLeaves: EarlyLeaves;
  setEarlyLeave: (sessionId: string, leaveAt: string) => void;
  clearEarlyLeave: (sessionId: string) => void;

  /** 判定つきの当日プラン */
  plan: PlanItem[];
  problemCount: number;
  /** 追加前チェック */
  check: (id: string) => ReturnType<typeof checkAdd>;

  /** ホームの「きみへのおすすめ」。選択中の日付から最大 RECOMMEND_LIMIT 件 */
  recommendations: Session[];

  /**
   * 現在地。**保存しない。** ページを閉じれば消える。
   * 会期が終わったあとに、その人がどこにいたかの記録を残さない
   */
  location: LatLng | null;
  locationStatus: LocationStatus;
  /**
   * 現在地を取得した時刻（epoch ミリ秒）。**古さの判定に使う。**
   * 一度取ったきりの座標で「現在地から徒歩3分」と言い続けないために持つ
   */
  locationAt: number | null;
  /** 利用者の操作で呼ぶ。起動時に勝手に許可を求めない */
  requestLocation: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  /**
   * いま使っているデータ一式。**差し替えは必ずこの単位で行う。**
   *
   * 起動直後は同梱データ。裏で取得したものが検証を通り、より新しければ丸ごと入れ替わる。
   * **セッションだけ新しく会場は古い、という状態を作らないため。**
   */
  const [dataset, setDataset] = useState<Dataset>(BUNDLED);
  const [datasetChecking, setDatasetChecking] = useState(false);
  const [datasetCheckedAt, setDatasetCheckedAt] = useState<number | null>(null);
  const [datasetResult, setDatasetResult] =
    useState<{ ok: boolean; text: string; detail?: string } | null>(null);
  /**
   * いまのデータセットの控え。**差し替わったかどうかを、状態の更新関数の外で判断するため。**
   * `setDataset` の更新関数の中で判定すると、React が二重に呼んだときに答えが変わる。
   */
  const datasetRef = useRef<Dataset>(BUNDLED);
  /**
   * 最後に取得できた時刻。**取り直しの間隔を測るためだけに持つ。**
   * 画面に出す「いつ時点の情報か」は dataset.generatedAt を使う
   * （利用者が知りたいのは「いつ確認したか」ではなく「いつのプログラムか」）
   */
  const fetchedAtRef = useRef<number | null>(null);
  const [day, setDay] = useState<string>(BUNDLED.days[0].id);
  const [plannedIds, setPlannedIds] = useState<string[]>([]);
  const [earlyLeaves, setEarlyLeaves] = useState<EarlyLeaves>({});
  // 位置情報は永続化しない。Persisted に入れていないのは意図的
  const [location, setLocation] = useState<LatLng | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationAt, setLocationAt] = useState<number | null>(null);

  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 起動時に読み込む（保存と復元は必ずセットで実装する）。
  // window/localStorage を使うため useEffect の中でのみ触る（SSR中はここを通らない）
  useEffect(() => {
    try {
      const raw = readLocalStorage(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Persisted;
        if (data?.version === 1) {
          // 選択肢を組み替えたため、保存済みの古い値をここで整える。
          // 廃止した role は読み捨てる（#1）
          setProfile(
            data.profile ? { tags: keepKnownTags(data.profile.tags) } : null,
          );
          setPlannedIds(data.plannedIds ?? []);
          setEarlyLeaves(data.earlyLeaves ?? {});
        }
      }
    } catch (e) {
      // 読めなかった場合は初期状態で続行する(起動できなくなる方が困る)
      console.warn('保存データの読み込みに失敗しました', e);
    } finally {
      setHydrated(true);
    }
  }, []);

  // 変更のたびに保存する
  useEffect(() => {
    // 読み込み完了前（初期値がまだ入っている状態）で上書き保存してしまうのを防ぐ
    if (!hydrated) return;
    const payload: Persisted = {
      version: 1,
      profile,
      plannedIds,
      earlyLeaves,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setSaveError(null);
    } catch (e) {
      console.warn('保存に失敗しました', e);
      setSaveError('保存できませんでした。ブラウザのストレージ容量を確認してください。');
    }
  }, [hydrated, profile, plannedIds, earlyLeaves]);

  /**
   * データを取りに行き、より新しければ差し替える。
   *
   * **`silent` は自動取得のとき。** 裏で失敗しただけで赤い字を出すと、
   * 圏外にいる利用者に「壊れた」と思わせる。押して失敗したときだけ伝える。
   */
  /** 取れたものを採用する。**差し替わったかどうかを返す** */
  const applyDataset = useCallback((incoming: Dataset): boolean => {
    // **前のものを先に置く。** 同じ版なら差し替えず、無駄な再描画をしない
    const next = selectDataset([datasetRef.current, incoming]) ?? datasetRef.current;
    if (next === datasetRef.current) return false;
    datasetRef.current = next;
    setDataset(next);
    return true;
  }, []);

  const runFetch = useCallback(
    async (silent: boolean) => {
      setDatasetChecking(true);
      try {
        const out = await fetchDataset();
        setDatasetCheckedAt(Date.now());

        if (out.status === 'ok') {
          fetchedAtRef.current = out.fetchedAt;
          const changed = applyDataset(out.dataset);
          setDatasetResult({
            ok: true,
            text: changed ? '最新の情報に更新しました。' : 'すでに最新の状態です。',
          });
          return;
        }

        if (silent) return;

        setDatasetResult(
          out.status === 'invalid'
            ? {
                ok: false,
                text: '配信されているデータに問題がありました。いま表示しているものを使い続けます。',
                detail: out.reasons[0],
              }
            : {
                ok: false,
                text: '更新できませんでした。通信状況を確認してください。',
                detail: out.reason,
              },
        );
      } catch (e) {
        /*
          🔴 **`fetchDataset` は自分で握りつぶす作りだが、それでも漏れたときに
          「押しても何も起きない」で終わらせない。**
          何が起きても結果は必ず画面に出す。
        */
        setDatasetCheckedAt(Date.now());
        if (!silent) {
          setDatasetResult({
            ok: false,
            text: '更新できませんでした。',
            detail: e instanceof Error ? e.message : String(e),
          });
        }
      } finally {
        // **ここを finally に置く。** 途中で抜けてもボタンが「確認中…」で固まらない
        setDatasetChecking(false);
      }
    },
    [applyDataset],
  );

  const refreshDataset = useCallback(() => runFetch(false), [runFetch]);

  /**
   * 起動時。**まず手元にあるもので画面を出し、そのあと裏で取りに行く。**
   *
   * 取得を待ってから描画すると、圏外の人はいつまでも白い画面を見ることになる。
   * 同梱データと前回のキャッシュのうち新しい方を即座に採用し、
   * ネットワークはあくまで「あれば使う」ものとして扱う。
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await readCache();
      if (!alive) return;
      if (cached) {
        fetchedAtRef.current = cached.fetchedAt;
        applyDataset(cached.dataset);
      }
      await runFetch(true);
    })();
    return () => {
      alive = false;
    };
  }, [runFetch, applyDataset]);

  /**
   * タブがまた見えるようになったときに取り直す。**会期中はプログラムが動く。**
   *
   * 会期中の利用者はタブを閉じずに1日中開いておくので、起動時だけでは
   * 一度も取り直されない。ただしタブに戻るたびに通信すると無駄が多いので、
   * `shouldRefetch` で間隔を空ける。RNAppState の 'change'/'active' 相当を
   * ブラウザの Page Visibility API で行う。
   */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!shouldRefetch(fetchedAtRef.current, Date.now())) return;
      void runFetch(true);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [runFetch]);

  /**
   * 選択中の日付が、新しいデータに存在しないことがある。
   * **その場合は先頭の日に戻す。** 放っておくと「その日は0件」の画面から出られない。
   */
  useEffect(() => {
    if (dataset.days.some((d) => d.id === day)) return;
    setDay(dataset.days[0].id);
  }, [dataset, day]);

  const requestLocation = useCallback(async () => {
    setLocationStatus('loading');
    const result = await getCurrentLocation();
    setLocationStatus(result.status);
    setLocation(result.coords);
    // 取れなかったときは時刻を消す。古い座標に新しい時刻が付くと、
    // 「たった今の位置」に見えてしまう
    setLocationAt(result.coords ? Date.now() : null);
  }, []);

  const completeOnboarding = useCallback((p: Profile) => setProfile(p), []);

  // 中身は completeOnboarding と同じだが、呼び出し側の意図が読めるように分けている。
  // 保存は profile を見ている useEffect が拾うので、ここでは状態を差し替えるだけでよい。
  const updateProfile = useCallback((p: Profile) => setProfile(p), []);

  const addSession = useCallback((id: string) => {
    setPlannedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const setEarlyLeave = useCallback((sessionId: string, leaveAt: string) => {
    setEarlyLeaves((prev) => ({ ...prev, [sessionId]: leaveAt }));
  }, []);

  const clearEarlyLeave = useCallback((sessionId: string) => {
    setEarlyLeaves((prev) => {
      if (!(sessionId in prev)) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, []);

  const removeSession = useCallback((id: string) => {
    setPlannedIds((prev) => prev.filter((x) => x !== id));
    // 予定から外した以上、その予定の早退記録も残さない
    setEarlyLeaves((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // 削除と追加を1回の更新で行う。2回に分けると途中の状態で判定が走ってしまう
  const swapSession = useCallback((removeId: string, addId: string) => {
    setPlannedIds((prev) => {
      const without = prev.filter((x) => x !== removeId);
      return without.includes(addId) ? without : [...without, addId];
    });
    setEarlyLeaves((prev) => {
      if (!(removeId in prev)) return prev;
      const next = { ...prev };
      delete next[removeId];
      return next;
    });
  }, []);

  const isPlanned = useCallback((id: string) => plannedIds.includes(id), [plannedIds]);

  const plannedSessions = useMemo(
    () => dataset.sessions.filter((s) => plannedIds.includes(s.id)),
    [dataset, plannedIds],
  );

  const plan = useMemo(
    () => buildPlan(plannedSessions.filter((s) => s.day === day), dataset, earlyLeaves),
    [plannedSessions, day, dataset, earlyLeaves],
  );

  const problemCount = useMemo(() => countProblems(plan), [plan]);

  const check = useCallback(
    (id: string) => {
      const s = dataset.sessions.find((x) => x.id === id)!;
      return checkAdd(s, plannedSessions, dataset, earlyLeaves);
    },
    [dataset, plannedSessions, earlyLeaves],
  );

  /**
   * おすすめ。**並べ方そのものは `lib/recommend.ts` の純粋関数に置いてある。**
   * 判定エンジンと同じく、UIから独立して検証できる形にしたいため。
   *
   * ここが持つのは「今の状態を渡す」ことだけ。予定・早退・プロフィール・日付が
   * 変われば並びも変わるので、依存はそのまま列挙する。
   */
  const recommendations = useMemo(
    () =>
      recommend({
        sessions: dataset.sessions,
        dataset,
        planned: plannedSessions,
        earlyLeaves,
        profile,
        day,
      }),
    [dataset, plannedSessions, earlyLeaves, profile, day],
  );

  const categories = useMemo(() => categoriesOf(dataset), [dataset]);

  const value: AppState = useMemo(
    () => ({
      dataset,
      categories,
      datasetChecking,
      datasetCheckedAt,
      datasetResult,
      refreshDataset,
      hydrated,
      saveError,
      profile,
      completeOnboarding,
      updateProfile,
      day,
      setDay,
      plannedIds,
      addSession,
      removeSession,
      swapSession,
      isPlanned,
      earlyLeaves,
      setEarlyLeave,
      clearEarlyLeave,
      plan,
      problemCount,
      check,
      recommendations,
      location,
      locationStatus,
      locationAt,
      requestLocation,
    }),
    [
      dataset,
      categories,
      datasetChecking,
      datasetCheckedAt,
      datasetResult,
      refreshDataset,
      hydrated,
      saveError,
      profile,
      completeOnboarding,
      updateProfile,
      day,
      plannedIds,
      addSession,
      removeSession,
      swapSession,
      isPlanned,
      earlyLeaves,
      setEarlyLeave,
      clearEarlyLeave,
      plan,
      problemCount,
      check,
      recommendations,
      location,
      locationStatus,
      locationAt,
      requestLocation,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be used within AppProvider');
  return c;
}
