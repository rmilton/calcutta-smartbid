"use client";

import type { FocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { formatBidInputText, formatBidInputValue, parseBidInputValue } from "@/lib/bid-input";
import { useSessionDashboard } from "@/lib/hooks/use-session-dashboard";
import { AuctionDashboard, TeamClassificationValue } from "@/lib/types";

export type WorkspaceView = "auction" | "analysis" | "bracket" | "overrides";

interface LiveRoomControllerArgs {
  sessionId: string;
  initialDashboard: AuctionDashboard;
  initialView: WorkspaceView;
  availableViews: WorkspaceView[];
  viewerMode: boolean;
  clearFeedback: () => void;
  showError: (message: string) => void;
  showNotice: (message: string) => void;
}

export function useLiveRoomController(args: LiveRoomControllerArgs) {
  const {
    sessionId,
    initialDashboard,
    initialView,
    availableViews,
    viewerMode,
    clearFeedback,
    showError,
    showNotice
  } = args;
  const { dashboard, refresh, broadcastRefresh, replaceDashboard } = useSessionDashboard(
    sessionId,
    initialDashboard
  );
  const [activeView, setActiveView] = useState<WorkspaceView>(
    availableViews.includes(initialView) ? initialView : "auction"
  );
  const [selectedAssetId, setSelectedAssetId] = useState(
    dashboard.session.liveState.nominatedAssetId ?? dashboard.nominatedAsset?.id ?? ""
  );
  const [selectedTeamId, setSelectedTeamId] = useState(
    dashboard.session.liveState.nominatedTeamId ?? dashboard.nominatedTeam?.id ?? ""
  );
  const [currentBid, setCurrentBid] = useState(dashboard.session.liveState.currentBid);
  const [bidInputValue, setBidInputValue] = useState(
    formatBidInputValue(dashboard.session.liveState.currentBid)
  );
  const [buyerId, setBuyerId] = useState(dashboard.focusSyndicate.id);
  const [isSavingLiveState, setIsSavingLiveState] = useState(false);
  const [isUndoingPurchase, setIsUndoingPurchase] = useState(false);
  const [isSavingClassification, setIsSavingClassification] = useState(false);
  const [isSavingTeamNote, setIsSavingTeamNote] = useState(false);
  const [isSavingBracket, setIsSavingBracket] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    rating: "",
    offense: "",
    defense: "",
    tempo: ""
  });
  const [teamNoteInput, setTeamNoteInput] = useState("");
  const [analysisSearch, setAnalysisSearch] = useState("");
  const [analysisTeamId, setAnalysisTeamId] = useState(
    dashboard.session.liveState.nominatedTeamId ?? dashboard.nominatedTeam?.id ?? ""
  );
  const [overrideTeamId, setOverrideTeamId] = useState(
    dashboard.session.liveState.nominatedTeamId ?? dashboard.nominatedTeam?.id ?? ""
  );
  const [expandedSyndicateIds, setExpandedSyndicateIds] = useState<string[]>([]);
  const [ownershipSearch, setOwnershipSearch] = useState("");
  const teamSelectRef = useRef<HTMLInputElement | null>(null);
  const bidInputRef = useRef<HTMLInputElement | null>(null);
  const activeTeamSaveInFlightRef = useRef(false);
  const pendingActiveTeamIdRef = useRef<string | null>(null);
  const pendingCommittedBidRef = useRef<number | null>(null);
  const parsedBidInputValue = parseBidInputValue(bidInputValue);
  const isLiveStateDirty =
    bidInputValue.trim() === "" ? true : parsedBidInputValue !== currentBid;
  const liveNominatedAssetId = dashboard.session.liveState.nominatedAssetId ?? "";
  const liveNominatedTeamId = dashboard.session.liveState.nominatedTeamId ?? "";

  const selectedAsset =
    dashboard.session.auctionAssets?.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedTeam =
    dashboard.session.projections.find((team) => team.id === selectedTeamId) ?? null;
  const overrideSelectedTeam =
    dashboard.session.projections.find((team) => team.id === overrideTeamId) ?? null;
  const selectedOverride =
    (overrideTeamId && dashboard.session.projectionOverrides[overrideTeamId]) || null;
  const analysisDetailTeam =
    dashboard.session.projections.find((team) => team.id === analysisTeamId) ?? null;
  const analysisDetailTeamNote = analysisDetailTeam
    ? dashboard.session.teamNotes[analysisDetailTeam.id]?.note ?? ""
    : "";

  useEffect(() => {
    if (!availableViews.includes(activeView)) {
      setActiveView("auction");
    }
  }, [activeView, availableViews]);

  useEffect(() => {
    if (isLiveStateDirty && !viewerMode) {
      return;
    }

    const liveBid = dashboard.session.liveState.currentBid;
    if (pendingCommittedBidRef.current !== null) {
      if (liveBid !== pendingCommittedBidRef.current) {
        setSelectedAssetId(liveNominatedAssetId);
        setSelectedTeamId(liveNominatedTeamId);
        return;
      }

      pendingCommittedBidRef.current = null;
    }

    setSelectedAssetId(liveNominatedAssetId);
    setSelectedTeamId(liveNominatedTeamId);
    setCurrentBid(liveBid);
    setBidInputValue(formatBidInputValue(liveBid));
  }, [
    dashboard.session.liveState,
    isLiveStateDirty,
    liveNominatedAssetId,
    liveNominatedTeamId,
    viewerMode
  ]);

  useEffect(() => {
    if (!dashboard.ledger.some((syndicate) => syndicate.id === buyerId)) {
      setBuyerId(dashboard.focusSyndicate.id);
    }
  }, [buyerId, dashboard.focusSyndicate.id, dashboard.ledger]);

  useEffect(() => {
    setOverrideTeamId(dashboard.session.liveState.nominatedTeamId ?? dashboard.nominatedTeam?.id ?? "");
  }, [dashboard.nominatedTeam?.id, dashboard.session.liveState.nominatedTeamId]);

  useEffect(() => {
    if (!overrideSelectedTeam) {
      setOverrideForm({
        rating: "",
        offense: "",
        defense: "",
        tempo: ""
      });
      return;
    }

    setOverrideForm({
      rating: selectedOverride?.rating?.toString() ?? overrideSelectedTeam.rating.toString(),
      offense: selectedOverride?.offense?.toString() ?? overrideSelectedTeam.offense.toString(),
      defense: selectedOverride?.defense?.toString() ?? overrideSelectedTeam.defense.toString(),
      tempo: selectedOverride?.tempo?.toString() ?? overrideSelectedTeam.tempo.toString()
    });
  }, [overrideSelectedTeam, selectedOverride]);

  useEffect(() => {
    setTeamNoteInput(analysisDetailTeamNote);
  }, [analysisDetailTeam?.id, analysisDetailTeamNote]);

  const saveActiveAsset = useCallback(
    async (nextAssetId: string) => {
      pendingActiveTeamIdRef.current = nextAssetId;

      if (activeTeamSaveInFlightRef.current) {
        return;
      }

      activeTeamSaveInFlightRef.current = true;

      while (pendingActiveTeamIdRef.current !== null) {
        const assetIdToPersist = pendingActiveTeamIdRef.current;
        pendingActiveTeamIdRef.current = null;

        clearFeedback();

        const response = await fetch(`/api/sessions/${sessionId}/live-state`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            nominatedAssetId: assetIdToPersist || null
          })
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };

          if (pendingActiveTeamIdRef.current === null) {
            showError(payload.error ?? "Unable to update active team.");
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
    },
    [broadcastRefresh, clearFeedback, refresh, sessionId, showError]
  );

  const handleAssetChange = useCallback(
    (nextAssetId: string) => {
      const nextAsset =
        dashboard.session.auctionAssets?.find((asset) => asset.id === nextAssetId) ?? null;
      const nextBid = 0;
      setSelectedAssetId(nextAssetId);
      setSelectedTeamId(nextAsset?.projectionIds[0] ?? "");
      setCurrentBid(nextBid);
      setBidInputValue(formatBidInputValue(nextBid));
      void saveActiveAsset(nextAssetId);
    },
    [dashboard.session.auctionAssets, saveActiveAsset]
  );

  const saveLiveState = useCallback(async () => {
    clearFeedback();
    setIsSavingLiveState(true);
    const nextBid = parsedBidInputValue;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/live-state`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nominatedAssetId: selectedAssetId || null,
          currentBid: nextBid
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        showError(payload.error ?? "Unable to update live state.");
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
      showError("Unable to update live state.");
    } finally {
      setIsSavingLiveState(false);
    }
  }, [
    broadcastRefresh,
    clearFeedback,
    parsedBidInputValue,
    refresh,
    selectedAssetId,
    sessionId,
    showError
  ]);

  const handleBidBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      const nextFocusTarget = event.relatedTarget as HTMLElement | null;

      if (
        nextFocusTarget?.dataset.liveBidBlurIgnore === "true" ||
        isSavingLiveState ||
        !isLiveStateDirty
      ) {
        return;
      }

      void saveLiveState();
    },
    [isLiveStateDirty, isSavingLiveState, saveLiveState]
  );

  const handleBidKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }

      event.preventDefault();
      const delta = event.key === "ArrowUp" ? 100 : -100;
      const nextBid = Math.max(0, parsedBidInputValue + delta);
      setBidInputValue(formatBidInputValue(nextBid));
    },
    [parsedBidInputValue]
  );

  const handleShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isButtonTarget = target?.closest("button") !== null;
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

      if (
        event.key === "Enter" &&
        activeView === "auction" &&
        !isButtonTarget &&
        (tagName === "INPUT" || !isEditable)
      ) {
        event.preventDefault();
        void saveLiveState();
      }
    },
    [activeView, saveLiveState]
  );

  useEffect(() => {
    if (viewerMode) {
      return;
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [handleShortcut, viewerMode]);

  const recordPurchase = useCallback(async () => {
    clearFeedback();
    const nextBid = parsedBidInputValue;

    if (nextBid <= 0) {
      showError("Enter a bid greater than $0 before recording a purchase.");
      return;
    }

    if (!selectedAssetId) {
      showError("Choose a nominated team before recording a purchase.");
      return;
    }

    const response = await fetch(`/api/sessions/${sessionId}/purchases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        assetId: selectedAssetId || undefined,
        buyerSyndicateId: buyerId,
        price: nextBid
      })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      showError(payload.error ?? "Unable to record purchase.");
      return;
    }

    const nextDashboard = (await response.json()) as AuctionDashboard;
    replaceDashboard(nextDashboard);
    pendingCommittedBidRef.current = null;
    setSelectedAssetId(nextDashboard.session.liveState.nominatedAssetId ?? "");
    setSelectedTeamId(nextDashboard.session.liveState.nominatedTeamId ?? "");
    setCurrentBid(nextDashboard.session.liveState.currentBid);
    setBidInputValue(formatBidInputValue(nextDashboard.session.liveState.currentBid));
    showNotice("Purchase recorded.");
    void broadcastRefresh("purchase");
  }, [
    broadcastRefresh,
    buyerId,
    clearFeedback,
    parsedBidInputValue,
    replaceDashboard,
    selectedAssetId,
    sessionId,
    showError,
    showNotice
  ]);

  const undoPurchase = useCallback(
    async (lastPurchaseTeamName: string | null) => {
      if (!dashboard.lastPurchase) {
        showError("No purchase is available to undo.");
        return;
      }

      clearFeedback();
      setIsUndoingPurchase(true);

      const purchaseToUndo = dashboard.lastPurchase;
      const undoneTeamName = lastPurchaseTeamName ?? purchaseToUndo.teamId;

      try {
        const response = await fetch(
          `/api/sessions/${sessionId}/purchases?purchaseId=${encodeURIComponent(purchaseToUndo.id)}`,
          {
            method: "DELETE"
          }
        );

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          showError(payload.error ?? "Unable to undo purchase.");
          return;
        }

        const nextDashboard = (await response.json()) as AuctionDashboard;
        replaceDashboard(nextDashboard);
        setBuyerId(purchaseToUndo.buyerSyndicateId);
        showNotice(`Undid purchase for ${undoneTeamName}.`);
        void broadcastRefresh("purchase-undo");
      } catch {
        showError("Unable to undo purchase.");
      } finally {
        setIsUndoingPurchase(false);
      }
    },
    [
      broadcastRefresh,
      clearFeedback,
      dashboard.lastPurchase,
      replaceDashboard,
      sessionId,
      showError,
      showNotice
    ]
  );

  const saveProjectionOverride = useCallback(async () => {
    if (!overrideTeamId) {
      showError("Choose a team before saving an override.");
      return;
    }

    clearFeedback();
    const response = await fetch(`/api/sessions/${sessionId}/projections/${overrideTeamId}/override`, {
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
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      showError(payload.error ?? "Unable to save projection override.");
      return;
    }

    showNotice("Projection override saved and simulation rebuilt.");
    startTransition(() => {
      void refresh();
    });
  }, [clearFeedback, overrideForm, overrideTeamId, refresh, sessionId, showError, showNotice]);

  const clearProjectionOverride = useCallback(async () => {
    if (!overrideTeamId) {
      showError("Choose a team before clearing an override.");
      return;
    }

    clearFeedback();
    const response = await fetch(`/api/sessions/${sessionId}/projections/${overrideTeamId}/override`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      showError(payload.error ?? "Unable to clear projection override.");
      return;
    }

    showNotice("Projection override cleared.");
    startTransition(() => {
      void refresh();
    });
  }, [clearFeedback, overrideTeamId, refresh, sessionId, showError, showNotice]);

  const saveTeamClassification = useCallback(
    async (classification: TeamClassificationValue) => {
      if (!analysisDetailTeam) {
        showError("Choose a team before saving a classification.");
        return;
      }

      clearFeedback();
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
          showError(payload.error ?? "Unable to save team classification.");
          return;
        }

        const nextDashboard = (await response.json()) as AuctionDashboard;
        replaceDashboard(nextDashboard);
        void broadcastRefresh("team-classification");
      } catch {
        showError("Unable to save team classification.");
      } finally {
        setIsSavingClassification(false);
      }
    },
    [
      analysisDetailTeam,
      broadcastRefresh,
      clearFeedback,
      replaceDashboard,
      sessionId,
      showError
    ]
  );

  const clearTeamClassification = useCallback(async () => {
    if (!analysisDetailTeam) {
      showError("Choose a team before clearing a classification.");
      return;
    }

    clearFeedback();
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
        showError(payload.error ?? "Unable to clear team classification.");
        return;
      }

      const nextDashboard = (await response.json()) as AuctionDashboard;
      replaceDashboard(nextDashboard);
      void broadcastRefresh("team-classification");
    } catch {
      showError("Unable to clear team classification.");
    } finally {
      setIsSavingClassification(false);
    }
  }, [
    analysisDetailTeam,
    broadcastRefresh,
    clearFeedback,
    replaceDashboard,
    sessionId,
    showError
  ]);

  const saveTeamNote = useCallback(async () => {
    if (!analysisDetailTeam) {
      showError("Choose a team before saving a note.");
      return;
    }

    clearFeedback();
    setIsSavingTeamNote(true);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/projections/${analysisDetailTeam.id}/note`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ note: teamNoteInput })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        showError(payload.error ?? "Unable to save team note.");
        return;
      }

      const nextDashboard = (await response.json()) as AuctionDashboard;
      replaceDashboard(nextDashboard);
      showNotice("Team note saved.");
      void broadcastRefresh("team-note");
    } catch {
      showError("Unable to save team note.");
    } finally {
      setIsSavingTeamNote(false);
    }
  }, [
    analysisDetailTeam,
    broadcastRefresh,
    clearFeedback,
    replaceDashboard,
    sessionId,
    showError,
    showNotice,
    teamNoteInput
  ]);

  const clearTeamNote = useCallback(async () => {
    if (!analysisDetailTeam) {
      showError("Choose a team before clearing a note.");
      return;
    }

    clearFeedback();
    setIsSavingTeamNote(true);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/projections/${analysisDetailTeam.id}/note`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        showError(payload.error ?? "Unable to clear team note.");
        return;
      }

      const nextDashboard = (await response.json()) as AuctionDashboard;
      replaceDashboard(nextDashboard);
      setTeamNoteInput("");
      showNotice("Team note cleared.");
      void broadcastRefresh("team-note");
    } catch {
      showError("Unable to clear team note.");
    } finally {
      setIsSavingTeamNote(false);
    }
  }, [
    analysisDetailTeam,
    broadcastRefresh,
    clearFeedback,
    replaceDashboard,
    sessionId,
    showError,
    showNotice
  ]);

  const saveBracketWinner = useCallback(async (gameId: string, winnerTeamId: string | null) => {
    clearFeedback();
    setIsSavingBracket(true);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/bracket/games/${gameId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          winnerTeamId
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        showError(payload.error ?? "Unable to update bracket game.");
        return;
      }

      const nextDashboard = (await response.json()) as AuctionDashboard;
      replaceDashboard(nextDashboard);
      showNotice(winnerTeamId ? "Bracket winner advanced." : "Bracket winner cleared.");
      void broadcastRefresh("bracket");
    } catch {
      showError("Unable to update bracket game.");
    } finally {
      setIsSavingBracket(false);
    }
  }, [
    broadcastRefresh,
    clearFeedback,
    replaceDashboard,
    sessionId,
    showError,
    showNotice
  ]);

  return {
    dashboard,
    refresh,
    broadcastRefresh,
    replaceDashboard,
    activeView,
    setActiveView,
    selectedAssetId,
    selectedTeamId,
    currentBid,
    bidInputValue,
    parsedBidInputValue,
    buyerId,
    isSavingLiveState,
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
    setBidInputValue: (value: string) => setBidInputValue(formatBidInputText(value)),
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
    saveBracketWinner,
    saveLiveState
  };
}
