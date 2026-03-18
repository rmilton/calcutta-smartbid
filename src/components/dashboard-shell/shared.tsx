import React, { useMemo } from "react";
import { AssetLogo, TeamLogo } from "@/components/team-logo";
import { getBreakEvenStage, getCumulativeStagePayouts } from "@/lib/payouts";
import { cn, formatCurrency, formatPercent, titleCaseStage } from "@/lib/utils";
import {
  AuctionAsset,
  MatchupConflict,
  NateSilverProjection,
  PayoutRules,
  SoldAssetSummary,
  Stage,
  Syndicate,
  TeamProjection
} from "@/lib/types";

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

export function formatBreakEvenReachRound(stage: Stage | "negativeReturn" | null) {
  if (stage === null || stage === "negativeReturn") {
    return formatBreakEvenStage(stage);
  }

  return nateSilverColumns.find((column) => column.payoutStage === stage)?.label ?? formatBreakEvenStage(stage);
}

type NateSilverColumn = {
  key: "roundOf32" | "sweet16" | "elite8" | "finalFour" | "championshipGame" | "champion";
  label: string;
  payoutStage: Stage;
};

const nateSilverColumns: readonly NateSilverColumn[] = [
  {
    key: "roundOf32",
    label: "Round of 32",
    payoutStage: "roundOf64"
  },
  {
    key: "sweet16",
    label: "Sweet 16",
    payoutStage: "roundOf32"
  },
  {
    key: "elite8",
    label: "Elite 8",
    payoutStage: "sweet16"
  },
  {
    key: "finalFour",
    label: "Final Four",
    payoutStage: "elite8"
  },
  {
    key: "championshipGame",
    label: "Championship",
    payoutStage: "finalFour"
  },
  {
    key: "champion",
    label: "Champion",
    payoutStage: "champion"
  }
] as const;

