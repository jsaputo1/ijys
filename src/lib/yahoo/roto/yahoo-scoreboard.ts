export function getLeagueWeekBounds(fantasyResponse: unknown) {
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

  return { startWeek, endWeek: currentWeek };
}

export function extractRawMatchupsFromScoreboard(scoreboardResponse: unknown): unknown[] {
  const leagueEntries =
    (scoreboardResponse as { fantasy_content?: { league?: unknown[] } })?.fantasy_content
      ?.league ?? [];
  const scoreboardEntry = leagueEntries.find(
    (entry) => typeof entry === "object" && entry !== null && "scoreboard" in entry,
  ) as
    | {
        scoreboard?: Array<{
          matchups?: Record<string, { matchup?: unknown }>;
        }>;
      }
    | undefined;
  const matchupsRecord = scoreboardEntry?.scoreboard?.[0]?.matchups ?? {};

  return Object.entries(matchupsRecord)
    .filter(([key]) => key !== "count")
    .map(([, value]) => value?.matchup ?? value);
}
