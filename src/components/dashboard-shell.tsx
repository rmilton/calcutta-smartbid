"use client";

import Image from "next/image";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deriveMothershipFundingSnapshot } from "@/lib/funding";
import { useFeedbackMessage } from "@/lib/hooks/use-feedback-message";
import {
  buildOperatorSyndicateHoldings,
  buildViewerOwnershipGroups,
  deriveAuctionMatchups,
  filterRecommendationRationale,
  getFocusOwnedTeams,
  orderSyndicateBoard
} from "@/lib/live-room";
import { buildBidRecommendation, computeOwnershipExposure } from "@/lib/engine/recommendations";
import { getBreakEvenStage } from "@/lib/payouts";
import {
  AuctionAsset,
  AuctionDashboard,
  AuthenticatedMember,
  BidRecommendation,
  ProjectionOverride,
  TeamClassificationValue,
  TeamProjection
} from "@/lib/types";
import { TEAM_CLASSIFICATION_ORDER, getTeamClassificationMeta } from "@/lib/team-classifications";
import { cn, formatCurrency, formatPercent, titleCaseStage } from "@/lib/utils";
import { OperatorAuctionWorkspace } from "@/components/dashboard-shell/operator-auction-workspace";
import {
  displayNullableNumber,
  displayNullablePercent,
  formatBreakEvenStage,
  formatAssetMembersCompact
} from "@/components/dashboard-shell/shared";
import {
  useLiveRoomController,
  WorkspaceView
} from "@/components/dashboard-shell/use-live-room-controller";
import { ViewerAuctionWorkspace } from "@/components/dashboard-shell/viewer-auction-workspace";
import { SessionBracket } from "@/components/session-bracket";
import { AssetLogo, TeamLogo } from "@/components/team-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { TeamClassificationBadge } from "@/components/team-classification-badge";

interface DashboardShellProps {
  sessionId: string;
  initialDashboard: AuctionDashboard;
  initialView?: WorkspaceView;
  viewerMode: boolean;
  currentMember: AuthenticatedMember;
}

interface ActiveOverrideRow {
  override: ProjectionOverride;
  team: TeamProjection;
}

interface AnalysisAssetTableRow {
  asset: AuctionAsset;
  rank: number;
  representativeTeamId: string;
  representativeTeamName: string;
  representativeRow: AuctionDashboard["analysis"]["ranking"][number];
  classification: TeamClassificationValue | null;
  compositeScore: number;
  targetBid: number | null;
  maxBid: number | null;
  status: "Owned" | "Sold" | "Available";
  memberSummary: string | null;
  searchText: string;
}

const viewLabels: Record<WorkspaceView, string> = {
  auction: "Auction",
  analysis: "Analysis",
  bracket: "Bracket",
  overrides: "Overrides"
};

const viewerViews: WorkspaceView[] = ["auction", "bracket"];
const editorViews: WorkspaceView[] = ["auction", "analysis", "bracket", "overrides"];

const stoplightLabels: Record<BidRecommendation["stoplight"], string> = {
  buy: "Keep bidding",
  caution: "Stay disciplined",
  pass: "Pass"
};

const analysisRoundLadder = [
  { stage: "roundOf32", shortLabel: "R32", label: "Round of 32" },
  { stage: "sweet16", shortLabel: "S16", label: "Sweet 16" },
  { stage: "elite8", shortLabel: "E8", label: "Elite 8" },
  { stage: "finalFour", shortLabel: "F4", label: "Final Four" },
  { stage: "champion", shortLabel: "Champ", label: "Champion" }
] as const;

function getRoleLabel(role: AuthenticatedMember["role"], scope: AuthenticatedMember["scope"]) {
  if (scope === "platform" && role === "admin") {
    return "Platform admin";
  }

  return role === "admin" ? "Operator" : "Viewer";
}

function getWorkspacePath(sessionId: string, view: WorkspaceView) {
  return (
    view === "auction" ? `/session/${sessionId}` : `/session/${sessionId}?view=${view}`
  ) as Route;
}

