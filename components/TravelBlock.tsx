'use client';

import { venueById } from '@/lib/dataset';
import { useApp } from '@/store/AppContext';
import { isProblem, TravelInfo } from '@/lib/schedule';
import { Button } from './ui';
import styles from './TravelBlock.module.css';

/**
 * 予定と予定の「間」に挟まる移動ブロック。
 *
 * このアプリの主役。経路案内ではなく「その予定は間に合わない」という
 * 事前警告を見せることが目的なので、問題があるときだけ強く出す。
 * 警告色（イエロー）はここでしか使わない。
 */
export function TravelBlock({
  travel,
  onResolve,
}: {
  travel: TravelInfo;
  onResolve?: (action: 'leave-early' | 'alternative' | 'remove') => void;
}) {
  const { dataset } = useApp();

  if (travel.status === 'first') {
    return (
      <div className={styles.calmRow}>
        <span className={styles.rail} />
        <span className={styles.calmText}>この日最初の予定になります。</span>
      </div>
    );
  }

  // 大域ではなく、いま使っているデータセットから引く
  const from = travel.from ? (venueById(dataset, travel.from.venueId)?.name ?? '') : '';
  const problem = isProblem(travel.status);

  // 徒歩時間が未登録。分数を出さず、判定できないことをそのまま伝える。
  // 「代わりの候補」も出さない（候補側の徒歩時間も同じく未登録の可能性がある）。
  if (travel.status === 'unknown') {
    return (
      <div className={styles.warnCard} role="alert">
        <div className={styles.warnHead}>
          <span className={styles.warnIcon} aria-hidden="true">
            ⚠
          </span>
          <span className={styles.warnTitle}>移動時間が判定できません</span>
        </div>
        <p className={styles.warnDetail}>
          {`${from}から次の会場までの徒歩時間が登録されていません。間に合うかどうかは、ご自身で確認してください。`}
        </p>
      </div>
    );
  }

  if (!problem) {
    const tail = travel.status === 'exact' ? 'ちょうど間に合う' : `余裕${travel.slackMinutes}分`;
    return (
      <div className={styles.calmRow}>
        <span className={styles.rail} />
        <span className={styles.calmText}>
          {`徒歩${travel.walkMinutes}分・${from}から　${tail}`}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.warnCard} role="alert">
      <div className={styles.warnHead}>
        <span className={styles.warnIcon} aria-hidden="true">
          ⚠
        </span>
        <span className={styles.warnTitle}>{headline(travel)}</span>
      </div>

      <p className={styles.warnDetail}>{detail(travel, from)}</p>

      {onResolve && (
        <div className={styles.actions}>
          {travel.leaveBy && travel.status !== 'overlap' && (
            <Button
              label={`前の予定を${travel.leaveBy}に抜ける`}
              variant="warn"
              onPress={() => onResolve('leave-early')}
              className={styles.action}
            />
          )}
          <Button
            label="代わりの候補を見る"
            variant="outline"
            onPress={() => onResolve('alternative')}
            className={styles.action}
          />
          <Button
            label="この予定を外す"
            variant="ghost"
            onPress={() => onResolve('remove')}
            className={styles.action}
          />
        </div>
      )}
    </div>
  );
}

function headline(t: TravelInfo): string {
  switch (t.status) {
    case 'overlap':
      return '予定が重なっています';
    case 'reception':
      return '受付に間に合いません';
    case 'short':
      // 開始時刻が前の予定の終了より前なら「不足分」ではなく「重なり」として伝える。
      // ここを一律に「N分足りません」と出すと、gapが負のときに意味の通らない文になる。
      return t.gapMinutes < 0
        ? `前の予定と${Math.abs(t.gapMinutes)}分重なります`
        : `${Math.abs(t.slackMinutes)}分足りません`;
    default:
      return '';
  }
}

function detail(t: TravelInfo, from: string): string {
  const walk = `徒歩${t.walkMinutes}分（${from}から）`;
  switch (t.status) {
    case 'overlap':
      return `${walk}。時間が重なっているため、移動時間を考えると両方には参加できません。`;
    case 'reception':
      return `${walk}。到着は間に合いますが、受付締切に${t.receptionShortMinutes}分遅れます。受付を過ぎると入場できません。`;
    case 'short':
      if (t.gapMinutes < 0) {
        return `${walk}。前の予定がまだ終わっていない時間に始まります。${t.leaveBy}に抜ければ間に合います。`;
      }
      return `${walk}。前の予定の終了から${t.gapMinutes}分しかありません。`;
    default:
      return walk;
  }
}
