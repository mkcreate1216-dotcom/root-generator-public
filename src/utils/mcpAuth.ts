import { checkRateLimit, type RateLimitResult } from './rateLimit';

export interface ApiTokenRecord {
  token_hash: string;
  token_prefix: string;
  client_ip: string | null;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  request_count_today: number;
  request_count_total: number;
  last_request_date: string;
}

export interface McpQuotaInfo {
  dailyLimit: number;
  remainingToday: number;
  maxPlans: number;
  currentPlans: number;
  remainingPlans: number;
  maxDaysPerPlan: number;
  maxSpotsPerDay: number;
}

export const MCP_CONSTANTS = {
  DAILY_REQUEST_LIMIT: 200,
  BURST_RATE_LIMIT: {
    limit: 5,
    windowMs: 10 * 1000, // 10秒間に最大5回（AIエージェントの暴走ループ防止）
  },
  MAX_PLANS_PER_TOKEN: Infinity, // 保存件数制限なし
  MAX_DAYS_PER_PLAN: 7,
  MAX_SPOTS_PER_DAY: 10,
  TOKEN_PREFIX: 'tbr_',
};

/**
 * SHA-256 ハッシュを計算して16進数文字列で返却
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * セキュアなMCP連携用APIトークンを生成
 * 例: tbr_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 */
export function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const randomStr = Array.from(array, (byte) => chars[byte % chars.length]).join('');
  return `${MCP_CONSTANTS.TOKEN_PREFIX}${randomStr}`;
}

/**
 * リクエストヘッダーまたはURLクエリパラメータからトークンを抽出
 */
export function extractToken(request: Request): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && /^bearer$/i.test(parts[0])) {
      return parts[1];
    }
  }

  // 2. クエリパラメータ ?token=<token> （スマホAIアプリ用）
  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    if (queryToken && queryToken.trim().length > 0) {
      return queryToken.trim();
    }
  } catch {
    // URLパースエラー時は無視
  }

  return null;
}

/**
 * 新規APIトークンをD1に発行・保存
 */
export async function createApiToken(
  db: D1Database,
  clientIp: string
): Promise<{ token: string; tokenHash: string; expiresAt: string }> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const tokenPrefix = token.slice(0, 10);
  
  // 30日間の有効期限を設定
  const expiresAtDate = new Date();
  expiresAtDate.setDate(expiresAtDate.getDate() + 30);
  const expiresAt = expiresAtDate.toISOString();

  await db
    .prepare(
      `INSERT INTO api_tokens (token_hash, token_prefix, client_ip, created_at, expires_at, request_count_today, request_count_total, last_request_date)
       VALUES (?, ?, ?, datetime('now', 'localtime'), ?, 0, 0, date('now', 'localtime'))`
    )
    .bind(tokenHash, tokenPrefix, clientIp, expiresAt)
    .run();

  return { token, tokenHash, expiresAt };
}

export type McpAuthResult =
  | { success: true; tokenHash: string; tokenRecord: ApiTokenRecord }
  | { success: false; status: number; error: string; message: string; retryAfterSeconds?: number };

/**
 * トークンの認証およびレートリミット・日次クォータの検証とカウンター更新
 */
