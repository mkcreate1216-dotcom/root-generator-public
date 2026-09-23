import type { APIRoute } from 'astro';
import { getClientIp, checkRateLimit, createRateLimitResponse } from '../../../utils/rateLimit';
import { parseSafeJson } from '../../../utils/requestHelper';

export const prerender = false;

// 新規作成APIのレート制限設定: 1つのIPあたり10秒間に最大5回まで
const RATE_LIMIT_CONFIG = {
  limit: 5,
  windowMs: 10 * 1000,
};

// 扱いやすい10文字の英数字IDをセキュアに生成
function generatePlanId(length = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

export const POST: APIRoute = async ({ request, locals }) => {
  // 1. IPベースのレートリミット検証（D1アクセス前に遮断）
  const clientIp = getClientIp(request);
  const rateLimitResult = checkRateLimit(`create_plan:${clientIp}`, RATE_LIMIT_CONFIG);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  // 2. ペイロードサイズ制限と安全なJSONパース（D1アクセス前に遮断）
  const parseResult = await parseSafeJson<{ title?: unknown; data?: unknown }>(request);
  if (!parseResult.success || !parseResult.data) {
    return parseResult.response!;
  }

  const { title, data } = parseResult.data;

  // 3. データバリデーション
  if (!data || typeof data !== 'object') {
    return new Response(JSON.stringify({ error: 'data is required and must be an object' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = locals.runtime.env.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database binding not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = generatePlanId();
    const version = 1;
    // タイトルの正規化と最大長制限（100文字）
    const planTitle = typeof title === 'string' ? title.trim().slice(0, 100) : '無題の旅程';

    await db
      .prepare(
        `INSERT INTO plans (id, title, data, version, created_at, updated_at) 
         VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`
      )
      .bind(id, planTitle, JSON.stringify(data), version)
      .run();

    return new Response(
      JSON.stringify({
        id,
        title: planTitle,
        version,
        url: `/p/${id}`,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Failed to create plan:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

