/**
 * イベントデータの型・検証・選択。**すべて純粋関数。**
 *
 * `lib/geo.ts` と `lib/location.ts` の関係と同じ作りにしてある。
 * ここは計算と判断だけを持ち、ネットワークと保存は `lib/eventSource.ts` が担う。
 *
 * ## なぜ外から取るのか（#58）
 *
 * **2026-08-15、武井さん経由で「プログラムが全て確定するのは会期の数日前」と判明した。**
 * データをアプリに直書きしたままだと、確定 → ビルド → 審査（数日〜1週間）→ 公開、で
 * 会期に間に合わない。**アプリを更新せずにデータだけ差し替えられる必要がある。**
 *
 * ## 壊れたデータを入れない
 *
 * **判定エンジンは入力が正しい前提で動く。壊れた入力には黙って間違った答えを返す。**
 * だからここで止める。**通すか、丸ごと捨てるかの二択にしてある。**
 * 一部だけ採用すると、セッションは新しいのに会場は古い、という状態が生まれる。
 */

/** 会場。`data/event.ts` の実体もこの型に従う */
export type Venue = {
  id: string;
  /** マップ上のピン記号 */
  letter: string;
  name: string;
  desc: string;
  /** 公式に記載されている住所 */
  address: string;
  /** マップ描画用の相対座標（0〜1） */
  x: number;
  y: number;
  /**
   * 実際の緯度経度。現在地からの徒歩時間に使う。
   * **未登録の会場がある。住所から推測して埋めてはいけない**（#61）。
   */
  coords?: { lat: number; lng: number };
};

/**
 * 会場間の徒歩時間。**1件1行にしてある。**
 *
 * 以前は `{ 'akarenga|nissay': 3 }` のようにキーを連結した辞書だったが、
 * **この形は表に移せない。** 将来データベースへ移すとき、行になっていれば
 * そのまま1テーブルになる。JSONも同じ形で配る。
 */
export type Walk = { from: string; to: string; minutes: number };

/**
 * 判定の対象にしないプログラム。**載せるが、予定には入れられない。**
 *
 * ## なぜ Session と分けるのか
 *
 * 公式のプログラムには、いまの `Session` では表せないものがある
 * （東京〜茨城〜札幌の2日間の貸切フライト、前夜から翌朝までの合宿など）。
 * `Session` は `day` を1つしか持てず、`venueId` は徒歩圏の会場を指す前提で
 * できている。無理に会場を作ると、隣の予定で「徒歩時間が未登録です」と出る。
 * 飛行機に対してこの文言は明確に誤り。
 *
 * ## かといって、載せないのも違う
 *
 * 載せないと、その日にプログラムが無いように見え、**行けない予定を勧める。**
 * **なので「載せるが、予定には入れられない」形にした。**
 * 判定エンジンには一切届かないので、中核のロジックに手を入れずに済む（#2）。
 */
export type OffsiteProgram = {
  id: string;
  title: string;
  /**
   * どの日に出すか。**`days` の id を並べる。複数日にまたがるものがある。**
   *
   * 🔴 **表示のためだけの情報ではない。** これが無いと、徒歩圏外の
   * プログラムしか無い日が「空の日」に見える。
   */
  days: string[];
  /** 「9/23（水）〜9/24（木）」のように、画面にそのまま出す文字列 */
  dayLabel: string;
  /** 「09:00〜19:00」など。分からなければ入れない */
  timeLabel?: string;
  /** 「東京〜茨城〜札幌」「札幌市南区 芸森ワーサム」など */
  venueLabel: string;
  category: string;
  desc: string;
  ticket?: string;
  url?: string;
  applyUrl?: string;
  /**
   * **なぜ予定に入れられないのか。画面にそのまま出す。**
   *
   * 「このアプリの限界です」ではなく「このプログラムの性質です」と
   * 読める書き方にすること。前者だと、利用者はアプリ全体を疑い始める。
   */
  reason: string;
};

export type Day = { id: string; label: string; weekday: string };

