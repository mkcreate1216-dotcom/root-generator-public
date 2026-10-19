// クラウド（D1）上の旅程データの保存期間（最終更新から90日）
export const PLAN_RETENTION_DAYS = 90;

// 同一ワーカーインスタンス内でのクリーンアップ実行間隔（10分）
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanupTime = 0;

/**
 * 最終更新日時（updated_at）が保存期間（90日）を超過しているか判定する
 */
export function isPlanExpired(updatedAt?: string | null): boolean {
  if (!updatedAt) return false;
  try {
    // SQLite の datetime('now', 'localtime') 形式 ("YYYY-MM-DD HH:MM:SS") または ISO 形式に対応
    const normalized = updatedAt.includes('T') ? updatedAt : `${updatedAt.replace(' ', 'T')}+09:00`;
    const updatedTime = new Date(normalized).getTime();
    if (isNaN(updatedTime)) return false;
    const expireThreshold = Date.now() - PLAN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return updatedTime < expireThreshold;
  } catch {
    return false;
  }
}

/**
 * 最終更新から90日を経過した期限切れプランをD1から自動削除する
 */
export async function cleanupExpiredPlans(db: any, force = false): Promise<number> {
  if (!db) return 0;
  const now = Date.now();
  if (!force && now - lastCleanupTime < CLEANUP_INTERVAL_MS) {
    return 0;
  }
  lastCleanupTime = now;

  try {
    const result = await db
      .prepare(
        `DELETE FROM plans WHERE updated_at < datetime('now', 'localtime', '-${PLAN_RETENTION_DAYS} days')`
      )
      .run();
    return result?.meta?.changes || 0;
  } catch (err) {
    console.warn('Failed to cleanup expired plans:', err);
    return 0;
  }
}

