import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Capture build-time metadata for the About panel. Runs once per build
// invocation. Failures (e.g. missing git in the container) fall back to
// sensible defaults so CI / zipped source-drops still compile.
function readGit(cmd: string, fallback = ""): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

const pkgVersion: string = (() => {
  try {
    const raw = readFileSync("package.json", "utf-8");
    return JSON.parse(raw).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const buildInfo = {
  version: pkgVersion,
  gitHash: readGit("git rev-parse --short HEAD", "unknown"),
  gitBranch: readGit("git rev-parse --abbrev-ref HEAD", "unknown"),
  gitDirty: readGit("git status --porcelain", "") !== "",
  builtAt: new Date().toISOString(),
} as const;

// Use a project-scoped base path for production builds so the GitHub Pages
// deployment at <user>.github.io/Drumit/ serves assets with the correct
// prefix. Dev keeps / for localhost simplicity.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Drumit/" : "/",
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
}));
