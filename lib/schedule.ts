/**
 * スケジュール判定エンジン
 *
 * このアプリの中核。「経路を案内する」のではなく「その予定は間に合わない」と
 * 事前に警告することが目的（ヒアリング由来: 移動時間を見誤って雨中を爆走し、
 * 受付締切型と知らず5分遅れたケースから）。
 *
 * UIから独立した純粋関数として書く。判定ロジックだけを差し替え・検証できるようにするため。
 */

import type { Dataset, Session, Venue } from '@/lib/dataset';
import { walkMinutesBetween } from '@/lib/dataset';

/** "HH:MM" → 0時からの経過分 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 経過分 → "HH:MM" */
export function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type TravelStatus =
  | 'first' // その日の最初の予定
  | 'ok' // 余裕あり
  | 'exact' // ちょうど間に合う
  | 'short' // 移動時間が足りない
  | 'reception' // 到着はできるが受付締切に間に合わない
  | 'overlap' // 時間が重なっていて両立不可能
  | 'unknown'; // 会場間の徒歩時間が未登録で、判定できない

export type TravelInfo = {
  status: TravelStatus;
  /** 直前の予定（なければ null） */
  from: Session | null;
  /** 徒歩の所要分。**未登録なら null**（status は 'unknown' になる） */
  walkMinutes: number | null;
  /** 前の予定の終了から次の開始までの分 */
  gapMinutes: number;
  /** gap - walk。マイナスなら足りない */
  slackMinutes: number;
  /** 受付締切に間に合わせるために必要な追加分（reception時） */
  receptionShortMinutes: number;
  /** 早退すれば間に合う場合の退出時刻 */
  leaveBy: string | null;
  /** 早退が必要な分数 */
  earlyLeaveMinutes: number;
  /** 早退が既に登録されている場合の退出時刻。表示に使う */
  appliedLeaveAt: string | null;
};

/** 判定結果つきの予定 */
export type PlanItem = {
  session: Session;
  travel: TravelInfo;
};

/**
 * 移動に問題があるステータスか。
 *
 * 'unknown'（徒歩時間が未登録）も問題として扱う。
 * 判定できないものを黙って「大丈夫」の側に入れると、
 * 根拠のない安心を与えることになるため。
 */
export function isProblem(status: TravelStatus): boolean {
  return (
    status === 'short' ||
    status === 'reception' ||
    status === 'overlap' ||
    status === 'unknown'
  );
}

/**
 * 早退の記録。「このセッションを、この時刻に抜ける」を持つ。
 * キーは抜ける対象のセッションID、値は "HH:MM"。
 */
export type EarlyLeaves = Record<string, string>;

/**
 * 1日分の予定を開始時刻順に並べ、各予定について直前からの移動を判定する。
 *
 * earlyLeaves に登録された予定は、本来の終了時刻ではなく退出時刻を使って判定する。
 * 「前の予定を早めに抜ける」を選んだあとに警告が消えるのはこのため。
 */
export function buildPlan(
  sessions: Session[],
  dataset: Dataset,
  earlyLeaves: EarlyLeaves = {},
): PlanItem[] {
  const sorted = [...sessions].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  return sorted.map((session, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const leaveAt = prev ? earlyLeaves[prev.id] : undefined;
    return { session, travel: evaluateTravel(prev, session, dataset, leaveAt) };
  });
}

/**
 * 直前の予定 → 対象の予定 への移動を判定する。
 *
 * prevLeaveAt を渡すと、前の予定をその時刻に抜ける前提で計算する（早退）。
 */