export async function validateAndRateLimitMcpToken(
  db: D1Database,
  token: string | null,
  clientIp: string
): Promise<McpAuthResult> {
  if (!token || !token.startsWith(MCP_CONSTANTS.TOKEN_PREFIX)) {
    return {
      success: false,
      status: 401,
      error: 'Unauthorized',
      message: '有効なMCP連携トークンが必要です。ランディングページから連携URLを取得してください。',
    };
  }

  const tokenHash = await hashToken(token);

  // 1. 短期バーストレートリミット検証（AIエージェントの思考ループ暴走を最上流で遮断）
  const burstResult = checkRateLimit(`mcp_burst:${tokenHash}`, MCP_CONSTANTS.BURST_RATE_LIMIT);
  if (!burstResult.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil(burstResult.resetMs / 1000));
    return {
      success: false,
      status: 429,
      error: 'Too Many Requests',
      message: `リクエスト頻度が高すぎます（AIエージェントの暴走防止）。${retryAfterSeconds}秒待機してから再試行してください。`,
      retryAfterSeconds,
    };
  }

  // 2. D1 からトークン情報の取得
  const tokenRecord = (await db
    .prepare(
      `SELECT token_hash, token_prefix, client_ip, created_at, expires_at, last_used_at, 
              request_count_today, request_count_total, last_request_date 
       FROM api_tokens WHERE token_hash = ?`
    )
    .bind(tokenHash)
    .first()) as ApiTokenRecord | null;

  if (!tokenRecord) {
    return {
      success: false,
      status: 401,
      error: 'Unauthorized',
      message: '指定されたMCP連携トークンが見つかりません。再発行してください。',
    };
  }

  // 3. 有効期限チェック
  if (tokenRecord.expires_at) {
    const now = new Date();
    const expiresAt = new Date(tokenRecord.expires_at);
    if (now > expiresAt) {
      return {
        success: false,
        status: 401,
        error: 'Token Expired',
        message: 'MCP連携トークンの有効期限が切れています。ランディングページから再発行してください。',
      };
    }
  }

  // 4. 日付の切り替わり判定と日次クォータチェック
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const isNewDay = tokenRecord.last_request_date !== todayStr;
  const currentTodayCount = isNewDay ? 0 : tokenRecord.request_count_today;

  if (currentTodayCount >= MCP_CONSTANTS.DAILY_REQUEST_LIMIT) {
    return {
      success: false,
      status: 429,
      error: 'Daily Quota Exceeded',
      message: `本日の利用上限（${MCP_CONSTANTS.DAILY_REQUEST_LIMIT}回）に達しました。明日（日本時間0時以降）再度ご利用ください。`,
      retryAfterSeconds: 3600,
    };
  }

  // 5. カウンターのインクリメント更新
  const newTodayCount = currentTodayCount + 1;
  const newTotalCount = tokenRecord.request_count_total + 1;

  await db
    .prepare(
      `UPDATE api_tokens 
       SET request_count_today = ?, 
           request_count_total = ?, 
           last_request_date = ?, 
           last_used_at = datetime('now', 'localtime')
       WHERE token_hash = ?`
    )
    .bind(newTodayCount, newTotalCount, todayStr, tokenHash)
    .run();

  tokenRecord.request_count_today = newTodayCount;
  tokenRecord.request_count_total = newTotalCount;
  tokenRecord.last_request_date = todayStr;

  return {
    success: true,
    tokenHash,
    tokenRecord,
  };
}

/**
 * クォータ情報の取得
 */
export async function getMcpQuota(db: D1Database, tokenHash: string): Promise<McpQuotaInfo> {
  const tokenRecord = (await db
    .prepare(`SELECT request_count_today, last_request_date FROM api_tokens WHERE token_hash = ?`)
    .bind(tokenHash)
    .first()) as { request_count_today: number; last_request_date: string } | null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const isNewDay = !tokenRecord || tokenRecord.last_request_date !== todayStr;
  const requestCountToday = isNewDay ? 0 : (tokenRecord?.request_count_today ?? 0);
  const remainingToday = Math.max(0, MCP_CONSTANTS.DAILY_REQUEST_LIMIT - requestCountToday);

  // トークンに紐づくプラン作成数を集計
  const planCountResult = (await db
    .prepare(`SELECT COUNT(*) as count FROM plans WHERE token_hash = ?`)
    .bind(tokenHash)
    .first()) as { count: number } | null;

  const currentPlans = planCountResult?.count ?? 0;
  const remainingPlans = Math.max(0, MCP_CONSTANTS.MAX_PLANS_PER_TOKEN - currentPlans);

  return {
    dailyLimit: MCP_CONSTANTS.DAILY_REQUEST_LIMIT,
    remainingToday,
    maxPlans: MCP_CONSTANTS.MAX_PLANS_PER_TOKEN,
    currentPlans,
    remainingPlans,
    maxDaysPerPlan: MCP_CONSTANTS.MAX_DAYS_PER_PLAN,
    maxSpotsPerDay: MCP_CONSTANTS.MAX_SPOTS_PER_DAY,
  };
}
