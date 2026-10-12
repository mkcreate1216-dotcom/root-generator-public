/**
 * リクエストボディの安全なパースとサイズ制限を行うヘルパー
 */

export const DEFAULT_MAX_PAYLOAD_BYTES = 100 * 1024; // 100KB（通常の旅程データには十分な余裕）

export interface ParseJsonResult<T> {
  success: boolean;
  data?: T;
  response?: Response;
}

/**
 * リクエストボディをサイズ制限付きで安全にパースする
 */
export async function parseSafeJson<T = Record<string, unknown>>(
  request: Request,
  maxBytes: number = DEFAULT_MAX_PAYLOAD_BYTES
): Promise<ParseJsonResult<T>> {
  // 1. Content-Length ヘッダーによる事前チェック（無駄な読み込みを防止）
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const bytes = parseInt(contentLength, 10);
    if (!isNaN(bytes) && bytes > maxBytes) {
      return {
        success: false,
        response: new Response(
          JSON.stringify({
            error: 'Payload Too Large',
            message: `リクエストデータが制限サイズ（${Math.round(maxBytes / 1024)}KB）を超えています。`,
          }),
          {
            status: 413,
            headers: { 'Content-Type': 'application/json' },
          }
        ),
      };
    }
  }

  // 2. ボディテキストの読み込み
  let rawText: string;
  try {
    rawText = await request.text();
  } catch (err) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'リクエストボディの読み込みに失敗しました。',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  // 3. 実際のバイトサイズチェック（Content-Length未指定や改ざん対策）
  const byteLength = new TextEncoder().encode(rawText).length;
  if (byteLength > maxBytes) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({
          error: 'Payload Too Large',
          message: `リクエストデータが制限サイズ（${Math.round(maxBytes / 1024)}KB）を超えています。`,
        }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  // 4. 空ボディのチェック
  if (!rawText.trim()) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'リクエストボディが空です。',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  // 5. JSONパース
  try {
    const data = JSON.parse(rawText) as T;
    return {
      success: true,
      data,
    };
  } catch {
    return {
      success: false,
      response: new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: '無効なJSONフォーマットです。',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }
}

