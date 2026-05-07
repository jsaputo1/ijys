import { createClient } from "@supabase/supabase-js";

function getRequiredEnvValue(key: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getSupabaseServerClient() {
  const supabaseUrl = getRequiredEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
