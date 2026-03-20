export const FAST_DASHBOARD_POLL_MS = 2_500;
export const HEALTHY_REALTIME_DASHBOARD_POLL_MS = 30_000;

export type DashboardRealtimeHealth = "healthy" | "degraded";
export type DashboardRefreshSource = "manual" | "poll" | "realtime";
export type DashboardRefreshAction = "fetch" | "noop";

interface DashboardRefreshState {
  inFlight: boolean;
  hasPendingRefresh: boolean;
  isStaleWhileHidden: boolean;
}

function startFetch(state: DashboardRefreshState): DashboardRefreshState {
  return {
    ...state,
    inFlight: true,
    hasPendingRefresh: false,
    isStaleWhileHidden: false
  };
}

export function getDashboardPollIntervalMs(
  health: DashboardRealtimeHealth,
  options?: { paused?: boolean }
) {
  if (options?.paused) {
    return null;
  }

  return health === "healthy"
    ? HEALTHY_REALTIME_DASHBOARD_POLL_MS
    : FAST_DASHBOARD_POLL_MS;
}

export function createDashboardRefreshCoordinator() {
  let state: DashboardRefreshState = {
    inFlight: false,
    hasPendingRefresh: false,
    isStaleWhileHidden: false
  };

  return {
    getState() {
      return { ...state };
    },
    requestRefresh(args: {
      source: DashboardRefreshSource;
      isVisible: boolean;
    }): DashboardRefreshAction {
      if (args.source === "realtime" && !args.isVisible) {
        state = {
          ...state,
          isStaleWhileHidden: true
        };
        return "noop";
      }

      if (state.inFlight) {
        state = {
          ...state,
          hasPendingRefresh: true
        };
        return "noop";
      }

      state = startFetch(state);
      return "fetch";
    },
    settleRefresh(): DashboardRefreshAction {
      if (state.hasPendingRefresh) {
        state = startFetch(state);
        return "fetch";
      }

      state = {
        ...state,
        inFlight: false
      };
      return "noop";
    },
    resumeVisible(): DashboardRefreshAction {
      if (!state.isStaleWhileHidden) {
        return "noop";
      }

      if (state.inFlight) {
        state = {
          ...state,
          hasPendingRefresh: true,
          isStaleWhileHidden: false
        };
        return "noop";
      }

      state = startFetch(state);
      return "fetch";
    }
  };
}
