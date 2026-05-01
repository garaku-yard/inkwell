import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"

// Vitest config for component smoke tests. Kept minimal on purpose —
// the goal is "renders without crashing" plus a few targeted hook
// assertions, not a full integration suite. Tauri plugins (sql, fs,
// dialog) are unavailable in the test environment, so individual tests
// stub them via vi.mock as needed.
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./vitest.setup.mts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    css: false,
  },
})
