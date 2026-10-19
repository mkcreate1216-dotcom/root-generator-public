/**
 * アクセス解析に残るパスから、共有プランID（閲覧の鍵）を除く。
 * `/p/{id}` は集計上の「共有ページ」として `/p` にまとめる。
 */
export function redactAnalyticsPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '/';

  const withoutQuery = trimmed.split(/[?#]/)[0] || '/';
  const path = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;

  if (path === '/p' || path.startsWith('/p/')) return '/p';
  return path.slice(0, 200);
}

/**
 * 参照元URLに自サイトの共有プランIDが含まれる場合だけ、パスを `/p` に置き換える。
 * 外部サイトの参照元はそのまま残す。
 */
export function redactAnalyticsReferer(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    if (url.pathname === '/p' || url.pathname.startsWith('/p/')) {
      url.pathname = '/p';
      url.search = '';
      url.hash = '';
      return url.toString().slice(0, 300);
    }
    return trimmed.slice(0, 300);
  } catch {
    return redactAnalyticsPath(trimmed).slice(0, 300);
  }
}
