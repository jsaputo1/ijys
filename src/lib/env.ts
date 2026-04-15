type YahooEnvKey =
  | "YAHOO_CLIENT_ID"
  | "YAHOO_CLIENT_SECRET"
  | "YAHOO_REDIRECT_URI";

function getRequiredEnvVar(key: YahooEnvKey): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getYahooEnv() {
  return {
    clientId: getRequiredEnvVar("YAHOO_CLIENT_ID"),
    clientSecret: getRequiredEnvVar("YAHOO_CLIENT_SECRET"),
    redirectUri: getRequiredEnvVar("YAHOO_REDIRECT_URI"),
    fantasyApiBaseUrl:
      process.env.YAHOO_FANTASY_API_BASE_URL ??
      "https://fantasysports.yahooapis.com/fantasy/v2",
    oauthScope: process.env.YAHOO_OAUTH_SCOPE ?? "fspt-r",
    tokenEndpoint:
      process.env.YAHOO_OAUTH_TOKEN_URL ??
      "https://api.login.yahoo.com/oauth2/get_token",
    authEndpoint:
      process.env.YAHOO_OAUTH_AUTH_URL ??
      "https://api.login.yahoo.com/oauth2/request_auth",
  };
}
