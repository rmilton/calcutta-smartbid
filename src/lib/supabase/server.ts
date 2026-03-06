import { createClient } from "@supabase/supabase-js";
import { getRequiredSupabaseServerConfig } from "@/lib/config";

export function createServerSupabaseClient() {
  const { url, serviceRoleKey } = getRequiredSupabaseServerConfig();

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });
}
