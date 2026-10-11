import { defineConfig, devices } from '@playwright/test';

// End-to-end tests of the main flows (e2e/*.spec.ts), run against the dev
// server on 127.0.0.1:3000 (started if it isn't running): npm run test:e2e.
// They sign in as the test account @123 with a session cookie signed from
// SESSION_SECRET in .env.local (e2e/global-setup.ts) — no passwords — and
// put back anything they change. They use the same database as the app.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    storageState: 'e2e/.auth/user.json',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
