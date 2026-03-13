import {
  BudgetConfidence,
  FundingStatus,
  MothershipFundingModel,
  MothershipFundingSnapshot
} from "@/lib/types";
import { roundCurrency } from "@/lib/utils";

const DEFAULT_TARGET_SHARE_PRICE = 201;
const LEGACY_LOW_BUDGET_MULTIPLIER = 0.9;
const LEGACY_STRETCH_BUDGET_MULTIPLIER = 1.1;

export function deriveLegacyBudgetSeed(projectedPot: number, syndicateCount: number) {
  return roundCurrency(projectedPot / Math.max(1, syndicateCount));
}

export function buildDefaultMothershipFunding(seedBudget: number): MothershipFundingModel {
  return {
    targetSharePrice: DEFAULT_TARGET_SHARE_PRICE,
    allowHalfShares: true,
    fullSharesSold: 0,
    halfSharesSold: 0,
    budgetLow: roundCurrency(seedBudget * LEGACY_LOW_BUDGET_MULTIPLIER),
    budgetBase: roundCurrency(seedBudget),
    budgetStretch: roundCurrency(seedBudget * LEGACY_STRETCH_BUDGET_MULTIPLIER)
  };
}

export function normalizeMothershipFunding(
  funding: Partial<MothershipFundingModel> | undefined,
  seedBudget: number
): MothershipFundingModel {
  const defaults = buildDefaultMothershipFunding(seedBudget);
  const budgetBase =
    typeof funding?.budgetBase === "number" && Number.isFinite(funding.budgetBase)
      ? roundCurrency(Math.max(0, funding.budgetBase))
      : defaults.budgetBase;
  const budgetLow =
    typeof funding?.budgetLow === "number" && Number.isFinite(funding.budgetLow)
      ? roundCurrency(Math.max(0, Math.min(funding.budgetLow, budgetBase)))
      : defaults.budgetLow;
  const budgetStretch =
    typeof funding?.budgetStretch === "number" && Number.isFinite(funding.budgetStretch)
      ? roundCurrency(Math.max(budgetBase, funding.budgetStretch))
      : defaults.budgetStretch;

  return {
    targetSharePrice:
      typeof funding?.targetSharePrice === "number" && Number.isFinite(funding.targetSharePrice)
        ? roundCurrency(Math.max(1, funding.targetSharePrice))
        : defaults.targetSharePrice,
    allowHalfShares: funding?.allowHalfShares ?? defaults.allowHalfShares,
    fullSharesSold:
      typeof funding?.fullSharesSold === "number" && Number.isFinite(funding.fullSharesSold)
        ? Math.max(0, Math.round(funding.fullSharesSold))
        : defaults.fullSharesSold,
    halfSharesSold:
      typeof funding?.halfSharesSold === "number" && Number.isFinite(funding.halfSharesSold)
        ? Math.max(0, Math.round(funding.halfSharesSold))
        : defaults.halfSharesSold,
    budgetLow,
    budgetBase,
    budgetStretch
  };
}

export function normalizeSyndicateEstimate(
  value: {
    estimatedBudget?: number | null;
    budgetConfidence?: BudgetConfidence | null;
    budgetNotes?: string | null;
  },
  seedBudget: number
): {
  estimatedBudget: number;
  budgetConfidence: BudgetConfidence;
  budgetNotes: string;
} {
  return {
    estimatedBudget:
      typeof value.estimatedBudget === "number" && Number.isFinite(value.estimatedBudget)
        ? roundCurrency(Math.max(0, value.estimatedBudget))
        : roundCurrency(seedBudget),
    budgetConfidence:
      value.budgetConfidence === "low" ||
      value.budgetConfidence === "medium" ||
      value.budgetConfidence === "high"
        ? value.budgetConfidence
        : ("medium" as const),
    budgetNotes: (value.budgetNotes ?? "").trim()
  };
}

export function deriveEquivalentShares(funding: Pick<MothershipFundingModel, "fullSharesSold" | "halfSharesSold" | "allowHalfShares">) {
  return funding.fullSharesSold + (funding.allowHalfShares ? funding.halfSharesSold * 0.5 : 0);
}

export function deriveMothershipFundingSnapshot(
  funding: MothershipFundingModel,
  spend: number
): MothershipFundingSnapshot {
  const equivalentShares = deriveEquivalentShares(funding);
  return {
    ...funding,
    equivalentShares,
    committedCash: roundCurrency(equivalentShares * funding.targetSharePrice),
    impliedSharePrice: equivalentShares > 0 ? roundCurrency(spend / equivalentShares) : null,
    lowBidRoom: roundCurrency(funding.budgetLow - spend),
    baseBidRoom: roundCurrency(funding.budgetBase - spend),
    stretchBidRoom: roundCurrency(funding.budgetStretch - spend)
  };
}

export function deriveBudgetHeadroom(budget: number, spend: number, pendingBid = 0) {
  return roundCurrency(budget - spend - pendingBid);
}

export function deriveFundingStatus(
  spend: number,
  funding: Pick<MothershipFundingModel, "budgetBase" | "budgetStretch">
): FundingStatus {
  if (spend <= funding.budgetBase) {
    return "safe";
  }

  if (spend <= funding.budgetStretch) {
    return "stretch";
  }

  return "above-plan";
}

export function deriveSyndicateEstimateState(estimatedBudget: number, spend: number) {
  const estimatedRemainingBudget = roundCurrency(estimatedBudget - spend);
  return {
    estimatedRemainingBudget,
    estimateExceeded: spend > estimatedBudget
  };
}
