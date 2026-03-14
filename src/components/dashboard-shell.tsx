"use client";
import Image from "next/image";
import {
  useCallback,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useRouter } from "next/navigation";
import { deriveFundingStatus, deriveMothershipFundingSnapshot } from "@/lib/funding";
import { useSessionDashboard } from "@/lib/hooks/use-session-dashboard";
import { buildBidRecommendation } from "@/lib/engine/recommendations";
import { getBreakEvenStage } from "@/lib/payouts";
import {
  formatBidInputText,
  formatBidInputValue,
  parseBidInputValue
} from "@/lib/bid-input";
import {
  AuctionDashboard,
  AuthenticatedMember,
  BidRecommendation,
  MatchupConflict,
  ProjectionOverride,
  SoldTeamSummary,
  Stage,
  Syndicate,
  TeamClassificationValue,
  TeamProjection
} from "@/lib/types";
import { TEAM_CLASSIFICATION_ORDER, getTeamClassificationMeta } from "@/lib/team-classifications";
import { cn, formatCurrency, formatPercent, titleCaseStage } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { TeamClassificationBadge } from "@/components/team-classification-badge";

interface DashboardShellProps {
  sessionId: string;
  initialDashboard: AuctionDashboard;
  initialView?: WorkspaceView;
  viewerMode: boolean;
  currentMember: AuthenticatedMember;
}

type WorkspaceView = "auction" | "analysis" | "portfolio" | "overrides";

interface ActiveOverrideRow {
  override: ProjectionOverride;
  team: TeamProjection;
}

const viewLabels: Record<WorkspaceView, string> = {
  auction: "Auction",
  analysis: "Analysis",
  portfolio: "Portfolio",
  overrides: "Overrides"
};

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


