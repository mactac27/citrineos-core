// SPDX-License-Identifier: Apache-2.0
'use client';

import { useMinLoading } from '@lib/client/hooks/use.min.loading';
import { useShellArrival } from '@lib/client/hooks/use.shell.arrival';
import { Skeleton } from '@lib/client/components/ui/skeleton';
import { LOCATIONS_LIST_QUERY } from '@lib/queries/locations';
import { TRANSACTION_LIST_QUERY } from '@lib/queries/transactions';
import { TileErrorInline } from '@lib/client/pages/overview/tile-error/tile.error.inline';
import { TileRefreshButton } from '@lib/client/pages/overview/tile-refresh/tile.refresh.button';
import { ResourceType } from '@lib/utils/access.types';
import { useList } from '@refinedev/core';
import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

/// Charger Activity tile — second of the three overview stat tiles.
/// Shows the average number of charging sessions per constellation
/// over the last 24 hours, with a 5-day trend line to the right.
///
/// avg = transactions_started_last_24h / total_constellations
///
/// Both counts are live via `useList` aggregates. The 5-day series
/// is placeholder data until we have a per-day transaction
/// aggregation endpoint (see task #38, API observability).
export function ChargerActivityAvgCard() {
  const arrived = useShellArrival();
  // 24 hours ago as ISO string — filter transactions by startTime.
  const since = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);

  const { query: txQuery } = useList({
    resource: ResourceType.TRANSACTIONS,
    liveMode: 'auto',
    filters: [{ field: 'startTime', operator: 'gte', value: since }],
    pagination: { currentPage: 1, pageSize: 1 },
    meta: { gqlQuery: TRANSACTION_LIST_QUERY },
  });

  const { query: locQuery } = useList({
    resource: ResourceType.LOCATIONS,
    liveMode: 'auto',
    pagination: { currentPage: 1, pageSize: 1 },
    meta: { gqlQuery: LOCATIONS_LIST_QUERY },
  });

  const isLoading = txQuery.isLoading || locQuery.isLoading;
  const isRefreshing = txQuery.isFetching || locQuery.isFetching;
  const showSkeleton = useMinLoading(isLoading || isRefreshing, 500);
  const error = (txQuery.error || locQuery.error) as Error | null;
  const handleRefresh = () => {
    txQuery.refetch();
    locQuery.refetch();
  };
  const txCount = txQuery.data?.total ?? 0;
  const siteCount = locQuery.data?.total ?? 0;
  const avg = siteCount === 0 ? 0 : txCount / siteCount;
  // 1 decimal place — enough precision without visual noise.
  const avgDisplay = avg.toFixed(1);

  const series = useMemo(() => buildPlaceholderTrend(avg), [avg]);
  // Chart uses a fixed dull-amber tone since "activity" doesn't have
  // a good/bad direction — a busier fleet is neither healthier nor
  // sicker on its face.
  const seriesColor = '#c99039';


  return (
    <div className="relative h-40 overflow-hidden rounded-xl bg-white shadow-sm">
      <TileRefreshButton
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        label="Refresh charger activity"
      />

      {/* Amber corner glow — top-left for this tile so the trio each
          has a different accent position (Constellation Health uses
          bottom-left; Plug-in Success uses right). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_15%_15%,rgba(251,207,114,0.55),rgba(253,239,208,0)_65%)]"
      />

      {/* Text column — natural flow, `max-w` on the label preserves
          the two-line wrap seen on the Constellation Health tile. */}
      <div className="relative z-10 flex h-full flex-col justify-between p-4">
        <div className="max-w-[140px] text-[11px] font-medium uppercase leading-snug tracking-widest text-foreground/60">
          Charger Activity
        </div>
        <div>
          {showSkeleton ? (
            <>
              <Skeleton className="h-9 w-24" />
              <Skeleton className="mt-2 h-3 w-40" />
            </>
          ) : error ? (
            <TileErrorInline message={error.message} />
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold tabular-nums text-foreground">
                  {avgDisplay}
                </span>
                <span className="text-xs font-normal text-foreground/60">avg</span>
              </div>
              <div className="mt-1 whitespace-nowrap text-xs text-foreground/60">
                sessions / constellation · 24h
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chart — absolutely positioned like the sibling tile, so the
          text column's layout never fights with it. Faded to 60%.
          `pt-14 pb-8` shifts the plot area down so its zero baseline
          aligns roughly with the tile's number baseline (34px text
          near the bottom of the card). Tighter bottom padding is the
          key; without it, the sparkline floats well above the digits. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 z-0 w-[62%] pl-3 pr-4 pt-14 pb-8 opacity-60">
        {showSkeleton ? (
          // Bottom-align the skeleton line + offset by 12px so it
          // sits exactly where the real chart's zero line will be
          // (Recharts's LineChart has margin.bottom=12 inside its
          // ResponsiveContainer).
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

/// Deterministic wobble around the current average so the sparkline
/// looks alive without needing a real per-day series.
function buildPlaceholderTrend(currentAvg: number) {
  const days = 5;
  // No floor — if the current value is 0, every point stays 0 so
  // the sparkline sits flat at the baseline instead of fabricating
  // a fake curve above zero.
  const base = currentAvg;
  return Array.from({ length: days }, (_, i) => {
    const wobble = Math.sin((i / (days - 1)) * Math.PI) * base * 0.35;
    const v = i === days - 1 ? base : Math.max(0, base - base * 0.15 + wobble);
    return { day: i, v };
  });
}
