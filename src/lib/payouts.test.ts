import { getDefaultPayoutRules } from "@/lib/sample-data";
import { getBreakEvenStage, getCumulativeStagePayouts } from "@/lib/payouts";

describe("payout helpers", () => {
  it("breaks even in the round of 64 when the current bid is below the first payout step", () => {
    const payoutRules = getDefaultPayoutRules();

    expect(getBreakEvenStage(1000, payoutRules)).toBe("roundOf64");
  });

  it("breaks even in the sweet 16 when earlier cumulative stages do not cover the bid", () => {
    const payoutRules = getDefaultPayoutRules();

    expect(getBreakEvenStage(9000, payoutRules)).toBe("sweet16");
  });

  it("breaks even only at champion when the bid is near the full cumulative payout", () => {
    const payoutRules = getDefaultPayoutRules();
    const cumulativeChampionPayout =
      getCumulativeStagePayouts(payoutRules).find(({ stage }) => stage === "champion")?.payout ?? 0;

    expect(getBreakEvenStage(cumulativeChampionPayout, payoutRules)).toBe("champion");
  });

  it("returns negative return when even the champion payout does not cover the bid", () => {
    const payoutRules = getDefaultPayoutRules();
    const cumulativeChampionPayout =
      getCumulativeStagePayouts(payoutRules).find(({ stage }) => stage === "champion")?.payout ?? 0;

    expect(getBreakEvenStage(cumulativeChampionPayout + 1, payoutRules)).toBe("negativeReturn");
  });

  it("is driven by current bid and payout rules rather than recommendation state", () => {
    const payoutRules = getDefaultPayoutRules();

    expect(getBreakEvenStage(5000, payoutRules)).toBe("roundOf32");
    expect(
      getBreakEvenStage(5000, {
        ...payoutRules,
        projectedPot: 100000
      })
    ).toBe("sweet16");
  });
});
