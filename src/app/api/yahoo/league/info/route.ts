import { NextResponse } from "next/server";

import { getYahooEnv } from "@/lib/env";
import { getLeagueWeekBounds } from "@/lib/yahoo/roto/yahoo-scoreboard";
import {
  getValidYahooAccessToken,
  YahooAuthRequiredError,
} from "@/lib/yahoo/tokens";

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
      const authFailed = response.status === 401;
      return NextResponse.json(
        {
          ok: false,
          code: authFailed ? "YAHOO_AUTH_REQUIRED" : "YAHOO_API_ERROR",
          error: authFailed
            ? "Yahoo access token was rejected. Reconnect Yahoo."
            : "Yahoo Fantasy API request failed.",
          status: response.status,
          details: responseBody,
          leagueKey,
        },
        { status: authFailed ? 401 : response.status },
      );
    }

    const leagueParsed: unknown = JSON.parse(responseBody);
    const { startWeek: seasonStartWeek, endWeek: currentWeek } =
      getLeagueWeekBounds(leagueParsed);

    return NextResponse.json({
      ok: true,
      leagueKey,
      weekBounds: {
        seasonStartWeek,
        /** Yahoo’s active scoring week (same source the roto route uses as `endWeek`). */
        currentWeek,
      },
      league: leagueParsed,
    });
  } catch (error) {
    if (error instanceof YahooAuthRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          code: "YAHOO_AUTH_REQUIRED",
          error: "Login to see league data",
          details: error.message,
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load league data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
