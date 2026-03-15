import { cn, formatCurrency, titleCaseStage } from "@/lib/utils";
import { AuctionAsset, Stage, TeamProjection } from "@/lib/types";

export function MetricCard({
  label,
  value,
  tooltip,
  compact = false,
  longValue = false
}: {
  label: string;
  value: string;
  tooltip?: string;
  compact?: boolean;
  longValue?: boolean;
}) {
  return (
    <div
      className={cn(
        "metric-card",
        compact && "metric-card--compact",
        longValue && "metric-card--long-value"
      )}
    >
      <span className={tooltip ? "insight-label" : undefined}>
        {label}
        {tooltip ? (
          <button type="button" className="tooltip-hint" aria-label={`${label} explanation`}>
            ?
            <span className="tooltip-content">{tooltip}</span>
          </button>
        ) : null}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

export function formatBreakEvenStage(stage: Stage | "negativeReturn" | null) {
  if (stage === null) {
    return "--";
  }

  if (stage === "negativeReturn") {
    return "Negative return";
  }

  return titleCaseStage(stage);
}

export function formatAssetSeed(asset: AuctionAsset) {
  if (asset.seedRange) {
    return `${asset.seedRange[0]}-${asset.seedRange[1]}`;
  }

  if (asset.seed !== null) {
    return `${asset.seed}`;
  }

  return "--";
}

export function formatAssetSubtitle(asset: AuctionAsset, nominatedTeam: TeamProjection | null) {
  if (asset.type === "single_team") {
    if (nominatedTeam) {
      return `${nominatedTeam.seed}-seed, ${nominatedTeam.region} region`;
    }

    return `${formatAssetSeed(asset)}-seed, ${asset.region} region`;
  }

  if (asset.type === "play_in_slot") {
    const matchup = asset.members.map((member) => member.label).join(" / ");
    return `${formatAssetSeed(asset)}-seed play-in slot in the ${asset.region} region: ${matchup}`;
  }

  if (asset.type === "seed_bundle" && asset.seedRange) {
    return "";
  }

  return `${asset.region} auction team`;
}

export function formatAssetMembers(asset: AuctionAsset) {
  if (asset.type === "single_team") {
    return asset.members[0]?.label ?? asset.label;
  }

  if (asset.type === "play_in_slot") {
    return `Includes ${asset.members.map((member) => member.label).join(" and ")}`;
  }

  return `Includes ${asset.members.map((member) => member.label).join(", ")}`;
}

export function formatAssetMembersCompact(
  asset: AuctionAsset,
  options?: { includeParens?: boolean }
) {
  const includeParens = options?.includeParens ?? true;
  if (asset.type === "single_team") {
    return asset.members[0]?.label ?? asset.label;
  }

  if (asset.type === "play_in_slot") {
    const value = asset.members.map((member) => member.label).join(" / ");
    return includeParens ? `(${value})` : value;
  }

  const value = asset.members.map((member) => `${member.seed} ${member.label}`).join(" • ");
  return includeParens ? `(${value})` : value;
}

export function displayNullableNumber(value: number | null) {
  if (value === null || value === undefined) {
    return "--";
  }

  return `${value}`;
}

export function displayNullablePercent(value: number | null) {
  if (value === null || value === undefined) {
    return "--";
  }

  return `${value.toFixed(1)}%`;
}

export function formatAssetSalePrice(value: number) {
  return formatCurrency(value);
}
