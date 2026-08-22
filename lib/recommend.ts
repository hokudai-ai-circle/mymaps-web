/**
 * ホームの「おすすめ」の並べ方。
 *
 * ## 変えたのは1点だけ
 *
 * **「間に合うか」で段に分け、段の中は従来どおりのスコアで並べる。**
 *
 * これまでの推薦は `plannedIds` に入っていないことしか見ていなかった。そのため
 * **すでに入れた予定と時間が重なる予定や、前の会場から歩いて間に合わない予定を
 * 平気でおすすめに出していた**。カード側には警告が出るので、「勧めておいて直後に
 * 無理だと言う」状態になっていた。READMEに「主役は間に合わないという事前警告」と
 * 書いてあるのに、推薦だけがそれを無視していた。
 *
 * 実データでも起きる。9/25 の `s251400`（14:00〜15:30 赤れんが）と
 * `s251500`（15:00〜16:00 北洋銀行）は**公式データに実在する衝突**で、
 * 片方を予定に入れた人にもう片方を勧めても意味がない。
 *
 * ## 重みを足し合わせない理由
 *
 * 興味の点数と実現可能性を足して一発で順位を決めると、点数が高いだけで
 * 物理的に行けない予定が上に来る余地が残る。段を先に分ければ、その逆転が
 * 構造的に起きない。
 *
 * 判定は `lib/schedule.ts` の `checkAdd` をそのまま使う。推薦のために判定
 * ロジックを書き直さない（二重に持つと必ずずれる）。
 *
 * ## スコア（`interestScore`）
 *
 * 立場（Role）と雰囲気タグ（moods）による加点はどちらも撤去した（#1）。
 * 立場はおすすめの並びに一切影響しないまま必須入力になっていただけで、
 * 雰囲気タグは公式の裏付けが無い推測だった（2026-08-22決定）。
 *
 * 代わりに、セッションごとの重み（`tagWeights`）で加点するようになった（#2）。
 * 詳しくは `interestScore` 自体のコメントを参照。
 */

import type { Dataset, Session } from '@/lib/dataset';
import type { Category } from '@/constants/theme';
import type { InterestTag, Profile } from '@/store/AppContext';
import type { EarlyLeaves } from '@/lib/schedule';
import { checkAdd, toMinutes } from '@/lib/schedule';

/**
 * 興味タグ → セッションのカテゴリ。AppContext から移した。
 * アプリの状態ではなく推薦の重みなので、推薦ロジックと同じ場所に置く。**内容は不変。**
 */
const TAG_TO_CATEGORY: Record<InterestTag, Category[]> = {
  地方創生: ['SOCIAL'],
  スタートアップ: ['CAREER'],
  '海外・越境': ['CAREER'],
  'テクノロジー・AI': ['CAREER'],
  まちづくり: ['SOCIAL'],
  '教育・学び': ['SOCIAL', 'CAREER'],
  学生の活動: ['SOCIAL', 'CAREER'],
  デザイン: ['SOCIAL'],
  '映像・音楽・アート': ['SOCIAL'],
  フード: ['SOCIAL'],
};

/**
 * 興味の一致度。
 *
 * ## セッションごとの重みを優先する
 *
 * `tagWeights` が入っていれば、そちらだけを見る（`data/tag-keywords.ts` が
 * セッションのタイトルと説明文から計算する）。**カテゴリを一切経由しない**ので、
 * 公式が新しいカテゴリを出しても、おすすめの質が落ちない。
 *
 * ## 無ければ、従来どおりカテゴリで加点する
 *
 * ⚠️ **この経路は「10種類のタグが2つのカテゴリに潰れる」ので精度が低い。**
 * **移行の途中で壊さないためだけに残してある。**
 * 全セッションに `tagWeights` が入ったら消してよい。
 */
export function interestScore(session: Session, profile: Profile | null): number {
  const tags = profile?.tags ?? [];

  if (session.tagWeights !== undefined) {
    let score = 0;
    for (const t of tags) score += session.tagWeights[t] ?? 0;
    return score;
  }

  // 定数の型ではなく文字列で照合する。**外から届くデータには知らないカテゴリが含まれうる**
  const wanted = new Set<string>();
  tags.forEach((t) => TAG_TO_CATEGORY[t]?.forEach((c) => wanted.add(c)));

  let score = 0;
  if (wanted.has(session.category)) score += 3;
  return score;
}

/**
 * 実現可能性の段。小さいほど良い。
 *
 * `conflict` を除外せず最下段に置いているのは、その日の予定が埋まっている人に
 * 「もう入る隙間がない」と分かる形で見せたいため。カード側には既に重複の警告が出る。
 */
export type Feasibility = 'fits' | 'tight' | 'misses' | 'conflict';

const TIER: Record<Feasibility, number> = {
  fits: 0,
  tight: 1,
  misses: 2,
  conflict: 3,
};

/** 既存の予定に対して、この候補がどの段に入るか */
export function feasibilityOf(
  candidate: Session,
  planned: Session[],
  dataset: Dataset,
  earlyLeaves: EarlyLeaves,
): Feasibility {
  const check = checkAdd(candidate, planned, dataset, earlyLeaves);
  if (check.conflictWith) return 'conflict';
  // 自分は間に合っても、後続の予定を壊すなら勧められない
  if (check.breaksNext) return 'misses';
  switch (check.incoming.status) {
    case 'first':
    case 'ok':
      return 'fits';
    case 'exact':
      // 間に合うが余裕はない。積極的には勧めない
      return 'tight';
    case 'unknown':
      // 徒歩時間が未登録で判定できない。分からないものを上位に置かない
      return 'tight';
    default:
      return 'misses';
  }
}

/**
 * ホームに出すおすすめの上限。
 *
 * 6件。**日によっては満たない**（実データでは9/26が1件）。
 * 埋めるために別日から借りると #33 に逆戻りするので、足りないまま返す。
 *
 * 件数は推薦ロジックの一部なので、アプリの状態ではなくここに置く。
 */
export const RECOMMEND_LIMIT = 6;

export type RecommendInput = {
  /** 候補の母集団。ふつうは SESSIONS 全件 */
  sessions: Session[];
  dataset: Dataset;
  /** 予定に入っているセッション（全日ぶん） */
  planned: Session[];
  earlyLeaves: EarlyLeaves;
  profile: Profile | null;
  /** 表示中の日付。ここを絞らないと別日のセッションが紛れ込む（#33） */
  day: string;
  limit?: number;
};

/**
 * 並べて上から `limit` 件返す。副作用なし。
 *
 * **「別の◯件を見る」（reshuffle）は持たない。** 押すたびに並びが変わると
 * さっき見たものを探せなくなるため。件数を6に増やしたことで、
 * 巡回して他を見せる必要も薄くなった。
 */
export function recommend({
  sessions,
  dataset,
  planned,
  earlyLeaves,
  profile,
  day,
  limit = RECOMMEND_LIMIT,
}: RecommendInput): Session[] {
  const plannedIds = new Set(planned.map((s) => s.id));

  const ordered = sessions
    .filter((s) => s.day === day && !plannedIds.has(s.id))
    .map((session) => ({
      session,
      tier: TIER[feasibilityOf(session, planned, dataset, earlyLeaves)],
      score: interestScore(session, profile),
    }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (b.score !== a.score) return b.score - a.score;
      // 同点は開始が早い順。実行のたびに順番が変わらないよう、最後は必ず決め切る
      const start = toMinutes(a.session.start) - toMinutes(b.session.start);
      return start !== 0 ? start : a.session.id.localeCompare(b.session.id);
    })
    .map((x) => x.session);

  return ordered.slice(0, limit);
}
