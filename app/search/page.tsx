'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SessionCard } from '@/components/SessionCard';
import { Snackbar } from '@/components/Snackbar';
import { venueById } from '@/lib/dataset';
import { travelLabel } from '@/lib/schedule';
import { useApp } from '@/store/AppContext';
import styles from './page.module.css';

/**
 * 検索。
 *
 * ホーム右上の虫眼鏡から開く画面。**検索は常駐させるものではなく、
 * 必要になったときに開くもの。**
 *
 * ここは**日付で絞らない**。「いつだったか思い出せない」から検索するので、
 * 日を跨いで探せないと用を成さない。そのため、ここでは各カードに日付を出す
 * （ホーム側は日付を選んで見ているので出さない）。
 */
export default function SearchScreen() {
  const router = useRouter();
  const { dataset, addSession, isPlanned, check } = useApp();

  const [query, setQuery] = useState('');
  const [snack, setSnack] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return [];
    return dataset.sessions
      .filter((s) => {
        const haystack = [s.title, s.speaker, s.desc, s.category, s.ticket ?? '', venueById(dataset, s.venueId)?.name ?? '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
  }, [q, dataset]);

  const notify = (m: string) => {
    setSnack(m);
    setTimeout(() => setSnack(null), 3200);
  };

  const handleAdd = (id: string) => {
    const pre = check(id);
    addSession(id);
    if (pre.conflictWith) {
      notify(`追加しました。ただし「${pre.conflictWith.title}」と重なっています`);
    } else if (pre.incoming.status !== 'first' && pre.incoming.status !== 'ok') {
      notify(`追加しました。${travelLabel(pre.incoming)}`);
    } else {
      notify('予定に追加しました');
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button type="button" onClick={() => router.back()} className={styles.back} aria-label="閉じる">
          ✕
        </button>
        <h1 className={styles.heading}>さがす</h1>
      </div>

      <div className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden="true">
          🔍
        </span>
        <input
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キーワード・登壇者・会場で探す"
          autoFocus
        />
        {query.length > 0 && (
          <button type="button" onClick={() => setQuery('')} className={styles.clearIcon} aria-label="検索語を消す">
            ✕
          </button>
        )}
      </div>

      <div className={styles.list}>
        {q === '' && (
          <div className={styles.empty}>
            <p className={styles.emptyText}>セッション名・登壇者・会場名で探せます。日付をまたいで検索します。</p>
          </div>
        )}

        {q !== '' && results.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>見つかりませんでした</p>
            <p className={styles.emptyText}>
              キーワードを変えてみてください。公式サイトで未公開のプログラムは、まだ載っていません。
            </p>
          </div>
        )}

        {q !== '' && results.length > 0 && <p className={styles.count}>{`${results.length}件`}</p>}

        {results.map((s) => {
          const planned = isPlanned(s.id);
          return (
            <div key={s.id} className={styles.row}>
              {/* 検索は日付で絞らないので、ここでは日付が要る */}
              <p className={styles.dayLabel}>{`${s.day}（${dataset.days.find((d) => d.id === s.day)?.weekday ?? ''}）`}</p>
              <SessionCard
                session={s}
                onPress={() => router.push(`/session/${s.id}`)}
                right={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!planned) handleAdd(s.id);
                    }}
                    disabled={planned}
                    className={`${styles.addBtn} ${planned ? styles.addBtnDone : ''}`}
                  >
                    {planned ? '追加済み' : '＋ 追加'}
                  </button>
                }
              />
            </div>
          );
        })}
      </div>

      {snack && <Snackbar text={snack} />}
    </div>
  );
}
