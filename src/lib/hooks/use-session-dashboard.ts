"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { LiveRoomDashboard } from "@/lib/types";
import {
  createDashboardRefreshCoordinator,
  DashboardRealtimeHealth,
  getDashboardPollIntervalMs
} from "@/lib/hooks/use-session-dashboard-refresh";

function isDocumentVisible() {
  return document.visibilityState === "visible";
}

export function useSessionDashboard<TDashboard extends LiveRoomDashboard>(
  sessionId: string,
  initialDashboard: TDashboard
) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realtimeHealth, setRealtimeHealth] = useState<DashboardRealtimeHealth>("degraded");
  const channelRef = useRef<{
    send: (payload: {
      type: "broadcast";
      event: string;
      payload: Record<string, string>;
    }) => Promise<unknown>;
  } | null>(null);
  const isBroadcastReadyRef = useRef(false);
  const refreshCoordinatorRef = useRef(createDashboardRefreshCoordinator());

  const fetchDashboard = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/dashboard`, {
        cache: "no-store"
      });

      if (response.ok) {
        const nextDashboard = (await response.json()) as TDashboard;
        setDashboard(nextDashboard);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [sessionId]);

  const drainRefreshQueue = useCallback(async () => {
    const coordinator = refreshCoordinatorRef.current;

    while (true) {
      try {
        await fetchDashboard();
      } catch {
        coordinator.failRefresh();
        break;
      }

      if (coordinator.settleRefresh() !== "fetch") {
        break;
      }
    }
  }, [fetchDashboard]);

  const requestRefresh = useCallback(
    async (source: "manual" | "poll" | "realtime") => {
      const action = refreshCoordinatorRef.current.requestRefresh({
        source,
        isVisible: isDocumentVisible()
      });

      if (action !== "fetch") {
        return;
      }

      await drainRefreshQueue();
    },
    [drainRefreshQueue]
  );

  const refresh = useCallback(async () => {
    await requestRefresh("manual");
  }, [requestRefresh]);

  const broadcastRefresh = useCallback(
    async (reason: string) => {
      if (!channelRef.current || !isBroadcastReadyRef.current) {
        return;
      }

      await channelRef.current.send({
        type: "broadcast",
        event: "dashboard-refresh",
        payload: {
          reason,
          sessionId,
          at: new Date().toISOString()
        }
      });
    },
    [sessionId]
  );

  useEffect(() => {
    refreshCoordinatorRef.current = createDashboardRefreshCoordinator();
  }, [sessionId]);

  useEffect(() => {
    const refreshIntervalMs = getDashboardPollIntervalMs(realtimeHealth, {
      paused: dashboard.session.auctionStatus === "complete"
    });

    if (refreshIntervalMs === null) {
      return;
    }

    const refreshInterval = window.setInterval(() => {
      if (isDocumentVisible()) {
        void requestRefresh("poll");
      }
    }, refreshIntervalMs);

    return () => window.clearInterval(refreshInterval);
  }, [dashboard.session.auctionStatus, realtimeHealth, requestRefresh]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!isDocumentVisible()) {
        return;
      }

      if (refreshCoordinatorRef.current.resumeVisible() === "fetch") {
        void drainRefreshQueue();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [drainRefreshQueue]);

  useEffect(() => {
    if (initialDashboard.storageBackend !== "supabase") {
      setRealtimeHealth("degraded");
      return;
    }

    const client = createBrowserSupabaseClient();
    if (!client) {
      setRealtimeHealth("degraded");
      if (initialDashboard.storageBackend === "supabase") {
        throw new Error(
          "Supabase backend is active, but the browser is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
      }

      return;
    }

    setRealtimeHealth("degraded");

    const channel = client
      .channel(`calcutta-session-${sessionId}`)
      .on("broadcast", { event: "dashboard-refresh" }, () => {
        void requestRefresh("realtime");
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "auction_sessions",
          filter: `id=eq.${sessionId}`
        },
        () => {
          void requestRefresh("realtime");
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "syndicates",
          filter: `session_id=eq.${sessionId}`
        },
        () => {
          void requestRefresh("realtime");
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "purchase_records",
          filter: `session_id=eq.${sessionId}`
        },
        () => {
          void requestRefresh("realtime");
        }
      )
      .subscribe((status) => {
        isBroadcastReadyRef.current = status === "SUBSCRIBED";
        setRealtimeHealth(status === "SUBSCRIBED" ? "healthy" : "degraded");
      });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      isBroadcastReadyRef.current = false;
      setRealtimeHealth("degraded");
      void client.removeChannel(channel);
    };
  }, [initialDashboard.storageBackend, requestRefresh, sessionId]);

  return {
    dashboard,
    isRefreshing,
    refresh,
    broadcastRefresh,
    replaceDashboard: setDashboard
  };
}
