/* Hack Club Auth. https://auth.hackclub.com/docs/oidc-guide

   `address` is an HQ-only scope. Everything it returns stays on the server:
   fetchIdentity() is only ever called from submit.js, and its result goes
   straight to Airtable. It is never put in a response body. */

import { publicUrl, isDev } from "./config.js";

const BASE = "https://auth.hackclub.com";

export const redirectUri = () => publicUrl("/api/auth/callback");

/* Matches what hackclub/stardance requests, which is a working HQ-official set.
   `basic_info` is what carries birthday and phone; `address` and `slack_id` are
   each their own scope. All of these are HQ-only, so a community app will be
   refused at the authorize step. */
export const SCOPES = [
  "openid",
  "profile",
  "email",
  "name",
  "address",
  "slack_id",
  "basic_info",
  "verification_status",
].join(" ");

export function authorizeUrl({ state, redirectUri }) {
  const params = new URLSearchParams({
    client_id: required("HCA_CLIENT_ID"),
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
      client_id: required("HCA_CLIENT_ID"),
      client_secret: required("HCA_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  return res.json();
}

/* The full identity, including the mailing address. Server-side only. */
export async function fetchIdentity(accessToken) {
  const res = await fetch(`${BASE}/api/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`identity fetch failed: ${res.status}`);
  const body = await res.json();

  // /api/v1/me answers { identity: {...}, scopes: [...] }, so the claims are one
  // level down. Falling back to the body itself keeps this working if that ever
  // flattens.
  const identity = body?.identity ?? body;

  // Key names only, never values: enough to confirm which scopes came back
  // without putting an address or a birthday in a log file.
  if (isDev()) {
    console.log("[hca] granted scopes:", (body?.scopes || []).join(" "));
    console.log("[hca] identity keys:", Object.keys(identity).join(", "));
  }

  return identity;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/* YSWS eligibility. HCA exposes this as its own claim rather than something to
   infer from verification_status: "verified" is true for over-18s too, and they
   are not eligible. Trust the flag, not the status. */
export function isEligible(identity) {
  return eligibilityBypassed() || identity?.ysws_eligible === true;
}

/* Dev escape hatch, so whoever is building this can get past their own
   ineligibility.

   Double-gated: the flag alone does nothing. PUBLIC_ORIGIN must also be plain
   http, which no real deployment is — so leaking the env var into production
   can't switch the check off there. */
export function eligibilityBypassed() {
  return (
    process.env.SKIP_ELIGIBILITY_CHECK === "true" &&
    (process.env.PUBLIC_ORIGIN || "").startsWith("http://")
  );
}
