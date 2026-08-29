// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
// SPDX-License-Identifier: Apache-2.0
'use client';

import { AnimatedTile } from '@lib/client/pages/overview/animated-tile/animated.tile';
import { ChargerActivityAvgCard } from '@lib/client/pages/overview/charger-activity/charger.activity.avg.card';
import { ConstellationHealthCard } from '@lib/client/pages/overview/constellation-health/constellation.health.card';
import { DailyBriefCard } from '@lib/client/pages/overview/daily-brief/daily.brief.card';
import { FleetStatusCard } from '@lib/client/pages/overview/fleet-status/fleet.status.card';
import { OverviewHeader } from '@lib/client/pages/overview/header/overview.header';
import { PlugInSuccessCard } from '@lib/client/pages/overview/plug-in-success/plug.in.success.card';
import { TopConstellationsSection } from '@lib/client/pages/overview/top-constellations/top.constellations.section';
import { TotalWattageCard } from '@lib/client/pages/overview/total-wattage/total.wattage.card';

// The three original metric cards (OnlineStatus / ChargerActivity /
// PluginSuccessRate) and the legacy LocationsCard + ActiveTransactionsCard
// are intentionally not imported here — the Figma-driven rebuild
// replaces them. The components still exist on disk and can be
// reintroduced if we bring back the old layout.

/// Overview page — rebuilt to align with the Specula Figma
/// "CSMS - Overview" frame (node 4262:3365).
///
/// Structure (top → bottom):
///   1. Greeting + date + section nav
///   2. Daily Brief hero card (amber wash)
///   3. Three metric cards: Online Status / Activity / Plug-in Success
///   4. Legacy Locations map + Active Transactions (kept for now; the
///      Figma replaces these with Total Wattage / Top Sites /
///      Constellation Health, which need new data plumbing before
///      they can ship. Tracked as follow-ups.)
export const Overview = () => {
  return (
    <div className="flex flex-col gap-8 py-2">
      <OverviewHeader />

      {/* Hero + metrics block. On lg+ the layout is two columns:
          left column stacks Daily Brief over the 3 metric cards;
          right column is a single tall Total Wattage card that
          spans the full height of the left column. On narrow the
          whole thing collapses to a single column and stacks.

          Each tile is wrapped in an AnimatedTile with an explicit
          `index` — that's what drives the stagger cascade on load
          (top-left → across → down). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-9">
        <div className="flex flex-col gap-4 lg:col-span-6">
          <AnimatedTile index={0}><DailyBriefCard /></AnimatedTile>
          <div id="revenue" className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <AnimatedTile index={2}><ConstellationHealthCard /></AnimatedTile>
            <AnimatedTile index={3}><ChargerActivityAvgCard /></AnimatedTile>
            <AnimatedTile index={4}><PlugInSuccessCard /></AnimatedTile>
          </div>
        </div>
        <AnimatedTile index={1} className="lg:col-span-3" id="energy">
          <TotalWattageCard />
        </AnimatedTile>
      </div>

      {/* Top Sites row — matches the Figma "TOP SITES" + Fleet
          Status composition. 3 constellation cards on the left,
          stacked-bar breakdown on the right. */}
      <div id="sites" className="grid grid-cols-1 gap-4 lg:grid-cols-9">
        <AnimatedTile index={5} className="lg:col-span-6">
          <TopConstellationsSection />
        </AnimatedTile>
        <AnimatedTile index={6} className="lg:col-span-3">
          <FleetStatusCard />
        </AnimatedTile>
      </div>
    </div>
  );
};

/// Empty metric-card slot — title in the top-left over a white card
/// with an amber corner-gradient wash. Height is fixed so all three
/// stay uniform in the row even before their bodies are populated.
function PlaceholderMetricCard({ title }: { title: string }) {
  return (
    <div className="relative h-40 overflow-hidden rounded-xl bg-white shadow-sm">
      {/* Amber corner glow, top-left. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_20%_20%,rgba(251,207,114,0.55),rgba(253,239,208,0)_65%)]"
      />
      <div className="relative p-6">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
    </div>
  );
}
