// SPDX-License-Identifier: Apache-2.0
'use client';

import { Skeleton } from '@lib/client/components/ui/skeleton';
import { LOCATIONS_LIST_QUERY } from '@lib/queries/locations';
import { ResourceType } from '@lib/utils/access.types';
import { useList } from '@refinedev/core';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { LocationsMapDialog } from './locations.map.dialog';

/// Top Sites row from the Specula CSMS-Overview Figma — a section
/// header ("TOP SITES") over three constellation summary cards.
/// Cards are intentionally sparse for the Phase-A polish: name +
/// address / short label. Real ranking (by session count / revenue /
/// kWh) needs a backend aggregation query — for now the first three
/// locations returned by LOCATIONS_LIST_QUERY are used as
/// placeholders.
export function TopConstellationsSection() {
  const { query } = useList({
    resource: ResourceType.LOCATIONS,
    liveMode: 'auto',
    pagination: { currentPage: 1, pageSize: 3 },
    meta: { gqlQuery: LOCATIONS_LIST_QUERY },
  });

  const raw = (query.data?.data ?? []) as Array<{
    id?: number | string;
    name?: string;
    address?: string;
    city?: string;
  }>;
  // Fill to 3 with empty slots so the grid stays uniform on fresh
  // installs / empty tenants.
  const slots: Array<{ name: string; sub: string } | null> = Array.from(
    { length: 3 },
    (_, i) => {
      const loc = raw[i];
      if (!loc) return null;
      return {
        name: loc.name || `Constellation ${loc.id ?? i + 1}`,
        sub: [loc.address, loc.city].filter(Boolean).join(' · ') || '—',
      };
    },
  );

  return (
    <section className="flex h-full flex-col gap-3">
      {/* Section header row — label on the left, jump-to-Sites arrow
          on the right. `/locations` is the Sites tab in the top nav. */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-widest text-foreground/50">
          Top Sites
        </div>
        <div className="flex items-center gap-1">
          <LocationsMapDialog />
          <Link
            href="/locations"
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-widest text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            Show all sites
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
        {query.isLoading
          ? // 3 skeleton cards while the query is in flight so the
            // grid keeps its shape and users see something moving.
            Array.from({ length: 3 }, (_, i) => (
              <SkeletonConstellationCard key={i} />
            ))
          : slots.map((s, i) => (
              <ConstellationSummaryCard
                key={i}
                name={s?.name ?? `Site ${String.fromCharCode(65 + i)}`}
                sub={s?.sub ?? 'No data yet'}
                empty={!s}
              />
            ))}
      </div>
    </section>
  );
}

function ConstellationSummaryCard({
  name,
  sub,
  empty,
}: {
  name: string;
  sub: string;
  empty: boolean;
}) {
  return (
    <div className="relative h-full min-h-40 overflow-hidden rounded-xl bg-white p-4 shadow-sm">
      <h3
        className={
          'text-base font-semibold ' +
          (empty ? 'text-foreground/40' : 'text-foreground')
        }
      >
        {name}
      </h3>
      <p className="mt-1 text-xs text-foreground/60">{sub}</p>
    </div>
  );
}

/// Loading-state twin of ConstellationSummaryCard — same footprint,
/// pulsing placeholders where the title + subtitle would land.
function SkeletonConstellationCard() {
  return (
    <div className="relative h-full min-h-40 overflow-hidden rounded-xl bg-white p-4 shadow-sm">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-2 h-3 w-40" />
    </div>
  );
}