/**
 * セッション。
 *
 * ⚠️ **`category` は `string` にしてある。** 同梱データ側では
 * `Category` に絞って型の関所を効かせるが、**外から来るデータには
 * 関所を効かせられない**（実行時に届くのでビルドは止まらない）。
 *
 * **知らないカテゴリを拒否しない。** 会期中に公式が新しいカテゴリを出したとき、
 * 拒否するとそのセッションが利用者から見えなくなる。受け入れて表示する方が害が小さい。
 * 「気づく」役目は公開前の `npm run data:check` が担う。
 */
export type Session = {
  id: string;
  day: string;
  start: string;
  end: string;
  venueId: string;
  title: string;
  speaker: string;
  category: string;
  /**
   * 部屋のある階。**縦移動の計算に使う**（`lib/elevator.ts`）。
   *
   * **公式に記載が無ければ、入れないこと。** 推測で埋めると、
   * 根拠の無い分数で「間に合う／間に合わない」を断言することになる。
   */
  floor?: number;
  /**
   * 興味タグごとの加点。**おすすめの精度は、ここで決まる。**
   *
   * 以前は「興味タグ → カテゴリ」の対応表で加点していたが、10種類のタグが
   * 2つのカテゴリに潰れ、選び分ける意味がほとんど無かった。
   * セッションごとに持たせれば、公式が新しいカテゴリを出しても対応表を
   * 直す必要がない。**無い場合は、従来どおりカテゴリで加点する**
   * （`lib/recommend.ts`）ので、移行の途中でも壊れない。
   */
  tagWeights?: Record<string, number>;
  desc: string;
  /** 受付締切。**開始時刻より前でなければならない** */
  reception?: string;
  ticket?: string;
  applyUrl?: string;
  url?: string;
};

/**
 * アプリが1つだけ持つデータの塊。**差し替えは必ずこの単位で行う。**
 *
 * **JSONにそのまま書ける形だけで構成する。** Map や Set を持たせない。
 * 端末に保存して次回そのまま読み戻すため、シリアライズできることが要件になる。
 */
export type Dataset = {
  /** 形の版。**互換性の無い変更をするときに上げる**（下の SCHEMA_VERSION を参照） */
  schemaVersion: number;
  /**
   * 中身の版。**増える整数。**
   *
   * 「どちらが新しいか」を端末の時計に頼らず決めるために使う。
   * 時計はずれるし、利用者が変えられる。
   */
  dataVersion: number;
  /** 人に見せるための生成時刻。**判断には使わない** */
  generatedAt: string;
  eventYear: number;
  days: Day[];
  venues: Venue[];
  walks: Walk[];
  sessions: Session[];
  /**
   * 判定の対象にしないプログラム。**古いデータには無いので、必ず空配列で補う。**
   * 「形には厳しく、欠けには寛容に」の方針どおり、無くても検証は通す。
   */
  offsitePrograms: OffsiteProgram[];
};

/**
 * このアプリが読める形の版。
 *
 * ⚠️ **ストアに出したアプリは凍結され、勝手には更新されない。**
 * 形を変えたくなったら、`event-v2.json` を**別のURLに置く**こと。
 * 古いアプリは v1 を読み続け、壊れない。**同じURLの中身の形を変えてはいけない。**
 */
export const SCHEMA_VERSION = 1;

export type ParseResult =
  | { ok: true; dataset: Dataset }
  | { ok: false; reasons: string[] };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 省略可能な文字列。未指定と空文字は「無い」として扱う */
function optionalString(v: unknown): string | undefined {
  return isNonEmptyString(v) ? v : undefined;
}

/**
 * 外から来た値を検証して `Dataset` にする。**信用しない前提で全部見る。**
 *
 * ## 形には厳しく、欠けには寛容に
 *
 * 🔴 **「徒歩時間が登録されていないペアがある」ことを理由に落としてはいけない。**
 * 未登録は想定内の状態で、`walkMinutesBetween` が `null` を返し、UIが「未登録」と
 * 表示する仕組みが既にある。ここで落とすと、**新しい会場が1つ増えただけで
 * データ全体が拒否され、アプリが二度と更新されなくなる。**
 *
 * 公開前の `npm run data:check` は逆に、未登録を**問題として報告する**。
 * 人に直させるための検査と、実行時に受け入れるための検査は、**厳しさの向きが違う。**
 */
