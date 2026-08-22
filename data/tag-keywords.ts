/**
 * 興味タグを見分けるための語。**おすすめの精度は、この表で決まる。**
 *
 * ## この表がやっていること
 *
 * セッションのタイトルと説明文に、ここの語が含まれていれば、そのタグに加点する。
 * `data/event.ts` が同梱データを組み立てるときに計算して、`tagWeights` として持たせる。
 *
 * ## なぜ表を人が持つのか（AIに1件ずつ採点させないのか）
 *
 * **200件の重みは誰も検証できないが、この表は5分で読める。**
 *
 *   - **同じ入力に同じ答えが出る。** 実行するたびに並びが変わらない
 *   - **「なぜ上位に出たか」を説明できる。**「『食育』が入っているから」と言える
 *   - **1語直すと、過去の全セッションに一貫して効く**
 *
 * **AIの役目は、この表を育てること。** 新しいセッションを読んで
 * 「この語が表に無い」と気づき、追加を提案する。採点そのものは表がやる。
 *
 * ## 重みの目安
 *
 *   3  そのセッションの主題そのもの
 *   2  主題ではないが、はっきり扱っている
 *   1  触れている程度
 *
 * ⚠️ **強い語だけを入れること。** 「地域」のような広い語を3にすると、
 * ほとんどのセッションが「地方創生」で上位に来て、タグの意味が消える。
 */
export type TagKeyword = { word: string; weight: number };

export const TAG_KEYWORDS: Record<string, TagKeyword[]> = {
  地方創生: [
    { word: '地方創生', weight: 3 },
    { word: '関係人口', weight: 3 },
    { word: '過疎', weight: 3 },
    { word: '移住', weight: 2 },
    { word: '地域活性', weight: 2 },
    { word: '循環', weight: 1 },
    { word: '地域', weight: 1 },
  ],
  スタートアップ: [
    { word: 'スタートアップ', weight: 3 },
    // 🔴 **英語表記も見る。** タイトルが「PA for Startups!」なのに
    // カタカナしか見ておらず、1件も点が付かなかった、という事例が native 版にあった
    { word: 'Startups', weight: 3 },
    { word: 'Startup', weight: 3 },
    { word: '起業', weight: 3 },
    { word: '創業', weight: 3 },
    { word: '投資', weight: 2 },
    { word: '資金調達', weight: 2 },
    { word: '事業開発', weight: 2 },
    { word: 'ビジネスプラン', weight: 2 },
    { word: '事業機会', weight: 2 },
    { word: 'プロダクト', weight: 2 },
    { word: '共創', weight: 1 },
  ],
  '海外・越境': [
    { word: '海外', weight: 3 },
    { word: '越境', weight: 3 },
    { word: 'グローバル', weight: 3 },
    { word: 'バスク', weight: 3 },
    { word: '国際', weight: 2 },
    { word: 'インバウンド', weight: 2 },
    { word: '留学', weight: 2 },
  ],
  'テクノロジー・AI': [
    { word: 'AI', weight: 3 },
    { word: 'DX', weight: 3 },
    { word: 'デジタル', weight: 3 },
    { word: 'テクノロジー', weight: 3 },
    { word: 'データ', weight: 2 },
    { word: 'ロボット', weight: 2 },
    { word: '生成AI', weight: 3 },
    { word: 'IT', weight: 1 },
  ],
  まちづくり: [
    { word: 'まちづくり', weight: 3 },
    { word: '都市', weight: 2 },
    { word: '公共空間', weight: 3 },
    { word: '再開発', weight: 2 },
    { word: '自治体', weight: 2 },
    { word: '行政', weight: 2 },
    { word: '官民', weight: 2 },
    { word: '法制度', weight: 2 },
    { word: '公共', weight: 2 },
    // 「規制」は広い語。強くすると関係の薄いものまで巻き込む
    { word: '規制', weight: 1 },
    { word: '暮らし', weight: 1 },
  ],
  '教育・学び': [
    { word: '教育', weight: 3 },
    { word: '人材育成', weight: 3 },
    { word: '学び', weight: 3 },
    { word: '食育', weight: 2 },
    { word: 'リスキリング', weight: 3 },
    { word: 'キャリア', weight: 2 },
    { word: '働きがい', weight: 2 },
    { word: '研修', weight: 2 },
  ],
  学生の活動: [
    { word: '学生', weight: 3 },
    { word: '若者', weight: 3 },
    { word: 'インターン', weight: 3 },
    { word: 'U35', weight: 2 },
    { word: '大学', weight: 2 },
    { word: '次世代', weight: 2 },
  ],
  デザイン: [
    { word: 'デザイン', weight: 3 },
    { word: '設計', weight: 1 },
    { word: 'クリエイティブ', weight: 2 },
    { word: '建築', weight: 2 },
    { word: 'UX', weight: 3 },
  ],
  '映像・音楽・アート': [
    { word: '映像', weight: 3 },
    { word: '音楽', weight: 3 },
    { word: 'アート', weight: 3 },
    { word: '映画', weight: 3 },
    { word: 'ライブ', weight: 2 },
    { word: 'エンタメ', weight: 2 },
    { word: 'コンテンツ', weight: 1 },
  ],
  フード: [
    { word: '食', weight: 2 },
    { word: '農', weight: 2 },
    { word: '水産', weight: 2 },
    { word: 'シェフ', weight: 3 },
    { word: 'レストラン', weight: 3 },
    { word: '飲食', weight: 3 },
    { word: 'food', weight: 3 },
    { word: '弁当', weight: 2 },
    { word: '料理', weight: 3 },
  ],
};

/**
 * 1つのタグにつく上限。
 *
 * **同じ語が何度出ても、際限なく積み上がらないようにする。**
 * 「食」が10回出てくる説明文が、他を押しのけて常に1位になるのを防ぐ。
 */
export const TAG_WEIGHT_CAP = 4;

/**
 * タイトルと説明文から、興味タグごとの加点を出す。
 *
 * **同じ語が複数回出ても1回だけ数える。** 説明文の長いセッションが
 * 有利になるのは、内容ではなく文字数で並ぶということなので。
 */
export function computeTagWeights(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [tag, words] of Object.entries(TAG_KEYWORDS)) {
    let score = 0;
    for (const { word, weight } of words) {
      if (text.includes(word)) score += weight;
    }
    if (score > 0) out[tag] = Math.min(score, TAG_WEIGHT_CAP);
  }
  return out;
}

/**
 * 興味タグの重みが1つも付かなかったセッション。
 *
 * **ここに載るセッションは、どのタグを選んでも0点で、誰のおすすめにも上位に来ない。**
 * 「どの興味タグからも指されないカテゴリがあると、そのカテゴリのセッションは
 * 誰のおすすめにも上がらない」という考え方（加点をカテゴリ単位からセッション単位へ
 * 変えたあとも、同じ形の穴が空きうる）。
 *
 * テストから使う。**実行時の判断には使わない。**
 */
export function sessionsWithoutTagWeight(
  sessions: readonly { id: string; title: string; desc: string }[],
): string[] {
  return sessions
    .filter((s) => Object.keys(computeTagWeights(`${s.title}
${s.desc}`)).length === 0)
    .map((s) => s.id);
}
