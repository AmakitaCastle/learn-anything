import { defineConfig } from '@playwright/test';
import config from './playwright.config.ts';

// The material editor starts its own loopback server; no demo site is needed.
export default defineConfig({
  ...config,
  testMatch: '**/lesson-review.spec.ts',
  webServer: undefined,
  outputDir: 'test-results/review',
});
