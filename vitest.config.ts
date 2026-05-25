import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

// Vitest config kept minimal. We mirror Next.js's `@/*` alias so test
// files can import the same paths components use, jsdom for the DOM
// matchers, and a setup file that wires @testing-library/jest-dom into
// expect().
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    // Excluding next build artefacts, node_modules, and the Playwright
    // e2e directory. e2e/*.spec.ts uses @playwright/test, which can't
    // import under vitest — without this exclude vitest tries to load
    // those files and fails.
    exclude: ["node_modules", ".next", "dist", "e2e/**", "playwright-report/**", "test-results/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["components/**", "hooks/**", "services/**", "lib/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
