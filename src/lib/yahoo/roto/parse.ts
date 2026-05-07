import type { MatchupStatLine } from "@/lib/yahoo/roto/types";

/** Stat 60 numerator/denominator pair (numerator unused for totals; denominator weights weekly OBP). */
export function parseYahooSlashPair(value: unknown): {
  numerator: number;
  denominator: number;
} | null {
  if (typeof value !== "string" || !value.includes("/")) {
    return null;
  }
  const [left, right] = value.split("/");
  const numerator = Number.parseInt(left.trim(), 10);
  const denominator = Number.parseInt(right.trim(), 10);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return { numerator, denominator };
}

/**
 * Innings pitched as decimal outs: "34", "34.0" → 34; "30.1" → 30⅓; "30.2" → 30⅔ (not decimals).
 */
export function parseFantasyPitchingIpToDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (raw === "" || raw === "-") return null;
  const m = /^(\d+)(?:\.([012]))?$/.exec(raw);
  if (!m) return null;
  const whole = Number.parseInt(m[1], 10);
  const outs = m[2] ? Number.parseInt(m[2], 10) : 0;
  if (!Number.isFinite(whole) || outs > 2) return null;
  return whole + outs / 3;
}

export function parseYahooStatNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOptionalPositiveWeek(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function extractTeamLinesFromMatchup(rawMatchup: unknown): MatchupStatLine[] {
  const teams = (rawMatchup as { 0?: { teams?: Record<string, unknown> } })?.["0"]?.teams;
  if (!teams || typeof teams !== "object") {
    return [];
  }

  const lines: MatchupStatLine[] = [];
  for (const [teamIndex, teamData] of Object.entries(teams)) {
    if (teamIndex === "count") continue;
    const payload = (teamData as { team?: unknown[] })?.team;
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) continue;

    const teamMeta = payload[0] as unknown[];
    const teamIdObj = teamMeta.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { team_id?: unknown }).team_id === "string",
    ) as { team_id?: string } | undefined;
    const teamNameObj = teamMeta.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { name?: unknown }).name === "string",
    ) as { name?: string } | undefined;
    const statsContainer = payload.find(
      (item) => typeof item === "object" && item !== null && "team_stats" in (item as object),
    ) as
      | {
          team_stats?: {
            stats?: Array<{ stat?: { stat_id?: string; value?: string } }>;
          };
        }
      | undefined;

    if (!teamIdObj?.team_id || !teamNameObj?.name) continue;

    const statMap: Record<string, number | null> = {};
    const statRows = statsContainer?.team_stats?.stats ?? [];
    let obpDenom: number | null = null;
    let pitchingIp: number | null = null;

    for (const row of statRows) {
      const statId = row?.stat?.stat_id;
      if (!statId) continue;

      const cell = row.stat?.value;

      if (statId === "60") {
        const slash = parseYahooSlashPair(cell);
        if (slash) {
          obpDenom = slash.denominator;
        }
        statMap[statId] = parseYahooStatNumber(cell);
        continue;
      }

      if (statId === "50") {
        pitchingIp = parseFantasyPitchingIpToDecimal(cell);
        statMap[statId] = pitchingIp;
        continue;
      }

      statMap[statId] = parseYahooStatNumber(cell);
    }

    lines.push({
      teamId: teamIdObj.team_id,
      teamName: teamNameObj.name,
      stats: statMap,
      obpWeeklyDenominator: obpDenom,
      pitchingIpDecimals: pitchingIp,
    });
  }
  return lines;
}
