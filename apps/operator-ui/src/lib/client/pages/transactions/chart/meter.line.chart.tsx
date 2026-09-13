// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import {
  formatTimeLabel,
  generateTimeTicks,
  type ChartData,
} from '@lib/client/pages/transactions/chart/util';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/// Shared platform-styled chart used by every meter-value graph
/// on the transaction detail (Power / Energy / SoC / Voltage /
/// Current). Mirrors the Overview page's TotalWattageCard visual
/// language: no axis lines/ticks, faint horizontal grid, small
/// muted tick labels, single-stroke line in a brand color, dark
/// bubble tooltip.
///
/// Handles empty state internally so callers don't repeat the
/// "no data" check five times.
export function MeterLineChart({
  title,
  data,
  dataKey,
  color = '#05B084',
  unit,
  emptyMessage,
  yDomain,
  format,
}: {
  title: string;
  data: ChartData;
  /// Object key on `data` items that carries the numeric measurement.
  dataKey: string;
  /// Line stroke color. Defaults to brand green.
  color?: string;
  /// Unit suffix on tooltip values (e.g. "kW", "kWh", "%").
  unit: string;
  emptyMessage: string;
  /// Optional [min, max] override for the y-axis. Default = auto.
  yDomain?: [number, number];
  /// Optional value formatter for tooltip + y-axis ticks. Default
  /// rounds to one decimal.
  format?: (v: number) => string;
}) {
  const fmt = format ?? ((v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)));
  const hasData = data && data.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-card p-4 shadow-sm">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-widest text-foreground/50">
        {title}
      </div>
      {!hasData ? (
        <div className="flex flex-1 items-center justify-center py-6 text-xs text-foreground/40">
          {emptyMessage}
        </div>
      ) : (
        <div className="min-h-[160px] flex-1">
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
                dataKey="elapsedTime"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={generateTimeTicks(data)}
                tickFormatter={formatTimeLabel}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fillOpacity: 0.55, fontSize: 10 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fillOpacity: 0.55, fontSize: 10 }}
                tickFormatter={fmt}
                domain={yDomain ?? ['auto', 'auto']}
                width={40}
              />
              <Tooltip
                cursor={{
                  stroke: 'currentColor',
                  strokeOpacity: 0.15,
                  strokeWidth: 1,
                }}
                content={<MeterTooltip color={color} unit={unit} format={fmt} />}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: color }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Tooltip ────────────────────────────────────────────────────────

/// Dark-bubble tooltip matching the Overview page's TotalWattageCard.
/// Small-caps tracked timestamp on top, semibold value+unit below.
function MeterTooltip({
  active,
  payload,
  label,
  color,
  unit,
  format,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: number;
  color: string;
  unit: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  return (
    <div className="rounded-md bg-foreground px-2.5 py-1.5 shadow-lg">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-background/60">
        <span
          className="inline-block size-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label != null ? formatTimeLabel(Number(label)) : ''}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-background">
        {format(Number(payload[0].value))} {unit}
      </div>
    </div>
  );
}
