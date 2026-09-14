import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results-cloud",
  testMatch: "cloud.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5174",
    url: "http://127.0.0.1:5174",
    env: {
      VITE_FIREBASE_API_KEY: "demo-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-gtrack.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "demo-gtrack",
      VITE_FIREBASE_APP_ID: "1:123:web:demo",
      VITE_USE_EMULATORS: "true",
    },
  },
});
