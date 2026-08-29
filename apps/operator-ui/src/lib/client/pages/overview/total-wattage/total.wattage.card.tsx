// SPDX-License-Identifier: Apache-2.0
'use client';

import { Card, CardContent } from '@lib/client/components/ui/card';
import { useShellArrival } from '@lib/client/hooks/use.shell.arrival';
import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/// Fleet portfolio card — switches between three overlaid metrics
/// via a small button group at the top-right:
///   • Wattage — total energy draw in MWh
///   • Expense — energy cost in $K
///   • Revenue — customer revenue in $K
///
/// Each metric has its own y-axis scale, tick format, and series
/// color; only one renders at a time (mixed units on a single axis
/// would be dishonest).
///
/// Line is a stepAfter with an S-curve at each transition (see
/// `curveSCurveStepAfter` below) — monthly average holds flat
/// across the month, then smoothly transitions to the next value.
///
/// All values are placeholders for now — the historical
/// aggregation endpoints (meter values → MWh; transaction cost →
/// expense; charging session revenue → revenue) are tracked as
/// task #38.
export function TotalWattageCard() {
  const [selected, setSelected] = useState<MetricKey>('wattage');
  const metric = METRICS[selected];
  const targetData = useMemo(() => buildSeries(metric), [metric]);

  // Rise-from-0 entrance: interpolate `progress` from 0 → 1 over
  // `RISE_MS` via requestAnimationFrame. Data values are multiplied
  // by progress before rendering, so Recharts naturally draws the
  // line growing from the baseline. GATED on `useShellArrival()` so
  // the animation only starts AFTER the sign-in loader has exited
  // (otherwise it plays behind the loader and finishes invisibly).
  // Re-runs whenever `selected` changes so metric switches also rise.
  const arrived = useShellArrival();
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!arrived) {
      setProgress(0);
      return;
    }
    setProgress(0);
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - startedAt) / RISE_MS, 1);
      // ease-out cubic — fast start, gentle settle
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selected, arrived]);

  const data = useMemo(
    () => targetData.map((d) => ({ ...d, value: d.value * progress })),
    [targetData, progress],
  );

  return (
    <Card className="relative flex h-full flex-col overflow-hidden rounded-xl border-0 py-6 shadow-sm">
      <CardContent className="flex h-full flex-col gap-4">
        {/* Header: title + selector on the first row, subtitle
            below on its own full-width row so it stays a single
            line regardless of how narrow the card is. */}
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">
              {metric.title}
            </h2>
            <MetricSelector selected={selected} onSelect={setSelected} />
          </div>
          <p className="whitespace-nowrap text-xs text-foreground/50">
            {metric.subtitle}
          </p>
        </div>

        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fillOpacity: 0.55, fontSize: 11 }}
                interval={0}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fillOpacity: 0.55, fontSize: 11 }}
                domain={[0, metric.yMax]}
                ticks={metric.yTicks}
                tickFormatter={metric.tickFormat}
                // Wide enough to fit the widest label ("$2.5K")
                // without clipping the leading "$".
                width={56}
              />
              <Tooltip
                cursor={{
                  stroke: 'currentColor',
                  strokeOpacity: 0.15,
                  strokeWidth: 1,
                }}
                content={
                  <ChartTooltip
                    format={metric.tickFormat}
                    color={metric.color}
                  />
                }
              />
              <Line
                // Custom S-curve step — declared below. Cast because
                // Recharts's `CurveType` type is a string union that
                // doesn't include curve factories, but the runtime
                // does accept them.
                type={curveSCurveStepAfter as unknown as 'stepAfter'}
                dataKey="value"
                stroke={metric.color}
                strokeWidth={STROKE_WIDTH}
                strokeLinejoin="round"
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: metric.color }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

const STROKE_WIDTH = 2;
/// How long the rise-from-0 entrance animation runs (ms). Matches
/// the sparkline tiles' `tile-chart-rise` keyframe duration.
const RISE_MS = 900;
/// How much of the horizontal spacing between two data points is
/// used for the S-curve transition. 0 = sharp step; 1 = pure
/// S-curve across the whole segment.
const TRANSITION_FRACTION = 0.6;

// Metric definitions — each drives title, subtitle, y-axis scale,
// tick format, series color, and the shape of the placeholder data.
type MetricKey = 'wattage' | 'expense' | 'revenue';

type MetricDef = {
  key: MetricKey;
  label: string; // shown on the selector button
  title: string; // card title when selected
  subtitle: string;
  color: string;
  yMax: number;
  yTicks: number[];
  tickFormat: (v: number) => string;
  shape: number[]; // 8-month placeholder values
};

