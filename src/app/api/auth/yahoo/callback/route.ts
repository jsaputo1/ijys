import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { encryptText } from "@/lib/security/encryption";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  exchangeYahooCodeForTokens,
  YAHOO_OAUTH_STATE_COOKIE,
} from "@/lib/yahoo/oauth";

function redirectHomeAndClearState(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  const response = NextResponse.redirect(url);
  response.cookies.delete(YAHOO_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const storedState = cookieStore.get(YAHOO_OAUTH_STATE_COOKIE)?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const oauthErrorDescription = request.nextUrl.searchParams.get(
    "error_description",
  );

  if (oauthError) {
    // On error, clear state cookie but keep JSON response (helps debug locally).
    const response = NextResponse.json(
      {
        ok: false,
        error: "Yahoo returned an OAuth error.",
        oauthError,
        oauthErrorDescription,
      },
      { status: 400 },
    );
    response.cookies.delete(YAHOO_OAUTH_STATE_COOKIE);
    return response;
  }

  if (!storedState || !state || storedState !== state) {
    const response = NextResponse.json(
      {
        ok: false,
        error: "Invalid OAuth state. Please retry login.",
      },
      { status: 400 },
    );
    response.cookies.delete(YAHOO_OAUTH_STATE_COOKIE);
    return response;
  }

  if (!code) {
    const response = NextResponse.json(
      {
        ok: false,
        error: "Missing authorization code from Yahoo callback.",
      },
      { status: 400 },
    );
    response.cookies.delete(YAHOO_OAUTH_STATE_COOKIE);
    return response;
  }

  try {
    const tokenPayload = await exchangeYahooCodeForTokens(code);
    if (!tokenPayload.refresh_token) {
      throw new Error("Yahoo token response did not include a refresh token.");
    }

    const supabase = getSupabaseServerClient();
    const accessTokenExpiresAt = tokenPayload.expires_in
      ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString()
      : null;

    const { error: upsertError } = await supabase.from("yahoo_auth_tokens").upsert(
      {
        provider: "yahoo",
        refresh_token_encrypted: encryptText(tokenPayload.refresh_token),
        access_token_encrypted: tokenPayload.access_token
          ? encryptText(tokenPayload.access_token)
          : null,
        access_token_expires_at: accessTokenExpiresAt,
        token_type: tokenPayload.token_type ?? null,
        scope:
          typeof tokenPayload.x_oauth_scope === "string"
            ? tokenPayload.x_oauth_scope
            : null,
      },
      { onConflict: "provider" },
    );

    if (upsertError) {
      throw new Error(`Failed to persist Yahoo tokens: ${upsertError.message}`);
    }

    // On success, send user back to the dashboard.
    return redirectHomeAndClearState(request);
  } catch (error) {
    const response = NextResponse.json(
      {
        ok: false,
        error: "Failed to exchange Yahoo authorization code for tokens.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
    response.cookies.delete(YAHOO_OAUTH_STATE_COOKIE);
    return response;
  }
}
