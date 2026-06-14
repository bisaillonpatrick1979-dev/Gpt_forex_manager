import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type MemoryStatus = {
  enabled: boolean;
  reason?: string;
};

export function getMemoryStatus(): MemoryStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SERVER_KEY;

  if (!url || !serverKey) {
    return {
      enabled: false,
      reason: "Supabase non configuré. Ajoute NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVER_KEY dans Vercel."
    };
  }

  return { enabled: true };
}

export function getAppUserId() {
  return process.env.APP_USER_ID || "default-user";
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const status = getMemoryStatus();

  if (!status.enabled) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVER_KEY as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}
