# NoMaps fan app (Web版)

NoMaps（札幌の多産業クリエイティブ・カンファレンス）の非公式ファンアプリ、Web版。

公式タイムテーブルは会場間の徒歩移動時間を考慮していないため、「その予定は本当に間に合うか」を事前に警告することがこのアプリの目的です。ネイティブ版（[NoMaps-fan-app](../NoMaps-fan-app)）をベースに、Next.js で作り直した独立プロジェクトです。

## セットアップ

```bash
npm install
```

## 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開いてください。`/` はオンボーディング画面です。

## テスト

判定エンジン・データ検証・おすすめロジックなど、純粋なロジック部分のテストです（Node標準の `node:test` を使用、追加ライブラリなし）。

```bash
npm test
```

## 型チェック / ビルド

```bash
npm run typecheck
npm run build
```

## 構成

- `lib/schedule.ts` — 判定エンジン（移動時間・受付締切・重複の判定）。このアプリの中心。
- `lib/dataset.ts` — セッション・会場データの型とバリデーション。
- `lib/eventSource.ts` — 公開データの取得・`localStorage` へのキャッシュ。
- `lib/location.ts` — ブラウザの Geolocation API との境界。
- `data/event.ts` — NoMaps公式サイトから転記した実データ。
- `store/AppContext.tsx` — アプリ全体の状態（React Context 1つ）。
- `app/` — 画面（オンボーディング／ホーム／マップ／予定／プロフィール／検索／セッション詳細）。

通知機能（予定前のリマインダー）は、このWeb版のスコープには含まれていません。
