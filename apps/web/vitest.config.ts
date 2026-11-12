import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Server modules import class names from *.css.ts files.
  plugins: [vanillaExtractPlugin()],
  resolve: { tsconfigPaths: true },
});
