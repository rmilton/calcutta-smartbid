"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuctionDashboard } from "@/lib/types";

export function useSessionDashboard(sessionId: string, initialDashboard: AuctionDashboard) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const channelRef = useRef<{
    send: (payload: {
      type: "broadcast";
      event: string;
      payload: Record<string, string>;
    }) => Promise<unknown>;
  } | null>(null);
  const isBroadcastReadyRef = useRef(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    const response = await fetch(`/api/sessions/${sessionId}/dashboard`, {
      cache: "no-store"
    });

    if (response.ok) {
      const nextDashboard = (await response.json()) as AuctionDashboard;
      setDashboard(nextDashboard);
    }
    setIsRefreshing(false);
  }, [sessionId]);

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
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, 2500);

    const client = createBrowserSupabaseClient();
    if (!client) {
      if (initialDashboard.storageBackend === "supabase") {
        window.clearInterval(refreshInterval);
        throw new Error(
          "Supabase backend is active, but the browser is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
      }

      return () => window.clearInterval(refreshInterval);
    }

    const channel = client
      .channel(`calcutta-session-${sessionId}`)
      .on("broadcast", { event: "dashboard-refresh" }, () => {
        void refresh();
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
          void refresh();
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
          void refresh();
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
          void refresh();
        }
      )
      .subscribe((status) => {
        isBroadcastReadyRef.current = status === "SUBSCRIBED";
      });

    channelRef.current = channel;

    return () => {
      window.clearInterval(refreshInterval);
      channelRef.current = null;
      isBroadcastReadyRef.current = false;
      void client.removeChannel(channel);
    };
  }, [initialDashboard.storageBackend, refresh, sessionId]);

  return {
    dashboard,
    isRefreshing,
    refresh,
    broadcastRefresh,
    replaceDashboard: setDashboard
  };
}
