import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 기본 빌드: GitHub Pages(하위 경로)에서도 동작하도록 상대 경로
// --mode single: 더블클릭으로 여는 단일 HTML 파일 (dist-single/index.html)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  // file:// 에서는 모듈 워커가 막히므로 일반(iife) 워커로 번들
  worker: { format: 'iife' },
  build: {
    chunkSizeWarningLimit: 3000,
    ...(mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000 } : {}),
  },
  test: { environment: 'node' },
}) as any);
