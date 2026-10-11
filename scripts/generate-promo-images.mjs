import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PROMO_DIR = path.resolve('docs/promo');
if (!fs.existsSync(PROMO_DIR)) {
  fs.mkdirSync(PROMO_DIR, { recursive: true });
}

// スマホ（Xタイムライン）特化: 1080 x 1350 (4:5) / 特大文字仕様（72pxタイトル、32pxサブ、26px〜34px本文）
const commonCss = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1350px;
    overflow: hidden;
    background: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "BIZ UDPGothic", "Yu Gothic", sans-serif;
    color: #0f172a;
    position: relative;
    padding: 60px 56px 44px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    -webkit-font-smoothing: antialiased;
  }
  .bg-grid {
    position: absolute;
    inset: 0;
    background-image: 
      radial-gradient(#94a3b8 1.8px, transparent 1.8px),
      radial-gradient(#cbd5e1 1.8px, #f1f5f9 1.8px);
    background-size: 32px 32px;
    background-position: 0 0, 16px 16px;
    opacity: 0.55;
    z-index: 0;
  }
  .content {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  
  /* ヘッダー */
  .header-badges {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  .step-badge {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 10px 24px;
    background: #ffffff;
    border: 2px solid #e2e8f0;
    border-radius: 9999px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 0.05em;
    color: #0284c7;
  }
  .step-num {
    background: #0284c7;
    color: #ffffff;
    font-size: 20px;
    padding: 4px 14px;
    border-radius: 9999px;
    font-weight: 900;
  }
  .brand-badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 10px 24px;
    background: #0f172a;
    color: #ffffff;
    border-radius: 9999px;
    font-size: 22px;
    font-weight: 800;
  }

  /* 特大タイトル */
  .title-group {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 28px;
  }
  .main-title {
    font-size: 72px;
    font-weight: 900;
    line-height: 1.18;
    color: #0f172a;
    letter-spacing: -0.03em;
  }
  .main-title span.highlight {
    color: #0284c7;
  }
  .sub-title {
    font-size: 32px;
    font-weight: 700;
    color: #475569;
    line-height: 1.35;
  }

  /* メインコンテンツカード */
  .main-panel {
    flex: 1;
    background: #ffffff;
    border-radius: 36px;
    border: 3px solid #e2e8f0;
    box-shadow: 
      0 24px 60px -12px rgba(15, 23, 42, 0.12),
      0 8px 24px -4px rgba(15, 23, 42, 0.06);
    padding: 34px 38px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }

  /* 特大吹き出し */
  .callout-tag {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    border-radius: 18px;
    font-size: 26px;
    font-weight: 900;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
    width: fit-content;
  }
  .callout-dark { background: #0f172a; color: #ffffff; }
  .callout-blue { background: #0284c7; color: #ffffff; }
  .callout-green { background: #059669; color: #ffffff; }
  .callout-amber { background: #d97706; color: #ffffff; }

  /* 下部フッター */
  .footer-row {
    margin-top: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 18px;
    border-top: 2px solid #cbd5e1;
    font-size: 22px;
    font-weight: 800;
    color: #475569;
  }
`;

// 1枚目
const htmlCard1 = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${commonCss}
.feature-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.feature-item-large {
  background: #f8fafc;
  border: 3px solid #e2e8f0;
  border-radius: 24px;
  padding: 24px 30px;
  display: flex;
  align-items: center;
  gap: 24px;
  box-shadow: 0 4px 12px rgba(15,23,42,0.04);
}
.feature-item-large.featured {
  border-color: #0284c7;
  background: #f0f9ff;
}
.feature-icon-circle {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 38px;
  flex-shrink: 0;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(15,23,42,0.08);
}
.feature-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.feature-title-text {
  font-size: 34px;
  font-weight: 900;
  color: #0f172a;
}
.feature-desc-text {
  font-size: 24px;
  font-weight: 700;
  color: #64748b;
  line-height: 1.3;
}
.mockup-input-container {
  background: #f1f5f9;
  border: 3px solid #cbd5e1;
  border-radius: 24px;
  padding: 22px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.mockup-input-val {
  font-size: 34px;
  font-weight: 900;
  color: #0f172a;
}
.mockup-start-btn {
  background: #0f172a;
  color: #ffffff;
  padding: 16px 36px;
  border-radius: 18px;
  font-size: 28px;
  font-weight: 900;
}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="content">
  <div>
    <div class="header-badges">
      <div class="step-badge">
        <span class="step-num">01</span>
        <span>OVERVIEW / アプリ紹介</span>
      </div>
      <div class="brand-badge">たびろーむ</div>
    </div>

    <div class="title-group">
      <h1 class="main-title">旅行の計画、<br><span class="highlight">もう迷わない。</span></h1>
      <p class="sub-title">スポットを入れるだけで直感タイムライン完成！</p>
    </div>
  </div>

  <div class="main-panel">
    <div>
      <div style="font-size: 22px; font-weight: 800; color: #64748b; margin-bottom: 12px;">▼ 旅行名を入れるだけですぐ作成開始</div>
      <div class="mockup-input-container">
        <span class="mockup-input-val">京都 2泊3日 気まま旅</span>
        <span class="mockup-start-btn">はじめる ➔</span>
      </div>
    </div>

    <div class="feature-list">
      <div class="feature-item-large featured">
        <div class="feature-icon-circle">⚡️</div>
        <div class="feature-info">
          <div class="feature-title-text">登録不要・完全無料</div>
          <div class="feature-desc-text">ログインなしでブラウザを開けばすぐ使える！</div>
        </div>
      </div>

      <div class="feature-item-large">
        <div class="feature-icon-circle">📍</div>
        <div class="feature-info">
          <div class="feature-title-text">直感タイムライン ＆ 自動連動</div>
          <div class="feature-desc-text">宿泊地を入れると翌日の出発地点に自動反映！</div>
        </div>
      </div>

      <div class="feature-item-large">
        <div class="feature-icon-circle">🗺️</div>
        <div class="feature-info">
          <div class="feature-title-text">Google / Appleマップ直通</div>
          <div class="feature-desc-text">区間ルートも1日まとめルートもワンタップ起動！</div>
        </div>
      </div>
    </div>

    <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
      <span class="callout-tag callout-blue">✨ iPhone・スマホで快適動作！</span>
    </div>
  </div>

  <div class="footer-row">
    <div>🚀 Webブラウザで今すぐ利用可能</div>
    <div>URL共有で友達も閲覧可能 ↗</div>
  </div>
</div>
</body>
</html>`;

// 2枚目
const htmlCard2 = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${commonCss}
.timeline-list-large {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.timeline-card-large {
  background: #f8fafc;
  border: 3px solid #e2e8f0;
  border-radius: 24px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: 0 4px 12px rgba(15,23,42,0.04);
}
.timeline-card-large.dragged {
  border-color: #0284c7;
  background: #f0f9ff;
  box-shadow: 0 10px 24px rgba(2, 132, 199, 0.2);
}
.timeline-card-large.hotel {
  border: 3px dashed #f59e0b;
  background: #fffbeb;
}
.spot-num-large {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #0f172a;
  color: #fff;
  font-size: 26px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.spot-num-hotel {
  background: #b45309;
}
.spot-info-large {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.spot-name-large {
  font-size: 34px;
  font-weight: 900;
  color: #0f172a;
}
.spot-memo-large {
  font-size: 22px;
  font-weight: 700;
  color: #64748b;
}
.route-row-large {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 22px;
  font-weight: 800;
  color: #94a3b8;
  padding: 4px 0;
}
.route-btn-pill-large {
  background: #0f172a;
  color: #ffffff;
  padding: 8px 22px;
  border-radius: 9999px;
  font-size: 22px;
  font-weight: 900;
}
.tag-drag-large {
  background: #0284c7;
  color: #ffffff;
  padding: 8px 18px;
  border-radius: 9999px;
  font-size: 20px;
  font-weight: 900;
}
.tag-hotel-large {
  background: #fef3c7;
  color: #b45309;
  border: 2px solid #f59e0b;
  padding: 8px 18px;
  border-radius: 9999px;
  font-size: 22px;
  font-weight: 900;
}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="content">
  <div>
    <div class="header-badges">
      <div class="step-badge">
        <span class="step-num">02</span>
        <span>FEATURE 1 / 直感タイムライン</span>
      </div>
      <div class="brand-badge">たびろーむ</div>
    </div>

    <div class="title-group">
      <h1 class="main-title">スポットを入れるだけ。<br><span class="highlight">並び替えも自由自在。</span></h1>
      <p class="sub-title">ドラッグ＆ドロップ対応。宿泊地は翌日に自動連動！</p>
    </div>
  </div>

  <div class="main-panel">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <span style="font-size: 26px; font-weight: 900; color: #0f172a;">京都 2泊3日 気まま旅 (Day 1)</span>
      <span class="callout-tag callout-dark" style="font-size: 22px; padding: 8px 18px;">
        👆 指でサッと並び替え！
      </span>
    </div>

    <div class="timeline-list-large">
      <div class="timeline-card-large">
        <div class="spot-num-large">1</div>
        <div class="spot-info-large">
          <div class="spot-name-large">京都駅</div>
          <div class="spot-memo-large">新幹線中央口に集合</div>
        </div>
        <span style="font-size: 22px; font-weight: 800; color: #64748b; background: #e2e8f0; padding: 6px 14px; border-radius: 9999px;">出発地点</span>
      </div>

      <div class="route-row-large">
        <span>↓</span>
        <span class="route-btn-pill-large">🗺️ ルート検索</span>
        <span>↓</span>
      </div>

      <div class="timeline-card-large dragged">
        <div class="spot-num-large">2</div>
        <div class="spot-info-large">
          <div class="spot-name-large">伏見稲荷大社 ⛩️</div>
          <div class="spot-memo-large">千本鳥居を散策・写真撮影</div>
        </div>
        <span class="tag-drag-large">ドラッグ中</span>
      </div>

      <div class="route-row-large">
        <span>↓</span>
        <span class="route-btn-pill-large">🗺️ ルート検索</span>
        <span>↓</span>
      </div>

      <div class="timeline-card-large hotel">
        <div class="spot-num-large spot-num-hotel">🏨</div>
        <div class="spot-info-large">
          <div class="spot-name-large">四条烏丸のホテル</div>
          <div class="spot-memo-large">チェックイン 19:00</div>
        </div>
        <span class="tag-hotel-large">翌日の出発地点に自動反映！</span>
      </div>
    </div>

    <div style="background: #fffbeb; border: 2px solid #fde68a; border-radius: 20px; padding: 18px 24px; margin-top: 14px; display: flex; align-items: center; gap: 14px;">
      <span style="font-size: 32px;">💡</span>
      <span style="font-size: 24px; font-weight: 800; color: #92400e;">
        Day 1のホテルを入れるだけで、Day 2の先頭に自動セット！二重入力の手間ゼロ。
      </span>
    </div>
  </div>

  <div class="footer-row">
    <div>↩️ 削除しても安心の「元に戻す（アンドゥ）」対応</div>
    <div>複数日程もタブで一瞬切り替え ↗</div>
  </div>
</div>
</body>
</html>`;

// 3枚目
const htmlCard3 = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${commonCss}
.map-selector-large {
  background: #f8fafc;
  border: 3px solid #e2e8f0;
  border-radius: 24px;
  padding: 20px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.map-selector-label {
  font-size: 30px;
  font-weight: 900;
  color: #0f172a;
}
.map-toggle-large {
  display: flex;
  background: #cbd5e1;
  padding: 6px;
  border-radius: 9999px;
  gap: 6px;
}
.map-btn-large {
  padding: 10px 26px;
  border-radius: 9999px;
  font-size: 24px;
  font-weight: 900;
}
.map-btn-active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}
.map-btn-inactive {
  color: #475569;
}

.route-box-large {
  background: #f0fdf4;
  border: 3px solid #86efac;
  border-radius: 24px;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}
.route-title-large {
  font-size: 28px;
  font-weight: 900;
  color: #166534;
}
.route-flow-large {
  font-size: 36px;
  font-weight: 900;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 16px;
}

.bulk-btn-huge {
  background: #0f172a;
  color: #ffffff;
  border-radius: 24px;
  padding: 26px 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  font-size: 32px;
  font-weight: 900;
  box-shadow: 0 12px 30px rgba(15,23,42,0.25);
  margin-bottom: 12px;
}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="content">
  <div>
    <div class="header-badges">
      <div class="step-badge">
        <span class="step-num">03</span>
        <span>FEATURE 2 / マップ連携</span>
      </div>
      <div class="brand-badge">たびろーむ</div>
    </div>

    <div class="title-group">
      <h1 class="main-title">Googleマップも<br><span class="highlight">Appleマップも。</span></h1>
      <p class="sub-title">ワンタップ直通起動！まとめルートも一括表示</p>
    </div>
  </div>

  <div class="main-panel">
    <div class="map-selector-large">
      <div class="map-selector-label">🗺️ 連携マップ選択</div>
      <div class="map-toggle-large">
        <span class="map-btn-large map-btn-active">Google Maps</span>
        <span class="map-btn-large map-btn-inactive">Apple Maps</span>
      </div>
    </div>

    <div class="route-box-large">
      <div class="route-title-large">📍 区間ルート案内（ワンクリック）</div>
      <div class="route-flow-large">
        <span>伏見稲荷大社</span>
        <span style="color: #16a34a; font-size: 40px;">➔</span>
        <span>清水寺</span>
      </div>
      <div style="font-size: 24px; font-weight: 700; color: #15803d;">
        「ルート検索」を押すだけで、住所や経由地を入れた状態でマップが直通起動！
      </div>
    </div>

    <div>
      <div class="bulk-btn-huge">
        <span>🚀</span> Day 1 全スポットまとめルートを一括表示
      </div>
      <div style="text-align: center; font-size: 24px; font-weight: 800; color: #475569;">
        1日の全経由地を繋いだフルルートを地図アプリ上に一発展開！
      </div>
    </div>

    <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
      <span class="callout-tag callout-green">💡 住所を地図にコピペする手間ゼロ！</span>
    </div>
  </div>

  <div class="footer-row">
    <div>🚗 ナビ・乗り換え・徒歩ルートにそのまま直通</div>
    <div>旅行当日の移動も完全にノーストレス ↗</div>
  </div>
</div>
</body>
</html>`;

// 4枚目
const htmlCard4 = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${commonCss}
.main-panel {
  padding: 24px 32px;
}
.share-btn-container {
  margin-bottom: 14px;
}
.btn-share-single-huge {
  width: 100%;
  padding: 18px 22px;
  border-radius: 20px;
  font-size: 28px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-shadow: 0 8px 20px rgba(6,199,85,0.22);
  background: #06c755;
  color: #ffffff;
  border: 3px solid #05b34c;
}
.share-caption {
  text-align: center;
  font-size: 21px;
  font-weight: 800;
  color: #475569;
  margin-top: 8px;
}

.line-box-large {
  background: #6a88a6;
  border-radius: 24px;
  padding: 16px 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.line-bubble-huge {
  background: #ffffff;
  border-radius: 20px 20px 20px 4px;
  padding: 16px 20px;
  font-size: 22px;
  font-weight: 800;
  color: #1e293b;
  line-height: 1.42;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  font-family: -apple-system, monospace, sans-serif;
}
.line-bubble-title {
  font-size: 26px;
  font-weight: 900;
  color: #0f172a;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 6px;
  margin-bottom: 8px;
}
.line-route-link {
  color: #0284c7;
  font-size: 20px;
  font-weight: 700;
}
.line-web-url-box {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 2px dashed #cbd5e1;
  color: #0369a1;
  font-size: 21px;
  font-weight: 800;
}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="content">
  <div>
    <div class="header-badges">
      <div class="step-badge">
        <span class="step-num">04</span>
        <span>SHARE / LINE・Webしおり共有</span>
      </div>
      <div class="brand-badge">たびろーむ</div>
    </div>

    <div class="title-group">
      <h1 class="main-title">LINEで送れるWebしおり、<br><span class="highlight">ワンタップでまるごと共有！</span></h1>
      <p class="sub-title">ルート案内＋WebしおりURL入りのテキストを、ボタンひとつで自動生成！</p>
    </div>
  </div>

  <div class="main-panel">
    <div class="share-btn-container">
      <div class="btn-share-single-huge">
        <span style="font-size: 36px;">💬</span>
        <span>LINEで送れるWebしおりをコピー</span>
      </div>
      <div class="share-caption">
        ボタンひとつで「旅程テキスト ＋ マップリンク ＋ WebしおりURL」を全コピー！
      </div>
    </div>

    <div class="line-box-large">
      <div style="font-size: 21px; color: #ffffff; font-weight: 900; display: flex; align-items: center; gap: 8px;">
        <span>💬</span> LINE共有プレビュー（そのまま貼り付けて送信）
      </div>
      <div class="line-bubble-huge">
        <div class="line-bubble-title">【京都 2泊3日 気まま旅】</div>
        <div>■ Day 1</div>
        <div>・京都駅 (出発)</div>
        <div class="line-route-link"> ↓ (ルート: maps.apple.com/...)</div>
        <div>・伏見稲荷大社 ⛩️</div>
        <div class="line-route-link"> ↓ (ルート: maps.apple.com/...)</div>
        <div>・清水寺 🍂</div>
        <div style="color: #b45309; margin-top: 4px;">[宿泊地: 四条烏丸のホテル]</div>
        <div class="line-web-url-box">
          <div>▼ Webでしおりを開く</div>
          <div style="font-size: 20px; color: #0284c7; word-break: break-all;">https://tabirome.web.app/p/kyoto-trip-123</div>
        </div>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span class="callout-tag callout-green">
        ✨ グループLINEに貼るだけで完結！
      </span>
      <span class="callout-tag callout-dark">
        🔒 登録不要・安心保存
      </span>
    </div>
  </div>

  <div class="footer-row">
    <div>📱 アプリ不要・友達のスマホでもURLから即閲覧可能</div>
    <div>次の旅行にぜひ使ってみてください ✈️</div>
  </div>
</div>
</body>
</html>`;

// 書き出し
fs.writeFileSync(path.join(PROMO_DIR, '01_overview.html'), htmlCard1, 'utf8');
fs.writeFileSync(path.join(PROMO_DIR, '02_timeline.html'), htmlCard2, 'utf8');
fs.writeFileSync(path.join(PROMO_DIR, '03_map_route.html'), htmlCard3, 'utf8');
fs.writeFileSync(path.join(PROMO_DIR, '04_share.html'), htmlCard4, 'utf8');

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const list = [
  { html: '01_overview.html', png: '01_overview.png' },
  { html: '02_timeline.html', png: '02_timeline.png' },
  { html: '03_map_route.html', png: '03_map_route.png' },
  { html: '04_share.html', png: '04_share.png' },
];

for (const item of list) {
  const htmlPath = path.join(PROMO_DIR, item.html);
  const outPath = path.join(PROMO_DIR, item.png);
  console.log(`Rendering ${item.html} to ${outPath}...`);
  const cmd = `"${chromePath}" --headless --screenshot="${outPath}" --window-size=1080,1350 --force-device-scale-factor=2 --hide-scrollbars "file://${htmlPath}"`;
  execSync(cmd);
}

console.log('All finalized 4 promo images rendered!');