export function parseDataset(input: unknown): ParseResult {
  const reasons: string[] = [];
  const fail = (r: string) => reasons.push(r);

  if (!isObject(input)) return { ok: false, reasons: ['最上位がオブジェクトではありません'] };

  if (input.schemaVersion !== SCHEMA_VERSION) {
    // ここだけは即座に打ち切る。形が違うものを読み進めても意味がない
    return {
      ok: false,
      reasons: [`形の版が違います（期待 ${SCHEMA_VERSION} / 実際 ${String(input.schemaVersion)}）`],
    };
  }

  if (!Number.isInteger(input.dataVersion) || (input.dataVersion as number) < 0) {
    fail('dataVersion が0以上の整数ではありません');
  }
  if (!Number.isInteger(input.eventYear)) fail('eventYear が整数ではありません');
  if (typeof input.generatedAt !== 'string') fail('generatedAt が文字列ではありません');

  for (const key of ['days', 'venues', 'walks', 'sessions'] as const) {
    if (!Array.isArray(input[key])) fail(`${key} が配列ではありません`);
  }
  if (reasons.length > 0) return { ok: false, reasons };

  // --- 日付 ---
  const days: Day[] = [];
  for (const [i, raw] of (input.days as unknown[]).entries()) {
    if (!isObject(raw)) {
      fail(`days[${i}] がオブジェクトではありません`);
      continue;
    }
    if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.label) || !isNonEmptyString(raw.weekday)) {
      fail(`days[${i}] の id/label/weekday が足りません`);
      continue;
    }
    days.push({ id: raw.id, label: raw.label, weekday: raw.weekday });
  }
  if (days.length === 0) fail('days が空です');

  // --- 会場 ---
  const venues: Venue[] = [];
  for (const [i, raw] of (input.venues as unknown[]).entries()) {
    if (!isObject(raw)) {
      fail(`venues[${i}] がオブジェクトではありません`);
      continue;
    }
    if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.name) || !isNonEmptyString(raw.letter)) {
      fail(`venues[${i}] の id/name/letter が足りません`);
      continue;
    }
    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) {
      fail(`venues[${i}](${raw.id}) の x/y が数値ではありません`);
      continue;
    }

    let coords: Venue['coords'];
    if (raw.coords !== undefined) {
      // **座標は「無い」ことが正常。** 壊れているときだけ落とす
      if (!isObject(raw.coords) || !isFiniteNumber(raw.coords.lat) || !isFiniteNumber(raw.coords.lng)) {
        fail(`venues[${i}](${raw.id}) の coords が壊れています`);
        continue;
      }
      coords = { lat: raw.coords.lat, lng: raw.coords.lng };
    }

    venues.push({
      id: raw.id,
      name: raw.name,
      letter: raw.letter,
      desc: typeof raw.desc === 'string' ? raw.desc : '',
      address: typeof raw.address === 'string' ? raw.address : '',
      x: raw.x,
      y: raw.y,
      ...(coords ? { coords } : {}),
    });
  }
  if (venues.length === 0) fail('venues が空です');

  const venueIds = new Set(venues.map((v) => v.id));
  if (venueIds.size !== venues.length) fail('会場のIDが重複しています');
  const dayIds = new Set(days.map((d) => d.id));
  if (dayIds.size !== days.length) fail('日付のIDが重複しています');

  // --- 徒歩時間 ---
  // 🔴 **足りないことは問題にしない。** 壊れているものだけを落とす
  const walks: Walk[] = [];
  for (const [i, raw] of (input.walks as unknown[]).entries()) {
    if (!isObject(raw)) {
      fail(`walks[${i}] がオブジェクトではありません`);
      continue;
    }
    if (!isNonEmptyString(raw.from) || !isNonEmptyString(raw.to)) {
      fail(`walks[${i}] の from/to が足りません`);
      continue;
    }
    if (!venueIds.has(raw.from) || !venueIds.has(raw.to)) {
      fail(`walks[${i}] が存在しない会場を指しています（${raw.from} ↔ ${raw.to}）`);
      continue;
    }
    if (raw.from === raw.to) {
      fail(`walks[${i}] の from と to が同じです（${raw.from}）`);
      continue;
    }
    if (!Number.isInteger(raw.minutes) || (raw.minutes as number) < 0) {
      fail(`walks[${i}](${raw.from} ↔ ${raw.to}) の minutes が0以上の整数ではありません`);
      continue;
    }
    walks.push({ from: raw.from, to: raw.to, minutes: raw.minutes as number });
  }

  const walkKeys = new Set(walks.map((w) => [w.from, w.to].sort().join('|')));
  if (walkKeys.size !== walks.length) fail('同じ会場の組み合わせが2回出てきます');

  // --- セッション ---
  const sessions: Session[] = [];
  for (const [i, raw] of (input.sessions as unknown[]).entries()) {
    if (!isObject(raw)) {
      fail(`sessions[${i}] がオブジェクトではありません`);
      continue;
    }
    const where = isNonEmptyString(raw.id) ? raw.id : `sessions[${i}]`;

    if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.title)) {
      fail(`${where} の id/title が足りません`);
      continue;
    }
    if (!isNonEmptyString(raw.day) || !dayIds.has(raw.day)) {
      fail(`${where} の day が days にありません（${String(raw.day)}）`);
      continue;
    }
    if (!isNonEmptyString(raw.venueId) || !venueIds.has(raw.venueId)) {
      // **これを通すと、会場名の表示も徒歩時間の判定も破綻する**
      fail(`${where} の venueId が venues にありません（${String(raw.venueId)}）`);
      continue;
    }
    if (typeof raw.start !== 'string' || !HHMM.test(raw.start)) {
      fail(`${where} の start が HH:MM ではありません（${String(raw.start)}）`);
      continue;
    }
    if (typeof raw.end !== 'string' || !HHMM.test(raw.end)) {
      fail(`${where} の end が HH:MM ではありません（${String(raw.end)}）`);
      continue;
    }
    if (raw.end <= raw.start) {
      // HH:MM は0埋めなので文字列比較で時刻の前後が判定できる
      fail(`${where} の end が start 以前です（${raw.start}–${raw.end}）`);
      continue;
    }
    // **カテゴリは中身を問わない。** 知らない値でも受け入れる（この型の説明を参照）
    if (!isNonEmptyString(raw.category)) {
      fail(`${where} の category が空です`);
      continue;
    }

    const reception = optionalString(raw.reception);
    if (reception !== undefined) {
      if (!HHMM.test(reception)) {
        fail(`${where} の reception が HH:MM ではありません（${reception}）`);
        continue;
      }
      if (reception >= raw.start) {
        // **開始より後の受付締切は、判定エンジンが締切としてしか読めない。**
        // 通すと、実際には間に合う移動を「N分足りません」と誤って警告する
        fail(`${where} の reception が start 以降です（受付 ${reception} / 開始 ${raw.start}）`);
        continue;
      }
    }

    /*
      階。**入っていないのは正常。** 公式に記載が無い会場があり、
      その場合は縦移動を上乗せしない（`lib/elevator.ts`）。
      入っているのに数でない・現実的でない値なら、黙って捨てずに止める。
    */
    const floor = raw.floor;
    if (floor !== undefined && floor !== null) {
      if (typeof floor !== 'number' || !Number.isInteger(floor)) {
        fail(`${where} の floor が整数ではありません（${String(floor)}）`);
        continue;
      }
      if (floor < -5 || floor > 60) {
        fail(`${where} の floor が現実的な範囲を外れています（${floor}）`);
        continue;
      }
    }

    /*
      興味タグごとの加点。**壊れた値は黙って捨てず、そのセッションを落とす。**
      おすすめの並びに直接効くので、「なぜか上位に出ない」を作らない。
    */
    let tagWeights: Record<string, number> | undefined;
    if (raw.tagWeights !== undefined && raw.tagWeights !== null) {
      if (!isObject(raw.tagWeights)) {
        fail(`${where} の tagWeights がオブジェクトではありません`);
        continue;
      }
      const entries = Object.entries(raw.tagWeights as Record<string, unknown>);
      const bad = entries.find(([, v]) => !isFiniteNumber(v));
      if (bad) {
        fail(`${where} の tagWeights.${bad[0]} が数値ではありません`);
        continue;
      }
      if (entries.length > 0) {
        tagWeights = Object.fromEntries(entries as [string, number][]);
      }
    }

    sessions.push({
      id: raw.id,
      day: raw.day,
      start: raw.start,
      end: raw.end,
      venueId: raw.venueId,
      title: raw.title,
      speaker: typeof raw.speaker === 'string' ? raw.speaker : '',
      category: raw.category,
      desc: typeof raw.desc === 'string' ? raw.desc : '',
      ...(typeof floor === 'number' ? { floor } : {}),
      ...(tagWeights ? { tagWeights } : {}),
      ...(reception ? { reception } : {}),
      ...(optionalString(raw.ticket) ? { ticket: raw.ticket as string } : {}),
      ...(optionalString(raw.applyUrl) ? { applyUrl: raw.applyUrl as string } : {}),
      ...(optionalString(raw.url) ? { url: raw.url as string } : {}),
    });
  }

  if (new Set(sessions.map((s) => s.id)).size !== sessions.length) {
    fail('セッションのIDが重複しています');
  }

  /*
    判定対象外のプログラム。**無くても通す。**
    この形が生まれる前に配ったデータには存在しないし、
    ここで落とすと、古いデータを読んでいる端末がアプリごと止まる。
  */
  const offsitePrograms: OffsiteProgram[] = [];
  const rawOffsite = (input as { offsitePrograms?: unknown }).offsitePrograms;
  if (rawOffsite !== undefined) {
    if (!Array.isArray(rawOffsite)) {
      fail('offsitePrograms が配列ではありません');
    } else {
      for (const [i, raw] of rawOffsite.entries()) {
        if (!isObject(raw)) {
          fail(`offsitePrograms[${i}] がオブジェクトではありません`);
          continue;
        }
        const where = isNonEmptyString(raw.id) ? raw.id : `offsitePrograms[${i}]`;
        // **reason は必須。** 「なぜ予定に入れられないか」を出せないなら載せない
        if (
          !isNonEmptyString(raw.id) ||
          !isNonEmptyString(raw.title) ||
          !isNonEmptyString(raw.dayLabel) ||
          !isNonEmptyString(raw.venueLabel) ||
          !isNonEmptyString(raw.reason)
        ) {
          fail(`${where} の id/title/dayLabel/venueLabel/reason が足りません`);
          continue;
        }
        // **出す日が分からないものは載せない。** 黙って全日に出すほうが悪い
        const offDays = Array.isArray(raw.days) ? raw.days.filter(isNonEmptyString) : [];
        if (offDays.length === 0) {
          fail(`${where} の days が空です（どの日に出すかが決まりません）`);
          continue;
        }
        const unknownDay = offDays.find((d) => !dayIds.has(d));
        if (unknownDay !== undefined) {
          fail(`${where} の days に、days に無い日が入っています（${unknownDay}）`);
          continue;
        }
        offsitePrograms.push({
          id: raw.id,
          title: raw.title,
          days: offDays,
          dayLabel: raw.dayLabel,
          venueLabel: raw.venueLabel,
          reason: raw.reason,
          category: isNonEmptyString(raw.category) ? raw.category : '',
          desc: typeof raw.desc === 'string' ? raw.desc : '',
          ...(optionalString(raw.timeLabel) ? { timeLabel: raw.timeLabel as string } : {}),
          ...(optionalString(raw.ticket) ? { ticket: raw.ticket as string } : {}),
          ...(optionalString(raw.url) ? { url: raw.url as string } : {}),
          ...(optionalString(raw.applyUrl) ? { applyUrl: raw.applyUrl as string } : {}),
        });
      }
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };

  return {
    ok: true,
    dataset: {
      schemaVersion: SCHEMA_VERSION,
      dataVersion: input.dataVersion as number,
      generatedAt: input.generatedAt as string,
      eventYear: input.eventYear as number,
      days,
      venues,
      walks,
      sessions,
      offsitePrograms,
    },
  };
}

