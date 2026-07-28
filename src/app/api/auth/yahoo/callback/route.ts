import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { encryptText } from "@/lib/security/encryption";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  exchangeYahooCodeForTokens,
  YAHOO_OAUTH_STATE_COOKIE,
} from "@/lib/yahoo/oauth";

function redirectHome(request: NextRequest, errorMessage?: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  if (errorMessage) {
    url.searchParams.set("yahoo_error", errorMessage);
  }
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
    return redirectHome(
      request,
      oauthErrorDescription || oauthError || "Yahoo returned an OAuth error.",
    );
  }

  if (!storedState || !state || storedState !== state) {
    return redirectHome(request, "Invalid OAuth state. Please retry login.");
  }

  if (!code) {
    return redirectHome(
      request,
      "Missing authorization code from Yahoo callback.",
    );
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

    return redirectHome(request);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return redirectHome(
      request,
      `Failed to exchange Yahoo authorization code for tokens. ${details}`,
    );
  }
}