export function DashboardShell({
  sessionId,
  initialDashboard,
  initialView = "auction",
  viewerMode,
  currentMember
}: DashboardShellProps) {
  const router = useRouter();
  const { dashboard, refresh, broadcastRefresh, replaceDashboard } = useSessionDashboard(
    sessionId,
    initialDashboard
  );
  const [activeView, setActiveView] = useState<WorkspaceView>(initialView);
  const [selectedTeamId, setSelectedTeamId] = useState(
    dashboard.session.liveState.nominatedTeamId ?? ""
  );
  const [currentBid, setCurrentBid] = useState(dashboard.session.liveState.currentBid);
  const [bidInputValue, setBidInputValue] = useState(
    formatBidInputValue(dashboard.session.liveState.currentBid)
  );
  const [buyerId, setBuyerId] = useState(dashboard.focusSyndicate.id);
  const [isSavingLiveState, setIsSavingLiveState] = useState(false);
  const [isSavingClassification, setIsSavingClassification] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    rating: "",
    offense: "",
    defense: "",
    tempo: ""
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisSearch, setAnalysisSearch] = useState("");
  const [analysisTeamId, setAnalysisTeamId] = useState(
    dashboard.session.liveState.nominatedTeamId ?? ""
  );
  const teamSelectRef = useRef<HTMLInputElement | null>(null);
  const bidInputRef = useRef<HTMLInputElement | null>(null);
  const winnerSelectRef = useRef<HTMLSelectElement | null>(null);
  const activeTeamSaveInFlightRef = useRef(false);
  const pendingActiveTeamIdRef = useRef<string | null>(null);
  const pendingCommittedBidRef = useRef<number | null>(null);
  const isLiveStateDirty =
    bidInputValue.trim() === "" ? true : parseBidInputValue(bidInputValue) !== currentBid;

  useEffect(() => {
    if (isLiveStateDirty && !viewerMode) {
      return;
    }

    const liveBid = dashboard.session.liveState.currentBid;
    if (pendingCommittedBidRef.current !== null) {
      if (liveBid !== pendingCommittedBidRef.current) {
        setSelectedTeamId(dashboard.session.liveState.nominatedTeamId ?? "");
        return;
      }

      pendingCommittedBidRef.current = null;
    }

    setSelectedTeamId(dashboard.session.liveState.nominatedTeamId ?? "");
    setCurrentBid(liveBid);
    setBidInputValue(formatBidInputValue(liveBid));
  }, [dashboard.session.liveState, isLiveStateDirty, viewerMode]);

  useEffect(() => {
    if (!dashboard.ledger.some((syndicate) => syndicate.id === buyerId)) {
      setBuyerId(dashboard.focusSyndicate.id);
    }
  }, [buyerId, dashboard.focusSyndicate.id, dashboard.ledger]);

  const snapshot = dashboard.session.simulationSnapshot;
  const selectedTeam =
    dashboard.session.projections.find((team) => team.id === selectedTeamId) ?? null;
  const liveSession = useMemo(
    () => ({
      ...dashboard.session,
      liveState: {
        ...dashboard.session.liveState,
        nominatedTeamId: selectedTeamId || null,
        currentBid
      }
    }),
    [currentBid, dashboard.session, selectedTeamId]
  );
  const nominatedTeam = selectedTeam;
  const recommendation = useMemo(
    () =>
      buildBidRecommendation(
        liveSession,
        selectedTeam,
        dashboard.focusSyndicate,
        dashboard.analysis
      ),
    [dashboard.analysis, dashboard.focusSyndicate, liveSession, selectedTeam]
  );
  const selectedOverride =
    (selectedTeamId && dashboard.session.projectionOverrides[selectedTeamId]) || null;
  const soldLookup = useMemo(
    () => new Set(dashboard.soldTeams.map((item) => item.team.id)),
    [dashboard.soldTeams]
  );
  const teamLookup = useMemo(
    () => new Map(dashboard.session.projections.map((team) => [team.id, team])),
    [dashboard.session.projections]
  );
  const syndicateLookup = useMemo(
    () => new Map(dashboard.ledger.map((syndicate) => [syndicate.id, syndicate])),
    [dashboard.ledger]
  );
  const portfolioSyndicateBoard = useMemo(() => {
    const mothershipId = dashboard.focusSyndicate.id;
    return [...dashboard.ledger].sort((left, right) => {
      if (left.id === mothershipId) {
        return -1;
      }
      if (right.id === mothershipId) {
        return 1;
      }
      return 0;
    });
  }, [dashboard.focusSyndicate.id, dashboard.ledger]);
  const analysisDetailTeam =
    dashboard.session.projections.find((t) => t.id === analysisTeamId) ?? null;
  const analysisRow =
    dashboard.analysis.ranking.find((row) => row.teamId === analysisTeamId) ?? null;
  const analysisBudgetRow =
    dashboard.analysis.budgetRows.find((row) => row.teamId === analysisTeamId) ?? null;
  const analysisTeamClassification = analysisRow?.classification ?? null;
  const focusOwnedTeams = useMemo(
    () =>
      dashboard.soldTeams.filter(
        (item) => item.buyerSyndicateId === dashboard.focusSyndicate.id
      ),
    [dashboard.focusSyndicate.id, dashboard.soldTeams]
  );
  const recentSales = useMemo(
    () => [...dashboard.soldTeams].slice(-4).reverse(),
    [dashboard.soldTeams]
  );
  const ownedTeamLookup = useMemo(
    () => new Map(dashboard.analysis.ownedTeams.map((team) => [team.teamId, team])),
    [dashboard.analysis.ownedTeams]
  );
  const filteredAnalysisRows = useMemo(() => {
    const normalized = analysisSearch.trim().toLowerCase();
    if (!normalized) {
      return dashboard.analysis.budgetRows;
    }

    return dashboard.analysis.budgetRows.filter((row) => {
      const analysisItem = dashboard.analysis.ranking.find((candidate) => candidate.teamId === row.teamId);
      const haystack = `${row.teamName} ${analysisItem?.shortName ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [analysisSearch, dashboard.analysis.budgetRows, dashboard.analysis.ranking]);
  const filteredRationale = useMemo(
    () =>
      recommendation?.rationale.filter(
        (line) => !line.toLowerCase().includes("likely bidder pressure")
      ) ?? [],
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
    (nominatedTeam &&
      snapshot?.teamResults[nominatedTeam.id]?.roundProbabilities.champion) ||
    0;
  const nominatedTeamClassification =
    (nominatedTeam && dashboard.session.teamClassifications[nominatedTeam.id]?.classification) ||
    null;
  const focusFunding = useMemo(
    () =>
      deriveMothershipFundingSnapshot(
        dashboard.session.mothershipFunding,
        dashboard.focusSyndicate.spend
      ),
    [dashboard.focusSyndicate.spend, dashboard.session.mothershipFunding]
  );
  const projectedFundingStatus = deriveFundingStatus(
    dashboard.focusSyndicate.spend + currentBid,
    dashboard.session.mothershipFunding
  );
  const projectedBaseRoom = focusFunding.baseBidRoom - currentBid;
  const projectedStretchRoom = focusFunding.stretchBidRoom - currentBid;
  const selectedSimulation = analysisDetailTeam
    ? snapshot?.teamResults[analysisDetailTeam.id] ?? null
    : null;
  const breakEvenStage = selectedTeam
    ? getBreakEvenStage(currentBid, dashboard.session.payoutRules)
    : null;

  useEffect(() => {
    if (!selectedTeam) {
      setOverrideForm({
        rating: "",
        offense: "",
        defense: "",
        tempo: ""
      });
      return;
    }

    setOverrideForm({
      rating: selectedOverride?.rating?.toString() ?? selectedTeam.rating.toString(),
      offense: selectedOverride?.offense?.toString() ?? selectedTeam.offense.toString(),
      defense: selectedOverride?.defense?.toString() ?? selectedTeam.defense.toString(),
      tempo: selectedOverride?.tempo?.toString() ?? selectedTeam.tempo.toString()
    });
  }, [selectedOverride, selectedTeam]);

  const saveActiveTeam = useCallback(async (nextTeamId: string) => {
    pendingActiveTeamIdRef.current = nextTeamId;

    if (activeTeamSaveInFlightRef.current) {
      return;
    }

    activeTeamSaveInFlightRef.current = true;

    while (pendingActiveTeamIdRef.current !== null) {
      const teamIdToPersist = pendingActiveTeamIdRef.current;
      pendingActiveTeamIdRef.current = null;

      setError(null);
      setNotice(null);

      const response = await fetch(`/api/sessions/${sessionId}/live-state`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nominatedTeamId: teamIdToPersist || null
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };

        if (pendingActiveTeamIdRef.current === null) {
          setError(payload.error ?? "Unable to update active team.");
        }

        continue;
      }

      if (pendingActiveTeamIdRef.current !== null) {
        continue;
      }

      void broadcastRefresh("active-team");
      startTransition(() => {
        void refresh();
      });
    }

    activeTeamSaveInFlightRef.current = false;
  }, [broadcastRefresh, refresh, sessionId]);

  const saveLiveState = useCallback(async () => {
    setError(null);
    setNotice(null);
    setIsSavingLiveState(true);
    const nextBid = parseBidInputValue(bidInputValue);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/live-state`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nominatedTeamId: selectedTeamId || null,
          currentBid: nextBid
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Unable to update live state.");
        return;
      }

      pendingCommittedBidRef.current = nextBid;
      setCurrentBid(nextBid);
      setBidInputValue(formatBidInputValue(nextBid));
      void broadcastRefresh("live-state");
      startTransition(() => {
        void refresh();
      });
    } catch {
      setError("Unable to update live state.");
    } finally {
      setIsSavingLiveState(false);
    }
  }, [bidInputValue, broadcastRefresh, refresh, selectedTeamId, sessionId]);

  const handleShortcut = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName ?? "";
    const isEditable =
      target !== null &&
      (tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target.isContentEditable);

    if (event.key === "Escape" && isEditable) {
      event.preventDefault();
      target.blur();
      return;
    }

    if (event.key === "/" && !isEditable) {
      event.preventDefault();
      teamSelectRef.current?.focus();
      return;
    }

    if (event.key.toLowerCase() === "b" && !isEditable) {
      event.preventDefault();
      bidInputRef.current?.focus();
      bidInputRef.current?.select();
      return;
    }

    if (event.key.toLowerCase() === "w" && !isEditable) {
      event.preventDefault();
      winnerSelectRef.current?.focus();
      return;
    }

    if (
      event.key === "Enter" &&
      activeView === "auction" &&
      (tagName === "INPUT" || !isEditable)
    ) {
      event.preventDefault();
      void saveLiveState();
    }
  }, [activeView, saveLiveState]);

  useEffect(() => {
    if (viewerMode) {
      return;
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [handleShortcut, viewerMode]);

  const recordPurchase = useCallback(async () => {
    setError(null);
    setNotice(null);

    if (currentBid <= 0) {
      setError("Enter a bid greater than $0 before recording a purchase.");
      return;
    }

    if (!selectedTeamId) {
      setError("Choose a nominated team before recording a purchase.");
      return;
    }

    const response = await fetch(`/api/sessions/${sessionId}/purchases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        teamId: selectedTeamId || undefined,
        buyerSyndicateId: buyerId,
        price: currentBid
      })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to record purchase.");
      return;
    }

    setNotice("Purchase recorded.");
    void broadcastRefresh("purchase");
    startTransition(() => {
      void refresh();
    });
  }, [broadcastRefresh, buyerId, currentBid, refresh, selectedTeamId, sessionId]);

  async function saveProjectionOverride() {
    if (!selectedTeamId) {
      setError("Choose a team before saving an override.");
      return;
    }

    setError(null);
    setNotice(null);
    const response = await fetch(
      `/api/sessions/${sessionId}/projections/${selectedTeamId}/override`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          rating: Number(overrideForm.rating),
          offense: Number(overrideForm.offense),
          defense: Number(overrideForm.defense),
          tempo: Number(overrideForm.tempo)
        })
      }
    );

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to save projection override.");
      return;
    }

    setNotice("Projection override saved and simulation rebuilt.");
    startTransition(() => {
      void refresh();
    });
  }

  async function clearProjectionOverride() {
    if (!selectedTeamId) {
      setError("Choose a team before clearing an override.");
      return;
    }

    setError(null);
    setNotice(null);
    const response = await fetch(
      `/api/sessions/${sessionId}/projections/${selectedTeamId}/override`,
      {
        method: "DELETE"
      }
    );

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to clear projection override.");
      return;
    }

    setNotice("Projection override cleared.");
    startTransition(() => {
      void refresh();
    });
  }

  async function saveTeamClassification(classification: TeamClassificationValue) {
    if (!analysisDetailTeam) {
      setError("Choose a team before saving a classification.");
      return;
    }

    setError(null);
    setNotice(null);
    setIsSavingClassification(true);

    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/projections/${analysisDetailTeam.id}/classification`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ classification })
        }
      );

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Unable to save team classification.");
        return;
      }

      const nextDashboard = (await response.json()) as AuctionDashboard;
      replaceDashboard(nextDashboard);
      void broadcastRefresh("team-classification");
    } catch {
      setError("Unable to save team classification.");
    } finally {
      setIsSavingClassification(false);
    }
  }

  async function clearTeamClassification() {
    if (!analysisDetailTeam) {
      setError("Choose a team before clearing a classification.");
      return;
    }

    setError(null);
    setNotice(null);
    setIsSavingClassification(true);

    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/projections/${analysisDetailTeam.id}/classification`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Unable to clear team classification.");
        return;
      }

      const nextDashboard = (await response.json()) as AuctionDashboard;
      replaceDashboard(nextDashboard);
      void broadcastRefresh("team-classification");
    } catch {
      setError("Unable to clear team classification.");
    } finally {
      setIsSavingClassification(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST"
    });
    router.push("/");
    router.refresh();
  }

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

      {viewerMode ? (
        <ViewerBoard
          dashboard={dashboard}
          recommendation={recommendation}
        />
      ) : (
        <>
          <nav className="workspace-tabs" aria-label="Workspace views">
            {(Object.keys(viewLabels) as WorkspaceView[]).map((view) => (
              <button
                key={view}
                type="button"
                className={cn(
                  "workspace-tab",
                  activeView === view && "workspace-tab--active"
                )}
                onClick={() => setActiveView(view)}
              >
                {viewLabels[view]}
              </button>
            ))}
          </nav>

          {activeView === "auction" ? (
            <section className="auction-layout">
              <div className="auction-layout__main">
                <section className="decision-grid">
                  <article className="surface-card decision-panel">
                    <div className="decision-panel__header">
                      <div>
                        <p className="eyebrow">Live Decision Board</p>
                        <h2>{nominatedTeam ? nominatedTeam.name : "Waiting for nomination"}</h2>
                        <p className="decision-panel__subcopy">
                          {nominatedTeam
                            ? `${nominatedTeam.seed}-seed, ${nominatedTeam.region} region`
                            : "Set an active team to unlock bid guidance."}
                        </p>
                        {nominatedTeamClassification ? (
                          <div className="decision-panel__classification">
                            <TeamClassificationBadge classification={nominatedTeamClassification} />
                          </div>
                        ) : null}
                      </div>
                      {recommendation ? (
                        <div
                          className={cn(
                            "signal-pill",
                            `signal-pill--${recommendation.stoplight}`
                          )}
                        >
                          {stoplightLabels[recommendation.stoplight]}
                        </div>
                      ) : null}
                    </div>

                    <div className="decision-strip">
                      <div className="decision-stat decision-stat--active">
                        <span className="insight-label">
                          Current bid
                          <button
                            type="button"
                            className="tooltip-hint"
                            aria-label="Current bid explanation"
                          >
                            ?
                            <span className="tooltip-content">
                              The live price currently on the board for this team. Break-even,
                              funding status, and recommendation context all update against this
                              number.
                            </span>
                          </button>
                        </span>
                        <strong>{formatCurrency(currentBid)}</strong>
                      </div>
                      <div className="decision-stat">
                        <span className="insight-label">
                          Break-even round
                          <button
                            type="button"
                            className="tooltip-hint"
                            aria-label="Break-even round explanation"
                          >
                            ?
                            <span className="tooltip-content">
                              The earliest round where cumulative estimated payout covers the
                              current bid. It uses the room&apos;s projected pot and payout
                              structure, so it is an estimate rather than realized profit.
                            </span>
                          </button>
                        </span>
                        <strong>{formatBreakEvenStage(breakEvenStage)}</strong>
                      </div>
                      <div className="decision-stat">
                        <span className="insight-label">
                          Target bid
                          <button
                            type="button"
                            className="tooltip-hint"
                            aria-label="Target bid explanation"
                          >
                            ?
                            <span className="tooltip-content">
                              The model&apos;s normal buy price for this team based on conviction and
                              Mothership&apos;s remaining base-plan buying room.
                            </span>
                          </button>
                        </span>
                        <strong>
                          {recommendation
                            ? formatCurrency(recommendation.targetBid)
                            : "--"}
                        </strong>
                      </div>
                      <div className="decision-stat">
                        <span className="insight-label">
                          Max bid
                          <button
                            type="button"
                            className="tooltip-hint"
                            aria-label="Max bid explanation"
                          >
                            ?
                            <span className="tooltip-content">
                              The highest bid the model can justify after stretch funding room and
                              portfolio overlap penalties are applied.
                            </span>
                          </button>
                        </span>
                        <strong>
                          {recommendation ? formatCurrency(recommendation.maxBid) : "--"}
                        </strong>
                      </div>
                      <div className="decision-stat">
                        <span className="insight-label">
                          Base room after buy
                          <button
                            type="button"
                            className="tooltip-hint"
                            aria-label="Base room after buy explanation"
                          >
                            ?
                            <span className="tooltip-content">
                              How much room would remain inside Mothership&apos;s base funding plan
                              after buying this team at the current bid.
                            </span>
                          </button>
                        </span>
                        <strong>{formatCurrency(projectedBaseRoom)}</strong>
                      </div>
                      <div className="decision-stat">
                        <span className="insight-label">
                          Funding status
                          <button
                            type="button"
                            className="tooltip-hint"
                            aria-label="Funding status explanation"
                          >
                            ?
                            <span className="tooltip-content">
                              Shows whether buying at the current bid stays within Mothership&apos;s
                              base plan, requires stretch funding, or moves above the current
                              funding plan.
                            </span>
                          </button>
                        </span>
                        <strong>
                          {recommendation
                            ? fundingStatusLabels[recommendation.fundingStatus]
                            : fundingStatusLabels[projectedFundingStatus]}
                        </strong>
                      </div>
                      <div className="decision-stat">
                        <span className="insight-label">
                          Simulated net
                          <button
                            type="button"
                            className="tooltip-hint"
                            aria-label="Simulated net explanation"
                          >
                            ?
                            <span className="tooltip-content">
                              Expected gross payout minus the current bid and the ownership overlap
                              penalty for teams Mothership already owns.
                            </span>
                          </button>
                        </span>
                        <strong>
                          {recommendation
                            ? formatCurrency(recommendation.expectedNetValue)
                            : "--"}
                        </strong>
                      </div>
                    </div>
                  </article>

                  <article className="surface-card callout-panel">
                    <p className="eyebrow">Call</p>
                    <h3>
                      {recommendation
                        ? recommendation.stoplight === "buy"
                          ? `Bid through ${formatCurrency(recommendation.targetBid)}`
                          : recommendation.stoplight === "caution"
                            ? `Hold the line at ${formatCurrency(recommendation.maxBid)}`
                            : `Pass above ${formatCurrency(recommendation.maxBid)}`
                        : "Pick a team to set the board"}
                    </h3>
                    <p>
                      {recommendation
                        ? fundingStatusLabels[recommendation.fundingStatus]
                        : "The auction surface stays focused on one decision strip at a time."}
                    </p>
                    {recommendation?.rationale[2] ? (
                      <p className="call-conflict">{recommendation.rationale[2]}</p>
                    ) : null}
                  </article>
                </section>

                <article className="surface-card">
                  <div className="section-headline">
                    <div>
                      <p className="eyebrow">Model Drivers</p>
                      <h3>Visible metrics that justify the bid call</h3>
                    </div>
                  </div>
                  <div className="metric-grid">
                    <MetricCard
                      label="Expected gross"
                      value={
                        recommendation
                          ? formatCurrency(recommendation.expectedGrossPayout)
                          : "--"
                      }
                      tooltip="Average modeled payout for this team across the simulation before subtracting what you would pay for it."
                    />
                    <MetricCard
                      label="Expected net"
                      value={
                        recommendation
                          ? formatCurrency(recommendation.expectedNetValue)
                          : "--"
                      }
                      tooltip="Expected gross minus the current bid and the model's overlap penalty for teams Mothership already owns."
                    />
                    <MetricCard
                      label="Sim confidence"
                      value={
                        recommendation
                          ? `${formatCurrency(recommendation.confidenceBand[0])}-${formatCurrency(
                              recommendation.confidenceBand[1]
                            )}`
                          : "--"
                      }
                      longValue={Boolean(recommendation)}
                      tooltip="The model's typical value range for this team. It is shown as expected payout plus or minus about one standard deviation."
                    />
                    <MetricCard
                      label="Opening bid"
                      value={
                        recommendation ? formatCurrency(recommendation.openingBid) : "--"
                      }
                      tooltip="A conservative first number to put on the board before the bidding settles into the target and max range."
                    />
                    <MetricCard
                      label="Base budget room"
                      value={
                        recommendation
                          ? formatCurrency(recommendation.baseBudgetHeadroom)
                          : formatCurrency(projectedBaseRoom)
                      }
                      tooltip="Room left inside Mothership's base funding plan after the current bid."
                    />
                    <MetricCard
                      label="Stretch budget room"
                      value={
                        recommendation
                          ? formatCurrency(recommendation.stretchBudgetHeadroom)
                          : formatCurrency(projectedStretchRoom)
                      }
                      tooltip="Room left if Mothership moves beyond base and into its stretch funding plan."
                    />
                    <MetricCard
                      label="Ownership penalty"
                      value={
                        recommendation
                          ? formatCurrency(recommendation.ownershipPenalty)
                          : "--"
                      }
                      tooltip="How much value the model subtracts because this team overlaps with teams Mothership already owns."
                    />
                    <MetricCard
                      label="Value gap to max"
                      value={
                        recommendation
                          ? formatCurrency(recommendation.valueGap)
                          : "--"
                      }
                      tooltip="The room left between the current bid and the model's adjusted max bid for this team. Negative means the bid is already above max."
                    />
                    <MetricCard
                      label="Portfolio concentration"
                      value={
                        recommendation
                          ? formatPercent(recommendation.concentrationScore)
                          : "--"
                      }
                      tooltip="How concentrated Mothership already is. Higher concentration means the model gets more cautious about adding more exposure."
                    />
                    <MetricCard
                      label="Effective share price"
                      value={
                        focusFunding.impliedSharePrice === null
                          ? "--"
                          : formatCurrency(focusFunding.impliedSharePrice)
                      }
                      tooltip="What each equivalent Mothership share implies based on current spend."
                    />
                    <MetricCard
                      label="Title odds"
                      value={formatPercent(titleOdds)}
                      tooltip="The simulated chance this team wins the tournament."
                    />
                  </div>
                </article>

                <section className="detail-grid">
                  <article className="surface-card">
                    <div className="section-headline">
                      <div>
                        <p className="eyebrow">Rationale</p>
                        <h3>Decision context</h3>
                      </div>
                    </div>
                    {filteredRationale.length ? (
                      <div className="list-stack">
                        {filteredRationale.map((line) => (
                          <div key={line} className="list-line">
                            {line}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-copy">
                        Choose a team to unlock simulation-backed rationale.
                      </p>
                    )}
                  </article>

                  <article className="surface-card">
                    <div className="section-headline">
                      <div>
                        <p className="eyebrow">Ownership Conflicts</p>
                        <h3>Where current holdings collide</h3>
                      </div>
                    </div>
                    {nominatedTeam &&
                    snapshot?.teamResults[nominatedTeam.id]?.likelyConflicts.length ? (
                      <div className="list-stack">
                        {snapshot.teamResults[nominatedTeam.id].likelyConflicts
                          .slice(0, 4)
                          .map((conflict) => (
                            <ConflictRow
                              key={conflict.opponentId}
                              conflict={conflict}
                              teamLookup={teamLookup}
                            />
                          ))}
                      </div>
                    ) : (
                      <p className="empty-copy">No immediate portfolio collision flags.</p>
                    )}
                  </article>
                </section>
              </div>

              <aside className="auction-layout__side">
                <article className="surface-card control-panel">
                  <div className="section-headline">
                    <div>
                      <p className="eyebrow">Live Controls</p>
                    </div>
                  </div>
                  <div className="shortcut-legend">
                    <div className="shortcut-legend__row"><kbd>/</kbd><span>Focus team</span></div>
                    <div className="shortcut-legend__row"><kbd>B</kbd><span>Focus bid</span></div>
                    <div className="shortcut-legend__row"><kbd>W</kbd><span>Focus winner</span></div>
                    <div className="shortcut-legend__row"><kbd>↵</kbd><span>Save board</span></div>
                  </div>

                  <div className="field-stack">
                    <label className="field-shell field-shell--accent">
                      <span>Active team</span>
                      <TeamCombobox
                        teams={dashboard.session.projections}
                        soldLookup={soldLookup}
                        value={selectedTeamId}
                        inputRef={teamSelectRef}
                        onChange={(nextTeamId) => {
                          const nextBid = 0;
                          setSelectedTeamId(nextTeamId);
                          setCurrentBid(nextBid);
                          setBidInputValue(formatBidInputValue(nextBid));
                          void saveActiveTeam(nextTeamId);
                        }}
                      />
                    </label>

                    <label className="field-shell">
                      <span>Current bid{isLiveStateDirty ? " — unsaved" : ""}</span>
                      <div className="live-bid-field">
                        <input
                          ref={bidInputRef}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={bidInputValue}
                          onChange={(event) =>
                            setBidInputValue(formatBidInputText(event.target.value))
                          }
                          onFocus={(event) => event.target.select()}
                          onClick={(event) => event.currentTarget.select()}
                        />
                        <button
                          type="button"
                          className={
                            isLiveStateDirty
                              ? "live-bid-save live-bid-save--dirty"
                              : "live-bid-save"
                          }
                          aria-label={
                            isSavingLiveState
                              ? "Saving current bid"
                              : isLiveStateDirty
                                ? "Save current bid to board"
                                : "Current bid is synced"
                          }
                          title={
                            isSavingLiveState
                              ? "Saving current bid"
                              : isLiveStateDirty
                                ? "Save current bid to board"
                                : "Current bid is synced"
                          }
                          disabled={isSavingLiveState || !isLiveStateDirty}
                          onClick={() => void saveLiveState()}
                        >
                          {isSavingLiveState ? "…" : isLiveStateDirty ? "↵" : "✓"}
                        </button>
                      </div>
                    </label>

                    <label className="field-shell">
                      <span>Winner</span>
                      <select
                        ref={winnerSelectRef}
                        value={buyerId}
                        onChange={(event) => setBuyerId(event.target.value)}
                      >
                        {dashboard.ledger.map((syndicate) => (
                          <option key={syndicate.id} value={syndicate.id}>
                            {syndicate.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="button-row">
                    <button
                      type="button"
                      className="button button-accent"
                      disabled={currentBid <= 0 || !selectedTeamId}
                      onClick={() => void recordPurchase()}
                    >
                      Record purchase
                    </button>
                  </div>

                  {notice ? <p className="notice-text">{notice}</p> : null}
                  {error ? <p className="error-text">{error}</p> : null}
                </article>

                <article className="surface-card">
                  <div className="section-headline">
                    <div>
                      <p className="eyebrow">Auction Pulse</p>
                      <h3>Mothership position</h3>
                    </div>
                  </div>
                  <div className="mini-grid">
                    <MetricCard
                      label="Spend"
                      value={formatCurrency(dashboard.focusSyndicate.spend)}
                      compact
                    />
                    <MetricCard
                      label="Base room"
                      value={formatCurrency(focusFunding.baseBidRoom)}
                      compact
                    />
                    <MetricCard
                      label="Stretch room"
                      value={formatCurrency(focusFunding.stretchBidRoom)}
                      compact
                    />
                    <MetricCard
                      label="Effective share price"
                      value={
                        focusFunding.impliedSharePrice === null
                          ? "--"
                          : formatCurrency(focusFunding.impliedSharePrice)
                      }
                      compact
                    />
                  </div>
                </article>

                <article className="surface-card">
                  <div className="section-headline">
                    <div>
                      <p className="eyebrow">Recent Sales</p>
                      <h3>Latest auction activity</h3>
                    </div>
                  </div>
                  {recentSales.length ? (
                    <div className="list-stack">
                      {recentSales.map((sale) => (
                        <SaleRow
                          key={`${sale.team.id}-${sale.price}`}
                          sale={sale}
                          syndicateLookup={syndicateLookup}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="empty-copy">No sales have been recorded yet.</p>
                  )}
                </article>
              </aside>
            </section>
          ) : null}

          {activeView === "analysis" ? (
            <section className="detail-grid">
              <article className="surface-card">
                <div className="section-headline">
                  <div>
                    <p className="eyebrow">Analysis</p>
                    <h2>Session ranking and budget plan</h2>
                  </div>
                  <div className="button-row">
                    <span className="status-pill">
                      {dashboard.analysis.targetTeamCount} target teams
                    </span>
                    <span className="status-pill">
                      {dashboard.analysis.maxSingleTeamPct}% max cap
                    </span>
                  </div>
                </div>

                <div className="form-grid analysis-search-row">
                  <label className="field-shell">
                    <span>Search</span>
                    <input
                      type="search"
                      value={analysisSearch}
                      onChange={(event) => setAnalysisSearch(event.target.value)}
                      placeholder="Type team or abbreviation"
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
                          key={row.teamId}
                          className={cn(analysisTeamId === row.teamId && "table-row--focus")}
                          onClick={() => setAnalysisTeamId(row.teamId)}
                        >
                          <td>#{row.rank}</td>
                          <td>
                            <strong>{row.teamName}</strong>
                          </td>
                          <td>
                            {row.classification ? (
                              <TeamClassificationBadge
                                classification={row.classification}
                                compact
                              />
                            ) : (
                              <span className="team-classification-empty">--</span>
                            )}
                          </td>
                          <td>
                            {dashboard.analysis.ranking
                              .find((candidate) => candidate.teamId === row.teamId)
                              ?.compositeScore.toFixed(3) ?? "--"}
                          </td>
                          <td>{formatCurrency(row.targetBid)}</td>
                          <td>{formatCurrency(row.maxBid)}</td>
                          <td>{ownedTeamLookup.has(row.teamId) ? "Owned" : "Available"}</td>
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
                                        event.currentTarget.nextElementSibling?.removeAttribute("hidden");
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
                      <div className="button-row">
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
                        label="Target / max"
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
                          <p className="empty-copy">No standout strengths from available scouting data.</p>
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
                          <p className="empty-copy">No material risk flags from available scouting data.</p>
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
                        label="Conviction share"
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

          {activeView === "portfolio" ? (
            <section className="stack-layout">
              <article className="surface-card">
                <div className="section-headline">
                  <div>
                    <p className="eyebrow">Mothership Summary</p>
                    <h2>Portfolio position</h2>
                  </div>
                </div>
                <div className="metric-grid">
                  <MetricCard label="Owned teams" value={`${focusOwnedTeams.length}`} />
                  <MetricCard
                    label="Total spend"
                    value={formatCurrency(dashboard.focusSyndicate.spend)}
                  />
                  <MetricCard
                    label="Base room"
                    value={formatCurrency(focusFunding.baseBidRoom)}
                  />
                  <MetricCard
                    label="Effective share price"
                    value={
                      focusFunding.impliedSharePrice === null
                        ? "--"
                        : formatCurrency(focusFunding.impliedSharePrice)
                    }
                  />
                </div>
              </article>

              <section className="detail-grid">
                <article className="surface-card">
                  <div className="section-headline">
                    <div>
                      <p className="eyebrow">Owned Teams</p>
                      <h3>Readable position cards</h3>
                    </div>
                  </div>
                  {focusOwnedTeams.length ? (
                    <div className="portfolio-card-grid">
                      {focusOwnedTeams.map((item) => {
                        const modeledValue =
                          snapshot?.teamResults[item.team.id]?.expectedGrossPayout ?? 0;
                        const valueDelta = modeledValue - item.price;
                        return (
                          <article key={item.team.id} className="portfolio-card">
                            <div>
                              <h4>{item.team.name}</h4>
                              <p>
                                {item.team.seed}-seed, {item.team.region}
                              </p>
                            </div>
                            <div className="portfolio-card__metrics">
                              <MetricCard
                                label="Purchase price"
                                value={formatCurrency(item.price)}
                                compact
                              />
                              <MetricCard
                                label="Modeled value"
                                value={formatCurrency(modeledValue)}
                                compact
                              />
                              <MetricCard
                                label="Delta"
                                value={formatCurrency(valueDelta)}
                                compact
                              />
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="empty-copy">
                      No purchased teams yet for {dashboard.focusSyndicate.name}.
                    </p>
                  )}
                </article>

                <article className="surface-card">
                  <div className="section-headline">
                    <div>
                      <p className="eyebrow">Syndicate Board</p>
                      <h3>Spend, estimates, and EV</h3>
                    </div>
                  </div>
                  <div className="syndicate-board">
                    {portfolioSyndicateBoard.map((syndicate) => (
                      <div key={syndicate.id} className="syndicate-row">
                        <div className="syndicate-row__title">
                          <span
                            className="syndicate-dot"
                            style={{ backgroundColor: syndicate.color }}
                          />
                          <div>
                            <strong>{syndicate.name}</strong>
                            <span>{syndicate.ownedTeamIds.length} teams owned</span>
                          </div>
                        </div>
                        <div>
                          <span>Spend</span>
                          <strong>{formatCurrency(syndicate.spend)}</strong>
                        </div>
                        <div>
                          <span>
                            {syndicate.id === dashboard.focusSyndicate.id
                              ? "Base room"
                              : "Est. room"}
                          </span>
                          <strong>
                            {formatCurrency(
                              syndicate.id === dashboard.focusSyndicate.id
                                ? focusFunding.baseBidRoom
                                : syndicate.estimatedRemainingBudget
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>
                            {syndicate.id === dashboard.focusSyndicate.id
                              ? "Portfolio EV"
                              : "Estimated budget"}
                          </span>
                          <strong>
                            {formatCurrency(
                              syndicate.id === dashboard.focusSyndicate.id
                                ? syndicate.portfolioExpectedValue
                                : syndicate.estimatedBudget
                            )}
                          </strong>
                        </div>
                        {syndicate.id !== dashboard.focusSyndicate.id && syndicate.estimateExceeded ? (
                          <div>
                            <span>Room read</span>
                            <strong>Estimate exceeded</strong>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              </section>
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
                      value={selectedTeamId}
                      onChange={(event) => setSelectedTeamId(event.target.value)}
                    >
                      <option value="">Select a team</option>
                      {dashboard.session.projections.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.seed}. {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedTeam ? (
                    <>
                      <div className="override-summary">
                        <strong>{selectedTeam.name}</strong>
                        <span>
                          Source {selectedTeam.source}
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
                    <p className="empty-copy">
                      Choose a team to edit projection inputs.
                    </p>
                  )}
                </div>

                {selectedTeam ? (
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

        </>
      )}
    </main>
  );
}

function ViewerBoard({
  dashboard,
  recommendation
}: {
  dashboard: AuctionDashboard;
  recommendation: BidRecommendation | null;
}) {
  const nominatedTeam = dashboard.nominatedTeam;
  const [ownershipSearch, setOwnershipSearch] = useState("");
  const soldFeed = useMemo(() => [...dashboard.soldTeams].reverse(), [dashboard.soldTeams]);
  const ownershipGroups = useMemo(() => {
    const normalized = ownershipSearch.trim().toLowerCase();
    const hasActiveSearch = normalized.length > 0;
    const matchesSearch = (sale: SoldTeamSummary) =>
      !normalized || sale.team.name.toLowerCase().includes(normalized);

    return [
      ...[
        {
          syndicate: dashboard.focusSyndicate,
          sales: dashboard.soldTeams.filter(
            (sale) =>
              sale.buyerSyndicateId === dashboard.focusSyndicate.id && matchesSearch(sale)
          ),
          highlight: true
        }
      ].filter((group) => group.sales.length > 0 || !hasActiveSearch),
      ...dashboard.ledger
        .filter((syndicate) => syndicate.id !== dashboard.focusSyndicate.id)
        .map((syndicate) => ({
          syndicate,
          sales: dashboard.soldTeams.filter(
            (sale) => sale.buyerSyndicateId === syndicate.id && matchesSearch(sale)
          ),
          highlight: false
        }))
        .filter((group) => group.sales.length > 0 || !hasActiveSearch)
      ];
  }, [dashboard.focusSyndicate, dashboard.ledger, dashboard.soldTeams, ownershipSearch]);
  return (
    <section className="viewer-layout">
      <div className="viewer-layout__main">
        <article className="surface-card viewer-board viewer-board--spotlight">
          <p className="eyebrow">Shared Board</p>
          <div className="viewer-bid-hero viewer-bid-hero--team">
            <div className="viewer-bid-hero__pulse">
              <span className="pulse-dot" />
              <span>{nominatedTeam ? "Active team" : "Awaiting nomination"}</span>
            </div>
            <strong
              className={cn(!nominatedTeam && "viewer-bid-hero__title--waiting")}
            >
              {nominatedTeam ? nominatedTeam.name : "Waiting for next team"}
            </strong>
            <p className="viewer-board__subcopy">
              {nominatedTeam
                ? `${nominatedTeam.seed}-seed, ${nominatedTeam.region} region`
                : "The next active team will take over this board as soon as the operator makes a nomination."}
            </p>
            {nominatedTeam &&
            dashboard.session.teamClassifications[nominatedTeam.id]?.classification ? (
              <div className="viewer-bid-hero__classification">
                <TeamClassificationBadge
                  classification={
                    dashboard.session.teamClassifications[nominatedTeam.id]?.classification
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="metric-grid viewer-board__metrics">
            <MetricCard
              label="Target / max"
              value={
                recommendation
                  ? `${formatCurrency(recommendation.targetBid)} / ${formatCurrency(recommendation.maxBid)}`
                  : "--"
              }
              longValue={Boolean(recommendation)}
            />
            <MetricCard
              label="Stoplight"
              value={recommendation ? stoplightLabels[recommendation.stoplight] : "Idle"}
            />
            <MetricCard
              label="Funding status"
              value={
                recommendation
                  ? fundingStatusLabels[recommendation.fundingStatus]
                  : fundingStatusLabels[
                      deriveFundingStatus(
                        dashboard.focusSyndicate.spend,
                        dashboard.session.mothershipFunding
                      )
                    ]
              }
            />
            <MetricCard
              label="Effective share price"
              value={
                dashboard.analysis.funding.impliedSharePrice === null
                  ? "--"
                  : formatCurrency(dashboard.analysis.funding.impliedSharePrice)
              }
            />
            <MetricCard label="Teams remaining" value={`${dashboard.availableTeams.length}`} />
            <MetricCard
              label="Mothership total spent"
              value={formatCurrency(dashboard.focusSyndicate.spend)}
            />
          </div>
        </article>

        <article className="surface-card">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Ownership Ledger</p>
              <h3>Syndicate Holdings</h3>
            </div>
            <div className="viewer-ledger-search">
              <input
                type="search"
                value={ownershipSearch}
                onChange={(event) => setOwnershipSearch(event.target.value)}
                placeholder="Filter by team name"
              />
            </div>
          </div>
          {ownershipGroups.length ? (
            <div className="viewer-ledger">
              {ownershipGroups.map((group) => (
                <ViewerOwnershipLedgerGroup
                  key={group.syndicate.id}
                  group={group}
                  isMothership={group.highlight}
                  hasActiveSearch={ownershipSearch.trim().length > 0}
                />
              ))}
            </div>
          ) : (
            <p className="empty-copy">No matching teams in current syndicate holdings.</p>
          )}
        </article>
      </div>

      <aside className="viewer-layout__side">
        {recommendation ? (
          <article className="surface-card viewer-guidance-card">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Live Guidance</p>
                <h3>What Mothership should keep in view</h3>
              </div>
            </div>
            <div className="list-stack">
              {recommendation.rationale.slice(0, 3).map((line) => (
                <div key={line} className="list-line">
                  {line}
                </div>
              ))}
            </div>
          </article>
        ) : null}

        <article className="surface-card">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Sold Teams</p>
              <h3>Most recent sales first</h3>
            </div>
          </div>
          {soldFeed.length ? (
            <div className="list-stack">
              {soldFeed.map((sale) => (
                <ViewerSoldTeamRow
                  key={`${sale.team.id}-${sale.price}-${sale.buyerSyndicateId}`}
                  sale={sale}
                  buyerName={
                    dashboard.ledger.find((syndicate) => syndicate.id === sale.buyerSyndicateId)
                      ?.name ?? sale.buyerSyndicateId
                  }
                />
              ))}
            </div>
          ) : (
            <p className="empty-copy">No teams have sold yet.</p>
          )}
        </article>
      </aside>
    </section>
  );
}

function ViewerSoldTeamRow({
  sale,
  buyerName
}: {
  sale: SoldTeamSummary;
  buyerName: string;
}) {
  return (
    <div className="list-row">
      <div>
        <strong>{sale.team.name}</strong>
        <span>To {buyerName}</span>
      </div>
      <strong>{formatCurrency(sale.price)}</strong>
    </div>
  );
}

function MetricCard({
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

function formatBreakEvenStage(stage: Stage | "negativeReturn" | null) {
  if (stage === null) {
    return "--";
  }

  if (stage === "negativeReturn") {
    return "Negative return";
  }

  return titleCaseStage(stage);
}

function ConflictRow({
  conflict,
  teamLookup
}: {
  conflict: MatchupConflict;
  teamLookup: Map<string, TeamProjection>;
}) {
  const opponent = teamLookup.get(conflict.opponentId);

  return (
    <div className="list-row">
      <div>
        <strong>{opponent?.name ?? conflict.opponentId}</strong>
        <span>{titleCaseStage(conflict.earliestRound)} window</span>
      </div>
      <strong>{formatPercent(conflict.probability)}</strong>
    </div>
  );
}

function SaleRow({
  sale,
  syndicateLookup
}: {
  sale: SoldTeamSummary;
  syndicateLookup: Map<string, Syndicate>;
}) {
  const buyer = syndicateLookup.get(sale.buyerSyndicateId);

  return (
    <div className="list-row">
      <div>
        <strong>{sale.team.name}</strong>
        <span>{buyer?.name ?? sale.buyerSyndicateId}</span>
      </div>
      <strong>{formatCurrency(sale.price)}</strong>
    </div>
  );
}

function ViewerOwnershipLedgerGroup({
  group,
  isMothership,
  hasActiveSearch
}: {
  group: { syndicate: Syndicate; sales: SoldTeamSummary[] };
  isMothership: boolean;
  hasActiveSearch: boolean;
}) {
  return (
    <article
      className={cn("viewer-ledger-group", isMothership && "viewer-ledger-group--focus")}
    >
      <div className="viewer-ledger-group__header">
        <div className="viewer-ledger-group__title">
          <span
            className="syndicate-dot"
            style={{ backgroundColor: group.syndicate.color }}
          />
          <div>
            <strong>{group.syndicate.name}</strong>
          </div>
        </div>
        <div className="viewer-ledger-group__total">
          <strong>
            {formatCurrency(group.syndicate.spend)} · {group.sales.length}{" "}
            {group.sales.length === 1 ? "team" : "teams"}
          </strong>
        </div>
      </div>
      {group.sales.length ? (
        <div className="viewer-ledger-group__rows">
          {group.sales.map((sale) => (
            <div key={`${group.syndicate.id}-${sale.team.id}-${sale.price}`} className="viewer-ledger-row">
              <div className="viewer-ledger-row__team">
                <strong>{sale.team.name}</strong>
                <span>
                  {sale.team.seed}-seed, {sale.team.region} region
                </span>
              </div>
              <div className="viewer-ledger-row__price">
                <strong>{formatCurrency(sale.price)}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-copy">
          {hasActiveSearch
            ? `No matching teams for ${group.syndicate.name}.`
            : `No purchased teams yet for ${group.syndicate.name}.`}
        </p>
      )}
    </article>
  );
}

function TeamCombobox({
  teams,
  soldLookup,
  value,
  inputRef,
  onChange
}: {
  teams: TeamProjection[];
  soldLookup: Set<string>;
  value: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (teamId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedTeam = useMemo(() => teams.find((t) => t.id === value) ?? null, [teams, value]);

  const sorted = useMemo(() => {
    const available = teams.filter((t) => !soldLookup.has(t.id)).sort((a, b) => a.seed - b.seed);
    const sold = teams.filter((t) => soldLookup.has(t.id)).sort((a, b) => a.seed - b.seed);
    return [...available, ...sold];
  }, [teams, soldLookup]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const lower = search.toLowerCase();
    return sorted.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.shortName.toLowerCase().includes(lower) ||
        t.region.toLowerCase().includes(lower) ||
        String(t.seed) === lower
    );
  }, [sorted, search]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function handleFocus() {
    setOpen(true);
    setSearch("");
    setHighlightIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const team = filtered[highlightIndex];
      if (team && !soldLookup.has(team.id)) {
        onChange(team.id);
        setOpen(false);
        setSearch("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  }

  const displayValue = open ? search : selectedTeam ? `${selectedTeam.seed}. ${selectedTeam.name}` : "";

  return (
    <div className="combobox" ref={containerRef}>
      <input
        ref={inputRef}
        className="combobox__input"
        value={displayValue}
        placeholder={open ? "Search teams…" : "Select a team"}
        readOnly={!open}
        autoComplete="off"
        onFocus={handleFocus}
        onClick={() => { if (!open) handleFocus(); }}
        onChange={(e) => {
          setSearch(e.target.value);
          setHighlightIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul className="combobox__list">
          {filtered.length === 0 ? (
            <li className="combobox__empty">No teams found</li>
          ) : (
            filtered.map((team, index) => {
              const sold = soldLookup.has(team.id);
              return (
                <li
                  key={team.id}
                  className={cn(
                    "combobox__item",
                    index === highlightIndex && "combobox__item--highlighted",
                    sold && "combobox__item--sold"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!sold) {
                      onChange(team.id);
                      setOpen(false);
                      setSearch("");
                    }
                  }}
                  onMouseEnter={() => setHighlightIndex(index)}
                >
                  <span className="combobox__seed">{team.seed}</span>
                  <span className="combobox__name">{team.name}</span>
                  <span className="combobox__region">{team.region}</span>
                  {sold ? <span className="combobox__sold-badge">sold</span> : null}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

function displayNullableNumber(value: number | null) {
  if (value === null || value === undefined) {
    return "--";
  }

  return `${value}`;
}

function displayNullablePercent(value: number | null) {
  if (value === null || value === undefined) {
    return "--";
  }

  return `${value.toFixed(1)}%`;
}
