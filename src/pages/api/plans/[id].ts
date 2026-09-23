import type { APIRoute } from 'astro';
import { getClientIp, checkRateLimit, createRateLimitResponse } from '../../../utils/rateLimit';
import { parseSafeJson } from '../../../utils/requestHelper';

export const prerender = false;

// 更新APIのレート制限設定: 1つのIPあたり60秒間に最大30回まで（通常の共同編集/オートセーブを妨げずに乱発を防止）
const UPDATE_RATE_LIMIT_CONFIG = {
  limit: 30,
  windowMs: 60 * 1000,
};

interface PlanRecord {
  id: string;
  title: string;
  data: string;
  version: number;
  created_at: string;
  updated_at: string;
}

// GET: プラン読み込み・リロード
export const GET: APIRoute = async ({ params, locals }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Plan ID is required' }), {
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

    const plan = await db
      .prepare(`SELECT id, title, data, version, created_at, updated_at FROM plans WHERE id = ?`)
      .bind(id)
      .first<PlanRecord>();

    if (!plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let parsedData: unknown = null;
    try {
      parsedData = JSON.parse(plan.data);
    } catch {
      parsedData = plan.data;
    }

    return new Response(
      JSON.stringify({
        id: plan.id,
        title: plan.title,
        data: parsedData,
        version: plan.version,
        createdAt: plan.created_at,
        updatedAt: plan.updated_at,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Failed to get plan:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// PUT: プラン保存（楽観的ロック）
export const PUT: APIRoute = async ({ params, request, locals }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Plan ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. IPベースのレートリミット検証（D1アクセス前に遮断）
  const clientIp = getClientIp(request);
  const rateLimitResult = checkRateLimit(`update_plan:${clientIp}`, UPDATE_RATE_LIMIT_CONFIG);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  // 2. ペイロードサイズ制限と安全なJSONパース（D1アクセス前に遮断）
  const parseResult = await parseSafeJson<{ title?: unknown; data?: unknown; version?: unknown }>(request);
  if (!parseResult.success || !parseResult.data) {
    return parseResult.response!;
  }

  const { title, data, version } = parseResult.data;

  // 3. データバリデーション
  if (!data || typeof data !== 'object') {
    return new Response(JSON.stringify({ error: 'data is required and must be an object' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof version !== 'number') {
    return new Response(
      JSON.stringify({ error: 'version (number) is required for optimistic locking' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const db = locals.runtime.env.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database binding not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const planTitle = typeof title === 'string' ? title.trim().slice(0, 100) : '無題の旅程';

    // 楽観的ロック: id と version が一致する場合のみ更新し、version をインクリメント
    const result = await db
      .prepare(
        `UPDATE plans 
         SET title = ?, data = ?, version = version + 1, updated_at = datetime('now', 'localtime')
         WHERE id = ? AND version = ?`
      )
      .bind(planTitle, JSON.stringify(data), id, version)
      .run();

    // 更新件数が 0 の場合は競合（他者が先に更新したか、IDが存在しない）
    if (result.meta.changes === 0) {
      const current = await db
        .prepare(`SELECT id, version, updated_at FROM plans WHERE id = ?`)
        .bind(id)
        .first<{ id: string; version: number; updated_at: string }>();

      if (!current) {
        return new Response(JSON.stringify({ error: 'Plan not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          error: 'Conflict',
          message: '他のユーザーによって内容が更新されています。最新データを再読み込みしてください。',
          latestVersion: current.version,
          latestUpdatedAt: current.updated_at,
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        newVersion: version + 1,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Failed to update plan:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

