import type { APIRoute } from 'astro';

export const prerender = false;

// 扱いやすい10文字の英数字IDをセキュアに生成
function generatePlanId(length = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = locals.runtime.env.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database binding not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { title, data } = body;

    if (!data) {
      return new Response(JSON.stringify({ error: 'data is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = generatePlanId();
    const version = 1;
    const planTitle = typeof title === 'string' ? title.trim() : '無題の旅程';

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

