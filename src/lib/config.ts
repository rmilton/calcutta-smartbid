import { StorageBackend } from "@/lib/types";

function isBlank(value: string | undefined) {
  return value === undefined || value.trim() === "";
}

export function getConfiguredStorageBackend(): StorageBackend {
  const rawValue = process.env.CALCUTTA_STORAGE_BACKEND;
  const backend = isBlank(rawValue) ? "local" : rawValue;

  if (backend !== "local" && backend !== "supabase") {
    throw new Error("CALCUTTA_STORAGE_BACKEND must be either 'local' or 'supabase'.");
  }

  if (process.env.VERCEL === "1" && backend !== "supabase") {
    throw new Error(
      "Vercel deployment requires CALCUTTA_STORAGE_BACKEND=supabase. Local file storage is not supported there."
    );
  }

  return backend;
}

export function getRequiredSupabaseServerConfig() {
  const missing: string[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (isBlank(url)) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (isBlank(anonKey)) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (isBlank(serviceRoleKey)) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `Supabase backend requested, but missing environment variable(s): ${missing.join(", ")}.`
    );
  }

  return {
    url: url!,
    anonKey: anonKey!,
    serviceRoleKey: serviceRoleKey!
  };
}

export function getOptionalSupabaseBrowserConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (isBlank(url) || isBlank(anonKey)) {
    return null;
  }

  return {
    url: url!,
    anonKey: anonKey!
  };
}

export function validateRuntimeConfig() {
  const backend = getConfiguredStorageBackend();

  if (backend === "supabase") {
    getRequiredSupabaseServerConfig();
  }
}

export function getConfiguredCsvProjectionFilePath() {
  const rawValue = process.env.SPORTS_PROJECTIONS_CSV_FILE;
  if (isBlank(rawValue)) {
    return null;
  }

  return normalizeEnvPath(rawValue!);
}

export function getConfiguredMothershipSyndicateName() {
  const rawValue = process.env.MOTHERSHIP_SYNDICATE_NAME;

  if (isBlank(rawValue)) {
    return "Mothership";
  }

  return rawValue!.trim();
}

function normalizeEnvPath(rawValue: string) {
  let value = rawValue.trim();

  if (value.startsWith("=")) {
    value = value.slice(1).trim();
  }

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
}
