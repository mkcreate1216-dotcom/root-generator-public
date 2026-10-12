import type { APIRoute } from 'astro';
import { getClientIp } from '../../../utils/rateLimit';
import {
  extractToken,
  validateAndRateLimitMcpToken,
  getMcpQuota,
  MCP_CONSTANTS,
} from '../../../utils/mcpAuth';
import type { Trip, Day, Spot, MapType } from '../../../scripts/types';

export const prerender = false;

// 扱いやすい10文字の英数字IDをセキュアに生成
function generatePlanId(length = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

// 空のDayオブジェクトを生成
function createDefaultDay(name: string): Day {
  return {
    name,
    spots: [],
    accommodation: '',
    accommodationMemo: '',
    autoAccommodation: false, // 全日程に勝手に宿泊地がコピーされるのを防ぐため false
    autoStart: true,
    autoStartSlot: true,
    autoStartValue: '',
  };
}

// Google / Apple Maps のルート案内URLを生成
function buildRouteUrl(
  departure: string,
  spots: Spot[],
  arrival: string,
  mapType: MapType = 'google'
): string {
  const points: string[] = [];
  if (departure.trim()) points.push(departure.trim());
  spots.forEach((s) => {
    if (s.name.trim()) points.push(s.name.trim());
  });
  if (arrival.trim()) points.push(arrival.trim());

  if (points.length === 0) return '';
  if (points.length === 1) {
    const q = encodeURIComponent(points[0]);
    return mapType === 'apple'
      ? `https://maps.apple.com/?q=${q}`
      : `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  const origin = encodeURIComponent(points[0]);
  const destination = encodeURIComponent(points[points.length - 1]);
  const waypoints = points.slice(1, -1);

  if (mapType === 'apple') {
    return `https://maps.apple.com/?saddr=${origin}&daddr=${destination}`;
  }

  // Google Maps
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  if (waypoints.length > 0) {
    url += `&waypoints=${waypoints.map(encodeURIComponent).join('|')}`;
  }
  return url;
}

// MCPサーバーの基本設定と指示書（Instructions / Skills）
const MCP_SERVER_INFO = {
  name: 'tabirome-mcp',
  version: '1.0.0',
};

const MCP_INSTRUCTIONS = `あなたは旅程作成アプリ「たびろーむ (TabiRome)」の専属AIトラベルコンシェルジュです。
ユーザーと自然言語で対話しながら、旅行の目的・好みに寄り添った素敵な旅程を作成・提案してください。

【最重要行動規範: 連続API更新の禁止】
1スポット相談するごとにツールを連打してAPIを呼び出すことは絶対に避けてください。
行きたい地域や興味、巡りたいスポットをユーザーと十分にヒアリングし、1日分または旅行全体の骨組みがまとまった段階でバッチ的に \`create_trip\` または \`add_spots\` を呼び出してください。

【宿泊地設定の仕様と重要挙動ルール】
たびろーむでは、ある日に「宿泊地」を設定すると、翌日の「出発地点」に自動連動する便利な仕様があります。
一方で、UI仕様上「それ以降で登録（以降すべて）」の扱いになると、その日以降の全日程に同じ宿泊地が重複登録されてしまう問題があります。
AIはこの挙動を正確に理解し、以下のルールを厳守して旅程を設定してください：
1. **最終日には宿泊地を設定しない**:
   - 最終日（帰着日・終了日）は夜に帰るため宿泊地は不要です。最終日の宿泊地は必ず空（未設定）にしてください。
2. **宿泊地は実際に宿泊する日程のみに指定する**:
   - 連泊でない限り、全日程に同じ宿泊地が勝手に埋まらないよう、宿泊する日（例: 1泊2日なら1日目の夜）だけに宿泊地を設定してください。
3. **旅程構成のベストプラクティス例**:
   例: 箱根 1泊2日 温泉ドライブ旅
   ・1日目:
     - 出発地点: 小田原駅
     - スポット1: 鈴廣かまぼこの里
     - スポット2: 箱根彫刻の森美術館
     - 宿泊地: 箱根強羅温泉（※1日目の夜に泊まる宿）
   ・2日目:
     - 出発地点: （1日目の宿泊地から自動連動）
     - スポット1: 大涌谷
     - スポット2: 芦ノ湖 海賊船
     - 最終到着地点: 小田原駅
     - 宿泊地: なし（最終日のため宿泊地は空のままにする）

【クォータと制限仕様】
- 1日のリクエスト上限: ${MCP_CONSTANTS.DAILY_REQUEST_LIMIT}回（AI暴走防止）
- 保存可能なプラン数: 制限なし（無制限に作成・更新可能）
- 1旅程の最大日数: 最大${MCP_CONSTANTS.MAX_DAYS_PER_PLAN}日
- 1日あたりの最大スポット数: 最大${MCP_CONSTANTS.MAX_SPOTS_PER_DAY}件
- 必要に応じて \`check_quota\` ツールを実行し、現在の利用枠を確認できます。

【ユーザーへのHow to案内】
旅程を作成または更新した後は、必ず発行されたたびろーむのWeb閲覧URL（例: https://domain/p/{id}）をユーザーに共有してください。
ユーザーはそのURLをスマホやPCのブラウザで開くことで、以下のアクションがワンクリックで行えます：
1. ドラッグ＆ドロップによる直感的な並び替え（FLIPアニメーション）
2. Google Maps / Apple Mapsでのルート案内一括起動
3. LINE共有用テキストのワンクリック生成`;

// MCPツール定義リスト
const MCP_TOOLS = [
  {
    name: 'create_trip',
    description:
      '新しい旅行プランを作成します。旅行全体の骨組みや複数日・初期スポットを一度にまとめて登録できます。',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '旅行のタイトル（例: "京都 2泊3日の旅", "金沢 週末グルメ旅"）',
        },
        day_count: {
          type: 'number',
          description: '旅行の日数（1〜7日）。省略時は1。',
          default: 1,
        },
        departure: {
          type: 'string',
          description: '出発地点（例: "東京駅", "京都駅"）',
        },
        arrival: {
          type: 'string',
          description: '最終到着地点（例: "東京駅"）',
        },
        initial_spots: {
          type: 'array',
          description: '初回に登録するスポットのリスト',
          items: {
            type: 'object',
            properties: {
              day_index: {
                type: 'number',
                description: '日程番号（0始まり。0が1日目、1が2日目）',
              },
              name: {
                type: 'string',
                description: 'スポット名または施設名',
              },
              memo: {
                type: 'string',
                description: '見どころやメモ（任意）',
              },
              is_accommodation: {
                type: 'boolean',
                description: 'このスポットを宿泊地として設定するかどうか（trueの場合、翌日の出発地点に自動反映されます）',
              },
            },
            required: ['day_index', 'name'],
          },
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_trip',
    description: '指定したプランIDの旅行プラン詳細（各日程、スポット、宿泊地、出発・到着地点）を取得します。',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: {
          type: 'string',
          description: 'プランID（例: "abc123xyz0"）',
        },
      },
      required: ['plan_id'],
    },
  },
  {
    name: 'add_spots',
    description:
      '既存の旅程に1つまたは複数のスポット・宿泊地を一括追加します。API連打を防ぐため、可能な限り複数スポットをまとめて追加してください。',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: {
          type: 'string',
          description: 'プランID',
        },
        spots: {
          type: 'array',
          description: '追加するスポットのリスト',
          items: {
            type: 'object',
            properties: {
              day_index: {
                type: 'number',
                description: '日程番号（0始まり。0が1日目）',
              },
              name: {
                type: 'string',
                description: 'スポット名',
              },
              memo: {
                type: 'string',
                description: 'スポットのメモ（任意）',
              },
              is_accommodation: {
                type: 'boolean',
                description: '宿泊地として設定するかどうか',
              },
            },
            required: ['day_index', 'name'],
          },
        },
      },
      required: ['plan_id', 'spots'],
    },
  },
  {
    name: 'update_spot',
    description: '登録済みスポットの名称やメモを修正します。',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'プランID' },
        day_index: { type: 'number', description: '日程番号（0始まり）' },
        spot_index: { type: 'number', description: 'スポット番号（0始まり）' },
        name: { type: 'string', description: '新しいスポット名' },
        memo: { type: 'string', description: '新しいメモ' },
      },
      required: ['plan_id', 'day_index', 'spot_index', 'name'],
    },
  },
  {
    name: 'delete_spot',
    description: '指定したスポットを旅程から削除します。',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'プランID' },
        day_index: { type: 'number', description: '日程番号（0始まり）' },
        spot_index: { type: 'number', description: 'スポット番号（0始まり）' },
      },
      required: ['plan_id', 'day_index', 'spot_index'],
    },
  },
  {
    name: 'generate_route_url',
    description: '指定した日程の全スポットを経由する Google Maps または Apple Maps のルート案内URLを生成します。',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'プランID' },
        day_index: { type: 'number', description: '日程番号（0始まり）' },
        map_type: {
          type: 'string',
          enum: ['google', 'apple'],
          description: '地図アプリの種類（"google" または "apple"）',
          default: 'google',
        },
      },
      required: ['plan_id', 'day_index'],
    },
  },
  {
    name: 'check_quota',
    description: '本日のAPI利用可能残数、保存済みプラン件数、クォータ仕様を確認します。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// MCPプロンプト定義
const MCP_PROMPTS = [
  {
    name: 'plan_trip',
    description: 'たびろーむ推奨の旅程作成対話フローを開始します。',
    arguments: [
      {
        name: 'destination',
        description: '行きたい地域や旅行先（例: "京都", "金沢"）',
        required: true,
      },
      {
        name: 'duration',
        description: '日程（例: "1泊2日", "日帰り"）',
        required: false,
      },
    ],
  },
];

/**
 * JSON-RPC レスポンス作成ヘルパー
 */
function makeJsonRpcResponse(id: string | number | null, result?: any, error?: any): Response {
  const body: any = { jsonrpc: '2.0', id };
  if (error) {
    body.error = error;
  } else {
    body.result = result;
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * GET: サーバー仕様・ステータス確認 / 簡易案内
 */
export const GET: APIRoute = async ({ request, locals, url }) => {
  const token = extractToken(request);
  const clientIp = getClientIp(request);
  const db = locals.runtime?.env?.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database binding not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!token) {
    return new Response(
      JSON.stringify({
        status: 'online',
        service: 'tabirome-mcp',
        version: MCP_SERVER_INFO.version,
        message: 'たびろーむ Remote MCP サーバーです。アクセスには有効なトークンが必要です。',
        docs: `${url.origin}/`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const authResult = await validateAndRateLimitMcpToken(db, token, clientIp);
  if (!authResult.success) {
    return new Response(
      JSON.stringify({
        error: authResult.error,
        message: authResult.message,
      }),
      {
        status: authResult.status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const quota = await getMcpQuota(db, authResult.tokenHash);
  return new Response(
    JSON.stringify({
      status: 'authenticated',
      service: 'tabirome-mcp',
      version: MCP_SERVER_INFO.version,
      quota,
      tools: MCP_TOOLS.map((t) => t.name),
      instructions: MCP_INSTRUCTIONS,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};

/**
 * POST: MCP (JSON-RPC 2.0) リクエストの処理
 */
export const POST: APIRoute = async ({ request, locals, url }) => {
  const clientIp = getClientIp(request);
  const db = locals.runtime?.env?.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database binding not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. 認証 & レートリミット検証（未認証・過剰リクエストは即401/429遮断）
  const token = extractToken(request);
  const authResult = await validateAndRateLimitMcpToken(db, token, clientIp);
  if (!authResult.success) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: authResult.status === 429 ? -32000 : -32001,
          message: authResult.message,
          data: { error: authResult.error, retryAfter: authResult.retryAfterSeconds },
        },
      }),
      {
        status: authResult.status,
        headers: {
          'Content-Type': 'application/json',
          ...(authResult.retryAfterSeconds
            ? { 'Retry-After': String(authResult.retryAfterSeconds) }
            : {}),
        },
      }
    );
  }

  const { tokenHash } = authResult;

  // 2. JSON-RPC パース
  let body: any;
  try {
    body = await request.json();
  } catch {
    return makeJsonRpcResponse(null, undefined, {
      code: -32700,
      message: 'Parse error: Invalid JSON',
    });
  }

  const { id = null, method, params = {} } = body;
  const baseUrl = url.origin;

  try {
    // 3. MCP メソッド分岐
    switch (method) {
      case 'initialize': {
        return makeJsonRpcResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            prompts: {},
          },
          serverInfo: MCP_SERVER_INFO,
          instructions: MCP_INSTRUCTIONS,
        });
      }

      case 'notifications/initialized': {
        return new Response(null, { status: 204 });
      }

      case 'ping': {
        return makeJsonRpcResponse(id, {});
      }

      case 'prompts/list': {
        return makeJsonRpcResponse(id, {
          prompts: MCP_PROMPTS,
        });
      }

      case 'prompts/get': {
        const promptName = params.name;
        if (promptName === 'plan_trip') {
          const dest = params.arguments?.destination || '旅行先';
          const duration = params.arguments?.duration || '1泊2日';
          return makeJsonRpcResponse(id, {
            description: `${dest}への${duration}の旅程計画`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `${dest}への${duration}の旅行を計画したいです。おすすめの観光スポットやグルメを提案し、合意できたらたびろーむに旅程を作成してください。\n※宿泊地設定ルール: 宿泊する日（1日目の夜等）のみに宿泊地を設定し、最終日には宿泊地を設定しないでください。`,
                },
              },
            ],
          });
        }
        return makeJsonRpcResponse(id, undefined, {
          code: -32602,
          message: `Unknown prompt: ${promptName}`,
        });
      }

      case 'tools/list': {
        return makeJsonRpcResponse(id, {
          tools: MCP_TOOLS,
        });
      }

      case 'tools/call': {
        const toolName = params.name;
        const toolArgs = params.arguments || {};

        // ツール毎の処理
        if (toolName === 'check_quota') {
          const quota = await getMcpQuota(db, tokenHash);
          return makeJsonRpcResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    message: 'たびろーむ MCP 利用状況',
                    remainingRequestsToday: quota.remainingToday,
                    dailyLimit: quota.dailyLimit,
                    savedPlans: `${quota.currentPlans}件 (保存件数制限なし)`,
                    maxDaysPerPlan: quota.maxDaysPerPlan,
                    maxSpotsPerDay: quota.maxSpotsPerDay,
                  },
                  null,
                  2
                ),
              },
            ],
          });
        }

        if (toolName === 'create_trip') {
          const quota = await getMcpQuota(db, tokenHash);
          if (Number.isFinite(quota.remainingPlans) && quota.remainingPlans <= 0) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `エラー: 保存可能なプラン数上限（最大${quota.maxPlans}件）に達しています。既存のプランを更新するか整理してください。`,
                },
              ],
            });
          }

          const rawTitle = typeof toolArgs.title === 'string' ? toolArgs.title.trim() : '無題の旅程';
          const title = rawTitle.slice(0, 100);
          const rawDayCount = Number(toolArgs.day_count) || 1;
          const dayCount = Math.max(1, Math.min(MCP_CONSTANTS.MAX_DAYS_PER_PLAN, rawDayCount));
          const departure = typeof toolArgs.departure === 'string' ? toolArgs.departure.trim() : '';
          const arrival = typeof toolArgs.arrival === 'string' ? toolArgs.arrival.trim() : '';

          const planId = generatePlanId();
          const days: Day[] = [];
          for (let i = 0; i < dayCount; i++) {
            days.push(createDefaultDay(`Day ${i + 1}`));
          }

          // 初回スポットの追加
          if (Array.isArray(toolArgs.initial_spots)) {
            for (const sp of toolArgs.initial_spots) {
              const dIdx = Number(sp.day_index) || 0;
              const name = typeof sp.name === 'string' ? sp.name.trim() : '';
              const memo = typeof sp.memo === 'string' ? sp.memo.trim() : '';
              if (!name || dIdx < 0 || dIdx >= days.length) continue;

              const targetDay = days[dIdx];
              if (targetDay.spots.length >= MCP_CONSTANTS.MAX_SPOTS_PER_DAY) continue;

              if (sp.is_accommodation) {
                targetDay.accommodation = name;
                targetDay.accommodationMemo = memo;
                // 翌日が存在すれば自動反映
                if (dIdx + 1 < days.length) {
                  days[dIdx + 1].autoStartValue = name;
                }
              } else {
                targetDay.spots.push({ name, memo });
              }
            }
          }

          const tripData: Trip = {
            id: planId,
            shareId: planId,
            tripName: title,
            days,
            activeDayIndex: 0,
            departure,
            arrival,
            autoArrival: false,
            mapType: 'google',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await db
            .prepare(
              `INSERT INTO plans (id, title, data, version, token_hash, created_at, updated_at) 
               VALUES (?, ?, ?, 1, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`
            )
            .bind(planId, title, JSON.stringify(tripData), tokenHash)
            .run();

          const webUrl = `${baseUrl}/p/${planId}`;
          return makeJsonRpcResponse(id, {
            content: [
              {
                type: 'text',
                text: `✅ 旅行プラン「${title}」を作成しました！\n\n【旅程詳細】\n- プランID: ${planId}\n- 日数: ${dayCount}日間\n- 出発地点: ${departure || '未設定'}\n- 到着地点: ${arrival || '未設定'}\n\n📱 Web旅程URL (ブラウザで開いて確認・地図起動・LINE共有):\n${webUrl}`,
              },
            ],
          });
        }

        if (toolName === 'get_trip') {
          const planId = typeof toolArgs.plan_id === 'string' ? toolArgs.plan_id.trim() : '';
          if (!planId) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [{ type: 'text', text: 'エラー: plan_id が指定されていません。' }],
            });
          }

          const record = await db
            .prepare(`SELECT id, title, data, updated_at FROM plans WHERE id = ?`)
            .bind(planId)
            .first<{ id: string; title: string; data: string; updated_at: string }>();

          if (!record) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [{ type: 'text', text: `エラー: プラン ID「${planId}」が見つかりません。` }],
            });
          }

          const trip: Trip = JSON.parse(record.data);
          let summary = `📍 プラン: ${trip.tripName} (ID: ${trip.id})\n`;
          summary += `出発: ${trip.departure || '未設定'} / 到着: ${trip.arrival || '未設定'}\n\n`;

          trip.days.forEach((day, idx) => {
            summary += `【${day.name || `Day ${idx + 1}`}】\n`;
            if (day.spots.length === 0) {
              summary += `  (スポット未登録)\n`;
            } else {
              day.spots.forEach((s, sIdx) => {
                summary += `  ${sIdx + 1}. ${s.name}${s.memo ? ` (${s.memo})` : ''}\n`;
              });
            }
            if (day.accommodation) {
              summary += `  🏨 宿泊地: ${day.accommodation}${day.accommodationMemo ? ` (${day.accommodationMemo})` : ''}\n`;
            }
          });

          summary += `\n📱 Web閲覧URL: ${baseUrl}/p/${trip.id}`;

          return makeJsonRpcResponse(id, {
            content: [{ type: 'text', text: summary }],
          });
        }

        if (toolName === 'add_spots') {
          const planId = typeof toolArgs.plan_id === 'string' ? toolArgs.plan_id.trim() : '';
          const spotsToAdd = Array.isArray(toolArgs.spots) ? toolArgs.spots : [];

          if (!planId || spotsToAdd.length === 0) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [{ type: 'text', text: 'エラー: plan_id と spots配列は必須です。' }],
            });
          }

          const record = await db
            .prepare(`SELECT id, title, data, version FROM plans WHERE id = ?`)
            .bind(planId)
            .first<{ id: string; title: string; data: string; version: number }>();

          if (!record) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [{ type: 'text', text: `エラー: プラン ID「${planId}」が見つかりません。` }],
            });
          }

          const trip: Trip = JSON.parse(record.data);
          let addedCount = 0;

          for (const sp of spotsToAdd) {
            const dIdx = Number(sp.day_index) || 0;
            const name = typeof sp.name === 'string' ? sp.name.trim() : '';
            const memo = typeof sp.memo === 'string' ? sp.memo.trim() : '';
            if (!name || dIdx < 0 || dIdx >= trip.days.length) continue;

            const targetDay = trip.days[dIdx];
            if (targetDay.spots.length >= MCP_CONSTANTS.MAX_SPOTS_PER_DAY) continue;

            if (sp.is_accommodation) {
              targetDay.accommodation = name;
              targetDay.accommodationMemo = memo;
              if (dIdx + 1 < trip.days.length) {
                trip.days[dIdx + 1].autoStartValue = name;
              }
            } else {
              targetDay.spots.push({ name, memo });
            }
            addedCount++;
          }

          trip.updatedAt = new Date().toISOString();

          await db
            .prepare(
              `UPDATE plans 
               SET data = ?, version = version + 1, updated_at = datetime('now', 'localtime') 
               WHERE id = ?`
            )
            .bind(JSON.stringify(trip), planId)
            .run();

          return makeJsonRpcResponse(id, {
            content: [
              {
                type: 'text',
                text: `✅ ${addedCount}件のスポットを更新しました！\n\n📱 Web旅程URL: ${baseUrl}/p/${planId}`,
              },
            ],
          });
        }

        if (toolName === 'update_spot') {
          const { plan_id, day_index, spot_index, name, memo } = toolArgs;
          const record = await db
            .prepare(`SELECT id, data FROM plans WHERE id = ?`)
            .bind(plan_id)
            .first<{ id: string; data: string }>();

          if (!record) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [{ type: 'text', text: 'エラー: プランが見つかりません。' }],
            });
          }

          const trip: Trip = JSON.parse(record.data);
          const day = trip.days[day_index];
          if (!day || !day.spots[spot_index]) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [{ type: 'text', text: 'エラー: 指定されたスポットが見つかりません。' }],
            });
          }

          day.spots[spot_index].name = String(name).trim();
          if (typeof memo === 'string') {
            day.spots[spot_index].memo = memo.trim();
          }

          await db
            .prepare(
              `UPDATE plans 
               SET data = ?, version = version + 1, updated_at = datetime('now', 'localtime') 
               WHERE id = ?`
            )
            .bind(JSON.stringify(trip), plan_id)
            .run();

          return makeJsonRpcResponse(id, {
            content: [
              {
                type: 'text',
                text: `✅ スポットを「${day.spots[spot_index].name}」に更新しました。\n📱 ${baseUrl}/p/${plan_id}`,
              },
            ],
          });
        }

        if (toolName === 'delete_spot') {
          const { plan_id, day_index, spot_index } = toolArgs;
          const record = await db
            .prepare(`SELECT id, data FROM plans WHERE id = ?`)
            .bind(plan_id)
            .first<{ id: string; data: string }>();

          if (!record) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [{ type: 'text', text: 'エラー: プランが見つかりません。' }],
            });
          }

          const trip: Trip = JSON.parse(record.data);
          const day = trip.days[day_index];
          if (!day || !day.spots[spot_index]) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [{ type: 'text', text: 'エラー: 指定されたスポットが見つかりません。' }],
            });
          }

          const deletedName = day.spots[spot_index].name;
          day.spots.splice(spot_index, 1);

          await db
            .prepare(
              `UPDATE plans 
               SET data = ?, version = version + 1, updated_at = datetime('now', 'localtime') 
               WHERE id = ?`
            )
            .bind(JSON.stringify(trip), plan_id)
            .run();

          return makeJsonRpcResponse(id, {
            content: [
              {
                type: 'text',
                text: `🗑️ スポット「${deletedName}」を削除しました。\n📱 ${baseUrl}/p/${plan_id}`,
              },
            ],
          });
        }

        if (toolName === 'generate_route_url') {
          const { plan_id, day_index, map_type = 'google' } = toolArgs;
          const record = await db
            .prepare(`SELECT id, data FROM plans WHERE id = ?`)
            .bind(plan_id)
            .first<{ id: string; data: string }>();

          if (!record) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [{ type: 'text', text: 'エラー: プランが見つかりません。' }],
            });
          }

          const trip: Trip = JSON.parse(record.data);
          const day = trip.days[day_index];
          if (!day) {
            return makeJsonRpcResponse(id, {
              isError: true,
              content: [{ type: 'text', text: 'エラー: 指定された日程が見つかりません。' }],
            });
          }

          const departure = day.autoStartValue || trip.departure || '';
          const arrival = day.accommodation || trip.arrival || '';
          const routeUrl = buildRouteUrl(departure, day.spots, arrival, map_type);

          return makeJsonRpcResponse(id, {
            content: [
              {
                type: 'text',
                text: `🗺️ ${day.name || `Day ${day_index + 1}`}のルート案内URL (${map_type === 'apple' ? 'Apple Maps' : 'Google Maps'}):\n${routeUrl || '経由地点が不足しているため生成できませんでした。'}`,
              },
            ],
          });
        }

        return makeJsonRpcResponse(id, undefined, {
          code: -32601,
          message: `Method not found: Unknown tool ${toolName}`,
        });
      }

      default:
        return makeJsonRpcResponse(id, undefined, {
          code: -32601,
          message: `Method not found: ${method}`,
        });
    }
  } catch (error) {
    console.error('MCP internal error:', error);
    return makeJsonRpcResponse(id, undefined, {
      code: -32603,
      message: 'Internal error',
      data: String(error),
    });
  }
};

