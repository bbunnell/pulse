import { createClient } from "@supabase/supabase-js";

export function isSupabaseServiceConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function createSupabaseServiceClient() {
  if (!isSupabaseServiceConfigured()) {
    throw new Error("Supabase service environment variables are not configured.");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