export function evaluateTravel(
  prev: Session | null,
  next: Session,
  dataset: Dataset,
  prevLeaveAt?: string,
): TravelInfo {
  const base: TravelInfo = {
    status: 'first',
    from: null,
    walkMinutes: 0,
    gapMinutes: 0,
    slackMinutes: 0,
    receptionShortMinutes: 0,
    leaveBy: null,
    earlyLeaveMinutes: 0,
    appliedLeaveAt: null,
  };

  if (!prev) return base;

  const walk = walkMinutesBetween(dataset, prev.venueId, next.venueId);

  // 徒歩時間が未登録なら、間に合うかどうかは判定できない。
  // ここで既定値を当てて計算を続けると、根拠のない数字で断言することになる。
  if (walk === null) {
    return {
      ...base,
      status: 'unknown',
      from: prev,
      walkMinutes: null,
      gapMinutes: toMinutes(next.start) - toMinutes(prev.end),
      appliedLeaveAt: prevLeaveAt ?? null,
    };
  }

  // 早退が登録されていれば、本来の終了ではなく退出時刻を起点に計算する
  const prevEnd = prevLeaveAt ? toMinutes(prevLeaveAt) : toMinutes(prev.end);
  const prevStart = toMinutes(prev.start);
  const nextStart = toMinutes(next.start);
  const gap = nextStart - prevEnd;
  const slack = gap - walk;

  // 間に合わせるべき時刻は「開始時刻」とは限らない。
  // 受付締切があるイベントでは、締切の方が先に来る（例: 開始16:20／受付16:05）。
  // ここを開始時刻だけで逆算していたため、受付締切のケースでは常に earlyLeave が 0 になり、
  // 「前の予定を○○に抜ける」という解決策がユーザーに提示されなかった。
  // このアプリが生まれた理由そのもののケースが、唯一「諦めろ」としか言えない状態だった。
  const deadline = next.reception
    ? Math.min(toMinutes(next.reception), nextStart)
    : nextStart;
  const leaveByMin = deadline - walk;
  const earlyLeave = Math.max(0, prevEnd - leaveByMin);
  // 前の予定の開始より前に出ないと無理なら、そもそも両立不可能
  const canAttendPrevAtAll = leaveByMin > prevStart;

  const info: TravelInfo = {
    ...base,
    from: prev,
    walkMinutes: walk,
    gapMinutes: gap,
    slackMinutes: slack,
    leaveBy: earlyLeave > 0 ? toHHMM(leaveByMin) : null,
    earlyLeaveMinutes: earlyLeave,
    appliedLeaveAt: prevLeaveAt ?? null,
  };

  // 時間そのものが重なっている、または前の予定にほぼ出られない
  if (nextStart < prevEnd && !canAttendPrevAtAll) {
    return { ...info, status: 'overlap' };
  }
  if (nextStart < prevEnd) {
    // 重なってはいるが、早退すれば次に間に合う
    return { ...info, status: 'short' };
  }

  // 受付締切のチェック（到着自体は間に合っても受付に間に合わないことがある）
  if (next.reception) {
    const receptionAt = toMinutes(next.reception);
    const arriveAt = prevEnd + walk;
    if (arriveAt > receptionAt) {
      return {
        ...info,
        status: 'reception',
        receptionShortMinutes: arriveAt - receptionAt,
      };
    }
  }

  if (slack < 0) return { ...info, status: 'short' };
  if (slack === 0) return { ...info, status: 'exact' };
  return { ...info, status: 'ok' };
}

/**
 * 既存の予定に対して、あるセッションを追加できるか判定する。
 * ホームの「きみへの3選」から追加する導線でそのまま使う。
 */
export type AddCheck = {
  ok: boolean;
  /** 時間が完全に重なっている既存の予定 */
  conflictWith: Session | null;
  /** 追加した場合の、その予定自身の移動判定 */
  incoming: TravelInfo;
  /** 追加した場合に、後続の予定が壊れるか */
  breaksNext: { session: Session; travel: TravelInfo } | null;
};

export function checkAdd(
  candidate: Session,
  planned: Session[],
  dataset: Dataset,
  earlyLeaves: EarlyLeaves = {},
): AddCheck {
  const sameDay = planned.filter((s) => s.day === candidate.day);
  const sorted = [...sameDay].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const cStart = toMinutes(candidate.start);
  const cEnd = toMinutes(candidate.end);

  // 完全な時間重複を探す
  const conflict =
    sorted.find((s) => {
      const sStart = toMinutes(s.start);
      const sEnd = toMinutes(s.end);
      return cStart < sEnd && sStart < cEnd;
    }) ?? null;

  const prev = [...sorted].reverse().find((s) => toMinutes(s.end) <= cStart) ?? null;
  const next = sorted.find((s) => toMinutes(s.start) >= cEnd) ?? null;

  const incoming = evaluateTravel(
    prev,
    candidate,
    dataset,
    prev ? earlyLeaves[prev.id] : undefined,
  );
  const afterTravel = next
    ? evaluateTravel(candidate, next, dataset, earlyLeaves[candidate.id])
    : null;

  const breaksNext =
    next && afterTravel && isProblem(afterTravel.status)
      ? { session: next, travel: afterTravel }
      : null;

  return {
    ok: !conflict && !isProblem(incoming.status) && !breaksNext,
    conflictWith: conflict,
    incoming,
    breaksNext,
  };
}

