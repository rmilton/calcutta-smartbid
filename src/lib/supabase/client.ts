import { createClient } from "@supabase/supabase-js";
import { getOptionalSupabaseBrowserConfig } from "@/lib/config";

export function createBrowserSupabaseClient() {
  const config = getOptionalSupabaseBrowserConfig();
  if (!config) {
    return null;
  }

  return createClient(config.url, config.anonKey);
}
