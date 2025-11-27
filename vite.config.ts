import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoName = 'mortgage-calculator';

export default defineConfig({
  base: `/${repoName}/`,
  plugins: [react()],
});