/** その日の予定のうち、移動が厳しい区間の数 */
export function countProblems(plan: PlanItem[]): number {
  return plan.filter((p) => isProblem(p.travel.status)).length;
}

/**
 * 予定と予定の間の空き時間を返す。
 * 「この時間なら行けるセッション」の逆引き提案に使う。
 */
export type FreeSlot = { start: string; end: string; minutes: number; afterVenueId: string | null };

export function findFreeSlots(plan: PlanItem[], minMinutes = 45): FreeSlot[] {
  const slots: FreeSlot[] = [];
  for (let i = 0; i < plan.length - 1; i++) {
    const cur = plan[i].session;
    const nxt = plan[i + 1].session;
    const gap = toMinutes(nxt.start) - toMinutes(cur.end);
    if (gap >= minMinutes) {
      slots.push({
        start: cur.end,
        end: nxt.start,
        minutes: gap,
        afterVenueId: cur.venueId,
      });
    }
  }
  return slots;
}

/**
 * 空き時間に入れる候補。
 *
 * `reachable` は移動が間に合うものだけ。
 * `unreachableCount` は「時間は空いているが歩いて間に合わない」ために外した数。
 * 黙って隠すと「候補がありません」と出て、本当は開催されているのに
 * 何も無いように見えてしまうため、件数だけは伝える。
 */
export type SlotCandidates = {
  reachable: Session[];
  unreachableCount: number;
};

/**
 * 空き時間に「実際に行ける」セッションを探す。
 *
 * 時間が空いていることと、そこへ歩いて間に合うことは別の話。
 * ここを時刻の比較だけで済ませると、**同じ画面の上半分で
 * 「徒歩9分・4分足りません」と警告している区間を、
 * 下半分で「空き時間に行けます」と勧める**ことになる。
 * このアプリの中心価値を自分で否定してしまうので、必ず判定を通す。
 */
export function findSlotCandidates(
  slot: FreeSlot,
  day: string,
  planned: Session[],
  all: Session[],
  dataset: Dataset,
  limit = 2,
  earlyLeaves: EarlyLeaves = {},
): SlotCandidates {
  const slotStart = toMinutes(slot.start);
  const slotEnd = toMinutes(slot.end);

  const inSlot = all.filter(
    (s) =>
      s.day === day &&
      toMinutes(s.start) >= slotStart &&
      toMinutes(s.end) <= slotEnd &&
      !planned.some((p) => p.id === s.id),
  );

  const reachable = inSlot.filter((s) => checkAdd(s, planned, dataset, earlyLeaves).ok);

  return {
    reachable: reachable.slice(0, limit),
    unreachableCount: inSlot.length - reachable.length,
  };
}

/**
 * 「その予定は間に合わない」と言われたときの、代わりに行ける候補を探す。
 *
 * 単に同じ時間帯のセッションを並べるのではなく、
 * **入れ替えても移動が破綻しないものだけ**を返すのが要点。
 * 前の予定から歩いて間に合い、かつ次の予定にも間に合うものに絞る。
 */
export type Alternative = {
  session: Session;
  travel: TravelInfo;
  /** 元の予定と同じカテゴリか（近い興味のものを優先して見せる） */
  sameCategory: boolean;
};

