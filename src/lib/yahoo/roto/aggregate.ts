import type { MatchupStatLine, TeamAgg, TeamRateBlend } from "@/lib/yahoo/roto/types";

function emptyBlend(): TeamRateBlend {
  return {
    obpWeightedSum: 0,
    obpDenomSum: 0,
    pitchingIpSum: 0,
    eraIpProductSum: 0,
    whipIpProductSum: 0,
  };
}

function createEmptyTeamAgg(teamId: string, teamName: string): TeamAgg {
  return {
    teamId,
    teamName,
    rateBlend: emptyBlend(),
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
  };
}

/** Derive season totals for OBP, ERA, WHIP after all matchup merges. */
export function finalizeTeamRateTotals(teams: Map<string, TeamAgg>) {
  for (const agg of teams.values()) {
    const blend = agg.rateBlend;
    if (!blend) continue;

    if (blend.obpDenomSum > 0) {
      agg.totals.OBP = blend.obpWeightedSum / blend.obpDenomSum;
    } else {
      agg.totals.OBP = null;
    }

    if (blend.pitchingIpSum > 0) {
      agg.totals.ERA = blend.eraIpProductSum / blend.pitchingIpSum;
      agg.totals.WHIP = blend.whipIpProductSum / blend.pitchingIpSum;
    } else {
      agg.totals.ERA = null;
      agg.totals.WHIP = null;
    }

    delete agg.rateBlend;
  }
}

export function mergeMatchupLineIntoTotals(
  teams: Map<string, TeamAgg>,
  line: MatchupStatLine,
) {
  const current =
    teams.get(line.teamId) ?? createEmptyTeamAgg(line.teamId, line.teamName);
  current.rateBlend ??= emptyBlend();
  const b = current.rateBlend;

  current.totals.R = (current.totals.R ?? 0) + (line.stats["7"] ?? 0);
  current.totals.HR = (current.totals.HR ?? 0) + (line.stats["12"] ?? 0);
  current.totals.RBI = (current.totals.RBI ?? 0) + (line.stats["13"] ?? 0);
  current.totals.SB = (current.totals.SB ?? 0) + (line.stats["16"] ?? 0);
  current.totals.W = (current.totals.W ?? 0) + (line.stats["28"] ?? 0);
  current.totals.SV = (current.totals.SV ?? 0) + (line.stats["32"] ?? 0);
  current.totals.K = (current.totals.K ?? 0) + (line.stats["42"] ?? 0);

  const weeklyObp = line.stats["4"] ?? line.stats["55"];
  const obpDenom = line.obpWeeklyDenominator;
  if (
    typeof weeklyObp === "number" &&
    Number.isFinite(weeklyObp) &&
    obpDenom !== null &&
    obpDenom > 0
  ) {
    b.obpWeightedSum += weeklyObp * obpDenom;
    b.obpDenomSum += obpDenom;
  }

  const ip = line.pitchingIpDecimals;
  const era = line.stats["26"];
  const whip = line.stats["27"];
  if (
    ip !== null &&
    ip > 0 &&
    typeof era === "number" &&
    Number.isFinite(era) &&
    typeof whip === "number" &&
    Number.isFinite(whip)
  ) {
    b.pitchingIpSum += ip;
    b.eraIpProductSum += era * ip;
    b.whipIpProductSum += whip * ip;
  }

  teams.set(line.teamId, current);
}
