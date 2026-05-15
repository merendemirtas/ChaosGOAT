import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [rootDir],
    },
  },
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
});