/**
 * 候補の中から実際に使うものを選ぶ。**`dataVersion` が最大のものが勝つ。**
 *
 * 候補は「アプリに同梱したもの」「前回取れてキャッシュしたもの」「今回取れたもの」の3つ。
 * **この1行の規則が、面倒な場合をすべて吸収する。**
 *
 * - 通信できない → 同梱かキャッシュが残る
 * - アプリを更新して同梱データの方が新しい → **同梱が勝つ。**古いキャッシュに引きずられない
 * - 誤って古いJSONを公開した → **無視される**
 *
 * 同点のときは先に渡されたものを採る。呼び出し側は**同梱を先頭**にして渡すこと
 * （同じ版なら、通信で取り直したものより手元にあるものを使う方が速い）。
 */
export function selectDataset(candidates: (Dataset | null | undefined)[]): Dataset | null {
  let best: Dataset | null = null;
  for (const c of candidates) {
    if (!c) continue;
    if (best === null || c.dataVersion > best.dataVersion) best = c;
  }
  return best;
}

/**
 * 会場を引く。**見つからなければ `undefined`。**
 *
 * ⚠️ **以前は見つからないと1番目の会場を返していた。** 知らないIDに対して
 * 「赤れんがホールA」と答える作りで、`walkMinutesBetween` が未登録のペアに
 * `?? 10` を返していたのと**まったく同じ形の欠陥**だった。
 * 分からないものを、それらしい答えで埋めない。
 */
