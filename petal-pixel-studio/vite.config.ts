import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("three") || id.includes("@react-three") || id.includes("postprocessing")) return "vendor-three";
          if (id.includes("/ethers/")) return "vendor-ethers";
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory-vendor")) return "vendor-charts";
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/") || id.includes("react-router")) return "vendor-react";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
