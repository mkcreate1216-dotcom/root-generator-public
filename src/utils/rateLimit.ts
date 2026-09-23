export interface RateLimitConfig {
  limit: number; // 制限時間内に許可する最大リクエスト数
  windowMs: number; // 判定ウィンドウ期間（ミリ秒）
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

// IPごとのリクエストタイムスタンプ履歴を保持するインメモリストア
const ipHistoryMap = new Map<string, number[]>();
const MAX_MAP_ENTRIES = 5000; // メモリ枯渇を防ぐための上限エントリー数

/**
 * リクエストからクライアントのIPアドレスを特定・取得する
 */
export function getClientIp(request: Request): string {
  // Cloudflare環境の最適IP
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp && cfConnectingIp.trim().length > 0) {
    return cfConnectingIp.trim();
  }

  // 標準的なフォールバック
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp.length > 0) {
      return firstIp;
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return 'unknown';
}

/**
 * インメモリのスライディングウィンドウ方式によるレート制限チェック
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  now: number = Date.now()
): RateLimitResult {
  const windowStart = now - config.windowMs;
  const history = ipHistoryMap.get(key) || [];

  // ウィンドウ外の古いタイムスタンプを破棄
  const recentHistory = history.filter((timestamp) => timestamp > windowStart);

  if (recentHistory.length >= config.limit) {
    const oldestTimestamp = recentHistory[0];
    const resetMs = Math.max(0, oldestTimestamp + config.windowMs - now);

    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      resetMs,
    };
  }

  // 新しいタイムスタンプを追加
  recentHistory.push(now);
  ipHistoryMap.set(key, recentHistory);

  // マップの肥大化防止（5,000件超過時は先頭エントリーを削除）
  if (ipHistoryMap.size > MAX_MAP_ENTRIES) {
    const firstKey = ipHistoryMap.keys().next().value;
    if (firstKey) {
      ipHistoryMap.delete(firstKey);
    }
  }

  return {
    allowed: true,
    limit: config.limit,
    remaining: config.limit - recentHistory.length,
    resetMs: config.windowMs,
  };
}

/**
 * レートリミット制限超過時の 429 Too Many Requests レスポンスを生成
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil(result.resetMs / 1000));

  return new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: 'リクエスト頻度が高すぎます。しばらく時間を置いてから再試行してください。',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfterSeconds.toString(),
      },
    }
  );
}

/**
 * テスト用: ストアの初期化
 */
export function _resetRateLimitStoreForTesting(): void {
  ipHistoryMap.clear();
}

