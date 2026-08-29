// SPDX-License-Identifier: Apache-2.0
'use client';

import { Card, CardContent } from '@lib/client/components/ui/card';

/// Amber-gradient "Daily Brief" hero card from the CSMS - Overview
/// Figma frame. Currently renders a placeholder body — once we have
/// an operator-brief data source (aggregated incidents / usage
/// highlights / etc), swap the body + timestamp for the live values.
///
/// Kept intentionally chart-free and static so it can ship in the
/// polish pass without waiting on backend work.
export function DailyBriefCard() {
  return (
    <Card
      className={[
        'relative overflow-hidden rounded-xl border-0 py-8 shadow-sm',
        // Amber-cream gradient wash matching the Figma. The card sits
        // on the off-white page background; the gradient fades from
        // saturated amber (top-left) into cream so text at the bottom
        // remains legible.
        'bg-[radial-gradient(120%_180%_at_10%_20%,#fbcf72_0%,#f6dc9d_35%,#fdefd0_70%,#fdf4de_100%)]',
      ].join(' ')}
    >
      <CardContent className="relative">
        <div className="flex items-start gap-4">
          {/* Brief-source icon — /public/data-brief.svg. Housed in a
              soft-white circle so the SVG stays legible against the
              amber gradient behind it. `object-contain` + inner
              padding keeps the icon from touching the ring. */}
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/40 ring-1 ring-white/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/data-brief.svg"
              alt=""
              width={26}
              height={26}
              className="size-[26px]"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-base font-semibold text-[#3a2410]">
              <span>Daily Brief</span>
              <span className="text-[#3a2410]/60">·</span>
              <span className="text-sm font-normal text-[#3a2410]/70">
                updated 2 hours ago
              </span>
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#3a2410]/80">
              Overnight roll-up: fleet ran clean, no faulted chargers,
              revenue tracking to plan. Two orbitals in Constellation
              Nova flagged intermittent auth latency, watch queue for
              recurrence. Full drill-down in the sections below.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-full bg-white/60 px-4 py-2 text-xs font-medium text-[#3a2410] ring-1 ring-white/70 backdrop-blur-sm transition-colors hover:bg-white/80"
              >
                Full report
              </button>
              <button
                type="button"
                className="rounded-full bg-white/40 px-4 py-2 text-xs font-medium text-[#3a2410] ring-1 ring-white/50 backdrop-blur-sm transition-colors hover:bg-white/60"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
