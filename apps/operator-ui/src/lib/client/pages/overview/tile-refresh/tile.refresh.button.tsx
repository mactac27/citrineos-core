// SPDX-License-Identifier: Apache-2.0
'use client';

import { RefreshCw } from 'lucide-react';

/// Small circular refresh button pinned to the bottom-right of a
/// tile. Absolutely positioned so callers just drop it inside a
/// `relative` tile container and don't need to wire layout
/// themselves.
///
/// Filled treatment: neutral-grey background, white icon — reads as
/// a solid affordance rather than a ghost button, which matters for
/// discoverability against the tile's amber corner washes.
///
/// Spins while `isRefreshing`, dims + disables while spinning so a
/// user can't queue up rapid duplicate refetches.
export function TileRefreshButton({
  onRefresh,
  isRefreshing,
  label = 'Refresh',
}: {
  onRefresh: () => void;
  isRefreshing: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      aria-label={label}
      title={label}
      className="absolute bottom-2 right-2 z-20 flex size-7 items-center justify-center rounded-full bg-neutral-200 text-white shadow-sm transition-colors hover:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <RefreshCw
        className={
          'size-3.5 ' + (isRefreshing ? 'animate-spin' : '')
        }
      />
    </button>
  );
}
