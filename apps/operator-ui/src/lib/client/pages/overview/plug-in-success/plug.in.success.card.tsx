// SPDX-License-Identifier: Apache-2.0
'use client';

import { useMinLoading } from '@lib/client/hooks/use.min.loading';
import { useShellArrival } from '@lib/client/hooks/use.shell.arrival';
import { Skeleton } from '@lib/client/components/ui/skeleton';
import { TileErrorInline } from '@lib/client/pages/overview/tile-error/tile.error.inline';
import { TileRefreshButton } from '@lib/client/pages/overview/tile-refresh/tile.refresh.button';
import { TRANSACTION_SUCCESS_RATE_QUERY } from '@lib/queries/transactions';
import { useCustom } from '@refinedev/core';
import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

/// Plug-in Success tile — third of the three overview stat tiles.
/// Shows the share of transactions that delivered energy
/// (`totalKwh > 0`) out of all transactions started. Same visual
/// system as Constellation Health and Charger Activity: label +
/// big number + sub-count on the left, faded 5-day sparkline
/// absolutely positioned on the right.
///
/// The percentage is live via TRANSACTION_SUCCESS_RATE_QUERY (a
/// dual-aggregate that returns success + total counts). The 5-day
/// series is placeholder data; real per-day success-rate rollup
/// lands with task #38 (API observability).
export function PlugInSuccessCard() {
  const arrived = useShellArrival();
  const {
    query: { data, isLoading, isFetching, refetch, error },
  } = useCustom({
    // useCustom's typing doesn't accept our meta shape cleanly; the
    // legacy PluginSuccessRateCard casts to `any` for the same reason.
    meta: { gqlQuery: TRANSACTION_SUCCESS_RATE_QUERY },
  } as any);

  const showSkeleton = useMinLoading(isLoading || isFetching, 500);
  const successCount = (data as any)?.data?.success?.aggregate?.count ?? 0;
  const totalCount = (data as any)?.data?.total?.aggregate?.count ?? 0;
  const pct = totalCount === 0 ? 0 : Math.round((successCount / totalCount) * 100);

  const series = useMemo(() => buildPlaceholderTrend(pct), [pct]);
  const seriesColor = healthColor(pct);


  return (
    <div className="relative h-40 overflow-hidden rounded-xl bg-white shadow-sm">
      <TileRefreshButton
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        label="Refresh plug-in success"
      />

      {/* Amber wash — hugging the right edge as a curved wedge.
          Radial center pushed off-canvas past the right side so only
          the leftward arc is visible inside the card, giving a
          natural curved boundary rather than a diffuse blob. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_110%_at_110%_85%,rgba(251,207,114,0.6),rgba(253,239,208,0)_65%)]"
      />

      <div className="relative z-10 flex h-full flex-col justify-between p-4">
        <div className="max-w-[140px] text-[11px] font-medium uppercase leading-snug tracking-widest text-foreground/60">
          Plug-in Success
        </div>
        <div>
          {showSkeleton ? (
            <>
              <Skeleton className="h-9 w-20" />
              <Skeleton className="mt-2 h-3 w-28" />
            </>
          ) : error ? (
            <TileErrorInline message={(error as unknown as Error)?.message} />
          ) : (
            <>
              <div className="flex items-baseline gap-0.5">
                <span className="text-4xl font-semibold tabular-nums text-foreground">
                  {pct}
                </span>
                <span className="text-2xl font-semibold text-foreground">%</span>
              </div>
              <div className="mt-1 whitespace-nowrap text-xs text-foreground/60">
                {successCount} of {totalCount} sessions
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-0 z-0 w-[62%] pl-3 pr-4 pt-14 pb-8 opacity-60">
        {showSkeleton ? (
          <div className="flex h-full items-end pb-3">
            <Skeleton className="h-[2px] w-full" />
          </div>
        ) : error ? (
          null
        ) : (
          <div
            className="h-full origin-bottom"
            style={
              arrived
                ? { animation: 'tile-chart-rise 750ms ease-out both' }
                : { transform: 'scaleY(0)' }
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={series}
                margin={{ top: 8, right: 10, bottom: 12, left: 10 }}
              >
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={seriesColor}
                  strokeWidth={1.5}
                  dot={{ r: 1.5, stroke: seriesColor, strokeWidth: 1, fill: '#ffffff' }}
                  activeDot={{ r: 2.5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

/// Traffic-light color for a percentage — same mapping as the
/// Constellation Health tile so the trio reads consistently.
///   < 35%  → matte red
///   35-75% → dull amber
///   >= 75% → matte green
function healthColor(pct: number): string {
  if (pct < 35) return '#c94a3a';
  if (pct < 75) return '#c99039';
  return '#4a9d6c';
}

function buildPlaceholderTrend(currentPct: number) {
  const days = 5;
  const base = Math.min(100, currentPct);
  // If the real value is 0, keep the sparkline flat at 0 rather
  // than fabricating a wobble around a synthetic floor.
  if (base === 0) {
    return Array.from({ length: days }, (_, i) => ({ day: i, v: 0 }));
  }
  return Array.from({ length: days }, (_, i) => {
    const wobble = Math.sin((i / (days - 1)) * Math.PI) * 8;
    const v = i === days - 1 ? base : Math.round(base - 4 + wobble);
    return { day: i, v: Math.max(0, Math.min(100, v)) };
  });
}
