import { NextRequest, NextResponse } from "next/server";

import { getYahooEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCachedRotoRange,
  getWeeksToRefresh,
  getWeeklyRangeAggregate,
  upsertLeagueTeams,
  upsertWeeklyTeamStats,
  upsertRotoRangeCache,
} from "@/lib/yahoo/roto/cache";
import { parseOptionalPositiveWeek, extractTeamLinesFromMatchup } from "@/lib/yahoo/roto/parse";
import type { RotoSuccessPayload } from "@/lib/yahoo/roto/payload";
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

async function fetchLeagueMetadata(args: {
  fantasyApiBaseUrl: string;
  leagueKey: string;
  accessToken: string;
}) {
  const leagueUrl = new URL(`${args.fantasyApiBaseUrl}/league/${args.leagueKey}`);
  leagueUrl.searchParams.set("format", "json");
  const response = await fetch(leagueUrl.toString(), {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to load Yahoo league metadata.");
  }

  return response.json();
}

async function refreshCanonicalWeekFromYahoo(args: {
  fantasyApiBaseUrl: string;
  leagueKey: string;
  accessToken: string;
  week: number;
}) {
  const scoreboardUrl = new URL(
    `${args.fantasyApiBaseUrl}/league/${args.leagueKey}/scoreboard;week=${args.week}`,
  );
  scoreboardUrl.searchParams.set("format", "json");
  const scoreboardResponse = await fetch(scoreboardUrl.toString(), {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });
  if (!scoreboardResponse.ok) {
    throw new Error(`Failed to fetch scoreboard for week ${args.week}.`);
  }
  const scoreboardData = await scoreboardResponse.json();
  const rawMatchups = extractRawMatchupsFromScoreboard(scoreboardData);

  const weeklyRows = [];
  const teams = new Map<string, { teamId: string; teamName: string }>();
  for (const rawMatchup of rawMatchups) {
    const lines = extractTeamLinesFromMatchup(rawMatchup);
    for (const line of lines) {
      teams.set(line.teamId, { teamId: line.teamId, teamName: line.teamName });
      const weeklyObp = line.stats["4"] ?? line.stats["55"];
      const obpDenom = line.obpWeeklyDenominator;
      const ip = line.pitchingIpDecimals;
      const era = line.stats["26"];
      const whip = line.stats["27"];

      weeklyRows.push({
        leagueKey: args.leagueKey,
        week: args.week,
        teamId: line.teamId,
        teamName: line.teamName,
        runs: line.stats["7"] ?? 0,
        hr: line.stats["12"] ?? 0,
        rbi: line.stats["13"] ?? 0,
        sb: line.stats["16"] ?? 0,
        wins: line.stats["28"] ?? 0,
        sv: line.stats["32"] ?? 0,
        strikeouts: line.stats["42"] ?? 0,
        obpWeightedSum:
          typeof weeklyObp === "number" && Number.isFinite(weeklyObp) && (obpDenom ?? 0) > 0
            ? weeklyObp * (obpDenom ?? 0)
            : 0,
        obpDenomSum: obpDenom ?? 0,
        pitchingIpSum:
          ip !== null &&
          ip > 0 &&
          typeof era === "number" &&
          Number.isFinite(era) &&
          typeof whip === "number" &&
          Number.isFinite(whip)
            ? ip
            : 0,
        eraIpProductSum:
          ip !== null && ip > 0 && typeof era === "number" && Number.isFinite(era) ? era * ip : 0,
        whipIpProductSum:
          ip !== null && ip > 0 && typeof whip === "number" && Number.isFinite(whip)
            ? whip * ip
            : 0,
      });
    }
  }

  await upsertWeeklyTeamStats({
    supabase: getSupabaseServerClient(),
    rows: weeklyRows,
  });
  await upsertLeagueTeams({
    supabase: getSupabaseServerClient(),
    teams: Array.from(teams.values()).map((team) => ({
      leagueKey: args.leagueKey,
      teamId: team.teamId,
      teamName: team.teamName,
    })),
  });
}

async function buildRotoFromCanonicalWeeks(args: {
  leagueKey: string;
  startWeek: number;
  endWeek: number;
}): Promise<RotoSuccessPayload> {
  const aggregateRows = await getWeeklyRangeAggregate({
    supabase: getSupabaseServerClient(),
    leagueKey: args.leagueKey,
    startWeek: args.startWeek,
    endWeek: args.endWeek,
  });
  if (aggregateRows.length === 0) {
    throw new Error("No team stat data found in weekly canonical cache.");
  }

  const teams = new Map<string, TeamAgg>();
  for (const row of aggregateRows) {
    const existing =
      teams.get(row.team_id) ??
      ({
        teamId: row.team_id,
        teamName: row.team_name,
        totals: {
          R: 0,
          HR: 0,
          RBI: 0,
          SB: 0,
          OBP: null,
          W: 0,
          SV: 0,
          K: 0,
          ERA: null,
          WHIP: null,
        },
      } satisfies TeamAgg);

    existing.teamName = row.team_name;
    existing.totals.R = (existing.totals.R ?? 0) + Number(row.runs ?? 0);
    existing.totals.HR = (existing.totals.HR ?? 0) + Number(row.hr ?? 0);
    existing.totals.RBI = (existing.totals.RBI ?? 0) + Number(row.rbi ?? 0);
    existing.totals.SB = (existing.totals.SB ?? 0) + Number(row.sb ?? 0);
    existing.totals.W = (existing.totals.W ?? 0) + Number(row.wins ?? 0);
    existing.totals.SV = (existing.totals.SV ?? 0) + Number(row.sv ?? 0);
    existing.totals.K = (existing.totals.K ?? 0) + Number(row.strikeouts ?? 0);

    const obpDenom = Number(row.obp_denom_sum ?? 0);
    const obpWeighted = Number(row.obp_weighted_sum ?? 0);
    const pitchingIp = Number(row.pitching_ip_sum ?? 0);
    const eraIp = Number(row.era_ip_product_sum ?? 0);
    const whipIp = Number(row.whip_ip_product_sum ?? 0);

    existing.totals.OBP =
      (existing.totals.OBP ?? 0) +
      (obpDenom > 0 && Number.isFinite(obpWeighted) ? obpWeighted : 0);
    existing.totals.ERA =
      (existing.totals.ERA ?? 0) + (pitchingIp > 0 && Number.isFinite(eraIp) ? eraIp : 0);
    existing.totals.WHIP =
      (existing.totals.WHIP ?? 0) + (pitchingIp > 0 && Number.isFinite(whipIp) ? whipIp : 0);
    // Temporarily stash denominators in local map to finalize rates later.
    const denoms = (existing as TeamAgg & {
      _obpDenom?: number;
      _ipDenom?: number;
    });
    denoms._obpDenom = (denoms._obpDenom ?? 0) + (obpDenom > 0 ? obpDenom : 0);
    denoms._ipDenom = (denoms._ipDenom ?? 0) + (pitchingIp > 0 ? pitchingIp : 0);

    teams.set(row.team_id, existing);
  }

  for (const team of teams.values() as Iterable<
    TeamAgg & { _obpDenom?: number; _ipDenom?: number }
  >) {
    team.totals.OBP =
      (team._obpDenom ?? 0) > 0 && team.totals.OBP !== null
        ? team.totals.OBP / (team._obpDenom ?? 1)
        : null;
    team.totals.ERA =
      (team._ipDenom ?? 0) > 0 && team.totals.ERA !== null
        ? team.totals.ERA / (team._ipDenom ?? 1)
        : null;
    team.totals.WHIP =
      (team._ipDenom ?? 0) > 0 && team.totals.WHIP !== null
        ? team.totals.WHIP / (team._ipDenom ?? 1)
        : null;
    delete team._obpDenom;
    delete team._ipDenom;
  }

  const rows = Array.from(teams.values());
  const { totalsTable, rotoTable } = buildRotoTables(rows);

  return {
    ok: true,
    leagueKey: args.leagueKey,
    filters: {
      startWeek: args.startWeek,
      endWeek: args.endWeek,
    },
    categories: ROTO_CATEGORIES,
    tables: {
      totals: totalsTable,
      roto: rotoTable,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("forceRefresh") === "1";

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

    const leagueData = await fetchLeagueMetadata({
      fantasyApiBaseUrl,
      leagueKey,
      accessToken,
    });
    const { startWeek, endWeek } = getLeagueWeekBounds(leagueData);
    const effectiveStartWeek = Math.max(startWeekFilter ?? startWeek, startWeek);
    const effectiveEndWeek = Math.min(endWeekFilter ?? endWeek, endWeek);
    if (effectiveStartWeek > effectiveEndWeek) {
      return NextResponse.json(
        { ok: false, error: "Invalid week range: startWeek must be <= endWeek." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();
    const cachedPayload = await getCachedRotoRange({
      supabase,
      leagueKey,
      startWeek: effectiveStartWeek,
      endWeek: effectiveEndWeek,
      forceRefresh,
      currentWeek: endWeek,
    });
    if (cachedPayload) {
      return NextResponse.json(cachedPayload, {
        headers: {
          "x-roto-source": "range-cache",
          "x-roto-weeks-refreshed": "0",
        },
      });
    }

    const weeksToRefresh = await getWeeksToRefresh({
      supabase,
      leagueKey,
      startWeek: effectiveStartWeek,
      endWeek: effectiveEndWeek,
      currentWeek: endWeek,
      forceRefresh,
    });

    for (const week of weeksToRefresh) {
      await refreshCanonicalWeekFromYahoo({
        fantasyApiBaseUrl,
        leagueKey,
        accessToken,
        week,
      });
    }

    const payload = await buildRotoFromCanonicalWeeks({
      leagueKey,
      startWeek: effectiveStartWeek,
      endWeek: effectiveEndWeek,
    });
    await upsertRotoRangeCache({
      supabase,
      payload,
      currentWeek: endWeek,
      source: "weekly-canonical",
    });

    return NextResponse.json(payload, {
      headers: {
        "x-roto-source": weeksToRefresh.length > 0 ? "yahoo-refresh+weekly-canonical" : "weekly-canonical",
        "x-roto-weeks-refreshed": String(weeksToRefresh.length),
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    const status =
      details === "No team stat data found in weekly canonical cache." ? 404 : 500;

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to build league roto tables.",
        details,
      },
      {
        status,
        headers: {
          "x-roto-source": "error",
        },
      },
    );
  }
}
