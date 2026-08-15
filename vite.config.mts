import { defineConfig } from "vite";

// No @vitejs/plugin-react: esbuild's automatic JSX transform is enough here.
// Trade-off is a full reload instead of Fast Refresh on edit.
export default defineConfig({
    root: "web",
    esbuild: { jsx: "automatic" },
    server: {
        proxy: { "/api": "http://localhost:3000" },
    },
});
