import { describe, expect, it } from "vitest";
import {
  createDashboardRefreshCoordinator,
  FAST_DASHBOARD_POLL_MS,
  getDashboardPollIntervalMs,
  HEALTHY_REALTIME_DASHBOARD_POLL_MS
} from "@/lib/hooks/use-session-dashboard-refresh";

describe("useSessionDashboard refresh helpers", () => {
  it("uses a slower fallback poll when realtime is healthy", () => {
    expect(getDashboardPollIntervalMs("healthy")).toBe(HEALTHY_REALTIME_DASHBOARD_POLL_MS);
  });

  it("uses the fast fallback poll before realtime is healthy", () => {
    expect(getDashboardPollIntervalMs("degraded")).toBe(FAST_DASHBOARD_POLL_MS);
  });

  it("collapses in-flight refresh bursts into one trailing fetch", () => {
    const coordinator = createDashboardRefreshCoordinator();

    expect(coordinator.requestRefresh({ source: "manual", isVisible: true })).toBe("fetch");
    expect(coordinator.requestRefresh({ source: "poll", isVisible: true })).toBe("noop");
    expect(coordinator.requestRefresh({ source: "realtime", isVisible: true })).toBe("noop");
    expect(coordinator.getState()).toMatchObject({
      inFlight: true,
      hasPendingRefresh: true,
      isStaleWhileHidden: false
    });

    expect(coordinator.settleRefresh()).toBe("fetch");
    expect(coordinator.getState()).toMatchObject({
      inFlight: true,
      hasPendingRefresh: false,
      isStaleWhileHidden: false
    });

    expect(coordinator.settleRefresh()).toBe("noop");
    expect(coordinator.getState()).toMatchObject({
      inFlight: false,
      hasPendingRefresh: false,
      isStaleWhileHidden: false
    });
  });

  it("marks hidden realtime updates stale and fetches once when visible again", () => {
    const coordinator = createDashboardRefreshCoordinator();

    expect(coordinator.requestRefresh({ source: "realtime", isVisible: false })).toBe("noop");
    expect(coordinator.requestRefresh({ source: "realtime", isVisible: false })).toBe("noop");
    expect(coordinator.getState()).toMatchObject({
      inFlight: false,
      hasPendingRefresh: false,
      isStaleWhileHidden: true
    });

    expect(coordinator.resumeVisible()).toBe("fetch");
    expect(coordinator.getState()).toMatchObject({
      inFlight: true,
      hasPendingRefresh: false,
      isStaleWhileHidden: false
    });

    expect(coordinator.settleRefresh()).toBe("noop");
    expect(coordinator.resumeVisible()).toBe("noop");
  });
});
