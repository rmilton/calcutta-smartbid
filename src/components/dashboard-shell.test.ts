import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseRouter,
  mockUseFeedbackMessage,
  mockUseLiveRoomController
} = vi.hoisted(() => ({
  mockUseRouter: vi.fn(),
  mockUseFeedbackMessage: vi.fn(),
  mockUseLiveRoomController: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: mockUseRouter
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    delete imageProps.unoptimized;
    return createElement("img", imageProps);
  }
}));

vi.mock("@/lib/hooks/use-feedback-message", () => ({
  useFeedbackMessage: mockUseFeedbackMessage
}));

vi.mock("@/components/dashboard-shell/use-live-room-controller", () => ({
  useLiveRoomController: mockUseLiveRoomController
}));

vi.mock("@/lib/funding", () => ({
  deriveMothershipFundingSnapshot: () => ({
    baseBidRoom: 0,
    stretchBidRoom: 0,
    impliedSharePrice: null
  })
}));

vi.mock("@/lib/live-room", () => ({
  buildOperatorSyndicateHoldings: () => [],
  buildViewerOwnershipGroups: () => [],
  deriveAuctionMatchups: () => ({
    nominatedMatchup: null,
    likelyRound2Matchup: null,
    hasOwnedRoundOneOpponent: false,
    hasOwnedLikelyRoundTwoOpponent: false
  }),
  filterRecommendationRationale: () => [],
  getFocusOwnedTeams: () => [],
  orderSyndicateBoard: (ledger: unknown) => ledger
}));

vi.mock("@/lib/engine/recommendations", () => ({
  buildBidRecommendation: () => null,
  computeOwnershipExposure: () => ({
    overlapScore: 0,
    concentrationScore: 0,
    likelyConflicts: []
  })
}));

vi.mock("@/lib/payouts", () => ({
  getBreakEvenStage: () => null
}));

vi.mock("@/components/dashboard-shell/operator-auction-workspace", () => ({
  OperatorAuctionWorkspace: () => createElement("div", null, "operator")
}));

vi.mock("@/components/dashboard-shell/viewer-auction-workspace", () => ({
  ViewerAuctionWorkspace: () => createElement("div", null, "viewer")
}));

vi.mock("@/components/session-bracket", () => ({
  SessionBracket: () => createElement("div", null, "bracket")
}));

vi.mock("@/components/team-logo", () => ({
  TeamLogo: ({ teamName }: { teamName: string }) => createElement("span", null, teamName),
  AssetLogo: ({ asset }: { asset: { label: string } }) => createElement("span", null, asset.label)
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => createElement("button", null, "theme")
}));

vi.mock("@/components/team-classification-badge", () => ({
  TeamClassificationBadge: ({ classification }: { classification: string }) =>
    createElement("span", null, classification)
}));

import type {
  AuctionAsset,
  AuctionDashboard,
  AuthenticatedMember,
  SessionAnalysisSnapshot,
  Syndicate,
  TeamProjection
} from "@/lib/types";

function buildTeam(id: string, name: string, seed: number): TeamProjection {
  return {
    id,
    name,
    shortName: name,
    region: "East",
    seed,
    rating: 88.8,
    offense: 120.5,
    defense: 100.7,
    tempo: 68.2,
    source: "test"
  };
}

function buildAsset(team: TeamProjection): AuctionAsset {
  return {
    id: `asset-${team.id}`,
    label: team.name,
    type: "single_team",
    region: team.region,
    seed: team.seed,
    seedRange: null,
    memberTeamIds: [team.id],
    projectionIds: [team.id],
    members: [
      {
        id: team.id,
        type: "team",
        label: team.name,
        region: team.region,
        seed: team.seed,
        regionSlot: `${team.region}-${team.seed}`,
        teamIds: [team.id],
        projectionIds: [team.id],
        unresolved: false
      }
    ],
    unresolved: false
  };
}

function buildSyndicate(): Syndicate {
  return {
    id: "focus",
    name: "Mothership",
    color: "#0f172a",
    spend: 0,
    remainingBankroll: 0,
    estimatedBudget: 10000,
    budgetConfidence: "high",
    budgetNotes: "",
    estimatedRemainingBudget: 10000,
    estimateExceeded: false,
    ownedTeamIds: [],
    portfolioExpectedValue: 0
  };
}

