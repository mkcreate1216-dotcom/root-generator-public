#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();

const checks = [
  {
    name: 'LPサンプルタグのボタン化・クリッカブル化チェック (index.astro)',
    file: 'src/pages/index.astro',
    validate: (content) => {
      const errors = [];
      if (content.includes('data-sample-trip')) {
        errors.push('data-sample-trip 属性が含まれています。LPの例は非クリッカブルである必要があります。');
      }
      const sampleSectionMatch = content.match(/<div[^>]*id="lp-samples-section"[\s\S]*?<\/div>\s*<\/div>/);
      if (sampleSectionMatch) {
        const section = sampleSectionMatch[0];
        if (section.includes('<button')) {
          errors.push('lp-samples-section 内に <button> タグが含まれています。<span> などの静的タグを使用してください。');
        }
        if (section.includes('cursor-pointer')) {
          errors.push('lp-samples-section 内に cursor-pointer が含まれています。クリック可能に見えるスタイルは禁止です。');
        }
      }
      return errors;
    }
  },
  {
    name: 'LPサンプルタグのボタン化・クリッカブル化チェック (planId.astro)',
    file: 'src/pages/p/[planId].astro',
    validate: (content) => {
      const errors = [];
      if (content.includes('data-sample-trip')) {
        errors.push('data-sample-trip 属性が含まれています。LPの例は非クリッカブルである必要があります。');
      }
      const sampleSectionMatch = content.match(/<div[^>]*id="lp-samples-section"[\s\S]*?<\/div>\s*<\/div>/);
      if (sampleSectionMatch) {
        const section = sampleSectionMatch[0];
        if (section.includes('<button')) {
          errors.push('lp-samples-section 内に <button> タグが含まれています。<span> などの静的タグを使用してください。');
        }
        if (section.includes('cursor-pointer')) {
          errors.push('lp-samples-section 内に cursor-pointer が含まれています。クリック可能に見えるスタイルは禁止です。');
        }
      }
      return errors;
    }
  },
  {
    name: 'スクリプト内のサンプルタグイベントリスナー混入チェック (app.ts)',
    file: 'src/scripts/app.ts',
    validate: (content) => {
      const errors = [];
      if (content.includes('data-sample-trip') || content.includes('sampleTrip')) {
        errors.push('app.ts 内に data-sample-trip / sampleTrip 関連の処理が含まれています。LPの例へのイベントリスナー追加は禁止です。');
      }
      return errors;
    }
  }
];

let hasErrors = false;

console.log('🔍 仕様ガードチェックを実行中...');

for (const check of checks) {
  const filePath = path.join(rootDir, check.file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ファイルが存在しません: ${check.file}`);
    hasErrors = true;
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const errors = check.validate(content);

  if (errors.length > 0) {
    console.error(`❌ [仕様違反検知] ${check.name}:`);
    for (const err of errors) {
      console.error(`   - ${err}`);
    }
    hasErrors = true;
  } else {
    console.log(`✅ [合格] ${check.name}`);
  }
}

if (hasErrors) {
  console.error('\n🚨 仕様ガードチェックに失敗しました。AGENTS.mdの「LPのサンプル表示（「例:」タグ）に関する絶対禁止事項」を確認してください。\n');
  process.exit(1);
} else {
  console.log('\n✨ すべての仕様ガードチェックに合格しました。\n');
}
