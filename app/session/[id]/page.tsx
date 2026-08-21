'use client';

import { useParams, useRouter } from 'next/navigation';
import { NavIcon } from '@/components/NavIcon';
import { Button, MoodChip, VenueDot } from '@/components/ui';
import { sessionById, venueById } from '@/lib/dataset';
import { travelLabel } from '@/lib/schedule';
import { useApp } from '@/store/AppContext';
import styles from './page.module.css';

/**
 * 戻るボタン。
 *
 * **表示は「戻る」で固定する。** この画面はホーム・マップ・予定・さがすの
 * 4箇所から開けて、`router.back()` は来た場所へ戻る。「イベント一覧」のような
 * 行き先の名前を出すと、予定やマップから来た人には嘘になる。
 */
function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} className={styles.backBtn} aria-label="戻る">
      <NavIcon name="chevron-left" color="var(--color-teal)" size={22} />
      <span className={styles.back}>戻る</span>
    </button>
  );
}

export default function SessionDetail() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { dataset, addSession, removeSession, isPlanned, check } = useApp();

  const session = params.id ? sessionById(dataset, params.id) : undefined;

  if (!session) {
    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <BackButton onPress={() => router.back()} />
        </div>
        <p className={styles.missing}>セッションが見つかりませんでした。</p>
      </div>
    );
  }

  const venue = venueById(dataset, session.venueId);
  const planned = isPlanned(session.id);
  const pre = check(session.id);

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <BackButton onPress={() => router.back()} />
      </div>

      <div className={styles.content}>
        <div className={styles.metaRow}>
          <span className={styles.time}>{`${session.day} ${session.start}–${session.end}`}</span>
          <span className={styles.cat}>{session.category}</span>
        </div>

        <h1 className={styles.title}>{session.title}</h1>
        <p className={styles.speaker}>{session.speaker}</p>

        <div className={styles.moods}>
          {session.moods.map((m) => (
            <MoodChip key={m} label={m} />
          ))}
        </div>

        <p className={styles.desc}>{session.desc}</p>

        {/* 会場が引けないことは検証で弾いているが、引けなければ会場欄ごと出さない */}
        {venue && (
          <div className={styles.venueCard}>
            <VenueDot letter={venue.letter} size={30} />
            <div className={styles.venueText}>
              <p className={styles.venueName}>{venue.name}</p>
              <p className={styles.venueDesc}>{venue.desc}</p>
            </div>
          </div>
        )}

        {session.ticket && (
          <div className={styles.ticketCard}>
            <p className={styles.ticketTitle}>{session.ticket}</p>
            {/*
              申込先が分かっているものは、ここから直接飛ばす。
              「別途申込が必要」と書いておいて申込先を出さないと、公式ページを開いて
              本文を読み直させることになる。
            */}
            {session.applyUrl ? (
              <a href={session.applyUrl} target="_blank" rel="noopener noreferrer" className={styles.applyLink}>
                申込ページを開く
              </a>
            ) : (
              <p className={styles.ticketBody}>参加方法はNoMaps公式サイトで確認してください。</p>
            )}
          </div>
        )}

        {session.reception && (
          <div className={styles.receptionCard}>
            <p className={styles.receptionTitle}>{`受付は ${session.reception} まで`}</p>
            <p className={styles.receptionBody}>受付を過ぎると入場できません。移動時間に余裕を持ってください。</p>
          </div>
        )}

        <div className={styles.travelCard}>
          <p className={styles.travelLabel}>直前の予定からの移動時間</p>
          <p className={styles.travelValue}>{travelLabel(pre.incoming)}</p>
          {pre.conflictWith && (
            <p className={styles.conflict}>
              {`この時間にはすでに「${pre.conflictWith.title}」の予定があります。移動時間を考えると両方には参加できません。`}
            </p>
          )}
          {pre.breaksNext && (
            <p className={styles.conflict}>{`追加すると、次の「${pre.breaksNext.session.title}」に間に合わなくなります。`}</p>
          )}
        </div>

        {planned ? (
          <Button
            label="予定から外す"
            variant="outline"
            onPress={() => {
              removeSession(session.id);
              router.back();
            }}
          />
        ) : (
          <Button
            label="予定に追加"
            onPress={() => {
              addSession(session.id);
              router.back();
            }}
          />
        )}

        {/*
          説明文は公式の全文を載せている（事務局からの要請で、一字一句そのまま使う）。
          このリンクは、登壇者の詳細やチケットなど、アプリが持っていない情報への導線として残す。
        */}
        {session.url && (
          <a href={session.url} target="_blank" rel="noopener noreferrer" className={styles.officialLink}>
            NoMaps公式サイトで詳細を見る
          </a>
        )}
      </div>
    </div>
  );
}
