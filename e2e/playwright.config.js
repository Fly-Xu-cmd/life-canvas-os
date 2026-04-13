/**
 * Playwright E2E 测试配置
 * 适用：Electron + React + FastAPI 全栈应用
 */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // 测试目录
  testDir: './e2e/tests',

  // 失败时重试次数
  retries: process.env.CI ? 2 : 0,

  // 并行workers
  workers: process.env.CI ? 2 : undefined,

  // 报告器
  reporter: [
    ['html', { outputFolder: 'e2e/reports' }],
    ['list'],
  ],

  // 全局超时
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },

  // 共享设置
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    navigationTimeout: 15_000,
  },

  // 项目配置
  projects: [
    // ===== Electron 主应用测试 =====
    {
      name: 'electron',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5173',
        contextOptions: {
          viewport: { width: 1280, height: 800 },
        },
      },
      webServer: [
        {
          command: 'cd backend && python -m uvicorn main:app --port 3000',
          port: 3000,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
        {
          command: 'pnpm dev',
          port: 5173,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ],
      testMatch: /.*\.electron\.spec\.ts/,
    },

    // ===== 后端 API 测试 =====
    {
      name: 'api',
      use: {
        baseURL: 'http://localhost:3000',
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
        },
      },
      webServer: {
        command: 'cd backend && python -m uvicorn main:app --port 3000',
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
      testMatch: /.*\.api\.spec\.ts/,
    },

    // ===== 移动端模拟测试 =====
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        baseURL: 'http://localhost:5173',
      },
      webServer: [
        {
          command: 'cd backend && python -m uvicorn main:app --port 3000',
          port: 3000,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          command: 'pnpm dev',
          port: 5173,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      ],
      testMatch: /.*\.mobile\.spec\.ts/,
    },
  ],
});
