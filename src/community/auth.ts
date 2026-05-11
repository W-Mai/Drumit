const AUTH_KEY = "drumit:auth";

export interface AuthState {
  version: 1;
  provider: "github";
  accessToken: string;
  username: string;
  avatarUrl?: string;
  scopes: string[];
  createdAt: number;
}

declare const __DRUMIT_GITHUB_CLIENT_ID__: string;
declare const __DRUMIT_OAUTH_PROXY_URL__: string;

const GITHUB_CLIENT_ID: string = __DRUMIT_GITHUB_CLIENT_ID__;
const OAUTH_PROXY_URL: string = __DRUMIT_OAUTH_PROXY_URL__;

export function getGithubClientId(): string {
  return GITHUB_CLIENT_ID;
}

export function getOAuthProxyUrl(): string {
  return OAUTH_PROXY_URL;
}

export function loadAuth(): AuthState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthState;
    if (parsed.version !== 1 || !parsed.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAuth(state: AuthState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(state));
  } catch {
    // quota / disabled
  }
}

export function clearAuth(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    // ignore
  }
}

export function buildAuthorizeUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "public_repo",
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  scope: string;
}> {
  const res = await fetch(`${OAUTH_PROXY_URL}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error");
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json();
}

export async function fetchGitHubUser(token: string): Promise<{
  login: string;
  avatar_url: string;
}> {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `token ${token}` },
  });
  if (!res.ok) throw new Error(`GitHub user fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Extracts the OAuth `code` from the current URL (e.g. ?code=xxx) and
 * removes it from the address bar without reloading. Returns null if
 * no code is present.
 */
export function extractOAuthCode(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return null;
  params.delete("code");
  params.delete("state");
  const clean =
    window.location.pathname +
    (params.toString() ? `?${params}` : "") +
    window.location.hash;
  window.history.replaceState(null, "", clean);
  return code;
}
