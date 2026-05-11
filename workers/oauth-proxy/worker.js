/**
 * Cloudflare Worker — GitHub OAuth token exchange proxy.
 *
 * Receives { code } from the drumit SPA, calls GitHub's token endpoint
 * server-side (adding the client_secret that can't live in the browser),
 * and returns the access_token to the SPA.
 *
 * Deploy:
 *   wrangler deploy
 *
 * Environment variables (set via `wrangler secret put`):
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 *   ALLOWED_ORIGIN  (e.g. "https://benign.host")
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "https://benign.host";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/exchange") {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    if (!origin.startsWith(allowed)) {
      return new Response("Forbidden origin", { status: 403, headers: corsHeaders });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }

    const { code } = body;
    if (!code || typeof code !== "string") {
      return new Response("Missing code", { status: 400, headers: corsHeaders });
    }

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new Response(JSON.stringify(tokenData), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        access_token: tokenData.access_token,
        scope: tokenData.scope,
        token_type: tokenData.token_type,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  },
};
