const brandedSyndicatePalette = [
  "#c8ff62",
  "#78e3ff",
  "#4fd8b8",
  "#8bb8ff",
  "#ffd166",
  "#ff9d7a",
  "#9cf0a7",
  "#6cc5ff"
] as const;

export function getSyndicateBrandColor(name: string) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return brandedSyndicatePalette[0];
  }

  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }

  return brandedSyndicatePalette[hash % brandedSyndicatePalette.length];
}
