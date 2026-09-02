import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  // Keeps the browser same-origin in dev (mirrors the vercel.json rewrite in
  // prod), so no cross-origin request is made and the backend needs no CORS.
  server: {
    proxy: {
      "/api/v1": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
})