const METRICS: Record<MetricKey, MetricDef> = {
  wattage: {
    key: 'wattage',
    label: 'Wattage',
    title: 'Total Wattage',
    subtitle: 'Fleet-wide draw · last 8 months',
    color: '#05B084',
    yMax: 6,
    yTicks: [0, 1, 2, 3, 4, 5, 6],
    tickFormat: (v) => (v === 0 ? '0' : `${v}M`),
    shape: [2.3, 2.1, 2.8, 3.4, 3.9, 4.2, 3.6, 3.1],
  },
  expense: {
    key: 'expense',
    label: 'Expense',
    title: 'Total Expense',
    subtitle: 'Energy cost · last 8 months',
    color: '#e07c1f',
    yMax: 3,
    yTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3],
    tickFormat: (v) => (v === 0 ? '0' : `$${v}K`),
    shape: [1.2, 1.1, 1.4, 1.7, 2.0, 2.1, 1.8, 1.6],
  },
  revenue: {
    key: 'revenue',
    label: 'Revenue',
    title: 'Total Revenue',
    subtitle: 'Customer revenue · last 8 months',
    color: '#3faa6b',
    yMax: 5,
    yTicks: [0, 1, 2, 3, 4, 5],
    tickFormat: (v) => (v === 0 ? '0' : `$${v}K`),
    shape: [2.4, 2.2, 2.9, 3.5, 4.0, 4.4, 3.8, 3.3],
  },
};

/// Recharts tooltip content — small dark bubble with the month
/// (small-caps) and the formatted value (bold). `format` is the
/// same tickFormatter the y-axis uses so units stay consistent.
function ChartTooltip({
  active,
  payload,
  label,
  format,
  color,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  format: (v: number) => string;
  color: string;
}) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  return (
    <div className="rounded-md bg-foreground px-2.5 py-1.5 shadow-lg">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-background/60">
        <span
          className="inline-block size-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-background">
        {format(payload[0].value)}
      </div>
    </div>
  );
}

/// Metric picker — small pill button group at the top-right of the
/// card. Selected button has a filled dark bg + white text; the
/// others sit at muted grey with a colored dot indicating each
/// series' line color.
function MetricSelector({
  selected,
  onSelect,
}: {
  selected: MetricKey;
  onSelect: (key: MetricKey) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-foreground/[0.04] p-0.5">
      {(Object.values(METRICS) as MetricDef[]).map((m) => {
        const active = m.key === selected;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onSelect(m.key)}
            aria-pressed={active}
            className={
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ' +
              (active
                ? 'bg-foreground text-background'
                : 'text-foreground/60 hover:text-foreground')
            }
          >
            <span
              className="inline-block size-1.5 rounded-full"
              style={{ backgroundColor: m.color }}
            />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/// Custom d3-shape curve: stepAfter with an S-curve transition at
/// each corner instead of sharp 90° angles. Passed directly to
/// Recharts's `<Line type>` — Recharts accepts curve factories at
/// runtime even though the type signature says otherwise.
type PathContext = {
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  bezierCurveTo: (
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ) => void;
};

function curveSCurveStepAfter(context: PathContext) {
  let started = false;
  let prevX = 0;
  let prevY = 0;
  return {
    areaStart() {},
    areaEnd() {},
    lineStart() {
      started = false;
    },
    lineEnd() {},
    point(x: number, y: number) {
      x = +x;
      y = +y;
      if (!started) {
        started = true;
        context.moveTo(x, y);
      } else {
        const dx = x - prevX;
        if (y === prevY) {
          context.lineTo(x, y);
        } else {
          const w = dx * TRANSITION_FRACTION;
          const startX = x - w;
          const midX = startX + w / 2;
          context.lineTo(startX, prevY);
          context.bezierCurveTo(midX, prevY, midX, y, x, y);
        }
      }
      prevX = x;
      prevY = y;
    },
  };
}

/// Deterministic 8-month series for the selected metric, keyed by
/// current month → 7 months back. Values pulled from `metric.shape`
/// so the trend feels consistent across renders.
function buildSeries(
  metric: MetricDef,
): Array<{ month: string; value: number }> {
  const months = monthLabelsEndingThisMonth(8);
  return months.map((month, i) => ({
    month,
    value: metric.shape[i] ?? 0,
  }));
}

function monthLabelsEndingThisMonth(count: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(d.toLocaleString('en', { month: 'short' }));
  }
  return out;
}