export function venueById(dataset: Dataset, id: string): Venue | undefined {
  return dataset.venues.find((v) => v.id === id);
}

export function sessionById(dataset: Dataset, id: string): Session | undefined {
  return dataset.sessions.find((s) => s.id === id);
}

/**
 * 会場間の徒歩時間。同じ会場は0、**未登録は `null`**。
 *
 * 既定値で埋めてはいけない。以前は `?? 10` を返しており、
 * **2026-08-11に会場が4つ目に増えて3ペアが欠けたとき、根拠のない数字で
 * 「余裕5分」と断言するところだった。** 分からないときは分からないと言う。
 *
 * 毎回なめているのは、**`Dataset` をJSONに書ける形だけで構成したいため**
 * （索引を持たせると保存して読み戻せなくなる）。会場は多くても10前後、
 * 組み合わせは45程度なので、探索の回数は問題にならない。
 */
export function walkMinutesBetween(dataset: Dataset, a: string, b: string): number | null {
  if (a === b) return 0;
  const hit = dataset.walks.find(
    (w) => (w.from === a && w.to === b) || (w.from === b && w.to === a),
  );
  return hit ? hit.minutes : null;
}

/**
 * いま存在するカテゴリの一覧。**絞り込みの選択肢はここから作る。**
 *
 * 定数から作ってはいけない。**公式が会期中に新しいカテゴリを出したとき、
 * 定数を見ていると、そのカテゴリのセッションだけ絞り込めなくなる。**
 * 出現順を保つので、公式の並びがそのまま画面の並びになる。
 */
export function categoriesOf(dataset: Dataset): string[] {
  const seen: string[] = [];
  for (const s of dataset.sessions) {
    if (!seen.includes(s.category)) seen.push(s.category);
  }
  return seen;
}

/**
 * 徒歩時間が未登録の組み合わせ。**表示と公開前の点検のためのもので、
 * 検証で落とすためのものではない**（`parseDataset` の説明を参照）。
 */
export function missingWalks(dataset: Dataset): string[] {
  const missing: string[] = [];
  const { venues } = dataset;
  for (let i = 0; i < venues.length; i++) {
    for (let j = i + 1; j < venues.length; j++) {
      if (walkMinutesBetween(dataset, venues[i].id, venues[j].id) === null) {
        missing.push(`${venues[i].id} ↔ ${venues[j].id}`);
      }
    }
  }
  return missing;
}
