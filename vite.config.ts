import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Use a project-scoped base path for production builds so the GitHub Pages
// deployment at <user>.github.io/Drumit/ serves assets with the correct
// prefix. Dev keeps / for localhost simplicity.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Drumit/" : "/",
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
}));
