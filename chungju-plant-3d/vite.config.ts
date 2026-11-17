import { defineConfig } from 'vite';
// 하위 경로(GitHub/Cloudflare Pages)에서도 열리도록 상대 경로로 빌드
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 1500 } });
