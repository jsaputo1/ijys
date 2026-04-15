import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  exchangeYahooCodeForTokens,
  YAHOO_OAUTH_STATE_COOKIE,
} from "@/lib/yahoo/oauth";

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
    const response = NextResponse.json({
      ok: true,
      message:
        "Yahoo OAuth callback succeeded.",
      receivedTokens: {
        accessToken: Boolean(tokenPayload.access_token),
        refreshToken: Boolean(tokenPayload.refresh_token),
        tokenType: tokenPayload.token_type,
        expiresIn: tokenPayload.expires_in,
      },
    });
    response.cookies.delete(YAHOO_OAUTH_STATE_COOKIE);
    return response;
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
