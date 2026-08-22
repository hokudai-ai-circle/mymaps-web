'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Chip } from '@/components/ui';
import { PRIVACY_POLICY_URL } from '@/constants/links';
import { INTEREST_TAGS, InterestTag, Role, ROLES, useApp } from '@/store/AppContext';
import styles from './page.module.css';

/**
 * オンボーディング。
 * 立場と興味タグを聞き、ホームのおすすめの照合に使う。
 * 位置情報の扱いを先に明示する。
 */
export default function Onboarding() {
  const router = useRouter();
  const { completeOnboarding, hydrated, profile } = useApp();
  const [role, setRole] = useState<Role | null>(null);
  const [tags, setTags] = useState<InterestTag[]>([]);

  // 前回オンボーディングを終えていれば、毎回聞き直さずホームへ進む
  useEffect(() => {
    if (hydrated && profile) {
      router.replace('/home');
    }
  }, [hydrated, profile, router]);

  // 読み込み前に質問画面を出すと、既存ユーザーに一瞬オンボーディングが見えてしまう
  if (!hydrated || profile) {
    return (
      <div className={`${styles.screen} ${styles.loading}`}>
        <span className={styles.spinner} aria-label="読み込み中" />
      </div>
    );
  }

  const toggleTag = (t: InterestTag) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const start = () => {
    completeOnboarding({ role: role ?? '学生', tags });
    router.replace('/home');
  };

  return (
    <div className={styles.screen}>
      <div className={styles.content}>
        <span className={styles.brand}>MyMaps</span>

        {/* Issue #3: このアプリが非公式であることを、利用開始前に必ず示す */}
        <p className={styles.disclaimer}>
          NoMaps 2026 のファンアプリです。公式アプリではありません。
          <br />
          掲載しているプログラムは、公式サイトで公開済みのものです。順次追加されます。
        </p>

        <h1 className={styles.h1}>
          はじめまして。
          <br />
          30秒だけ、きみのこと教えて。
        </h1>
        <p className={styles.lead}>興味に合わせて、今日のおすすめを選びます。あとから変更OK。</p>

        <p className={styles.q}>立場は？</p>
        <div className={styles.row}>
          {ROLES.map((r) => (
            <Chip key={r} label={r} active={role === r} onPress={() => setRole(r)} />
          ))}
        </div>

        <p className={styles.q}>気になるタグは？（いくつでも）</p>
        <div className={styles.row}>
          {INTEREST_TAGS.map((t) => (
            <Chip key={t} label={t} active={tags.includes(t)} onPress={() => toggleTag(t)} />
          ))}
        </div>

        <div className={styles.note}>
          <p className={styles.noteText}>
            入力内容はブラウザ内にのみ保存され、外部に送信されません。位置情報は、あなたが「現在地から測る」を押したときだけ使い、これも外部には送信されません。
          </p>
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className={styles.policyLink}>
            プライバシーポリシーを読む
          </a>
        </div>

        <Button label={role ? 'はじめる' : '立場を選んでください'} onPress={start} disabled={!role} />

        <button type="button" onClick={start} className={styles.skip}>
          あとで設定する
        </button>
      </div>
    </div>
  );
}
