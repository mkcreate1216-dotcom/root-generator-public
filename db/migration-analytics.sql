-- Migration for analytics and page views tracking
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'desktop',
  referer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  view_date TEXT NOT NULL DEFAULT (date('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_page_views_view_date ON page_views(view_date);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path);

