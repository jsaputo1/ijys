import type { SupabaseClient } from "@supabase/supabase-js";

import type { RotoSuccessPayload } from "@/lib/yahoo/roto/payload";
import { isRotoSuccessPayload } from "@/lib/yahoo/roto/payload";

const CURRENT_RANGE_TTL_MS = 5 * 60 * 1000;
const CURRENT_WEEK_TTL_MS = 5 * 60 * 1000;

type CacheLookupRow = {
  payload: unknown;
  computed_at: string;
  is_current_range: boolean;
};

export type LeagueTeamUpsert = {
  leagueKey: string;
  teamId: string;
  teamName: string;
};

export type WeeklyTeamStatsUpsert = {
  leagueKey: string;
  week: number;
  teamId: string;
  teamName: string;
  runs: number;
  hr: number;
  rbi: number;
  sb: number;
  wins: number;
  sv: number;
  strikeouts: number;
  obpWeightedSum: number;
  obpDenomSum: number;
  pitchingIpSum: number;
  eraIpProductSum: number;
  whipIpProductSum: number;
};

type ExistingWeekRow = {
  week: number;
  updated_at: string;
};

export type WeeklyAggregateRow = {
  team_id: string;
  team_name: string;
  runs: number;
  hr: number;
  rbi: number;
  sb: number;
  wins: number;
  sv: number;
  strikeouts: number;
  obp_weighted_sum: number;
  obp_denom_sum: number;
  pitching_ip_sum: number;
  era_ip_product_sum: number;
  whip_ip_product_sum: number;
};

export async function getCachedRotoRange(args: {
  supabase: SupabaseClient;
  leagueKey: string;
  startWeek: number;
  endWeek: number;
  forceRefresh: boolean;
  currentWeek: number;
}): Promise<RotoSuccessPayload | null> {
  if (args.forceRefresh) return null;

  const { data, error } = await args.supabase
    .from("roto_range_cache")
    .select("payload,computed_at,is_current_range")
    .eq("league_key", args.leagueKey)
    .eq("start_week", args.startWeek)
    .eq("end_week", args.endWeek)
    .maybeSingle<CacheLookupRow>();

  if (error) {
    throw new Error(`Failed reading roto cache: ${error.message}`);
  }
  if (!data) return null;
  if (!isRotoSuccessPayload(data.payload)) return null;

  const isCurrentRange = args.endWeek === args.currentWeek || data.is_current_range;
  if (!isCurrentRange) return data.payload;

  const computedMs = Date.parse(data.computed_at);
  if (!Number.isFinite(computedMs)) return null;
  if (Date.now() - computedMs > CURRENT_RANGE_TTL_MS) return null;

  return data.payload;
}

function isFreshTimestamp(value: string, ttlMs: number) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= ttlMs;
}

export async function getWeeksToRefresh(args: {
  supabase: SupabaseClient;
  leagueKey: string;
  startWeek: number;
  endWeek: number;
  currentWeek: number;
  forceRefresh: boolean;
}) {
  const allWeeks: number[] = [];
  for (let week = args.startWeek; week <= args.endWeek; week += 1) {
    allWeeks.push(week);
  }
  if (args.forceRefresh) return allWeeks;

  const { data, error } = await args.supabase
    .from("roto_weekly_team_stats")
    .select("week,updated_at")
    .eq("league_key", args.leagueKey)
    .gte("week", args.startWeek)
    .lte("week", args.endWeek)
    .returns<ExistingWeekRow[]>();
  if (error) {
    throw new Error(`Failed reading weekly canonical stats: ${error.message}`);
  }

  const latestByWeek = new Map<number, string>();
  for (const row of data ?? []) {
    const prev = latestByWeek.get(row.week);
    if (!prev || Date.parse(row.updated_at) > Date.parse(prev)) {
      latestByWeek.set(row.week, row.updated_at);
    }
  }

  const toRefresh: number[] = [];
  for (const week of allWeeks) {
    const updatedAt = latestByWeek.get(week);
    if (!updatedAt) {
      toRefresh.push(week);
      continue;
    }
    if (week === args.currentWeek && !isFreshTimestamp(updatedAt, CURRENT_WEEK_TTL_MS)) {
      toRefresh.push(week);
    }
  }

  return toRefresh;
}

export async function upsertWeeklyTeamStats(args: {
  supabase: SupabaseClient;
  rows: WeeklyTeamStatsUpsert[];
}) {
  if (args.rows.length === 0) return;
  const nowIso = new Date().toISOString();
  const { error } = await args.supabase.from("roto_weekly_team_stats").upsert(
    args.rows.map((row) => ({
      league_key: row.leagueKey,
      week: row.week,
      team_id: row.teamId,
      team_name: row.teamName,
      runs: row.runs,
      hr: row.hr,
      rbi: row.rbi,
      sb: row.sb,
      wins: row.wins,
      sv: row.sv,
      strikeouts: row.strikeouts,
      obp_weighted_sum: row.obpWeightedSum,
      obp_denom_sum: row.obpDenomSum,
      pitching_ip_sum: row.pitchingIpSum,
      era_ip_product_sum: row.eraIpProductSum,
      whip_ip_product_sum: row.whipIpProductSum,
      updated_at: nowIso,
    })),
    { onConflict: "league_key,week,team_id" },
  );
  if (error) {
    throw new Error(`Failed writing weekly canonical stats: ${error.message}`);
  }
}

export async function getWeeklyRangeAggregate(args: {
  supabase: SupabaseClient;
  leagueKey: string;
  startWeek: number;
  endWeek: number;
}) {
  const { data, error } = await args.supabase
    .from("roto_weekly_team_stats")
    .select(
      "team_id,team_name,runs,hr,rbi,sb,wins,sv,strikeouts,obp_weighted_sum,obp_denom_sum,pitching_ip_sum,era_ip_product_sum,whip_ip_product_sum",
    )
    .eq("league_key", args.leagueKey)
    .gte("week", args.startWeek)
    .lte("week", args.endWeek)
    .returns<WeeklyAggregateRow[]>();

  if (error) {
    throw new Error(`Failed reading weekly aggregate rows: ${error.message}`);
  }

  return data ?? [];
}

export async function upsertRotoRangeCache(args: {
  supabase: SupabaseClient;
  payload: RotoSuccessPayload;
  source?: string;
  currentWeek: number;
}) {
  const { error } = await args.supabase.from("roto_range_cache").upsert(
    {
      league_key: args.payload.leagueKey,
      start_week: args.payload.filters.startWeek,
      end_week: args.payload.filters.endWeek,
      is_current_range: args.payload.filters.endWeek === args.currentWeek,
      payload: args.payload,
      computed_at: new Date().toISOString(),
      source: args.source ?? "yahoo-live",
    },
    { onConflict: "league_key,start_week,end_week" },
  );

  if (error) {
    throw new Error(`Failed writing roto cache: ${error.message}`);
  }
}

export async function upsertLeagueTeams(args: {
  supabase: SupabaseClient;
  teams: LeagueTeamUpsert[];
}) {
  if (args.teams.length === 0) return;
  const { error } = await args.supabase.from("league_teams").upsert(
    args.teams.map((team) => ({
      league_key: team.leagueKey,
      team_id: team.teamId,
      team_name: team.teamName,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "league_key,team_id" },
  );

  if (error) {
    throw new Error(`Failed upserting league teams: ${error.message}`);
  }
}
