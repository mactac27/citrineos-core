// SPDX-License-Identifier: Apache-2.0
'use client';

import { useEffect, useRef, useState } from 'react';

/// Enforces a minimum visible time for a loading state.
///
/// A fast query (e.g. cache hit, <100ms) causes the skeleton to
/// flicker in and out, which reads as a jitter rather than a load.
/// This hook holds the loading flag TRUE for at least `minMs` after
/// the loading start, even if the real work finished sooner.
///
///   const showSkeleton = useMinLoading(isFetching, 500);
///
/// Behavior:
///   - When `isActuallyLoading` flips true, start tracking + return true.
///   - When it flips false, return true until `minMs` has elapsed from
///     the tracked start, then flip false.
///   - If it flips true again mid-wait, we restart tracking.
export function useMinLoading(
  isActuallyLoading: boolean,
  minMs = 500,
): boolean {
  const [held, setHeld] = useState(isActuallyLoading);
  const startedAtRef = useRef<number | null>(
    isActuallyLoading ? Date.now() : null,
  );

  useEffect(() => {
    if (isActuallyLoading) {
      startedAtRef.current = Date.now();
      setHeld(true);
      return;
    }

    // Loading finished. If we never tracked a start (e.g. hook mounted
    // with actuallyLoading=false), just mirror the flag.
    if (startedAtRef.current === null) {
      setHeld(false);
      return;
    }

    const elapsed = Date.now() - startedAtRef.current;
    const remaining = minMs - elapsed;
    if (remaining <= 0) {
      startedAtRef.current = null;
      setHeld(false);
      return;
    }

    const t = setTimeout(() => {
      startedAtRef.current = null;
      setHeld(false);
    }, remaining);
    return () => clearTimeout(t);
  }, [isActuallyLoading, minMs]);

  return held;
}
