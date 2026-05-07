import { NextResponse } from "next/server";

import { getYahooEnv } from "@/lib/env";
import { getValidYahooAccessToken } from "@/lib/yahoo/tokens";

export async function GET() {
  try {
    const leagueKey = process.env.YAHOO_LEAGUE_KEY;
    if (!leagueKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing YAHOO_LEAGUE_KEY environment variable.",
        },
        { status: 500 },
      );
    }

    const { fantasyApiBaseUrl } = getYahooEnv();
    const accessToken = await getValidYahooAccessToken();
    const yahooUrl = new URL(`${fantasyApiBaseUrl}/league/${leagueKey}`);
    yahooUrl.searchParams.set("format", "json");

    const response = await fetch(yahooUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const responseBody = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Yahoo Fantasy API request failed.",
          status: response.status,
          details: responseBody,
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      ok: true,
      leagueKey,
      league: JSON.parse(responseBody),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load Yahoo league info.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
