"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuctionDashboard } from "@/lib/types";

export function useSessionDashboard(sessionId: string, initialDashboard: AuctionDashboard) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    if (!client) {
      if (initialDashboard.storageBackend === "supabase") {
        throw new Error(
          "Supabase backend is active, but the browser is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
      }

      const interval = window.setInterval(() => {
        void refresh();
      }, 2500);
      return () => window.clearInterval(interval);
    }

    const channel = client
      .channel(`calcutta-session-${sessionId}`)
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
          table: "purchase_records",
          filter: `session_id=eq.${sessionId}`
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [initialDashboard.storageBackend, refresh, sessionId]);

  return {
    dashboard,
    isRefreshing,
    refresh,
    replaceDashboard: setDashboard
  };
}
