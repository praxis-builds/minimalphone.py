import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("migrations");
  return {
    plugins: [
      cloudflareTest({
        main: "./api/test-worker.js",
        miniflare: {
          compatibilityDate: "2026-10-01",
          d1Databases: ["DB"],
          bindings: { APP_PASSCODE: "correct horse battery staple", TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: { include: ["tests/api/**/*.test.js"], setupFiles: ["./tests/api/setup.js"] },
  };
});
