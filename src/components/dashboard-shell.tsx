"use client";

import Image from "next/image";
import type { Route } from "next";
import { useMemo } from "react";
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
  MetricCard,
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

const fundingStatusLabels: Record<BidRecommendation["fundingStatus"], string> = {
  safe: "Within base budget",
  stretch: "Requires stretch budget",
  "above-plan": "Above current funding plan"
};

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
            stoplightLabels={stoplightLabels}
            fundingStatusLabels={fundingStatusLabels}
            nominatedMatchup={matchupSummary.nominatedMatchup}
            likelyRound2Matchup={matchupSummary.likelyRound2Matchup}
            hasOwnedRoundOneOpponent={matchupSummary.hasOwnedRoundOneOpponent}
            hasOwnedLikelyRoundTwoOpponent={matchupSummary.hasOwnedLikelyRoundTwoOpponent}
            forcedPassConflictName={forcedPassConflictName}
            ownershipSearch={ownershipSearch}
            onOwnershipSearchChange={setOwnershipSearch}
            ownershipGroups={ownershipGroups}
            soldFeed={soldFeed}
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
            <section className="detail-grid">
              <article className="surface-card">
                <div className="section-headline">
                  <div>
                    <p className="eyebrow">Analysis</p>
                    <h2>Session ranking and bid guidance</h2>
                  </div>
                </div>

                <div className="form-grid analysis-search-row">
                  <label className="field-shell">
                    <span>Search</span>
                    <input
                      type="search"
                      value={analysisSearch}
                      onChange={(event) => setAnalysisSearch(event.target.value)}
                      placeholder="Type team, package, or abbreviation"
                    />
                  </label>
                </div>

                <div className="mini-grid analysis-summary-grid analysis-summary-row">
                  <MetricCard
                    label="Base room"
                    value={formatCurrency(dashboard.analysis.investableCash)}
                    compact
                  />
                  <MetricCard
                    label="Actual paid"
                    value={formatCurrency(dashboard.analysis.actualPaidSpend)}
                    compact
                  />
                  <MetricCard
                    label="Stretch room"
                    value={formatCurrency(Math.max(0, dashboard.analysis.funding.stretchBidRoom))}
                    compact
                  />
                  <MetricCard
                    label="Effective share price"
                    value={
                      dashboard.analysis.funding.impliedSharePrice === null
                        ? "--"
                        : formatCurrency(dashboard.analysis.funding.impliedSharePrice)
                    }
                    compact
                  />
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
                            <strong>{row.representativeTeamName}</strong>
                          </td>
                          <td>
                            {row.asset.type === "single_team" ? (
                              <span className="team-classification-empty">Single team</span>
                            ) : (
                              <>
                                <strong>
                                  {row.asset.type === "play_in_slot"
                                    ? "Play-in team"
                                    : row.asset.label}
                                </strong>
                                {row.memberSummary ? (
                                  <div className="decision-panel__note">{row.memberSummary}</div>
                                ) : null}
                              </>
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

              <article className="surface-card">
                <div className="section-headline">
                  <div>
                    <p className="eyebrow">Selected Team</p>
                    <h3>{analysisDetailTeam?.name ?? "No team selected"}</h3>
                  </div>
                </div>

                {analysisDetailTeam && analysisRow ? (
                  <div className="stack-layout">
                    {analysisDetailAsset && analysisDetailAsset.type !== "single_team" ? (
                      <article className="surface-card">
                        <div className="section-headline">
                          <div>
                            <p className="eyebrow">Auction Team</p>
                            <h3>{analysisDetailAsset.label}</h3>
                          </div>
                          {analysisAssetBudget ? (
                            <span className="status-pill">
                              {formatCurrency(analysisAssetBudget.targetBid)} /{" "}
                              {formatCurrency(analysisAssetBudget.maxBid)}
                            </span>
                          ) : (
                            <span className="status-pill status-pill--muted">
                              Sold / unavailable
                            </span>
                          )}
                        </div>
                        <p className="decision-panel__note">
                          {formatAssetMembersCompact(analysisDetailAsset)}
                        </p>
                      </article>
                    ) : null}

                    <article className="surface-card">
                      <div className="section-headline">
                        <div>
                          <p className="eyebrow">Classification</p>
                        </div>
                        {analysisTeamClassification ? (
                          <TeamClassificationBadge classification={analysisTeamClassification} />
                        ) : (
                          <span className="status-pill status-pill--muted">Unclassified</span>
                        )}
                      </div>
                      <div className="classification-picker" role="radiogroup" aria-label="Team classification">
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
                              <span>{meta?.label ?? classification}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="button-row analysis-annotation-actions">
                        <button
                          type="button"
                          className="button button-ghost button--small"
                          onClick={() => void clearTeamClassification()}
                          disabled={!analysisTeamClassification || isSavingClassification}
                        >
                          Clear classification
                        </button>
                      </div>
                    </article>

                    <article className="surface-card">
                      <div className="section-headline">
                        <div>
                          <p className="eyebrow">Team Note</p>
                        </div>
                        {teamNoteInput.length > 0 ? (
                          <span className="status-pill status-pill--muted">
                            {teamNoteInput.length}/80
                          </span>
                        ) : null}
                      </div>
                      <label className="field-shell">
                        <span>Short note</span>
                        <input
                          type="text"
                          value={teamNoteInput}
                          onChange={(event) => setTeamNoteInput(event.target.value)}
                          maxLength={80}
                          placeholder="Quick thought on this team"
                        />
                      </label>
                      <div className="button-row analysis-annotation-actions">
                        <button
                          type="button"
                          className="button button-primary button--small"
                          onClick={() => void saveTeamNote()}
                          disabled={
                            isSavingTeamNote ||
                            trimmedTeamNoteInput.length === 0 ||
                            !teamNoteIsDirty
                          }
                        >
                          Save note
                        </button>
                        <button
                          type="button"
                          className="button button-ghost button--small"
                          onClick={() => void clearTeamNote()}
                          disabled={!analysisTeamNote || isSavingTeamNote}
                        >
                          Clear note
                        </button>
                      </div>
                    </article>

                    <div className="metric-grid">
                      <MetricCard
                        label="Rank / percentile"
                        value={`#${dashboard.analysis.ranking.findIndex((row) => row.teamId === analysisDetailTeam.id) + 1} / ${analysisRow.percentile}th`}
                      />
                      <MetricCard
                        label="Composite score"
                        value={analysisRow.compositeScore.toFixed(3)}
                      />
                      <MetricCard
                        label="Model rating"
                        value={analysisDetailTeam.rating.toFixed(3)}
                      />
                      <MetricCard
                        label="Bid guide"
                        value={
                          analysisBudgetRow
                            ? `${formatCurrency(analysisBudgetRow.targetBid)} / ${formatCurrency(analysisBudgetRow.maxBid)}`
                            : "Sold / unavailable"
                        }
                        longValue={Boolean(analysisBudgetRow)}
                      />
                    </div>

                    <div className="metric-grid">
                      <MetricCard
                        label="Off / Def / Tempo"
                        value={`${analysisDetailTeam.offense.toFixed(1)} / ${analysisDetailTeam.defense.toFixed(1)} / ${analysisDetailTeam.tempo.toFixed(1)}`}
                      />
                      <MetricCard
                        label="Q1 wins"
                        value={displayNullableNumber(analysisRow.q1Wins)}
                      />
                      <MetricCard
                        label="Ranked wins"
                        value={displayNullableNumber(analysisRow.rankedWins)}
                      />
                      <MetricCard
                        label="3PT / KenPom"
                        value={`${displayNullablePercent(analysisRow.threePointPct)} / ${displayNullableNumber(analysisRow.kenpomRank)}`}
                      />
                    </div>

                    <div className="detail-grid">
                      <article className="surface-card">
                        <div className="section-headline">
                          <div>
                            <p className="eyebrow">Strengths</p>
                            <h3>Why it scores well</h3>
                          </div>
                        </div>
                        {analysisRow.strengths.length ? (
                          <div className="list-stack">
                            {analysisRow.strengths.map((strength) => (
                              <div key={strength} className="list-line">
                                {strength}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-copy">
                            No standout strengths from available scouting data.
                          </p>
                        )}
                      </article>

                      <article className="surface-card">
                        <div className="section-headline">
                          <div>
                            <p className="eyebrow">Risks</p>
                            <h3>What can suppress conviction</h3>
                          </div>
                        </div>
                        {analysisRow.risks.length ? (
                          <div className="list-stack">
                            {analysisRow.risks.map((risk) => (
                              <div key={risk} className="list-line">
                                {risk}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-copy">
                            No material risk flags from available scouting data.
                          </p>
                        )}
                      </article>
                    </div>

                    <div className="metric-grid">
                      <MetricCard
                        label="Sim expected gross"
                        value={
                          selectedSimulation
                            ? formatCurrency(selectedSimulation.expectedGrossPayout)
                            : "--"
                        }
                      />
                      <MetricCard
                        label="Sim confidence"
                        value={
                          selectedSimulation
                            ? `${formatCurrency(selectedSimulation.confidenceBand[0])}-${formatCurrency(selectedSimulation.confidenceBand[1])}`
                            : "--"
                        }
                        longValue={Boolean(selectedSimulation)}
                      />
                      <MetricCard
                        label="Conviction weight"
                        value={
                          analysisBudgetRow
                            ? formatPercent(analysisBudgetRow.investableShare)
                            : "--"
                        }
                      />
                      <MetricCard
                        label="Opening bid"
                        value={
                          analysisBudgetRow
                            ? formatCurrency(analysisBudgetRow.openingBid)
                            : "--"
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <p className="empty-copy">Select a team to inspect deeper analysis.</p>
                )}
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
