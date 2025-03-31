import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 5001,
    host: true, // 外部からのアクセスを許可する場合 (任意)
    proxy: { // プロキシ設定を追加
      // '/sse' パスへのリクエストをバックエンドに転送
      '/sse': {
        target: 'http://localhost:8081', // バックエンドサーバーのアドレス
        changeOrigin: true, // オリジンを変更
        secure: false,      // HTTPSでない場合
        // rewrite: (path) => path.replace(/^\/sse/, '/sse') // パス書き換えが必要な場合 (今回は不要)
      },
      // '/test' パスへのリクエストも同様に転送 (POSTリクエスト用)
      '/test': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        one: resolve(__dirname, 'src/main-left.tsx'),
        two: resolve(__dirname, 'src/main-right.tsx'),
      },
    },
  },
});
