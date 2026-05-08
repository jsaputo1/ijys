import { ROTO_CATEGORIES, type RotoCategory } from "@/lib/yahoo/roto/types";

type RotoTotalsRow = {
  teamId: string;
  teamName: string;
  stats: Record<string, number | null>;
};

type RotoStandingRow = {
  rank: number;
  teamId: string;
  teamName: string;
  totalScore: number;
  statScores: Record<string, number>;
};

export type RotoSuccessPayload = {
  ok: true;
  leagueKey: string;
  filters: {
    startWeek: number;
    endWeek: number;
  };
  categories: RotoCategory[];
  tables: {
    totals: RotoTotalsRow[];
    roto: RotoStandingRow[];
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRotoCategory(value: unknown): value is RotoCategory {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.higherIsBetter === "boolean"
  );
}

function isRecordOfNumbersOrNull(value: unknown): value is Record<string, number | null> {
  if (!isObject(value)) return false;
  return Object.values(value).every((entry) => entry === null || isFiniteNumber(entry));
}

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  if (!isObject(value)) return false;
  return Object.values(value).every((entry) => isFiniteNumber(entry));
}

export function isRotoSuccessPayload(value: unknown): value is RotoSuccessPayload {
  if (!isObject(value) || value.ok !== true) return false;
  if (typeof value.leagueKey !== "string") return false;
  if (!isObject(value.filters)) return false;
  if (!isFiniteNumber(value.filters.startWeek) || !isFiniteNumber(value.filters.endWeek)) {
    return false;
  }

  if (!Array.isArray(value.categories) || !value.categories.every(isRotoCategory)) {
    return false;
  }

  if (!isObject(value.tables)) return false;
  if (!Array.isArray(value.tables.totals) || !Array.isArray(value.tables.roto)) return false;

  const validTotals = value.tables.totals.every((row) => {
    if (!isObject(row)) return false;
    return (
      typeof row.teamId === "string" &&
      typeof row.teamName === "string" &&
      isRecordOfNumbersOrNull(row.stats)
    );
  });

  if (!validTotals) return false;

  const validRoto = value.tables.roto.every((row) => {
    if (!isObject(row)) return false;
    return (
      isFiniteNumber(row.rank) &&
      typeof row.teamId === "string" &&
      typeof row.teamName === "string" &&
      isFiniteNumber(row.totalScore) &&
      isRecordOfNumbers(row.statScores)
    );
  });

  if (!validRoto) return false;

  const categoryIds = new Set(value.categories.map((c) => c.id));
  const expectedIds = new Set(ROTO_CATEGORIES.map((c) => c.id));
  if (categoryIds.size !== expectedIds.size) return false;
  for (const id of expectedIds) {
    if (!categoryIds.has(id)) return false;
  }

  return true;
}
