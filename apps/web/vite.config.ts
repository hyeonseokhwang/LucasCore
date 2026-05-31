import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiOrigin = process.env.VITE_LCC_API_ORIGIN || process.env.LCC_API_ORIGIN || "http://127.0.0.1:9001";
const wsOrigin =
  process.env.VITE_LCC_WS_ORIGIN ||
  process.env.LCC_WS_ORIGIN ||
  apiOrigin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: apiOrigin,
        changeOrigin: true
      },
      "/ws": {
        target: wsOrigin,
        ws: true
      }
    }
  }
});
