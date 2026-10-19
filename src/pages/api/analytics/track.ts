import type { APIRoute } from 'astro';
import { redactAnalyticsPath, redactAnalyticsReferer } from '../../../utils/analyticsPath';

export const prerender = false;

function detectDeviceType(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
  const ua = userAgent.toLowerCase();
  if (/(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk)/i.test(ua)) {
    return 'tablet';
  }
  if (/(mobi|ipod|iphone|android|blackberry|opera mini|iemobile|mobile)/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const rawBody = await request.text();
    let body: { path?: string; referer?: string } = {};
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        // パース失敗時は無視
      }
    }

    const path = redactAnalyticsPath(typeof body.path === 'string' ? body.path : '/');
    // 管理画面パスや内部APIはトラッキング対象外
    if (path.startsWith('/admin') || path.startsWith('/api')) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userAgent = request.headers.get('user-agent') || '';
    const deviceType = detectDeviceType(userAgent);
    const referer = redactAnalyticsReferer(
      body.referer || request.headers.get('referer') || '',
      new URL(request.url).origin
    );

    const db = locals.runtime?.env?.DB;
    if (db) {
      await db
        .prepare(
          `INSERT INTO page_views (path, device_type, referer, created_at, view_date)
           VALUES (?, ?, ?, datetime('now', 'localtime'), date('now', 'localtime'))`
        )
        .bind(path, deviceType, referer)
        .run();
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    // トラッキングのエラーはユーザー体験に影響を与えないよう200で握りつぶす
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

