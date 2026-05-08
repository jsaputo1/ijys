import { Redis } from "@upstash/redis";

import type { RotoSuccessPayload } from "@/lib/yahoo/roto/payload";
import { isRotoSuccessPayload } from "@/lib/yahoo/roto/payload";

const KV_KEY_PREFIX = "roto:v1";
const KV_CURRENT_RANGE_TTL_SECONDS = 5 * 60;
const KV_HISTORICAL_RANGE_TTL_SECONDS = 60 * 60;

function isKvConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getRedisClient() {
  if (!isKvConfigured()) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export function getRotoKvKey(args: { leagueKey: string; startWeek: number; endWeek: number }) {
  return `${KV_KEY_PREFIX}:${args.leagueKey}:${args.startWeek}:${args.endWeek}`;
}

export async function getRotoFromKv(args: {
  leagueKey: string;
  startWeek: number;
  endWeek: number;
}) {
  const redis = getRedisClient();
  if (!redis) return null;
  const key = getRotoKvKey(args);
  const payload = await redis.get<unknown>(key);
  if (!isRotoSuccessPayload(payload)) return null;
  return payload;
}

export async function setRotoInKv(args: {
  payload: RotoSuccessPayload;
  currentWeek: number;
}) {
  const redis = getRedisClient();
  if (!redis) return;
  const key = getRotoKvKey({
    leagueKey: args.payload.leagueKey,
    startWeek: args.payload.filters.startWeek,
    endWeek: args.payload.filters.endWeek,
  });
  const isCurrentRange = args.payload.filters.endWeek === args.currentWeek;
  const ttlSeconds = isCurrentRange
    ? KV_CURRENT_RANGE_TTL_SECONDS
    : KV_HISTORICAL_RANGE_TTL_SECONDS;

  await redis.set(key, args.payload, { ex: ttlSeconds });
}

export async function deleteRotoInKv(args: {
  leagueKey: string;
  startWeek: number;
  endWeek: number;
}) {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.del(getRotoKvKey(args));
}
