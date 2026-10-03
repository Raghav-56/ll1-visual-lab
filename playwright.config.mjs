import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const systemChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export default defineConfig({
  testDir: './browser-tests',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: process.env.LL1_TEST_URL ?? 'http://localhost:4176',
    launchOptions: {
      executablePath: process.env.LL1_BROWSER_PATH ?? (process.platform === 'win32' && existsSync(systemChrome) ? systemChrome : undefined),
    },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: process.env.LL1_TEST_URL ? undefined : { command: 'node server.mjs', url: 'http://localhost:4176', reuseExistingServer: true, timeout: 15000 },
});
