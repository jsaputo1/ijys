import { ROTO_TIE_EPSILON } from "@/lib/yahoo/roto/constants";
import {
  ROTO_CATEGORIES,
  type RotoCategory,
  type TeamAgg,
} from "@/lib/yahoo/roto/types";

export function computeCategoryPoints(
  rows: TeamAgg[],
  categoryId: RotoCategory["id"],
  higherIsBetter: boolean,
) {
  const ranked = rows
    .map((row) => ({ teamId: row.teamId, value: row.totals[categoryId] }))
    .filter((row) => row.value !== null) as Array<{ teamId: string; value: number }>;

  ranked.sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));
  const teamCount = rows.length;
  const points: Record<string, number> = {};

  let i = 0;
  while (i < ranked.length) {
    let j = i + 1;
    while (j < ranked.length && Math.abs(ranked[j].value - ranked[i].value) < ROTO_TIE_EPSILON) {
      j += 1;
    }

    const basePointsForPlace = teamCount - i;
    const tieCount = j - i;
    const tiedPoints = basePointsForPlace - (tieCount - 1) / tieCount;

    for (let idx = i; idx < j; idx += 1) {
      points[ranked[idx].teamId] = tiedPoints;
    }
    i = j;
  }

  return points;
}

export function addTieAwareRanks<
  T extends {
    teamId: string;
    teamName: string;
    totalScore: number;
    statScores: Record<RotoCategory["id"], number>;
  },
>(rows: T[]) {
  const withRanks: Array<{ rank: number } & T> = [];

  let previousScore: number | null = null;
  let previousRank = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rank =
      previousScore !== null && Math.abs(row.totalScore - previousScore) < ROTO_TIE_EPSILON
        ? previousRank
        : index + 1;

    withRanks.push({
      rank,
      ...row,
    });

    previousScore = row.totalScore;
    previousRank = rank;
  }

  return withRanks;
}

export type RotoTotalsRow = {
  teamId: string;
  teamName: string;
  stats: TeamAgg["totals"];
};

export type RotoStandingsRow = {
  rank: number;
  teamId: string;
  teamName: string;
  totalScore: number;
  statScores: Record<RotoCategory["id"], number>;
};

export function buildRotoTables(rows: TeamAgg[]): {
  totalsTable: RotoTotalsRow[];
  rotoTable: RotoStandingsRow[];
} {
  const totalsTable: RotoTotalsRow[] = rows
    .map((row) => ({ teamId: row.teamId, teamName: row.teamName, stats: row.totals }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));

  const pointsByCategory = Object.fromEntries(
    ROTO_CATEGORIES.map((category) => [
      category.id,
      computeCategoryPoints(rows, category.id, category.higherIsBetter),
    ]),
  ) as Record<RotoCategory["id"], Record<string, number>>;

  const rotoTable = addTieAwareRanks(
    rows
      .map((row) => {
        const statScores = Object.fromEntries(
          ROTO_CATEGORIES.map((category) => [
            category.id,
            Number((pointsByCategory[category.id][row.teamId] ?? 0).toFixed(2)),
          ]),
        ) as Record<RotoCategory["id"], number>;

        const totalScore = Number(
          Object.values(statScores)
            .reduce((sum, value) => sum + value, 0)
            .toFixed(2),
        );

        return {
          teamId: row.teamId,
          teamName: row.teamName,
          totalScore,
          statScores,
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore || a.teamName.localeCompare(b.teamName)),
  );

  return { totalsTable, rotoTable };
}
