PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
INSERT INTO plans VALUES('qHTDGVFlJ3','京都観光1泊2日（更新版）','{"days":[{"name":"1日目","spots":[{"name":"清水寺","memo":"朝9時集合"},{"name":"金閣寺","memo":"13時"}]}]}',2,'2026-09-20 18:21:11','2026-09-20 18:21:28');
INSERT INTO plans VALUES('tRD6J15aaY','箱根温泉の旅','{"tripName":"箱根温泉の旅","days":[{"name":"Day 1","spots":[{"name":"箱根湯本","memo":"ロマンスカーで到着"}]}]}',1,'2026-09-20 18:32:36','2026-09-20 18:32:36');
INSERT INTO plans VALUES('c4Ov4tnnlR','旅行1','{"days":[{"name":"Day 1","spots":[{"name":"渋谷","memo":""},{"name":"二子玉川","memo":""}],"accommodation":"表参道","autoAccommodation":false,"autoStart":false,"autoStartSlot":false,"autoStartValue":"","accommodationMemo":""},{"name":"Day 2","spots":[{"name":"表参道","memo":""},{"name":"明治神宮","memo":""}],"accommodation":"表参道","autoAccommodation":true,"autoStart":true,"autoStartSlot":true,"autoStartValue":"表参道","accommodationMemo":""},{"name":"Day 3","spots":[{"name":"表参道","memo":""},{"name":"池袋","memo":""}],"accommodation":"表参道","autoAccommodation":true,"autoStart":true,"autoStartSlot":true,"autoStartValue":"表参道","accommodationMemo":""},{"name":"Day 4","spots":[{"name":"表参道","memo":""}],"accommodation":"表参道","accommodationMemo":"","autoAccommodation":true,"autoStart":true,"autoStartSlot":true,"autoStartValue":"表参道"}],"activeDayIndex":0,"mapType":"google","openRouteMenuIndex":null,"accommodationUpdateScope":"all","departure":"鷺沼","departureMemo":"10:00\n駅前のコンビニ前に集合","arrival":"鷺沼","arrivalMemo":"","autoArrival":true,"tripName":"旅行1","addLocationType":"spot","addAccommodationScope":"all","shareId":"c4Ov4tnnlR"}',10,'2026-09-20 18:50:48','2026-09-20 19:12:23');
INSERT INTO plans VALUES('dUd4Gzd7T8','3','{"days":[{"name":"Day 1","spots":[],"accommodation":"","accommodationMemo":"","autoAccommodation":false,"autoStart":false,"autoStartSlot":false,"autoStartValue":""}],"activeDayIndex":0,"mapType":"google","openRouteMenuIndex":null,"accommodationUpdateScope":"all","departure":"","departureMemo":"","arrival":"","arrivalMemo":"","autoArrival":true,"tripName":"3","addLocationType":"spot","addAccommodationScope":"all"}',1,'2026-09-20 19:11:59','2026-09-20 19:11:59');
INSERT INTO plans VALUES('M329ikIge7','あ','{"days":[{"name":"Day 1","spots":[],"accommodation":"","accommodationMemo":"","autoAccommodation":false,"autoStart":false,"autoStartSlot":false,"autoStartValue":""},{"name":"Day 2","spots":[],"accommodation":"","accommodationMemo":"","autoAccommodation":true,"autoStart":true,"autoStartSlot":false,"autoStartValue":""},{"name":"Day 3","spots":[],"accommodation":"","accommodationMemo":"","autoAccommodation":true,"autoStart":true,"autoStartSlot":false,"autoStartValue":""}],"activeDayIndex":2,"mapType":"google","openRouteMenuIndex":null,"accommodationUpdateScope":"all","departure":"","departureMemo":"","arrival":"","arrivalMemo":"","autoArrival":true,"tripName":"あ","addLocationType":"spot","addAccommodationScope":"all"}',1,'2026-09-23 00:04:25','2026-09-23 00:04:25');
CREATE INDEX idx_plans_updated_at ON plans(updated_at);
COMMIT;
