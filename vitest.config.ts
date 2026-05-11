import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __DRUMIT_GITHUB_CLIENT_ID__: JSON.stringify(""),
    __DRUMIT_OAUTH_PROXY_URL__: JSON.stringify(""),
  },
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
  },
});
