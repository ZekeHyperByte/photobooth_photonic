import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fakeTimers: {
      toFake: [
        "setTimeout",
        "setInterval",
        "clearInterval",
        "clearTimeout",
        "Date",
      ],
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "src/camera/mutex.ts",
        "src/camera/watchdog.ts",
        "src/camera/providers/mock.ts",
        "src/camera/errors.ts",
        "src/camera/logger.ts",
        "src/services/session-persistence.ts",
      ],
      exclude: ["src/camera/__tests__/**"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
    setupFiles: ["./src/camera/__tests__/setup.ts"],
  },
});