export function NateSilverDecisionBoard({
  nominatedAsset,
  nominatedTeam,
  currentBid,
  breakEvenStage,
  payoutRules,
  projectedPot
}: {
  nominatedAsset: AuctionAsset | null;
  nominatedTeam: TeamProjection | null;
  currentBid: number;
  breakEvenStage: Stage | "negativeReturn" | null;
  payoutRules: PayoutRules;
  projectedPot?: number;
}) {
  const nateSilver = nominatedTeam?.nateSilverProjection ?? null;
  const hasNateSilverProjection = nateSilverColumns.some(
    ({ key }) => getNateSilverProbability(nateSilver, key) !== null
  );
  const effectiveBreakEvenStage =
    breakEvenStage === null
      ? null
      : projectedPot === undefined
      ? breakEvenStage
      : getBreakEvenStage(currentBid, payoutRules, projectedPot);
  const payoutLookup = useMemo(
    () =>
      new Map(
        getCumulativeStagePayouts(payoutRules, projectedPot).map(({ stage, payout }) => [
          stage,
          payout
        ])
      ),
    [payoutRules, projectedPot]
  );
  const breakEvenLabel =
    effectiveBreakEvenStage === null
      ? "Awaiting bid"
      : effectiveBreakEvenStage === "negativeReturn"
        ? "Above modeled return"
        : `Needs ${formatBreakEvenReachRound(effectiveBreakEvenStage)}`;
  const isSingleTeamAsset = nominatedAsset?.type === "single_team";
  const breakEvenCoverageIndex =
    effectiveBreakEvenStage === null || effectiveBreakEvenStage === "negativeReturn"
      ? -1
      : nateSilverColumns.findIndex((column) => column.payoutStage === effectiveBreakEvenStage);

  return (
    <section className="nate-silver-panel">
      <div className="nate-silver-panel__header">
        <div>
          <p className="eyebrow">Nate Silver Path</p>
          <h3>Round return odds against the projected final pot</h3>
        </div>
        <div className="nate-silver-panel__meta">
          <span className="status-pill status-pill--muted">{breakEvenLabel}</span>
        </div>
      </div>

      {!nominatedTeam ? (
        <p className="empty-copy">Select an active team to unlock the Nate Silver round board.</p>
      ) : !isSingleTeamAsset ? (
        <p className="empty-copy">
          Nate Silver round odds are shown for single-team nominations. Bundle and play-in
          packages still use the main recommendation model above.
        </p>
      ) : !hasNateSilverProjection ? (
        <p className="empty-copy">
          Nate Silver round data is not loaded for this team yet. Import analysis data with the
          Nate Silver columns to populate this board.
        </p>
      ) : (
        <>
          <div className="nate-silver-board" aria-label="Nate Silver round reach board">
            {nateSilverColumns.map(({ key, label, payoutStage }, index) => {
              const probability = getNateSilverProbability(nateSilver, key);
              const payoutValue = payoutLookup.get(payoutStage) ?? null;
              const needsDepth = breakEvenCoverageIndex >= 0 && index <= breakEvenCoverageIndex;
              const clearsBid = breakEvenCoverageIndex >= 0 && index >= breakEvenCoverageIndex;

              return (
                <article
                  key={key}
                  className={cn(
                    "nate-silver-board__cell",
                    needsDepth && "nate-silver-board__cell--needs-depth",
                    clearsBid && "nate-silver-board__cell--clears-bid"
                  )}
                >
                  <div className="nate-silver-board__topline">
                    <span className="nate-silver-board__label">{label}</span>
                  </div>
                  <strong className="nate-silver-board__probability">
                    {probability === null ? "--" : formatPercent(probability)}
                  </strong>
                  <div className="nate-silver-board__metric">
                    <span>Payout if reached</span>
                    <strong>{payoutValue === null ? "--" : formatCurrency(payoutValue)}</strong>
                  </div>
                </article>
              );
            })}
          </div>

          <p className="nate-silver-panel__footnote">
            Payout values are aligned to the round that unlocks the payout. Reaching the Round of 32
            triggers the first payout, Sweet 16 triggers the next, and so on.
          </p>
        </>
      )}
    </section>
  );
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

export function getRepresentativeTeamForAsset(
  asset: AuctionAsset,
  teamLookup: Map<string, TeamProjection>
) {
  return teamLookup.get(asset.projectionIds[0] ?? "") ?? null;
}

export function getAssetSummaryText(
  asset: AuctionAsset,
  teamLookup: Map<string, TeamProjection>
) {
  const representativeTeam = getRepresentativeTeamForAsset(asset, teamLookup);
  return (
    formatAssetSubtitle(asset, representativeTeam) ||
    (asset.type === "single_team"
      ? formatAssetMembers(asset)
      : formatAssetMembersCompact(asset, { includeParens: false }))
  );
}

export function getAssetBestSeed(asset: AuctionAsset) {
  const bestSeed = asset.members.reduce(
    (best, member) => Math.min(best, member.seed),
    Number.MAX_SAFE_INTEGER
  );

  return bestSeed === Number.MAX_SAFE_INTEGER ? null : bestSeed;
}

export function AuctionCompleteAssetRow({
  label,
  asset,
  teamLookup,
  detail,
  value,
  valueLabel
}: {
  label: string;
  asset: AuctionAsset;
  teamLookup: Map<string, TeamProjection>;
  detail: string;
  value?: string;
  valueLabel?: string;
}) {
  const subtitle = getAssetSummaryText(asset, teamLookup);

  return (
    <div className="list-row list-row--top-aligned">
      <div className="team-label">
        <AssetLogo asset={asset} teamLookup={teamLookup} size="sm" decorative />
        <div className="team-label__copy">
          <strong>{asset.label}</strong>
          <span>{label}</span>
          <span>{subtitle}</span>
          <span>{detail}</span>
        </div>
      </div>
      {value ? (
        <div className="auction-complete-value">
          {valueLabel ? <span>{valueLabel}</span> : null}
          <strong>{value}</strong>
        </div>
      ) : null}
    </div>
  );
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

export function ConflictRow({
  conflict,
  teamLookup,
  isOwned = false,
  isCritical = false
}: {
  conflict: MatchupConflict;
  teamLookup: Map<string, TeamProjection>;
  isOwned?: boolean;
  isCritical?: boolean;
}) {
  const opponent = teamLookup.get(conflict.opponentId);

  return (
    <div className={cn("list-row", "list-row--top-aligned", isCritical && "list-row--critical")}>
      <div className="team-label">
        <TeamLogo
          teamId={opponent?.id ?? conflict.opponentId}
          teamName={opponent?.name ?? conflict.opponentId}
          size="sm"
          decorative
        />
        <div className="team-label__copy">
          <strong>
            {opponent?.name ?? conflict.opponentId}
            {isOwned ? <span className="list-row__inline-note"> (you own)</span> : null}
          </strong>
          <span>{titleCaseStage(conflict.earliestRound)} window</span>
        </div>
      </div>
      <strong>{formatPercent(conflict.probability)}</strong>
    </div>
  );
}

export function AssetSaleRow({
  sale,
  syndicateLookup,
  teamLookup
}: {
  sale: SoldAssetSummary;
  syndicateLookup: Map<string, Syndicate>;
  teamLookup?: Map<string, TeamProjection>;
}) {
  const buyer = syndicateLookup.get(sale.buyerSyndicateId);

  return (
    <div className="list-row">
      <div className="team-label">
        <AssetLogo asset={sale.asset} teamLookup={teamLookup} size="sm" decorative />
        <div className="team-label__copy">
          <strong>{sale.asset.label}</strong>
          <span>{buyer?.name ?? sale.buyerSyndicateId}</span>
        </div>
      </div>
      <strong>{formatCurrency(sale.price)}</strong>
    </div>
  );
}

function getNateSilverProbability(projection: NateSilverProjection | null, key: NateSilverColumn["key"]) {
  if (!projection) {
    return null;
  }

  switch (key) {
    case "roundOf32":
      return projection.roundOf32;
    case "sweet16":
      return projection.sweet16;
    case "elite8":
      return projection.elite8;
    case "finalFour":
      return projection.finalFour;
    case "championshipGame":
      return projection.championshipGame;
    case "champion":
      return projection.champion;
    default:
      return null;
  }
}
