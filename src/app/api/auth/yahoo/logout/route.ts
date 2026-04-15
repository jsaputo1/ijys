import { NextResponse } from "next/server";

import { YAHOO_OAUTH_STATE_COOKIE } from "@/lib/yahoo/oauth";

function clearYahooAuthState() {
  const response = NextResponse.json({
    ok: true,
    message: "Yahoo auth state cleared.",
  });
  response.cookies.delete(YAHOO_OAUTH_STATE_COOKIE);
  return response;
}

export async function POST() {
  return clearYahooAuthState();
}

export async function GET() {
  return clearYahooAuthState();
}
