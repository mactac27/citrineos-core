// SPDX-License-Identifier: Apache-2.0
'use client';

/// Fleet Status card — right-column counterpart to the Top Sites
/// row, mirrors the Specula CSMS-Overview Figma's stacked-bar
/// breakdown card. Shows the total station count and how those
/// stations split across five states.
///
/// Counts are placeholder for the Phase-A polish; wiring live
/// aggregation across ChargerStatusEnum needs a per-status query
/// (or a group-by aggregate the current schema doesn't expose
/// cleanly). Slot for later — see task #38 (API observability).
export function FleetStatusCard() {
  // Placeholder distribution — swap for a live query later. Keep the
  // order matched to the segment order below so both the bar and
  // the legend read left-to-right consistently.
  const buckets: Array<{ label: string; count: number; color: string }> = [
    { label: 'Available',   count: 42, color: '#4a9d6c' },
    { label: 'Charging',    count: 18, color: '#c99039' },
    { label: 'Unavailable', count: 8,  color: '#2a3a6a' },
    { label: 'Faulted',     count: 4,  color: '#c94a3a' },
    { label: 'Offline',     count: 8,  color: '#8a8a8a' },
  ];
  const total = buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-foreground">
          Fleet Status
        </h2>
        <div className="text-xs text-foreground/60">
          <span className="text-base font-semibold text-foreground">{total}</span>{' '}
          stations
        </div>
      </div>

      {/* Stacked bar — each bucket contributes width proportional
          to its share of the total. `flex` gives us the composition
          without doing per-segment math. */}
      <div className="flex h-2 overflow-hidden rounded-full bg-foreground/[0.04]">
        {buckets.map((b) => (
          <div
            key={b.label}
            style={{
              width: total === 0 ? '0%' : `${(b.count / total) * 100}%`,
              backgroundColor: b.color,
            }}
            aria-label={`${b.label}: ${b.count}`}
          />
        ))}
      </div>

      {/* Legend rows — dot + label + count. Vertical stack matches
          the Figma treatment. */}
      <ul className="mt-1 flex flex-col gap-2 text-sm">
        {buckets.map((b) => (
          <li key={b.label} className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-foreground/80">
              <span
                aria-hidden
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: b.color }}
              />
              {b.label}
            </span>
            <span className="tabular-nums text-foreground/60">{b.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