export function DashboardShell({
  sessionId,
  initialDashboard,
  initialView = "auction",
  viewerMode,
  currentMember
}: DashboardShellProps) {
  const router = useRouter();
  const [isAnalysisNoteFocused, setIsAnalysisNoteFocused] = useState(false);
  const availableViews = viewerMode ? viewerViews : editorViews;
  const { error, notice, clearFeedback, showError, showNotice } = useFeedbackMessage();
  const controller = useLiveRoomController({
    sessionId,
    initialDashboard,
    initialView,
    availableViews,
    viewerMode,
    clearFeedback,
    showError,
    showNotice
  });
  const {
    dashboard,
    activeView,
    setActiveView,
    selectedAssetId,
    selectedTeamId,
    currentBid,
    bidInputValue,
    parsedBidInputValue,
    buyerId,
    isUndoingPurchase,
    isSavingClassification,
    isSavingTeamNote,
    isSavingBracket,
    overrideForm,
    teamNoteInput,
    analysisSearch,
    analysisTeamId,
    overrideTeamId,
    expandedSyndicateIds,
    ownershipSearch,
    teamSelectRef,
    bidInputRef,
    selectedAsset,
    selectedTeam,
    overrideSelectedTeam,
    selectedOverride,
    analysisDetailTeam,
    setBuyerId,
    setOverrideForm,
    setTeamNoteInput,
    setAnalysisSearch,
    setAnalysisTeamId,
    setOverrideTeamId,
    setExpandedSyndicateIds,
    setOwnershipSearch,
    handleAssetChange,
    setBidInputValue,
    handleBidBlur,
    handleBidKeyDown,
    recordPurchase,
    undoPurchase,
    saveProjectionOverride,
    clearProjectionOverride,
    saveTeamClassification,
    clearTeamClassification,
    saveTeamNote,
    clearTeamNote,
    saveBracketWinner
  } = controller;

  const sendPresenceHeartbeat = useCallback(async () => {
    if (currentMember.scope !== "session" || document.visibilityState !== "visible") {
      return;
    }

    await fetch(`/api/sessions/${sessionId}/presence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        currentView: activeView
      })
    });
  }, [activeView, currentMember.scope, sessionId]);

  useEffect(() => {
    if (currentMember.scope !== "session") {
      return;
    }

    void sendPresenceHeartbeat();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void sendPresenceHeartbeat();
      }
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void sendPresenceHeartbeat();
      }
    }, 60_000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentMember.scope, sendPresenceHeartbeat]);

  const snapshot = dashboard.session.simulationSnapshot;
  const liveSession = useMemo(
    () => ({
      ...dashboard.session,
      liveState: {
        ...dashboard.session.liveState,
        nominatedAssetId: selectedAssetId || null,
        nominatedTeamId: selectedTeamId || null,
        currentBid
      }
    }),
    [currentBid, dashboard.session, selectedAssetId, selectedTeamId]
  );
  const recommendation = useMemo(
    () =>
      buildBidRecommendation(
        liveSession,
        selectedTeam,
        dashboard.focusSyndicate,
        dashboard.analysis,
        selectedAsset
      ),
    [dashboard.analysis, dashboard.focusSyndicate, liveSession, selectedAsset, selectedTeam]
  );
  const ownershipConflicts = useMemo(
    () =>
      computeOwnershipExposure(
        liveSession,
        selectedAsset?.projectionIds ?? (selectedTeam ? [selectedTeam.id] : []),
        dashboard.focusSyndicate
      ).likelyConflicts,
    [dashboard.focusSyndicate, liveSession, selectedAsset, selectedTeam]
  );
  const teamLookup = useMemo(
    () => new Map(dashboard.session.projections.map((team) => [team.id, team])),
    [dashboard.session.projections]
  );
  const syndicateLookup = useMemo(
    () => new Map(dashboard.ledger.map((syndicate) => [syndicate.id, syndicate])),
    [dashboard.ledger]
  );
  const orderedSyndicateBoard = useMemo(
    () => orderSyndicateBoard(dashboard.ledger, dashboard.focusSyndicate.id),
    [dashboard.focusSyndicate.id, dashboard.ledger]
  );
  const analysisDetailAssetLookup = useMemo(() => {
    const lookup = new Map<string, AuctionAsset>();
    for (const asset of dashboard.session.auctionAssets ?? []) {
      for (const projectionId of asset.projectionIds) {
        lookup.set(projectionId, asset);
      }
    }
    return lookup;
  }, [dashboard.session.auctionAssets]);
  const analysisDetailAsset = analysisTeamId
    ? analysisDetailAssetLookup.get(analysisTeamId) ?? null
    : null;
  const analysisRow =
    dashboard.analysis.ranking.find((row) => row.teamId === analysisTeamId) ?? null;
  const analysisBudgetLookup = useMemo(
    () => new Map(dashboard.analysis.budgetRows.map((row) => [row.teamId, row])),
    [dashboard.analysis.budgetRows]
  );
  const analysisBudgetRow = analysisTeamId
    ? analysisBudgetLookup.get(analysisTeamId) ?? null
    : null;
  const analysisAssetBudget = useMemo(() => {
    if (!analysisDetailAsset) {
      return null;
    }

    const matchingRows = dashboard.analysis.budgetRows.filter((row) =>
      analysisDetailAsset.projectionIds.includes(row.teamId)
    );
    if (!matchingRows.length) {
      return null;
    }

    return {
      openingBid: matchingRows.reduce((total, row) => total + row.openingBid, 0),
      targetBid: matchingRows.reduce((total, row) => total + row.targetBid, 0),
      maxBid: matchingRows.reduce((total, row) => total + row.maxBid, 0)
    };
  }, [analysisDetailAsset, dashboard.analysis.budgetRows]);
  const analysisTeamClassification = analysisRow?.classification ?? null;
  const analysisTeamNote = analysisRow?.note ?? null;
  const trimmedTeamNoteInput = teamNoteInput.trim();
  const teamNoteIsDirty = trimmedTeamNoteInput !== (analysisTeamNote ?? "");
  const showAnalysisNoteCounter =
    isAnalysisNoteFocused || teamNoteInput.length > 0 || Boolean(analysisTeamNote);
  const focusOwnedTeams = useMemo(() => getFocusOwnedTeams(dashboard), [dashboard]);
  const operatorSyndicateHoldings = useMemo(
    () => buildOperatorSyndicateHoldings(dashboard.soldAssets, orderedSyndicateBoard),
    [dashboard.soldAssets, orderedSyndicateBoard]
  );
  const recentSales = useMemo(
    () => [...dashboard.soldAssets].slice(-4).reverse(),
    [dashboard.soldAssets]
  );
  const lastPurchaseTeam = dashboard.lastPurchase
    ? teamLookup.get(
        dashboard.lastPurchase.projectionIds?.find((teamId) => teamLookup.has(teamId)) ??
          dashboard.lastPurchase.teamId
      ) ?? null
    : null;
  const lastPurchaseBuyer = dashboard.lastPurchase
    ? syndicateLookup.get(dashboard.lastPurchase.buyerSyndicateId) ?? null
    : null;
  const soldAssetLookup = useMemo(
    () => new Map(dashboard.soldAssets.map((entry) => [entry.asset.id, entry])),
    [dashboard.soldAssets]
  );
  const analysisRankIndexLookup = useMemo(
    () => new Map(dashboard.analysis.ranking.map((row, index) => [row.teamId, index])),
    [dashboard.analysis.ranking]
  );
  const analysisAssetRows = useMemo<AnalysisAssetTableRow[]>(() => {
    const rows = (dashboard.session.auctionAssets ?? [])
      .map((asset) => {
        const memberRows = dashboard.analysis.ranking.filter((row) =>
          asset.projectionIds.includes(row.teamId)
        );
        const representativeRow =
          [...memberRows].sort(
            (left, right) =>
              (analysisRankIndexLookup.get(left.teamId) ?? Number.MAX_SAFE_INTEGER) -
              (analysisRankIndexLookup.get(right.teamId) ?? Number.MAX_SAFE_INTEGER)
          )[0] ?? null;
        if (!representativeRow) {
          return null;
        }

        const memberBudgetRows = dashboard.analysis.budgetRows.filter((row) =>
          asset.projectionIds.includes(row.teamId)
        );
        const soldAsset = soldAssetLookup.get(asset.id) ?? null;
        const bestRank =
          memberRows.reduce(
            (best, row) => Math.min(best, analysisRankIndexLookup.get(row.teamId) ?? best),
            Number.MAX_SAFE_INTEGER
          ) + 1;

        return {
          asset,
          rank: bestRank,
          representativeTeamId: representativeRow.teamId,
          representativeTeamName: representativeRow.teamName,
          representativeRow,
          classification: representativeRow.classification ?? null,
          compositeScore: representativeRow.compositeScore,
          targetBid: memberBudgetRows.length
            ? memberBudgetRows.reduce((total, row) => total + row.targetBid, 0)
            : null,
          maxBid: memberBudgetRows.length
            ? memberBudgetRows.reduce((total, row) => total + row.maxBid, 0)
            : null,
          status: soldAsset
            ? soldAsset.buyerSyndicateId === dashboard.focusSyndicate.id
              ? "Owned"
              : "Sold"
            : "Available",
          memberSummary:
            asset.type === "single_team"
              ? null
              : formatAssetMembersCompact(asset, { includeParens: false }),
          searchText: [
            asset.label,
            asset.region,
            representativeRow.teamName,
            representativeRow.shortName,
            ...memberRows.map((row) => row.shortName),
            ...asset.members.map((member) => member.label)
          ]
            .join(" ")
            .toLowerCase()
        };
      })
      .filter((row): row is AnalysisAssetTableRow => row !== null);

    return rows.sort((left, right) => left.rank - right.rank);
  }, [
    analysisRankIndexLookup,
    dashboard.analysis.budgetRows,
    dashboard.analysis.ranking,
    dashboard.focusSyndicate.id,
    dashboard.session.auctionAssets,
    soldAssetLookup
  ]);
  const filteredAnalysisRows = useMemo(() => {
    const normalized = analysisSearch.trim().toLowerCase();
    if (!normalized) {
      return analysisAssetRows;
    }

    return analysisAssetRows.filter((row) => row.searchText.includes(normalized));
  }, [analysisAssetRows, analysisSearch]);
  const filteredRationale = useMemo(
    () =>
      filterRecommendationRationale(
        recommendation?.rationale,
        recommendation?.forcedPassConflictTeamId
      ),
    [recommendation]
  );
  const activeOverrideRows = useMemo(
    (): ActiveOverrideRow[] =>
      Object.values(dashboard.session.projectionOverrides)
        .flatMap((override) => {
          const team = teamLookup.get(override.teamId);
          return team ? [{ override, team }] : [];
        })
        .sort((left, right) => left.team.name.localeCompare(right.team.name)),
    [dashboard.session.projectionOverrides, teamLookup]
  );
  const titleOdds =
    (selectedTeam && snapshot?.teamResults[selectedTeam.id]?.roundProbabilities.champion) || 0;
  const nominatedTeamClassification =
    (selectedTeam && dashboard.session.teamClassifications[selectedTeam.id]?.classification) || null;
  const nominatedTeamNote =
    (selectedTeam && dashboard.session.teamNotes[selectedTeam.id]?.note) || null;
  const focusFunding = useMemo(
    () =>
      deriveMothershipFundingSnapshot(
        dashboard.session.mothershipFunding,
        dashboard.focusSyndicate.spend
      ),
    [dashboard.focusSyndicate.spend, dashboard.session.mothershipFunding]
  );
  const projectedBaseRoom = focusFunding.baseBidRoom - currentBid;
  const projectedStretchRoom = focusFunding.stretchBidRoom - currentBid;
  const selectedSimulation = analysisDetailTeam
    ? snapshot?.teamResults[analysisDetailTeam.id] ?? null
    : null;
  const analysisSelectedRank =
    analysisTeamId && analysisRankIndexLookup.has(analysisTeamId)
      ? (analysisRankIndexLookup.get(analysisTeamId) ?? 0) + 1
      : null;
  const analysisBidGuideDisplay = analysisBudgetRow
    ? `${formatCurrency(analysisBudgetRow.targetBid)} / ${formatCurrency(analysisBudgetRow.maxBid)}`
    : "Sold / unavailable";
  const analysisAuctionTeamSummary =
    analysisDetailAsset && analysisDetailAsset.type !== "single_team"
      ? formatAssetMembersCompact(analysisDetailAsset, { includeParens: false })
      : null;
  const analysisOffDefTempoDisplay = analysisDetailTeam
    ? `${analysisDetailTeam.offense.toFixed(1)} · ${analysisDetailTeam.defense.toFixed(1)} · ${analysisDetailTeam.tempo.toFixed(1)}`
    : "--";
  const analysisThreePointKenPomDisplay = analysisRow
    ? `${displayNullablePercent(analysisRow.threePointPct)} / ${displayNullableNumber(analysisRow.kenpomRank)}`
    : "--";
  const analysisSimConfidenceDisplay = selectedSimulation
    ? `${formatCurrency(selectedSimulation.confidenceBand[0])}-${formatCurrency(selectedSimulation.confidenceBand[1])}`
    : "--";
  const breakEvenStage = selectedTeam
    ? getBreakEvenStage(currentBid, dashboard.session.payoutRules)
    : null;
  const matchupSummary = useMemo(
    () =>
      deriveAuctionMatchups({
        bracket: dashboard.bracket,
        snapshot: dashboard.session.simulationSnapshot,
        nominatedTeam: selectedTeam,
        ownedTeamIds: dashboard.focusSyndicate.ownedTeamIds
      }),
    [
      dashboard.bracket,
      dashboard.focusSyndicate.ownedTeamIds,
      dashboard.session.simulationSnapshot,
      selectedTeam
    ]
  );
  const forcedPassConflictName = recommendation?.forcedPassConflictTeamId
    ? teamLookup.get(recommendation.forcedPassConflictTeamId)?.name ??
      recommendation.forcedPassConflictTeamId
    : null;
  const topOwnershipConflict = ownershipConflicts[0] ?? null;
  const callSupportText = recommendation
    ? recommendation.forcedPassConflictTeamId
      ? `Round 1 is against ${forcedPassConflictName}, which Mothership already owns.`
      : recommendation.stoplight === "buy"
        ? "Model supports buying here"
        : recommendation.stoplight === "caution"
          ? "Model is getting cautious here"
          : "Model does not support chasing here"
    : "The live room stays focused on the current nomination and bankroll position.";
  const callDetailText = recommendation?.forcedPassConflictTeamId
    ? recommendation.forcedPassReason
    : recommendation
      ? recommendation.stoplight === "buy"
        ? topOwnershipConflict && topOwnershipConflict.probability >= 0.05
          ? `The live price remains below target, and the main ownership collision risk does not arrive until the ${titleCaseStage(topOwnershipConflict.earliestRound)}.`
          : breakEvenStage && breakEvenStage !== "negativeReturn"
            ? `${formatBreakEvenStage(breakEvenStage)} is enough for this price to clear the modeled cost.`
            : "The live price remains below target with positive simulated value."
        : recommendation.stoplight === "caution"
          ? topOwnershipConflict && topOwnershipConflict.probability >= 0.05
            ? `This price is near the model's ceiling, and the main ownership collision risk arrives in the ${titleCaseStage(topOwnershipConflict.earliestRound)}.`
            : "The live price is nearing the model's ceiling, so upside is starting to compress."
          : topOwnershipConflict && topOwnershipConflict.probability >= 0.05
            ? `The price is above the model's comfort range before the ${titleCaseStage(topOwnershipConflict.earliestRound)} ownership risk is even priced in.`
            : "The live price is above the model's comfort range for this team."
      : null;
  const callHeadline = recommendation
    ? recommendation.forcedPassConflictTeamId
      ? "Pass"
      : recommendation.stoplight === "buy"
        ? `Bid through ${formatCurrency(recommendation.targetBid)}`
        : recommendation.stoplight === "caution"
          ? `Hold the line at ${formatCurrency(recommendation.maxBid)}`
          : `Pass above ${formatCurrency(recommendation.maxBid)}`
    : "Pick a team to set the board";
  const targetBidDisplay = recommendation
    ? recommendation.forcedPassConflictTeamId
      ? "Pass"
      : formatCurrency(recommendation.targetBid)
    : "--";
  const maxBidDisplay = recommendation
    ? recommendation.forcedPassConflictTeamId
      ? "Pass"
      : formatCurrency(recommendation.maxBid)
    : "--";
  const soldFeed = useMemo(() => [...dashboard.soldAssets].reverse(), [dashboard.soldAssets]);
  const ownershipGroups = useMemo(
    () =>
      buildViewerOwnershipGroups(
        dashboard.soldAssets,
        dashboard.focusSyndicate,
        dashboard.ledger,
        ownershipSearch
      ),
    [dashboard.focusSyndicate, dashboard.ledger, dashboard.soldAssets, ownershipSearch]
  );

  function switchWorkspace(nextView: WorkspaceView) {
    setActiveView(nextView);
    router.replace(getWorkspacePath(sessionId, nextView));
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST"
    });
    router.push("/");
    router.refresh();
  }

  const bracketWorkspace = (
    <SessionBracket
      bracket={dashboard.bracket}
      syndicates={dashboard.ledger}
      canEdit={!viewerMode}
      isSaving={viewerMode ? false : isSavingBracket}
      notice={notice}
      error={error}
      onSelectWinner={viewerMode ? () => undefined : saveBracketWinner}
    />
  );

  return (
    <main className="dashboard-page">
      <header className="surface-card session-hero session-hero--slim">
        <div className="session-hero__copy">
          <p className="eyebrow">mothership smartbid™</p>
          <h1>{dashboard.session.name}</h1>
        </div>
        <div className="session-hero__meta">
          <ThemeToggle />
          <div className="status-pill">
            {focusOwnedTeams.length} {focusOwnedTeams.length === 1 ? "owned team" : "owned teams"}
          </div>
          <div className="status-pill">Spend · {formatCurrency(dashboard.focusSyndicate.spend)}</div>
          <div className="status-pill">
            {currentMember.name} · {getRoleLabel(currentMember.role, currentMember.scope)}
          </div>
          {currentMember.scope === "platform" ? (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => router.push("/admin")}
            >
              Admin center
            </button>
          ) : null}
          <button type="button" className="button button-ghost" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>

      {availableViews.length > 1 ? (
        <nav className="workspace-tabs" aria-label="Workspace views">
          {availableViews.map((view) => (
            <button
              key={view}
              type="button"
              className={cn("workspace-tab", activeView === view && "workspace-tab--active")}
              onClick={() => switchWorkspace(view)}
            >
              {viewLabels[view]}
            </button>
          ))}
        </nav>
      ) : null}

      {viewerMode ? (
        activeView === "bracket" ? (
          bracketWorkspace
        ) : (
          <ViewerAuctionWorkspace
            dashboard={dashboard}
            recommendation={recommendation}
            signalLabel={recommendation ? stoplightLabels[recommendation.stoplight] : null}
            currentBid={currentBid}
            nominatedMatchup={matchupSummary.nominatedMatchup}
            likelyRound2Matchup={matchupSummary.likelyRound2Matchup}
            hasOwnedRoundOneOpponent={matchupSummary.hasOwnedRoundOneOpponent}
            hasOwnedLikelyRoundTwoOpponent={matchupSummary.hasOwnedLikelyRoundTwoOpponent}
            callHeadline={callHeadline}
            callSupportText={callSupportText}
            callDetailText={callDetailText}
            breakEvenStage={breakEvenStage}
            targetBidDisplay={targetBidDisplay}
            maxBidDisplay={maxBidDisplay}
            filteredRationale={filteredRationale}
            ownershipConflicts={ownershipConflicts}
            teamLookup={teamLookup}
            forcedPassConflictTeamId={recommendation?.forcedPassConflictTeamId ?? null}
            ownershipSearch={ownershipSearch}
            onOwnershipSearchChange={setOwnershipSearch}
            ownershipGroups={ownershipGroups}
            soldFeed={soldFeed}
            syndicateLookup={syndicateLookup}
          />
        )
      ) : (
        <>
          {activeView === "auction" ? (
            <OperatorAuctionWorkspace
              dashboard={dashboard}
              recommendation={recommendation}
              notice={notice}
              error={error}
              selectedAssetId={selectedAssetId}
              bidInputValue={bidInputValue}
              parsedBidInputValue={parsedBidInputValue}
              buyerId={buyerId}
              currentBid={currentBid}
              isUndoingPurchase={isUndoingPurchase}
              teamSelectRef={teamSelectRef}
              bidInputRef={bidInputRef}
              onAssetChange={handleAssetChange}
              onBidInputChange={setBidInputValue}
              onBidBlur={handleBidBlur}
              onBidKeyDown={handleBidKeyDown}
              onBuyerChange={setBuyerId}
              onUndoPurchase={() =>
                void undoPurchase(lastPurchaseTeam?.name ?? dashboard.lastPurchase?.teamId ?? null)
              }
              onRecordPurchase={() => void recordPurchase()}
              lastPurchaseTeamName={lastPurchaseTeam?.name ?? null}
              lastPurchaseBuyerName={lastPurchaseBuyer?.name ?? null}
              signalLabel={recommendation ? stoplightLabels[recommendation.stoplight] : null}
              nominatedAsset={selectedAsset}
              nominatedTeam={selectedTeam}
              nominatedTeamClassification={nominatedTeamClassification}
              nominatedTeamNote={nominatedTeamNote}
              nominatedMatchup={matchupSummary.nominatedMatchup}
              likelyRound2Matchup={matchupSummary.likelyRound2Matchup}
              hasOwnedRoundOneOpponent={matchupSummary.hasOwnedRoundOneOpponent}
              hasOwnedLikelyRoundTwoOpponent={matchupSummary.hasOwnedLikelyRoundTwoOpponent}
              callHeadline={callHeadline}
              callSupportText={callSupportText}
              callDetailText={callDetailText}
              breakEvenStage={breakEvenStage}
              targetBidDisplay={targetBidDisplay}
              maxBidDisplay={maxBidDisplay}
              filteredRationale={filteredRationale}
              ownershipConflicts={ownershipConflicts}
              teamLookup={teamLookup}
              forcedPassConflictTeamId={recommendation?.forcedPassConflictTeamId ?? null}
              projectedBaseRoom={projectedBaseRoom}
              projectedStretchRoom={projectedStretchRoom}
              titleOdds={titleOdds}
              operatorSyndicateHoldings={operatorSyndicateHoldings}
              expandedSyndicateIds={expandedSyndicateIds}
              onToggleSyndicate={(syndicateId) =>
                setExpandedSyndicateIds((current) =>
                  current.includes(syndicateId)
                    ? current.filter((candidate) => candidate !== syndicateId)
                    : [...current, syndicateId]
                )
              }
              onExpandAll={() =>
                setExpandedSyndicateIds(
                  operatorSyndicateHoldings.map(({ syndicate }) => syndicate.id)
                )
              }
              onCollapseAll={() => setExpandedSyndicateIds([])}
              recentSales={recentSales}
              syndicateLookup={syndicateLookup}
              focusFundingImpliedSharePrice={focusFunding.impliedSharePrice}
            />
          ) : null}

          {activeView === "analysis" ? (
            <section className="stack-layout">
              <article className="surface-card">
                <div className="section-headline">
                  <div>
                    <p className="eyebrow">Analysis</p>
                  </div>
                </div>

                {analysisDetailTeam && analysisRow ? (
                  <div className="analysis-selected-panel">
                    <div className="analysis-selected-panel__top">
                      <div className="analysis-selected-panel__identity">
                        <div className="team-label">
                          <TeamLogo
                            teamId={analysisDetailTeam.id}
                            teamName={analysisDetailTeam.name}
                            size="md"
                            decorative
                          />
                          <div className="team-label__copy">
                            <p className="eyebrow">Selected Team</p>
                            <h3>{analysisDetailTeam.name}</h3>
                          </div>
                        </div>
                        <div className="analysis-selected-panel__meta">
                          {analysisDetailAsset && analysisDetailAsset.type !== "single_team" ? (
                            <span className="status-pill">
                              Auction team · {analysisDetailAsset.label}
                            </span>
                          ) : (
                            <span className="status-pill">Auction team · Single team</span>
                          )}
                          {analysisAuctionTeamSummary ? (
                            <span className="status-pill status-pill--muted">
                              {analysisAuctionTeamSummary}
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              "status-pill",
                              !analysisAssetBudget && "status-pill--muted"
                            )}
                          >
                            {analysisAssetBudget
                              ? `${formatCurrency(analysisAssetBudget.targetBid)} / ${formatCurrency(analysisAssetBudget.maxBid)}`
                              : "Sold / unavailable"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="analysis-selected-panel__stats">
                      <div className="analysis-selected-stat">
                        <span>Rank / percentile</span>
                        <strong>
                          {analysisSelectedRank !== null
                            ? `#${analysisSelectedRank} / ${analysisRow.percentile}th`
                            : "--"}
                        </strong>
                      </div>
                      <div className="analysis-selected-stat">
                        <span>Composite score</span>
                        <strong>{analysisRow.compositeScore.toFixed(3)}</strong>
                      </div>
                      <div className="analysis-selected-stat">
                        <span>Model rating</span>
                        <strong>{analysisDetailTeam.rating.toFixed(3)}</strong>
                      </div>
                      <div className="analysis-selected-stat">
                        <span>Bid guide</span>
                        <strong>{analysisBidGuideDisplay}</strong>
                      </div>
                      <div className="analysis-selected-stat analysis-selected-stat--inline-values">
                        <span>Off / Def / Tempo</span>
                        <strong>{analysisOffDefTempoDisplay}</strong>
                      </div>
                      <div className="analysis-selected-stat">
                        <span>Q1 wins</span>
                        <strong>{displayNullableNumber(analysisRow.q1Wins)}</strong>
                      </div>
                      <div className="analysis-selected-stat">
                        <span>Ranked wins</span>
                        <strong>{displayNullableNumber(analysisRow.rankedWins)}</strong>
                      </div>
                      <div className="analysis-selected-stat">
                        <span>3PT / KenPom</span>
                        <strong>{analysisThreePointKenPomDisplay}</strong>
                      </div>
                      <div className="analysis-selected-stat">
                        <span>Opening bid</span>
                        <strong>
                          {analysisBudgetRow ? formatCurrency(analysisBudgetRow.openingBid) : "--"}
                        </strong>
                      </div>
                      <div className="analysis-selected-stat">
                        <span>Conviction weight</span>
                        <strong>
                          {analysisBudgetRow
                            ? formatPercent(analysisBudgetRow.investableShare)
                            : "--"}
                        </strong>
                      </div>
                      <div className="analysis-selected-stat">
                        <span>Sim expected gross</span>
                        <strong>
                          {selectedSimulation
                            ? formatCurrency(selectedSimulation.expectedGrossPayout)
                            : "--"}
                        </strong>
                      </div>
                      <div className="analysis-selected-stat">
                        <span>Sim confidence</span>
                        <strong>{analysisSimConfidenceDisplay}</strong>
                      </div>
                    </div>

                    <div className="analysis-round-ladder" aria-label="Round reach probabilities">
                      {analysisRoundLadder.map(({ stage, shortLabel, label }) => {
                        const probability = selectedSimulation?.roundProbabilities[stage] ?? null;

                        return (
                          <div key={stage} className="analysis-round-ladder__step">
                            <div className="analysis-round-ladder__labels">
                              <span className="analysis-round-ladder__short">{shortLabel}</span>
                              <span className="analysis-round-ladder__value">
                                {probability === null ? "--" : formatPercent(probability)}
                              </span>
                            </div>
                            <div
                              className="analysis-round-ladder__track"
                              role="presentation"
                              aria-hidden="true"
                            >
                              <span
                                className="analysis-round-ladder__fill"
                                style={{
                                  width: `${
                                    probability === null
                                      ? 0
                                      : probability > 0
                                        ? Math.max(3, Math.min(100, probability * 100))
                                        : 0
                                  }%`
                                }}
                              />
                            </div>
                            <span className="analysis-round-ladder__caption">{label}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="analysis-selected-panel__toolbar">
                      <div className="analysis-inline-control analysis-inline-control--classification">
                        <span className="analysis-inline-control__label">Classification</span>
                        <div
                          className="classification-picker classification-picker--compact"
                          role="radiogroup"
                          aria-label="Team classification"
                        >
                          {TEAM_CLASSIFICATION_ORDER.map((classification) => {
                            const meta = getTeamClassificationMeta(classification);
                            const isSelected = analysisTeamClassification === classification;

                            return (
                              <button
                                key={classification}
                                type="button"
                                className={cn(
                                  "classification-option",
                                  meta && `classification-option--${meta.tone}`,
                                  isSelected && "classification-option--selected"
                                )}
                                onClick={() => void saveTeamClassification(classification)}
                                disabled={isSavingClassification}
                                aria-pressed={isSelected}
                              >
                                <span className="classification-option__icon" aria-hidden="true">
                                  {meta ? (
                                    <>
                                      <Image
                                        className="classification-option__icon-image"
                                        src={meta.iconSrc}
                                        alt=""
                                        width={20}
                                        height={20}
                                        unoptimized
                                        onError={(event) => {
                                          event.currentTarget.style.display = "none";
                                          event.currentTarget.nextElementSibling?.removeAttribute(
                                            "hidden"
                                          );
                                        }}
                                      />
                                      <span className="classification-option__icon-fallback" hidden>
                                        {meta.iconLabel}
                                      </span>
                                    </>
                                  ) : null}
                                </span>
                                <span>{meta?.shortLabel ?? meta?.label ?? classification}</span>
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          className="button button-ghost button--small"
                          onClick={() => void clearTeamClassification()}
                          disabled={!analysisTeamClassification || isSavingClassification}
                        >
                          Clear
                        </button>
                      </div>

                      <div className="analysis-inline-control analysis-inline-control--note">
                        <span className="analysis-inline-control__label">Team note</span>
                        <input
                          className="analysis-note-inline__input"
                          type="text"
                          value={teamNoteInput}
                          onChange={(event) => setTeamNoteInput(event.target.value)}
                          onFocus={() => setIsAnalysisNoteFocused(true)}
                          onBlur={() => setIsAnalysisNoteFocused(false)}
                          maxLength={80}
                          placeholder="Quick thought on this team"
                        />
                        {showAnalysisNoteCounter ? (
                          <span
                            className={cn(
                              "status-pill status-pill--muted analysis-note-counter",
                              teamNoteInput.length === 0 && "analysis-note-counter--subtle"
                            )}
                          >
                            {teamNoteInput.length}/80
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="button button-accent button--small"
                          onClick={() => void saveTeamNote()}
                          disabled={
                            isSavingTeamNote ||
                            trimmedTeamNoteInput.length === 0 ||
                            !teamNoteIsDirty
                          }
                        >
                          Save
                        </button>
                        {analysisTeamNote ? (
                          <button
                            type="button"
                            className="button button-ghost button--small"
                            onClick={() => void clearTeamNote()}
                            disabled={isSavingTeamNote}
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="analysis-selected-panel__signals">
                      <div className="analysis-signal-card">
                        <span className="analysis-signal-card__label">Strengths</span>
                        {analysisRow.strengths.length ? (
                          <div className="analysis-signal-card__list">
                            {analysisRow.strengths.map((strength) => (
                              <div key={strength} className="analysis-signal-card__item">
                                {strength}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-copy">
                            No standout strengths from available scouting data.
                          </p>
                        )}
                      </div>

                      <div className="analysis-signal-card">
                        <span className="analysis-signal-card__label">Risks</span>
                        {analysisRow.risks.length ? (
                          <div className="analysis-signal-card__list">
                            {analysisRow.risks.map((risk) => (
                              <div key={risk} className="analysis-signal-card__item">
                                {risk}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-copy">
                            No material risk flags from available scouting data.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="analysis-selected-panel analysis-selected-panel--empty">
                    <p className="empty-copy">Select a team to inspect deeper analysis.</p>
                  </div>
                )}

                <div className="form-grid analysis-search-row">
                  <label className="field-shell analysis-search-field">
                    <span>Search</span>
                    <input
                      type="search"
                      value={analysisSearch}
                      onChange={(event) => setAnalysisSearch(event.target.value)}
                      placeholder="Type team, package, or abbreviation"
                    />
                  </label>
                </div>

                <div className="table-wrap admin-table-wrap">
                  <table className="admin-table admin-table--dense">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Team</th>
                        <th>Auction team</th>
                        <th>Signal</th>
                        <th>Score</th>
                        <th>Target</th>
                        <th>Max</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAnalysisRows.map((row) => (
                        <tr
                          key={row.asset.id}
                          className={cn(
                            analysisDetailAsset?.id === row.asset.id && "table-row--focus"
                          )}
                          onClick={() => setAnalysisTeamId(row.representativeTeamId)}
                        >
                          <td>#{row.rank}</td>
                          <td>
                            <div className="team-label">
                              <TeamLogo
                                teamId={row.representativeTeamId}
                                teamName={row.representativeTeamName}
                                size="sm"
                                decorative
                              />
                              <div className="team-label__copy">
                                <strong>{row.representativeTeamName}</strong>
                              </div>
                            </div>
                          </td>
                          <td>
                            {row.asset.type === "single_team" ? (
                              <span className="team-classification-empty">Single team</span>
                            ) : (
                              <div className="team-label">
                                <AssetLogo asset={row.asset} teamLookup={teamLookup} size="sm" decorative />
                                <div className="team-label__copy">
                                  <strong>
                                    {row.asset.type === "play_in_slot"
                                      ? "Play-in team"
                                      : row.asset.label}
                                  </strong>
                                  {row.memberSummary ? (
                                    <div className="decision-panel__note">{row.memberSummary}</div>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </td>
                          <td>
                            {row.classification ? (
                              <TeamClassificationBadge classification={row.classification} compact />
                            ) : (
                              <span className="team-classification-empty">--</span>
                            )}
                          </td>
                          <td>{row.compositeScore.toFixed(3)}</td>
                          <td>{row.targetBid !== null ? formatCurrency(row.targetBid) : "--"}</td>
                          <td>{row.maxBid !== null ? formatCurrency(row.maxBid) : "--"}</td>
                          <td>{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          ) : null}

          {activeView === "overrides" ? (
            <section className="detail-grid">
              <article className="surface-card">
                <div className="section-headline">
                  <div>
                    <p className="eyebrow">Projection Overrides</p>
                    <h2>Manual team adjustments</h2>
                  </div>
                </div>

                <div className="field-stack">
                  <label className="field-shell">
                    <span>Team</span>
                    <select
                      value={overrideTeamId}
                      onChange={(event) => setOverrideTeamId(event.target.value)}
                    >
                      <option value="">Select a team</option>
                      {dashboard.session.projections.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.seed}. {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {overrideSelectedTeam ? (
                    <>
                      <div className="override-summary">
                        <strong>{overrideSelectedTeam.name}</strong>
                        <span>
                          Source {overrideSelectedTeam.source}
                          {selectedOverride ? " with override applied" : ""}
                        </span>
                      </div>
                      <div className="form-grid form-grid--two">
                        <label className="field-shell">
                          <span>Rating</span>
                          <input
                            type="number"
                            step="0.1"
                            value={overrideForm.rating}
                            onChange={(event) =>
                              setOverrideForm((current) => ({
                                ...current,
                                rating: event.target.value
                              }))
                            }
                          />
                        </label>
                        <label className="field-shell">
                          <span>Offense</span>
                          <input
                            type="number"
                            step="0.1"
                            value={overrideForm.offense}
                            onChange={(event) =>
                              setOverrideForm((current) => ({
                                ...current,
                                offense: event.target.value
                              }))
                            }
                          />
                        </label>
                        <label className="field-shell">
                          <span>Defense</span>
                          <input
                            type="number"
                            step="0.1"
                            value={overrideForm.defense}
                            onChange={(event) =>
                              setOverrideForm((current) => ({
                                ...current,
                                defense: event.target.value
                              }))
                            }
                          />
                        </label>
                        <label className="field-shell">
                          <span>Tempo</span>
                          <input
                            type="number"
                            step="0.1"
                            value={overrideForm.tempo}
                            onChange={(event) =>
                              setOverrideForm((current) => ({
                                ...current,
                                tempo: event.target.value
                              }))
                            }
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <p className="empty-copy">Choose a team to edit projection inputs.</p>
                  )}
                </div>

                {overrideSelectedTeam ? (
                  <div className="button-row">
                    <button
                      type="button"
                      className="button"
                      onClick={() => void saveProjectionOverride()}
                    >
                      Save override
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void clearProjectionOverride()}
                    >
                      Clear override
                    </button>
                  </div>
                ) : null}

                {notice ? <p className="notice-text">{notice}</p> : null}
                {error ? <p className="error-text">{error}</p> : null}
              </article>

              <article className="surface-card">
                <div className="section-headline">
                  <div>
                    <p className="eyebrow">Active Overrides</p>
                    <h3>{dashboard.projectionOverrideCount} teams modified</h3>
                  </div>
                </div>
                {activeOverrideRows.length ? (
                  <div className="list-stack">
                    {activeOverrideRows.map(({ override, team }) => (
                      <div key={override.teamId} className="list-row">
                        <div>
                          <strong>{team.name}</strong>
                          <span>{team.region} region</span>
                        </div>
                        <span>
                          Updated{" "}
                          {new Date(override.updatedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric"
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">No manual overrides are active.</p>
                )}
              </article>
            </section>
          ) : null}

          {activeView === "bracket" ? bracketWorkspace : null}
        </>
      )}
    </main>
  );
}
