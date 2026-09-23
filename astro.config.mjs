import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';

// 開発環境（astro dev）でのみ広告管理画面（_ads.astro）を /admin/ads としてルーティング
const devOnlyAdminRoutes = () => ({
  name: 'dev-only-admin-routes',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev') {
        injectRoute({
          pattern: '/admin/ads',
          entrypoint: './src/pages/admin/_ads.astro',
        });
      }
    },
  },
});

// https://astro.build/config
export default defineConfig({
  output: 'hybrid',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [tailwind(), devOnlyAdminRoutes()],
});

