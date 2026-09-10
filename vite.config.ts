import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const GITHUB_PAGES_BASE = '/Analysis-of-Labor-Disputes/';

export default defineConfig(({ mode }) => {
  const isPagesBuild = mode === 'pages';

  return {
    base: isPagesBuild ? GITHUB_PAGES_BASE : '/',
    plugins: [react(), tailwindcss()],
    build: {
      outDir: isPagesBuild ? 'dist-pages' : 'dist',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
