/* Hackatime. Modelled on hackclub/stardance's HackatimeService.

   Two hops: the OAuth access token buys an API key, and the API key is what the
   stats endpoint actually accepts. */

const BASE = "https://hackatime.hackclub.com";
const API = `${BASE}/api/v1`;

// Nothing logged before the event started counts toward it.
export const START_DATE = process.env.HACKATIME_START_DATE || "2026-09-01";

export const SCOPES = "profile read";

// Hackatime's own bookkeeping rows, not real projects (stardance excludes the
// same two).
const EXCLUDED = new Set(["Other", "<<LAST_PROJECT>>"]);

export function authorizeUrl({ state, redirectUri }) {
  const params = new URLSearchParams({
    client_id: required("HACKATIME_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `${BASE}/oauth/authorize?${params}`;
}

export async function exchangeCode({ code, redirectUri }) {
  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: required("HACKATIME_CLIENT_ID"),
      client_secret: required("HACKATIME_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`hackatime token exchange failed: ${res.status}`);
  return res.json();
}

/* The submitter's Hackatime user id. The unified YSWS pipeline uses this plus
   the project name to recompute hours itself. */
export async function fetchUserId(accessToken) {
  const data = await get("authenticated/me", accessToken);
  return data?.id != null ? String(data.id) : "";
}

/* The stats endpoint wants the user's API key, not the OAuth token. This
   endpoint returns the existing key or makes one. */
async function fetchApiKey(accessToken) {
  const data = await get("authenticated/api_keys", accessToken);
  if (!data.token) throw new Error("no hackatime api key");
  return data.token;
}

/* Every project the user has logged time against, newest-heaviest first, so
   they can pick rather than type a name that has to match exactly. */
export async function fetchProjects(accessToken) {
  const apiKey = await fetchApiKey(accessToken);
  const params = new URLSearchParams({ features: "projects", start_date: START_DATE });
  const data = await get(`users/my/stats?${params}`, apiKey);

  const projects = data?.data?.projects;
  if (!Array.isArray(projects)) return [];

  return projects
    .filter((p) => p?.name && !EXCLUDED.has(p.name))
    .map((p) => ({ name: p.name, hours: Math.round(((Number(p.total_seconds) || 0) / 3600) * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);
}

/* Seconds logged against one project name. Returns null when Hackatime has
   never heard of the project, which is different from zero. */
export async function fetchProjectSeconds(accessToken, projectName) {
  const apiKey = await fetchApiKey(accessToken);
  const params = new URLSearchParams({
    features: "projects",
    start_date: START_DATE,
    total_seconds: "true",
    filter_by_project: projectName,
  });

  const data = await get(`users/my/stats?${params}`, apiKey);

  if (typeof data.total_seconds === "number") return data.total_seconds;

  // Older shape: sum the per-project rows the filter left behind.
  const projects = data?.data?.projects;
  if (!Array.isArray(projects) || projects.length === 0) return null;
  return projects.reduce((sum, p) => sum + (Number(p.total_seconds) || 0), 0);
}

async function get(path, bearer) {
  const res = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${bearer}`, "Cache-Control": "no-cache, no-store" },
  });
  if (!res.ok) throw new Error(`hackatime ${path}: ${res.status}`);
  return res.json();
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
