export type RotoCategory = {
  id: "R" | "HR" | "RBI" | "SB" | "OBP" | "W" | "SV" | "K" | "ERA" | "WHIP";
  label: string;
  higherIsBetter: boolean;
};

/** Accumulates Yahoo weekly matchup lines into season-to-date composite rates (OBP / ERA / WHIP). */
export type TeamRateBlend = {
  /** Σ (weeklyDisplayedObp × obpWeeklyDenominator) — Yahoo OBP composites use this denominator. */
  obpWeightedSum: number;
  obpDenomSum: number;
  pitchingIpSum: number;
  eraIpProductSum: number;
  whipIpProductSum: number;
};

export type TeamAgg = {
  teamId: string;
  teamName: string;
  totals: Record<RotoCategory["id"], number | null>;
  /** Present while merging matchup weeks; stripped by `finalizeTeamRateTotals`. */
  rateBlend?: TeamRateBlend;
};

export type MatchupStatLine = {
  teamId: string;
  teamName: string;
  stats: Record<string, number | null>;
  /** Stat ID 60 "a/b" — second integer is denominator for blending weekly `.OBP`. */
  obpWeeklyDenominator: number | null;
  /** Stat ID "50"; Yahoo reports outs in the fractional digit (`.1` → ⅓ IP, `.2` → ⅔). */
  pitchingIpDecimals: number | null;
};

export const ROTO_CATEGORIES: RotoCategory[] = [
  { id: "R", label: "R", higherIsBetter: true },
  { id: "HR", label: "HR", higherIsBetter: true },
  { id: "RBI", label: "RBI", higherIsBetter: true },
  { id: "SB", label: "SB", higherIsBetter: true },
  { id: "OBP", label: "OBP", higherIsBetter: true },
  { id: "W", label: "W", higherIsBetter: true },
  { id: "SV", label: "SV", higherIsBetter: true },
  { id: "K", label: "K", higherIsBetter: true },
  { id: "ERA", label: "ERA", higherIsBetter: false },
  { id: "WHIP", label: "WHIP", higherIsBetter: false },
];
