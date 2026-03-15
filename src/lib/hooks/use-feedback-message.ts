"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_NOTICE_DURATION_MS = 4000;

export function useFeedbackMessage(durationMs = DEFAULT_NOTICE_DURATION_MS) {
  const [error, setErrorState] = useState<string | null>(null);
  const [notice, setNoticeState] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const clearNotice = useCallback(() => {
    setNoticeState(null);
  }, []);

  const clearFeedback = useCallback(() => {
    setErrorState(null);
    setNoticeState(null);
  }, []);

  const showError = useCallback((message: string) => {
    setNoticeState(null);
    setErrorState(message);
  }, []);

  const showNotice = useCallback((message: string) => {
    setErrorState(null);
    setNoticeState(message);
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNoticeState((current) => (current === notice ? null : current));
    }, durationMs);

    return () => window.clearTimeout(timeoutId);
  }, [durationMs, notice]);

  return {
    error,
    notice,
    clearError,
    clearNotice,
    clearFeedback,
    showError,
    showNotice
  } as const;
}
