import { NextResponse } from "next/server";

import {
  buildYahooAuthorizeUrl,
  createYahooOAuthState,
  YAHOO_OAUTH_STATE_COOKIE,
} from "@/lib/yahoo/oauth";

export async function GET() {
  try {
    const state = createYahooOAuthState();
    const authorizeUrl = buildYahooAuthorizeUrl(state);
    const response = NextResponse.redirect(authorizeUrl, 302);

    response.cookies.set(YAHOO_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to start Yahoo OAuth login flow.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
