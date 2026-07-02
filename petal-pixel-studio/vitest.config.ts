import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The 3D-geometry tests iterate ~100k-200k triangles in their assertion
    // helpers; under full-suite CPU contention they can exceed the 5s default.
    // Raise the ceiling so `npx vitest run` is not flaky on loaded machines.
    testTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
