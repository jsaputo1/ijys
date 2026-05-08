import { NextRequest, NextResponse } from "next/server";

import { getValidYahooAccessToken } from "@/lib/yahoo/tokens";

function getBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length).trim();
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Missing CRON_SECRET environment variable." },
      { status: 500 },
    );
  }

  const presented = getBearerToken(request);
  if (!presented || presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    await getValidYahooAccessToken();
    return NextResponse.json({
      ok: true,
      message: "Yahoo token checked/refreshed successfully.",
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to check/refresh Yahoo token.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
