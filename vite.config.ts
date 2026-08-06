import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  ssr: {
    // Required by @clerk/react-router on React Router v8 — otherwise Vite's
    // SSR module externalization can produce a mismatched Router context.
    noExternal: ["@clerk/react-router"],
  },
})
