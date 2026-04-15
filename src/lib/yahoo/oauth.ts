import { randomBytes } from "crypto";

import { getYahooEnv } from "@/lib/env";

export const YAHOO_OAUTH_STATE_COOKIE = "yahoo_oauth_state";

export function createYahooOAuthState() {
  return randomBytes(32).toString("hex");
}

export function buildYahooAuthorizeUrl(state: string) {
  const { authEndpoint, clientId, redirectUri, oauthScope } = getYahooEnv();

  const url = new URL(authEndpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("language", "en-us");
  url.searchParams.set("scope", oauthScope);
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeYahooCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri, tokenEndpoint } = getYahooEnv();

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Yahoo token exchange failed (${response.status}): ${errorBody}`,
    );
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in: number;
    [key: string]: unknown;
  };
}
