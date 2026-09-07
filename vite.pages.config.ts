import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

function githubPagesBase(): string {
  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repository || repository.endsWith('.github.io')) return '/';
  return `/${repository}/`;
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? githubPagesBase() : '/',
  build: { outDir: 'dist-pages' },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
});