describe("DashboardShell analysis hero", () => {
  beforeEach(() => {
    globalThis.React = React;
    mockUseRouter.mockReturnValue({
      replace: vi.fn(),
      push: vi.fn(),
      refresh: vi.fn()
    });
    mockUseFeedbackMessage.mockReturnValue({
      error: null,
      notice: null,
      clearFeedback: vi.fn(),
      showError: vi.fn(),
      showNotice: vi.fn()
    });
  });

  it("renders the compact analysis hero with round probabilities and without the old header clutter", async () => {
    const { DashboardShell } = await import("@/components/dashboard-shell");
    const team = {
      ...buildTeam("kentucky", "Kentucky", 3),
      nateSilverProjection: {
        seed: "3",
        roundOf64: 1,
        roundOf32: 0.803,
        sweet16: 0.51,
        elite8: 0.275,
        finalFour: 0.144,
        championshipGame: 0.091,
        champion: 0.081
      }
    };
    const asset = buildAsset(team);
    const syndicate = buildSyndicate();
    const analysis = {
      ranking: [
        {
          teamId: team.id,
          teamName: team.name,
          shortName: team.shortName,
          seed: team.seed,
          region: team.region,
          classification: "must-have",
          note: null,
          compositeScore: 0.587,
          percentile: 62,
          scoutingCoverage: 1,
          q1Wins: null,
          q2Wins: null,
          q3Wins: null,
          q4Wins: null,
          rankedWins: null,
          threePointPct: null,
          kenpomRank: null,
          atsRecord: null,
          atsWinPct: null,
          offenseStyle: null,
          defenseStyle: null,
          strengths: [],
          risks: ["Limited scouting data increases uncertainty"]
        }
      ],
      fieldAverages: {
        q1Wins: null,
        q2Wins: null,
        q3Wins: null,
        q4Wins: null,
        rankedWins: null,
        threePointPct: null,
        kenpomRank: null,
        atsWinPct: null
      },
      budgetRows: [
        {
          teamId: team.id,
          teamName: team.name,
          classification: "must-have",
          rank: 25,
          percentile: 62,
          convictionScore: 0.02,
          investableShare: 0.02,
          openingBid: 2241,
          targetBid: 3614,
          maxBid: 5335,
          tier: "core"
        }
      ],
      ownedTeams: [],
      funding: {
        targetSharePrice: 0,
        allowHalfShares: false,
        fullSharesSold: 0,
        halfSharesSold: 0,
        budgetLow: 0,
        budgetBase: 0,
        budgetStretch: 0,
        equivalentShares: 0,
        committedCash: 0,
        impliedSharePrice: null,
        lowBidRoom: 0,
        baseBidRoom: 0,
        stretchBidRoom: 0
      },
      investableCash: 0,
      actualPaidSpend: 0,
      remainingBankroll: 0
    } satisfies SessionAnalysisSnapshot;

    const dashboard = {
      session: {
        id: "session-1",
        name: "Session 1",
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
        archivedAt: null,
        archivedByName: null,
        archivedByEmail: null,
        projections: [team],
        projectionProvider: "test",
        projectionImportedAt: null,
        projectionOverrides: {},
        teamClassifications: {
          [team.id]: {
            teamId: team.id,
            classification: "must-have",
            updatedAt: "2026-03-15T00:00:00.000Z"
          }
        },
        teamNotes: {},
        auctionAssets: [asset],
        liveState: {
          nominatedTeamId: team.id,
          nominatedAssetId: asset.id,
          currentBid: 0,
          soldTeamIds: [],
          soldAssetIds: [],
          lastUpdatedAt: "2026-03-15T00:00:00.000Z"
        },
        payoutRules: {
          roundOf64: 1,
          roundOf32: 1,
          sweet16: 1,
          elite8: 1,
          finalFour: 1,
          champion: 1,
          projectedPot: 100000
        },
        mothershipFunding: {
          targetSharePrice: 0,
          allowHalfShares: false,
          fullSharesSold: 0,
          halfSharesSold: 0,
          budgetLow: 0,
          budgetBase: 0,
          budgetStretch: 0
        },
        simulationSnapshot: {
          id: "sim-1",
          sessionId: "session-1",
          provider: "test",
          iterations: 1000,
          generatedAt: "2026-03-15T00:00:00.000Z",
          teamResults: {
            [team.id]: {
              teamId: team.id,
              roundProbabilities: {
                roundOf64: 1,
                roundOf32: 0.676,
                sweet16: 0.36,
                elite8: 0.174,
                finalFour: 0.077,
                champion: 0.033
              },
              expectedGrossPayout: 8415,
              confidenceBand: [419, 16411],
              likelyConflicts: []
            }
          },
          matchupMatrix: {}
        }
      },
      focusSyndicate: syndicate,
      nominatedAsset: asset,
      nominatedTeam: team,
      availableAssets: [asset],
      soldAssets: [],
      availableTeams: [team],
      soldTeams: [],
      ledger: [syndicate],
      analysis,
      bracket: {
        isSupported: false,
        unsupportedReason: null,
        regions: [],
        finals: []
      },
      recommendation: null,
      lastPurchase: null,
      projectionOverrideCount: 0,
      storageBackend: "local"
    } as unknown as AuctionDashboard;

    mockUseLiveRoomController.mockReturnValue({
      dashboard,
      activeView: "analysis",
      setActiveView: vi.fn(),
      selectedAssetId: asset.id,
      selectedTeamId: team.id,
      currentBid: 0,
      bidInputValue: "",
      parsedBidInputValue: null,
      buyerId: "",
      isUndoingPurchase: false,
      isSavingClassification: false,
      isSavingTeamNote: false,
      isSavingBracket: false,
      overrideForm: {},
      teamNoteInput: "",
      analysisSearch: "",
      analysisTeamId: team.id,
      overrideTeamId: "",
      expandedSyndicateIds: [],
      ownershipSearch: "",
      teamSelectRef: { current: null },
      bidInputRef: { current: null },
      selectedAsset: asset,
      selectedTeam: team,
      overrideSelectedTeam: null,
      selectedOverride: null,
      analysisDetailTeam: team,
      setBuyerId: vi.fn(),
      setOverrideForm: vi.fn(),
      setTeamNoteInput: vi.fn(),
      setAnalysisSearch: vi.fn(),
      setAnalysisTeamId: vi.fn(),
      setOverrideTeamId: vi.fn(),
      setExpandedSyndicateIds: vi.fn(),
      setOwnershipSearch: vi.fn(),
      handleAssetChange: vi.fn(),
      setBidInputValue: vi.fn(),
      handleBidBlur: vi.fn(),
      handleBidKeyDown: vi.fn(),
      recordPurchase: vi.fn(),
      undoPurchase: vi.fn(),
      saveProjectionOverride: vi.fn(),
      clearProjectionOverride: vi.fn(),
      saveTeamClassification: vi.fn(),
      clearTeamClassification: vi.fn(),
      saveTeamNote: vi.fn(),
      clearTeamNote: vi.fn(),
      saveBracketWinner: vi.fn()
    });

    const currentMember = {
      scope: "session",
      sessionId: "session-1",
      memberId: "member-1",
      name: "Operator",
      email: "operator@example.com",
      role: "admin"
    } satisfies AuthenticatedMember;

    const markup = renderToStaticMarkup(
      createElement(DashboardShell, {
        sessionId: "session-1",
        initialDashboard: dashboard,
        initialView: "analysis",
        viewerMode: false,
        currentMember
      })
    );

    expect(markup).toContain("Selected Team");
    expect(markup).toContain("Kentucky");
    expect(markup).toContain("67.6%");
    expect(markup).toContain("Round of 32");
    expect(markup).toContain("Nate Silver projection");
    expect(markup).toContain("80.3%");
    expect(markup).toContain("8.1%");
    expect(markup).toContain("Quick thought on this team");
    expect(markup).toContain("Limited scouting data increases uncertainty");
    expect(markup).not.toContain("Session ranking and bid guidance");
    expect(markup).not.toContain("Base room");
    expect(markup).not.toContain("0/80");
  });

  it("hides the Nate Silver projection row when the selected team has no Nate data", async () => {
    const { DashboardShell } = await import("@/components/dashboard-shell");
    const team = buildTeam("villanova", "Villanova", 8);
    const asset = buildAsset(team);
    const syndicate = buildSyndicate();
    const analysis = {
      ranking: [
        {
          teamId: team.id,
          teamName: team.name,
          shortName: team.shortName,
          seed: team.seed,
          region: team.region,
          classification: null,
          note: null,
          compositeScore: 0.51,
          percentile: 55,
          scoutingCoverage: 1,
          q1Wins: null,
          q2Wins: null,
          q3Wins: null,
          q4Wins: null,
          rankedWins: null,
          threePointPct: null,
          kenpomRank: null,
          atsRecord: null,
          atsWinPct: null,
          offenseStyle: null,
          defenseStyle: null,
          strengths: [],
          risks: []
        }
      ],
      fieldAverages: {
        q1Wins: null,
        q2Wins: null,
        q3Wins: null,
        q4Wins: null,
        rankedWins: null,
        threePointPct: null,
        kenpomRank: null,
        atsWinPct: null
      },
      budgetRows: [],
      ownedTeams: [],
      funding: {
        targetSharePrice: 0,
        allowHalfShares: false,
        fullSharesSold: 0,
        halfSharesSold: 0,
        budgetLow: 0,
        budgetBase: 0,
        budgetStretch: 0,
        equivalentShares: 0,
        committedCash: 0,
        impliedSharePrice: null,
        lowBidRoom: 0,
        baseBidRoom: 0,
        stretchBidRoom: 0
      },
      investableCash: 0,
      actualPaidSpend: 0,
      remainingBankroll: 0
    } satisfies SessionAnalysisSnapshot;

    const dashboard = {
      session: {
        id: "session-2",
        name: "Session 2",
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
        archivedAt: null,
        archivedByName: null,
        archivedByEmail: null,
        projections: [team],
        projectionProvider: "test",
        projectionImportedAt: null,
        projectionOverrides: {},
        teamClassifications: {},
        teamNotes: {},
        auctionAssets: [asset],
        liveState: {
          nominatedTeamId: team.id,
          nominatedAssetId: asset.id,
          currentBid: 0,
          soldTeamIds: [],
          soldAssetIds: [],
          lastUpdatedAt: "2026-03-15T00:00:00.000Z"
        },
        payoutRules: {
          roundOf64: 1,
          roundOf32: 1,
          sweet16: 1,
          elite8: 1,
          finalFour: 1,
          champion: 1,
          projectedPot: 100000
        },
        mothershipFunding: {
          targetSharePrice: 0,
          allowHalfShares: false,
          fullSharesSold: 0,
          halfSharesSold: 0,
          budgetLow: 0,
          budgetBase: 0,
          budgetStretch: 0
        },
        simulationSnapshot: {
          id: "sim-2",
          sessionId: "session-2",
          provider: "test",
          iterations: 1000,
          generatedAt: "2026-03-15T00:00:00.000Z",
          teamResults: {
            [team.id]: {
              teamId: team.id,
              roundProbabilities: {
                roundOf64: 1,
                roundOf32: 0.4,
                sweet16: 0.18,
                elite8: 0.07,
                finalFour: 0.03,
                champion: 0.01
              },
              expectedGrossPayout: 2500,
              confidenceBand: [0, 6000],
              likelyConflicts: []
            }
          },
          matchupMatrix: {}
        }
      },
      focusSyndicate: syndicate,
      nominatedAsset: asset,
      nominatedTeam: team,
      availableAssets: [asset],
      soldAssets: [],
      availableTeams: [team],
      soldTeams: [],
      ledger: [syndicate],
      analysis,
      bracket: {
        isSupported: false,
        unsupportedReason: null,
        regions: [],
        finals: []
      },
      recommendation: null,
      lastPurchase: null,
      projectionOverrideCount: 0,
      storageBackend: "local"
    } as unknown as AuctionDashboard;

    mockUseLiveRoomController.mockReturnValue({
      dashboard,
      activeView: "analysis",
      setActiveView: vi.fn(),
      selectedAssetId: asset.id,
      selectedTeamId: team.id,
      currentBid: 0,
      bidInputValue: "",
      parsedBidInputValue: null,
      buyerId: "",
      isUndoingPurchase: false,
      isSavingClassification: false,
      isSavingTeamNote: false,
      isSavingBracket: false,
      overrideForm: {},
      teamNoteInput: "",
      analysisSearch: "",
      analysisTeamId: team.id,
      overrideTeamId: "",
      expandedSyndicateIds: [],
      ownershipSearch: "",
      teamSelectRef: { current: null },
      bidInputRef: { current: null },
      selectedAsset: asset,
      selectedTeam: team,
      overrideSelectedTeam: null,
      selectedOverride: null,
      analysisDetailTeam: team,
      setBuyerId: vi.fn(),
      setOverrideForm: vi.fn(),
      setTeamNoteInput: vi.fn(),
      setAnalysisSearch: vi.fn(),
      setAnalysisTeamId: vi.fn(),
      setOverrideTeamId: vi.fn(),
      setExpandedSyndicateIds: vi.fn(),
      setOwnershipSearch: vi.fn(),
      handleAssetChange: vi.fn(),
      setBidInputValue: vi.fn(),
      handleBidBlur: vi.fn(),
      handleBidKeyDown: vi.fn(),
      recordPurchase: vi.fn(),
      undoPurchase: vi.fn(),
      saveProjectionOverride: vi.fn(),
      clearProjectionOverride: vi.fn(),
      saveTeamClassification: vi.fn(),
      clearTeamClassification: vi.fn(),
      saveTeamNote: vi.fn(),
      clearTeamNote: vi.fn(),
      saveBracketWinner: vi.fn()
    });

    const currentMember = {
      scope: "session",
      sessionId: "session-2",
      memberId: "member-2",
      name: "Operator",
      email: "operator@example.com",
      role: "admin"
    } satisfies AuthenticatedMember;

    const markup = renderToStaticMarkup(
      createElement(DashboardShell, {
        sessionId: "session-2",
        initialDashboard: dashboard,
        initialView: "analysis",
        viewerMode: false,
        currentMember
      })
    );

    expect(markup).not.toContain("Nate Silver projection");
  });
});
