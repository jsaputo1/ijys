import { NextRequest, NextResponse } from "next/server";

import { getYahooEnv } from "@/lib/env";
import {
  finalizeTeamRateTotals,
  mergeMatchupLineIntoTotals,
} from "@/lib/yahoo/roto/aggregate";
import { parseOptionalPositiveWeek, extractTeamLinesFromMatchup } from "@/lib/yahoo/roto/parse";
import { buildRotoTables } from "@/lib/yahoo/roto/scoring";
import {
  ROTO_CATEGORIES,
  type TeamAgg,
} from "@/lib/yahoo/roto/types";
import {
  extractRawMatchupsFromScoreboard,
  getLeagueWeekBounds,
} from "@/lib/yahoo/roto/yahoo-scoreboard";
import { getValidYahooAccessToken } from "@/lib/yahoo/tokens";

export async function GET(request: NextRequest) {
  try {
    const startWeekFilter = parseOptionalPositiveWeek(
      request.nextUrl.searchParams.get("startWeek"),
    );
    const endWeekFilter = parseOptionalPositiveWeek(
      request.nextUrl.searchParams.get("endWeek"),
    );

    const leagueKey = process.env.YAHOO_LEAGUE_KEY;
    if (!leagueKey) {
      return NextResponse.json(
        { ok: false, error: "Missing YAHOO_LEAGUE_KEY environment variable." },
        { status: 500 },
      );
    }
    const { fantasyApiBaseUrl } = getYahooEnv();
    const accessToken = await getValidYahooAccessToken();

    const leagueUrl = new URL(`${fantasyApiBaseUrl}/league/${leagueKey}`);
    leagueUrl.searchParams.set("format", "json");
    const leagueResponse = await fetch(leagueUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!leagueResponse.ok) {
      return NextResponse.json(
        { ok: false, error: "Failed to load Yahoo league metadata." },
        { status: 502 },
      );
    }
    const leagueData = await leagueResponse.json();
    const { startWeek, endWeek } = getLeagueWeekBounds(leagueData);
    const effectiveStartWeek = Math.max(startWeekFilter ?? startWeek, startWeek);
    const effectiveEndWeek = Math.min(endWeekFilter ?? endWeek, endWeek);
    if (effectiveStartWeek > effectiveEndWeek) {
      return NextResponse.json(
        { ok: false, error: "Invalid week range: startWeek must be <= endWeek." },
        { status: 400 },
      );
    }

    const teams = new Map<string, TeamAgg>();
    for (let week = effectiveStartWeek; week <= effectiveEndWeek; week += 1) {
      const scoreboardUrl = new URL(
        `${fantasyApiBaseUrl}/league/${leagueKey}/scoreboard;week=${week}`,
      );
      scoreboardUrl.searchParams.set("format", "json");
      const scoreboardResponse = await fetch(scoreboardUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!scoreboardResponse.ok) {
        throw new Error(`Failed to fetch scoreboard for week ${week}.`);
      }
      const scoreboardData = await scoreboardResponse.json();
      const rawMatchups = extractRawMatchupsFromScoreboard(scoreboardData);
      for (const rawMatchup of rawMatchups) {
        const lines = extractTeamLinesFromMatchup(rawMatchup);
        for (const line of lines) {
          mergeMatchupLineIntoTotals(teams, line);
        }
      }
    }

    finalizeTeamRateTotals(teams);
    const rows = Array.from(teams.values());
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No team stat data found in matchup response." },
        { status: 404 },
      );
    }

    const { totalsTable, rotoTable } = buildRotoTables(rows);

    return NextResponse.json({
      ok: true,
      leagueKey,
      filters: {
        startWeek: effectiveStartWeek,
        endWeek: effectiveEndWeek,
      },
      categories: ROTO_CATEGORIES,
      tables: {
        totals: totalsTable,
        roto: rotoTable,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to build league roto tables.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