export function findAlternatives(
  target: Session,
  planned: Session[],
  all: Session[],
  dataset: Dataset,
  limit = 5,
  earlyLeaves: EarlyLeaves = {},
): Alternative[] {
  const sameDayPlanned = planned
    .filter((s) => s.day === target.day && s.id !== target.id)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const tStart = toMinutes(target.start);
  const tEnd = toMinutes(target.end);

  // 差し替え対象の前後にある予定。ここに挟まる形で成立する候補だけを採用する
  const prev =
    [...sameDayPlanned].reverse().find((s) => toMinutes(s.end) <= tStart) ?? null;
  const next = sameDayPlanned.find((s) => toMinutes(s.start) >= tEnd) ?? null;

  const plannedIds = new Set(planned.map((s) => s.id));

  const candidates = all.filter((s) => {
    if (s.day !== target.day) return false;
    if (s.id === target.id) return false;
    if (plannedIds.has(s.id)) return false;

    // 前の予定と時間が重なるものは、そもそも代わりにならない
    if (prev && toMinutes(s.start) < toMinutes(prev.end)) return false;
    // 次の予定と時間が重なるものも同様
    if (next && toMinutes(s.end) > toMinutes(next.start)) return false;

    return true;
  });

  const viable: Alternative[] = [];
  for (const c of candidates) {
    const inbound = evaluateTravel(
      prev,
      c,
      dataset,
      prev ? earlyLeaves[prev.id] : undefined,
    );
    if (isProblem(inbound.status)) continue;
    if (next) {
      const outbound = evaluateTravel(c, next, dataset, earlyLeaves[c.id]);
      if (isProblem(outbound.status)) continue;
    }
    viable.push({
      session: c,
      travel: inbound,
      sameCategory: c.category === target.category,
    });
  }

  // 同じカテゴリを優先し、その中では開始が早い順
  viable.sort((a, b) => {
    if (a.sameCategory !== b.sameCategory) return a.sameCategory ? -1 : 1;
    return toMinutes(a.session.start) - toMinutes(b.session.start);
  });

  return viable.slice(0, limit);
}

/**
 * データの不整合を洗い出す。**実データを投入したら必ず通すこと。**
 *
 * 判定エンジンは入力が正しい前提で動く。入力が壊れていると、
 * エンジンは黙って間違った答えを自信満々に返す。
 * ここで弾けるものは、判定に到達する前に弾く。
 *
 * 問題があれば説明文の配列を返す。空配列なら問題なし。
 */
export function validateSessions(sessions: Session[], venues: Venue[]): string[] {
  const problems: string[] = [];
  const venueIds = new Set(venues.map((v) => v.id));

  for (const s of sessions) {
    if (toMinutes(s.end) <= toMinutes(s.start)) {
      problems.push(`${s.id}: 終了(${s.end})が開始(${s.start})より後になっていない`);
    }
    if (!venueIds.has(s.venueId)) {
      problems.push(`${s.id}: 会場 "${s.venueId}" が会場一覧に存在しない`);
    }
    if (s.reception && toMinutes(s.reception) > toMinutes(s.start)) {
      problems.push(
        `${s.id}: 受付締切(${s.reception})が開始(${s.start})より後。` +
          `reception は「開始前に締め切る」意味なので、遅れての入場可には使えない`,
      );
    }
  }

  return problems;
}

/*
  徒歩時間が未登録の会場ペアを返す findMissingWalkTimes は
  `lib/dataset.ts` の missingWalks へ移した（#58）。
  **徒歩時間がデータセットに属するようになり、会場の配列だけでは答えが出ない。**
*/

/** 判定を人が読む文言にする（表示ロジックを1か所に集約する） */
export function travelLabel(t: TravelInfo): string {
  // 徒歩時間が分からない以上、分数を出してはいけない
  if (t.status === 'unknown') {
    return '会場間の徒歩時間が未登録です。ご自身で確認してください。';
  }
  const walk = t.walkMinutes ?? 0;
  switch (t.status) {
    case 'first':
      return 'この日最初の予定になります。';
    case 'ok':
      return `徒歩${walk}分・余裕${t.slackMinutes}分`;
    case 'exact':
      return `徒歩${walk}分・ちょうど間に合う`;
    case 'short':
      return `徒歩${walk}分・${Math.abs(t.slackMinutes)}分足りません`;
    case 'reception':
      return `徒歩${walk}分・受付に間に合いません（${t.receptionShortMinutes}分超過）`;
    case 'overlap':
      return '予定が重なっています';
  }
}
