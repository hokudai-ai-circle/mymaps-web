'use client';

import { Button, Chip, SectionTitle } from '@/components/ui';
import { INTEREST_TAGS, InterestTag, useApp } from '@/store/AppContext';
import styles from './page.module.css';

/**
 * 「いつ時点か」の表示。**読めない値だったら日付を作らない。**
 *
 * `generatedAt` は外から届く文字列で、検証では「文字列であること」しか見ていない
 * （日付として壊れていることを理由にデータ全体を捨てるのは厳しすぎる）。
 * ここで初めて日付として読むので、読めない場合がある。
 * **それらしい日付を捏造せず、素直に分からないと出す。**
 */
function formatAsOf(generatedAt: string): string {
  const d = new Date(generatedAt);
  if (Number.isNaN(d.getTime())) return '取得日時が不明な';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 「◯:◯◯ に確認」の時刻。日付は同じ日のことが大半なので出さない */
function formatTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * プロフィール。
 *
 * オンボーディングで聞いた立場と興味タグを、あとから変えられる場所。
 *
 * **保存ボタンは置かない。** 触った瞬間に反映して保存する。
 * ここで変えた内容はホームのおすすめにすぐ効くので、
 * 保存を挟むと「変えたのにおすすめが変わらない」という状態が生まれる。
 */
export default function ProfileTab() {
  const { profile, updateProfile, dataset, datasetChecking, datasetCheckedAt, datasetResult, refreshDataset } =
    useApp();

  const tags: InterestTag[] = profile?.tags ?? [];

  const toggleTag = (t: InterestTag) =>
    updateProfile({
      tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t],
    });

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1 className={styles.title}>プロフィール</h1>
      </div>

      <div className={styles.content}>
        <p className={styles.lead}>
          ここで選んだ内容は、ホームのおすすめの並びに使われます。いつでも変えられます。
        </p>

        <SectionTitle>気になるタグ</SectionTitle>
        <p className={styles.hint}>
          {tags.length === 0 ? 'ひとつも選ばれていません。選ぶとおすすめの精度が上がります。' : `${tags.length}個えらんでいます`}
        </p>
        <div className={styles.row}>
          {INTEREST_TAGS.map((t) => (
            <Chip key={t} label={t} active={tags.includes(t)} onPress={() => toggleTag(t)} />
          ))}
        </div>

        {/*
          プログラム情報がいつ時点のものかを必ず添える。
          **このアプリは位置情報について「5分前に取得した位置を使っています」と
          必ず時点を出している。同じ理由でこちらも出す。**
          会場は電波が弱く、更新できていない可能性が常にある。
          黙っていると、古い時間割で「間に合う」と断言することになる。
        */}
        <SectionTitle>プログラム情報</SectionTitle>
        <div className={styles.dataCard}>
          <p className={styles.dataText}>{`${formatAsOf(dataset.generatedAt)} 時点の情報を表示しています。`}</p>
          <p className={styles.dataSub}>
            公式サイトで公開済みのプログラムを読み込んでいます。会期が近づくと内容が変わります。
          </p>
          <Button
            label={datasetChecking ? '確認中…' : '最新の情報を確認'}
            variant="outline"
            disabled={datasetChecking}
            onPress={() => refreshDataset()}
          />

          {/*
            🔴 **押した結果を必ず出す。**
            公開データが同じ版なら画面は何も変わらず、通信は0.2秒で終わるので
            「確認中…」も見えない。**成功を黙っていると、無反応と区別が付かない。**
          */}
          {datasetCheckedAt !== null && datasetResult && (
            <div className={styles.dataResult}>
              <p className={datasetResult.ok ? styles.dataOk : styles.dataError}>
                {`${formatTime(datasetCheckedAt)} に確認 — ${datasetResult.text}`}
              </p>
              {!datasetResult.ok && datasetResult.detail && <p className={styles.dataDetail}>{datasetResult.detail}</p>}
            </div>
          )}
        </div>

        <div className={styles.note}>
          <p className={styles.noteText}>
            入力内容はブラウザ内にのみ保存され、外部に送信されません。氏名やメールアドレスを聞くことはありません。
          </p>
        </div>

        {/*
          Issue #3: このアプリが非公式であることを常設で示す。
          NoMaps事務局からの掲載許諾がまだ得られていないため、公式と誤解されないようにする。
        */}
        <div className={styles.disclaimer}>
          <p className={styles.disclaimerText}>
            NoMaps 2026 のファンアプリです。公式アプリではありません。
            <br />
            掲載しているプログラムは、公式サイトで公開済みのものです。順次追加されます。
          </p>
        </div>
      </div>
    </div>
  );
}
