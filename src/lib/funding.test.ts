import {
  buildDefaultMothershipFunding,
  deriveMothershipFundingSnapshot,
  deriveSyndicateEstimateState,
  normalizeMothershipFunding,
  normalizeSyndicateEstimate
} from "@/lib/funding";

describe("funding helpers", () => {
  it("seeds default Mothership funding from a legacy equal split", () => {
    const funding = buildDefaultMothershipFunding(50000);

    expect(funding.targetSharePrice).toBe(201);
    expect(funding.budgetLow).toBe(45000);
    expect(funding.budgetBase).toBe(50000);
    expect(funding.budgetStretch).toBe(55000);
  });

  it("derives equivalent shares and effective share price", () => {
    const snapshot = deriveMothershipFundingSnapshot(
      {
        targetSharePrice: 201,
        allowHalfShares: true,
        fullSharesSold: 100,
        halfSharesSold: 6,
        budgetLow: 18000,
        budgetBase: 22000,
        budgetStretch: 26000
      },
      20600
    );

    expect(snapshot.equivalentShares).toBe(103);
    expect(snapshot.committedCash).toBe(20703);
    expect(snapshot.impliedSharePrice).toBe(200);
    expect(snapshot.baseBidRoom).toBe(1400);
  });

  it("flags competitor estimates when spend moves past the estimate", () => {
    expect(deriveSyndicateEstimateState(18000, 18100)).toEqual({
      estimatedRemainingBudget: -100,
      estimateExceeded: true
    });
  });

  it("falls back to the legacy seed when no syndicate estimate is stored yet", () => {
    expect(
      normalizeSyndicateEstimate(
        {
          estimatedBudget: null,
          budgetConfidence: null,
          budgetNotes: null
        },
        25000
      )
    ).toEqual({
      estimatedBudget: 25000,
      budgetConfidence: "medium",
      budgetNotes: ""
    });
  });

  it("clamps out-of-order funding inputs back into a valid range", () => {
    const normalized = normalizeMothershipFunding(
      {
        budgetLow: 60000,
        budgetBase: 50000,
        budgetStretch: 45000
      },
      50000
    );

    expect(normalized.budgetLow).toBe(50000);
    expect(normalized.budgetBase).toBe(50000);
    expect(normalized.budgetStretch).toBe(50000);
  });
});
