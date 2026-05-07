import { decryptText, encryptText } from "@/lib/security/encryption";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { refreshYahooAccessToken } from "@/lib/yahoo/oauth";

type YahooTokenRow = {
  refresh_token_encrypted: string;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
};

function isAccessTokenStillValid(expiresAt: string | null) {
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return false;
  }

  return expiresAtMs > Date.now() + 60_000;
}

async function getStoredYahooTokens() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("yahoo_auth_tokens")
    .select("refresh_token_encrypted,access_token_encrypted,access_token_expires_at")
    .eq("provider", "yahoo")
    .single<YahooTokenRow>();

  if (error || !data) {
    throw new Error(
      `Yahoo auth token record not found. Reconnect Yahoo first. ${error?.message ?? ""}`.trim(),
    );
  }

  return data;
}

async function persistRefreshedTokens(args: {
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const accessTokenExpiresAt = new Date(
    Date.now() + args.expiresIn * 1000,
  ).toISOString();

  const { error } = await supabase.from("yahoo_auth_tokens").upsert(
    {
      provider: "yahoo",
      refresh_token_encrypted: encryptText(args.refreshToken),
      access_token_encrypted: encryptText(args.accessToken),
      access_token_expires_at: accessTokenExpiresAt,
      token_type: args.tokenType,
      scope: args.scope,
    },
    { onConflict: "provider" },
  );

  if (error) {
    throw new Error(`Failed to persist refreshed Yahoo tokens: ${error.message}`);
  }
}

export async function getValidYahooAccessToken() {
  const row = await getStoredYahooTokens();
  const refreshToken = decryptText(row.refresh_token_encrypted);

  if (row.access_token_encrypted && isAccessTokenStillValid(row.access_token_expires_at)) {
    return decryptText(row.access_token_encrypted);
  }

  const refreshed = await refreshYahooAccessToken(refreshToken);
  const nextRefreshToken = refreshed.refresh_token ?? refreshToken;

  await persistRefreshedTokens({
    refreshToken: nextRefreshToken,
    accessToken: refreshed.access_token,
    expiresIn: refreshed.expires_in,
    tokenType: refreshed.token_type,
    scope: typeof refreshed.x_oauth_scope === "string" ? refreshed.x_oauth_scope : null,
  });

  return refreshed.access_token;
}
