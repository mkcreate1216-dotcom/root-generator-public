import type { APIRoute } from 'astro';
import { getClientIp, checkRateLimit, createRateLimitResponse } from '../../../utils/rateLimit';
import { createApiToken, extractToken, hashToken, getMcpQuota, MCP_CONSTANTS } from '../../../utils/mcpAuth';

export const prerender = false;

// トークン新規発行APIのレート制限設定: 1つのIPあたり10分間に最大5回まで（乱造スパム防止）
const TOKEN_CREATE_RATE_LIMIT = {
  limit: 5,
  windowMs: 10 * 60 * 1000,
};

/**
 * POST: MCP連携用トークンを即時発行
 */
export const POST: APIRoute = async ({ request, locals, url }) => {
  // 1. IPベースのレートリミット検証
  const clientIp = getClientIp(request);
  const rateLimitResult = checkRateLimit(`mcp_token_create:${clientIp}`, TOKEN_CREATE_RATE_LIMIT);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const db = locals.runtime?.env?.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database binding not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { token, tokenHash, expiresAt } = await createApiToken(db, clientIp);

    // リクエストのホストから連携用URLを構築
    const origin = url.origin;
    const mcpUrl = `${origin}/api/mcp?token=${token}`;

    const quota = await getMcpQuota(db, tokenHash);

    return new Response(
      JSON.stringify({
        success: true,
        token,
        mcpUrl,
        expiresAt,
        quota,
        message: 'MCP連携用URLを発行しました。スマホのAIアプリやClaude Desktopに登録してください。',
      }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Failed to create MCP token:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * GET: トークンの有効性とクォータ状況を確認
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const token = extractToken(request);
  if (!token || !token.startsWith(MCP_CONSTANTS.TOKEN_PREFIX)) {
    return new Response(JSON.stringify({ error: 'Valid token required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = locals.runtime?.env?.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database binding not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tokenHash = await hashToken(token);
    const quota = await getMcpQuota(db, tokenHash);

    return new Response(
      JSON.stringify({
        valid: true,
        quota,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Failed to get token quota:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

