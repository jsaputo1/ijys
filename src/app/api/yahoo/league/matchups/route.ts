import { NextRequest, NextResponse } from "next/server";

import { getYahooEnv } from "@/lib/env";
import { getValidYahooAccessToken } from "@/lib/yahoo/tokens";

type YahooMatchupItem = {
  week: number;
  weekStartDate: string | null;
  weekEndDate: string | null;
  teamIds: string[];
  raw: unknown;
};

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSort(value: string | null): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function parseOptionalPositiveInt(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getLeagueSummary(fantasyResponse: unknown) {
  const leagueEntries =
    (fantasyResponse as { fantasy_content?: { league?: unknown[] } })?.fantasy_content
      ?.league ?? [];

  const leagueMetadata = leagueEntries.find(
    (entry) => typeof entry === "object" && entry !== null && "start_week" in entry,
  ) as { start_week?: string; current_week?: number | string; end_week?: number | string } | undefined;

  if (!leagueMetadata?.start_week) {
    throw new Error("Unable to determine league week range from Yahoo response.");
  }

  const startWeek = Number.parseInt(leagueMetadata.start_week, 10);
  const currentWeek = Number(leagueMetadata.current_week ?? leagueMetadata.end_week);

  if (!Number.isFinite(startWeek) || !Number.isFinite(currentWeek)) {
    throw new Error("Invalid league week metadata from Yahoo response.");
  }

  return {
    startWeek,
    endWeek: currentWeek,
  };
}

function extractWeekMatchups(scoreboardResponse: unknown, week: number): YahooMatchupItem[] {
  const leagueEntries =
    (scoreboardResponse as { fantasy_content?: { league?: unknown[] } })?.fantasy_content
      ?.league ?? [];

  const scoreboardEntry = leagueEntries.find(
    (entry) => typeof entry === "object" && entry !== null && "scoreboard" in entry,
  ) as
    | {
        scoreboard?: Array<{
          matchups?: Record<
            string,
            {
              matchup?: unknown;
            }
          >;
        }>;
      }
    | undefined;

  const matchupsRecord = scoreboardEntry?.scoreboard?.[0]?.matchups;
  if (!matchupsRecord) {
    return [];
  }

  return Object.entries(matchupsRecord)
    .filter(([key]) => key !== "count")
    .map(([, value]) => {
      const rawMatchup = value?.matchup ?? value;
      const weekStartDate =
        (rawMatchup as { week_start?: string })?.week_start ?? null;
      const weekEndDate = (rawMatchup as { week_end?: string })?.week_end ?? null;
      const teamIds = extractTeamIds(rawMatchup);

      return {
        week,
        weekStartDate,
        weekEndDate,
        teamIds,
        raw: rawMatchup,
      };
    });
}

function extractTeamIds(input: unknown): string[] {
  const found = new Set<string>();

  function walk(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }

    if (typeof value !== "object" || value === null) {
      return;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.team_id === "string") {
      found.add(record.team_id);
    }

    for (const child of Object.values(record)) {
      walk(child);
    }
  }

  walk(input);
  return Array.from(found);
}

function sortMatchups(items: YahooMatchupItem[], sort: "asc" | "desc") {
  const direction = sort === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const aDate = a.weekStartDate ? Date.parse(a.weekStartDate) : Number.NaN;
    const bDate = b.weekStartDate ? Date.parse(b.weekStartDate) : Number.NaN;

    const hasValidDates = Number.isFinite(aDate) && Number.isFinite(bDate);
    if (hasValidDates) {
      return (aDate - bDate) * direction;
    }

    return (a.week - b.week) * direction;
  });
}

export async function GET(request: NextRequest) {
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

    const page = parsePositiveInt(request.nextUrl.searchParams.get("page"), 1);
    const limit = Math.min(
      parsePositiveInt(request.nextUrl.searchParams.get("limit"), 25),
      100,
    );
    const sort = parseSort(request.nextUrl.searchParams.get("sort"));
    const requestedStartWeek = parseOptionalPositiveInt(
      request.nextUrl.searchParams.get("startWeek"),
    );
    const requestedEndWeek = parseOptionalPositiveInt(
      request.nextUrl.searchParams.get("endWeek"),
    );
    const teamId = request.nextUrl.searchParams.get("team_id");

    const { fantasyApiBaseUrl } = getYahooEnv();
    const accessToken = await getValidYahooAccessToken();

    const leagueUrl = new URL(`${fantasyApiBaseUrl}/league/${leagueKey}`);
    leagueUrl.searchParams.set("format", "json");
    const leagueResponse = await fetch(leagueUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!leagueResponse.ok) {
      const details = await leagueResponse.text();
      return NextResponse.json(
        {
          ok: false,
          error: "Yahoo league metadata request failed.",
          status: leagueResponse.status,
          details,
        },
        { status: leagueResponse.status },
      );
    }

    const leagueData = (await leagueResponse.json()) as unknown;
    const { startWeek, endWeek } = getLeagueSummary(leagueData);
    const effectiveStartWeek = Math.max(requestedStartWeek ?? startWeek, startWeek);
    const effectiveEndWeek = Math.min(requestedEndWeek ?? endWeek, endWeek);

    if (effectiveStartWeek > effectiveEndWeek) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid week range: startWeek must be less than or equal to endWeek.",
        },
        { status: 400 },
      );
    }

    const allMatchups: YahooMatchupItem[] = [];
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
        const details = await scoreboardResponse.text();
        return NextResponse.json(
          {
            ok: false,
            error: "Yahoo scoreboard request failed.",
            status: scoreboardResponse.status,
            details,
            week,
          },
          { status: scoreboardResponse.status },
        );
      }

      const scoreboardData = (await scoreboardResponse.json()) as unknown;
      allMatchups.push(...extractWeekMatchups(scoreboardData, week));
    }

    const filteredByTeam = teamId
      ? allMatchups.filter((matchup) => matchup.teamIds.includes(teamId))
      : allMatchups;
    const sorted = sortMatchups(filteredByTeam, sort);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * limit;
    const pagedItems = sorted.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      ok: true,
      leagueKey,
      filters: {
        page: safePage,
        limit,
        sort,
        startWeek: effectiveStartWeek,
        endWeek: effectiveEndWeek,
        team_id: teamId,
      },
      range: {
        startWeek: effectiveStartWeek,
        endWeek: effectiveEndWeek,
      },
      pagination: {
        total,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1,
      },
      matchups: pagedItems,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load Yahoo league matchups.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
