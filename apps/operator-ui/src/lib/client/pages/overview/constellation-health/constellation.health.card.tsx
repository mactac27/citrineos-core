// SPDX-License-Identifier: Apache-2.0
'use client';

import { useMinLoading } from '@lib/client/hooks/use.min.loading';
import { useShellArrival } from '@lib/client/hooks/use.shell.arrival';
import { Skeleton } from '@lib/client/components/ui/skeleton';
import { CHARGING_STATIONS_LIST_QUERY } from '@lib/queries/charging.stations';
import { TileErrorInline } from '@lib/client/pages/overview/tile-error/tile.error.inline';
import { TileRefreshButton } from '@lib/client/pages/overview/tile-refresh/tile.refresh.button';
import { ResourceType } from '@lib/utils/access.types';
import { useList } from '@refinedev/core';
import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

/// Constellation Health tile — first of the three overview stat
/// tiles. Shows the live share of stations currently reporting
/// online (rolled up as "constellation health"), plus a 5-day trend
/// line to the right (dots + stroke, no area fill). Visual
/// reference: the mint "HEALTHY 74%" tile the user shared.
///
/// The percentage is live (two `useList` calls against
/// CHARGING_STATIONS with online / offline filters, same pattern as
/// the legacy OnlineStatusCard). The 5-day series is placeholder
/// data until we add a historical-aggregation endpoint — Postgres
/// has the row-level status transitions, we just haven't built the
/// query yet. See task #38 (API observability).
///
/// TODO: the numerator/denominator are currently individual chargers
/// (Orbitals), not sites (Constellations). Aggregate to
/// constellation-level once the data model exposes it.
export function ConstellationHealthCard() {
  const arrived = useShellArrival();
  const { query: online } = useList({
    resource: ResourceType.CHARGING_STATIONS,
    liveMode: 'auto',
    filters: [{ field: 'isOnline', operator: 'eq', value: true }],
    pagination: { currentPage: 1, pageSize: 1 },
    meta: { gqlQuery: CHARGING_STATIONS_LIST_QUERY },
  });
  const { query: offline } = useList({
    resource: ResourceType.CHARGING_STATIONS,
    liveMode: 'auto',
    filters: [
      {
        operator: 'or',
        value: [
          { field: 'isOnline', operator: 'eq', value: false },
          { field: 'isOnline', operator: 'null', value: true },
        ],
      },
    ],
    pagination: { currentPage: 1, pageSize: 1 },
    meta: { gqlQuery: CHARGING_STATIONS_LIST_QUERY },
  });

  const isLoading = online.isLoading || offline.isLoading;
  const isRefreshing = online.isFetching || offline.isFetching;
  // Hold the skeleton visible for at least 500ms so quick refreshes
  // don't flicker in-and-out.
  const showSkeleton = useMinLoading(isLoading || isRefreshing, 500);
  const error = (online.error || offline.error) as Error | null;
  const handleRefresh = () => {
    online.refetch();
    offline.refetch();
  };
  const onlineCount = online.data?.total ?? 0;
  const offlineCount = offline.data?.total ?? 0;
  const total = onlineCount + offlineCount;
  const pct = total === 0 ? 0 : Math.round((onlineCount / total) * 100);

  const series = useMemo(() => buildPlaceholderTrend(pct), [pct]);
  const seriesColor = healthColor(pct);


  return (
    <div className="relative h-40 overflow-hidden rounded-xl bg-white shadow-sm">
      <TileRefreshButton
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        label="Refresh constellation health"
      />

      {/* Amber corner glow — bottom-left. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_15%_85%,rgba(251,207,114,0.55),rgba(253,239,208,0)_65%)]"
      />

      {/* Text column — natural flow, takes the full card width. Fixed
          `max-w` on the label preserves the two-line wrap the user
          liked, independent of card size. */}
      <div className="relative z-10 flex h-full flex-col justify-between p-4">
        <div className="max-w-[140px] text-[11px] font-medium uppercase leading-snug tracking-widest text-foreground/60">
          Constellation Health
        </div>
        <div>
          {showSkeleton ? (
            <>
              <Skeleton className="h-9 w-20" />
              <Skeleton className="mt-2 h-3 w-28" />
            </>
          ) : error ? (
            <TileErrorInline message={error.message} />
          ) : (
            <>
              <div className="flex items-baseline gap-0.5">
                <span className="text-4xl font-semibold tabular-nums text-foreground">
                  {pct}
                </span>
                <span className="text-2xl font-semibold text-foreground">%</span>
              </div>
              <div className="mt-1 whitespace-nowrap text-xs text-foreground/60">
                {onlineCount} of {total} stations
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chart — absolutely positioned on the right half of the card,
          so it stays put regardless of how the text column grows or
          the tile stretches. Doesn't participate in the text column's
          layout so it can't push/pull the label or number. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 z-0 w-[62%] pl-3 pr-4 pt-14 pb-8 opacity-60">
        {showSkeleton ? (
          // Chart-shaped skeleton — a thin pulsing bar where the
          // sparkline will land, so the space doesn't look empty
          // during initial load OR manual refresh.
          <div className="flex h-full items-end pb-3">
            <Skeleton className="h-[2px] w-full" />
          </div>
        ) : error ? (
          null
        ) : (
          <div
            // Rise animation is GATED on `useShellArrival()` so it
            // only runs AFTER the sign-in loader has exited. Before
            // arrival, the tile is held flat (scaleY 0) so the rise
            // is visible when the loader unmounts. After arrival,
            // the CSS keyframe animates it up.
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

/// Traffic-light color for a percentage — chart line + dots take
/// this color so the visual meaning tracks the number.
///   < 35%  → matte red
///   35-75% → dull amber
///   >= 75% → matte green
function healthColor(pct: number): string {
  if (pct < 35) return '#c94a3a';
  if (pct < 75) return '#c99039';
  return '#4a9d6c';
}

/// Cheap deterministic sine wobble around the current percent so the
/// chart looks alive without needing real historical data. Days go
/// left→right, oldest first, ending at the current value on the right.
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
