import { PayoutRules, Stage } from "@/lib/types";
import { roundCurrency } from "@/lib/utils";

const payoutStageOrder: Stage[] = [
  "roundOf64",
  "roundOf32",
  "sweet16",
  "elite8",
  "finalFour",
  "champion"
];

export function getCumulativeStagePayouts(payoutRules: PayoutRules) {
  let runningPayout = 0;

  return payoutStageOrder.map((stage) => {
    runningPayout += payoutRules.projectedPot * (payoutRules[stage] / 100);
    return {
      stage,
      payout: roundCurrency(runningPayout)
    };
  });
}

export function getBreakEvenStage(
  currentBid: number,
  payoutRules: PayoutRules
): Stage | "negativeReturn" {
  const normalizedBid = Math.max(0, roundCurrency(currentBid));
  const match = getCumulativeStagePayouts(payoutRules).find(
    ({ payout }) => payout >= normalizedBid
  );

  return match?.stage ?? "negativeReturn";
}
