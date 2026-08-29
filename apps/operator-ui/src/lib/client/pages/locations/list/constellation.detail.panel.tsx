// SPDX-License-Identifier: Apache-2.0
'use client';

import { ConstellationEditForm } from '@lib/client/pages/locations/list/constellation.edit.form';
import { MenuSection } from '@lib/client/components/main-menu/main.menu';
import { ChevronDown, ChevronLeft, Info, MapPin, Pencil, Plus, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/// Full detail data for a constellation card. Shared by the inline
/// takeover panel here and the edit form. Kept as a permissive type
/// because the list query returns partial fields depending on user
/// permissions.
export type ConstellationDetail = {
  id?: number | string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  timeZone?: string;
  parkingType?: string | null;
  facilities?: string[] | null;
  openingHours?: unknown | null;
  coordinates?: { coordinates: [number, number] } | null;
  chargingPool?: Array<{
    id?: number | string;
    ocppConnectionName?: string;
    isOnline?: boolean;
    transactions?: Array<{ isActive?: boolean; totalKwh?: number | null }>;
  }> | null;
};

/// Inline detail panel that takes over the RHS grid when a card or
/// pin is selected. Header (name + address), then Site Brief tile,
/// then the 3-stat row, then the field grid, then the orbitals list.
/// Footer opens the full-page detail. Own back button top-left,
/// pencil-edit top-right.
export function ConstellationDetailPanel({
  constellation,
  onClose,
}: {
  constellation: ConstellationDetail;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  useEffect(() => {
    setMode('view');
  }, [constellation.id]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-sm">
      {/* Amber wash — bottom-right radial, matches the sibling tile
          aesthetic. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(55%_110%_at_110%_100%,rgba(251,207,114,0.55),rgba(253,239,208,0)_65%)]"
      />

      {/* Back button — circle fill matches the tile bg
          (`bg-foreground/[0.03]`) so it reads as part of the same
          surface system, not a floating chip. Chevron rather than
          arrow so it feels like "back up one level" not "go left". */}
      <button
        type="button"
        aria-label="Back to constellations"
        onClick={onClose}
        className="absolute left-3 top-3 z-30 flex size-8 cursor-pointer items-center justify-center rounded-full bg-foreground/[0.03] text-foreground/80 transition-colors hover:bg-foreground/[0.08] focus:outline-hidden"
      >
        <ChevronLeft className="size-4" strokeWidth={2.5} />
      </button>

      {/* Edit pencil — view mode only. In edit mode the Cancel/Save
          footer drives state; pencil would be redundant. */}
      {mode === 'view' ? (
        <button
          type="button"
          aria-label="Edit constellation"
          onClick={() => setMode('edit')}
          className="absolute right-3 top-3 z-20 cursor-pointer rounded-md p-1 text-foreground opacity-70 transition-colors hover:bg-foreground/5 hover:opacity-100 active:bg-foreground/10 focus:outline-hidden"
        >
          <Pencil className="size-4" />
          <span className="sr-only">Edit</span>
        </button>
      ) : null}

      {mode === 'view' ? (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <Header c={constellation} />
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
            <SiteBrief c={constellation} />
            <StatsRow c={constellation} />
            <OpeningHoursSection c={constellation} />
            <FieldsGrid c={constellation} />
            <StationList c={constellation} />
          </div>
        </div>
      ) : (
        // pt-11 keeps the edit form's header out from under the back
        // button (size-8 button at top-3 = bottom edge at 44px).
        <div className="relative z-10 flex min-h-0 flex-1 flex-col pt-11">
          <ConstellationEditForm
            constellation={constellation}
            onCancel={() => setMode('view')}
            onSaved={() => setMode('view')}
            onDeleted={onClose}
          />
        </div>
      )}
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────

function Header({ c }: { c: ConstellationDetail }) {
  const address = [c.address, c.city, c.state].filter(Boolean).join(', ');
  const line2 = [c.postalCode, c.country].filter(Boolean).join(' · ');
  return (
    <div className="border-b border-border/40 px-6 pb-5 pt-14">
      <h2 className="text-lg font-semibold">
        {c.name || `Constellation ${c.id ?? ''}`}
      </h2>
      {address || line2 ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-foreground/60">
          <MapPin aria-hidden className="mt-0.5 size-3 shrink-0" />
          <span>
            {address}
            {address && line2 ? ' · ' : ''}
            {line2}
          </span>
        </p>
      ) : null}
    </div>
  );
}

// ─── Site brief tile ────────────────────────────────────────────────

/// Full-width tile above the stats row that hosts the AI-generated
/// site brief. Same neutral fill and label chrome as the sibling
/// stat tiles so it reads as a fourth tile that just happens to span
/// the row. Height is the same as a stat tile (label + big-text
/// row); content is two lines of prose that summarize the site's
/// recent state.
///
/// Copy is a stat-derived placeholder until the per-site brief
/// endpoint is wired — see task #38 (API observability).
function SiteBrief({ c }: { c: ConstellationDetail }) {
  const pool = c.chargingPool ?? [];
  const total = pool.length;
  const online = pool.filter((s) => s.isOnline).length;
  const activeSessions = pool.reduce(
    (acc, s) => acc + (s.transactions ?? []).filter((t) => t.isActive).length,
    0,
  );
  const brief = buildBrief(total, online, activeSessions);

  return (
    <div className="rounded-lg bg-foreground/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-foreground/50">
        <span>Site brief</span>
        {/* Info affordance — hints that the brief is AI-generated
            from live telemetry. Native title tooltip for v1; will
            expand to a popover once we have a settings surface. */}
        <span
          title="AI-generated summary based on the site's recent telemetry."
          className="inline-flex cursor-help"
        >
          <Info aria-hidden className="size-3 text-foreground/40" />
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-snug text-foreground/80">
        {brief}
      </p>
    </div>
  );
}

function buildBrief(total: number, online: number, activeSessions: number): string {
  if (total === 0) {
    return 'No chargers registered yet. Add one to start receiving telemetry and daily rollups.';
  }
  const offline = total - online;
  const parts: string[] = [];
  if (activeSessions > 0) {
    parts.push(
      `${activeSessions} session${activeSessions === 1 ? '' : 's'} in progress`,
    );
  } else {
    parts.push('No active sessions');
  }
  if (offline === 0) {
    parts.push(`all ${total} charger${total === 1 ? '' : 's'} online`);
  } else if (online === 0) {
    parts.push(`${total} charger${total === 1 ? '' : 's'} offline — investigate`);
  } else {
    parts.push(`${online} of ${total} chargers online`);
  }
  return `${parts.join(' · ')}.`;
}

// ─── Aggregate stats ────────────────────────────────────────────────

function StatsRow({ c }: { c: ConstellationDetail }) {
  const pool = c.chargingPool ?? [];
  const total = pool.length;
  const online = pool.filter((s) => s.isOnline).length;
  let activeSessions = 0;
  let liveKwh = 0;
  for (const s of pool) {
    for (const t of s.transactions ?? []) {
      if (t.isActive) {
        activeSessions += 1;
        liveKwh += Number(t.totalKwh ?? 0);
      }
    }
  }
  return (
    <div className="grid grid-cols-3 gap-4">
      <Stat label="Online" value={`${online} / ${total}`} />
      <Stat label="Active sessions" value={String(activeSessions)} />
      <Stat
        label="Live energy"
        value={
          <span className="flex items-baseline gap-1">
            <span>{liveKwh.toFixed(1)}</span>
            <span className="text-xs text-foreground/50">kWh</span>
          </span>
        }
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-foreground/[0.03] px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ─── Opening hours (read-only summary + expandable detail) ─────────

/// Section (not a tile) sitting between the stats row and the field
/// grid. Left column shows the "OPENING HOURS" label; right column
/// shows a short summary like "Weekdays 9 AM - 5 PM" or "Daily 24/7"
/// alongside a chevron. Clicking the chevron eases open a per-day
/// breakdown that pushes the FieldsGrid below downward.
///
/// Chevron is hidden when there's nothing to expand (24/7 or no
/// hours set) — the summary alone tells the story.
function OpeningHoursSection({ c }: { c: ConstellationDetail }) {
  const [expanded, setExpanded] = useState(false);
  const hours = normalizeHours(c.openingHours);
  const summary = summarizeHours(hours);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
          Opening Hours
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-foreground/80">
            {summary.label}
          </span>
          {summary.hasDetail ? (
            <button
              type="button"
              aria-label={expanded ? 'Hide daily breakdown' : 'Show daily breakdown'}
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="cursor-pointer rounded-md p-1 text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <ChevronDown
                className={
                  'size-3.5 transition-transform duration-200 ease-out ' +
                  (expanded ? 'rotate-180' : '')
                }
              />
            </button>
          ) : null}
        </div>
      </div>

      {/* Grid-template-rows trick — animates from 0fr → 1fr so the
          detail grows to its natural height on open and collapses
          back cleanly. Nothing needs to know the actual pixel size,
          which keeps the transition working even if the day list
          changes underneath. */}
      {summary.hasDetail ? (
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-in"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        >
          <div className="min-h-0 overflow-hidden">
            {/* px-3 indents the day list from the section header
                so the detail reads as a nested block rather than
                bumping the panel's outer padding. Full day names
                and precise "9:00 AM to 5:00 PM" times used here
                because the expanded view has the width for them —
                the collapsed summary above stays compact. */}
            <ul className="mt-3 space-y-2 px-3 text-xs">
              {summary.detail.map((d) => (
                <li key={d.weekday} className="flex items-center justify-between gap-3">
                  <span className="text-foreground/50">{fullWeekday(d.weekday)}</span>
                  <span className="truncate text-right font-medium tabular-nums text-foreground/80">
                    {formalTime(d.begin)} to {formalTime(d.end)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/// Coerces the raw JSON blob stored in `Locations.openingHours`
/// into the minimal shape the summary logic below relies on.
/// Deliberately loose — legacy rows may have missing / partial fields.
type NormalizedHours = {
  twentyfourSeven: boolean;
  regular: Array<{ weekday: number; begin: string; end: string }>;
};

function normalizeHours(raw: unknown | null | undefined): NormalizedHours {
  if (!raw || typeof raw !== 'object') {
    return { twentyfourSeven: false, regular: [] };
  }
  const obj = raw as {
    twentyfourSeven?: unknown;
    regularHours?: Array<{ weekday?: unknown; periodBegin?: unknown; periodEnd?: unknown }>;
  };
  const twentyfourSeven = obj.twentyfourSeven === true;
  const regular = (obj.regularHours ?? [])
    .map((r) => ({
      weekday: typeof r.weekday === 'number' ? r.weekday : Number(r.weekday),
      begin: typeof r.periodBegin === 'string' ? r.periodBegin : '',
      end: typeof r.periodEnd === 'string' ? r.periodEnd : '',
    }))
    .filter((r) => Number.isFinite(r.weekday) && r.weekday >= 1 && r.weekday <= 7 && r.begin && r.end)
    .sort((a, b) => a.weekday - b.weekday);
  return { twentyfourSeven, regular };
}

type OpeningHoursSummary = {
  label: string;
  hasDetail: boolean;
  detail: Array<{ weekday: number; begin: string; end: string }>;
};

/// Pattern-matches the schedule into a human phrase. The four
/// canonical labels operators use ("Daily 24/7", "Daily 9 AM - 5 PM",
/// "Weekdays 9 AM - 5 PM", "Weekends 9 AM - 5 PM", "Mon-Sat 9 AM - 5 PM")
/// short-circuit when every day has identical hours; anything else
/// falls back to "Custom times".
function summarizeHours(h: NormalizedHours): OpeningHoursSummary {
  if (h.twentyfourSeven) {
    return { label: 'Daily 24/7', hasDetail: false, detail: [] };
  }
  if (h.regular.length === 0) {
    return { label: 'Not set', hasDetail: false, detail: [] };
  }

  const detail = h.regular;
  const timeKey = (r: { begin: string; end: string }) => `${r.begin}|${r.end}`;
  const buckets = new Map<string, number[]>();
  for (const r of h.regular) {
    const k = timeKey(r);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r.weekday);
  }

  // Every day shares one time window — try to name the day set.
  if (buckets.size === 1) {
    const [key, days] = [...buckets][0];
    const [begin, end] = key.split('|');
    const timeLabel = `${friendlyTime(begin)} - ${friendlyTime(end)}`;
    return {
      label: `${describeDaySet(days)} ${timeLabel}`,
      hasDetail: true,
      detail,
    };
  }

  return { label: 'Custom times', hasDetail: true, detail };
}

/// Given a set of weekday numbers (1=Mon..7=Sun), produce the most
/// concise human label. Falls back to a comma-joined list of
/// abbreviated names for arbitrary combinations.
function describeDaySet(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'Daily';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(6) && set.has(7)) return 'Weekends';
  const sorted = [...set].sort((a, b) => a - b);
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length >= 2) {
    return `${shortWeekday(sorted[0])}-${shortWeekday(sorted[sorted.length - 1])}`;
  }
  return sorted.map(shortWeekday).join(', ');
}

function shortWeekday(w: number): string {
  return ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][w] ?? '';
}

function fullWeekday(w: number): string {
  return [
    '',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ][w] ?? '';
}

/// Compact time — used by the summary line where every character
/// counts ("Daily 9 AM - 5 PM"). Drops `:00` for on-the-hour times.
function friendlyTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = parseInt(m[2], 10);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return mm === 0 ? `${h12} ${ampm}` : `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

/// Formal time — used in the expanded per-day breakdown where we
/// have the room. Always shows `H:MM` so the column stays visually
/// aligned even for on-the-hour times ("9:00 AM to 5:00 PM").
function formalTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = parseInt(m[2], 10);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

// ─── Structured fields ──────────────────────────────────────────────

function FieldsGrid({ c }: { c: ConstellationDetail }) {
  const hasCoords = c.coordinates?.coordinates?.length === 2;
  const [lng, lat] = hasCoords
    ? (c.coordinates as { coordinates: [number, number] }).coordinates
    : [undefined, undefined];

  const facilities = (c.facilities ?? []).filter(Boolean);
  const facilitiesLabel = facilities.length > 0
    ? facilities.map(formatEnum).join(', ')
    : 'N/A';
  const parkingLabel = formatEnum(c.parkingType) ?? 'N/A';

  // Two-column layout. Parking and Facilities always render (with
  // an N/A fallback) so operators can tell the difference between
  // "not filled in" and "not applicable". Other rows drop when
  // missing to keep the grid compact.
  const rows = [
    { label: 'Timezone', value: c.timeZone, always: false },
    { label: 'Latitude', value: lat != null ? lat.toFixed(6) : undefined, always: false },
    { label: 'Longitude', value: lng != null ? lng.toFixed(6) : undefined, always: false },
    { label: 'ID', value: c.id != null ? String(c.id) : undefined, always: false },
    { label: 'Parking', value: parkingLabel, always: true },
    { label: 'Facilities', value: facilitiesLabel, always: true },
  ].filter((r) => r.always || !!r.value);

  if (rows.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-3">
          <span className="text-foreground/50">{r.label}</span>
          <span className="truncate text-right font-medium text-foreground/80">
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/// Enum values arrive as camelCase (`alongMotorway`), PascalCase, or
/// SCREAMING_SNAKE_CASE depending on the source — normalize all
/// three into a readable label ("Along Motorway"). Returns undefined
/// for empty input so FieldsGrid can drop the row.
function formatEnum(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  return raw
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Station list ───────────────────────────────────────────────────

function StationList({ c }: { c: ConstellationDetail }) {
  const { push } = useRouter();
  const pool = c.chargingPool ?? [];
  const count = pool.length;
  // Singularize the header label when only one charger is attached
  // (keeps "Orbital" internal per naming convention).
  const noun = count === 1 ? 'Charger' : 'Chargers';

  const AddButton = (
    <button
      type="button"
      onClick={() => push(`/${MenuSection.CHARGING_STATIONS}/new`)}
      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
    >
      <Plus className="size-3" />
      Add Charger
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
          {noun} {count > 0 ? `(${count})` : ''}
        </div>
        {AddButton}
      </div>
      {count === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-foreground/50">
          No chargers registered at this site yet.
        </div>
      ) : (
        <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/40">
          {pool.map((s) => {
            const active = (s.transactions ?? []).some((t) => t.isActive);
            const dot = s.isOnline
              ? active
                ? 'bg-[#05B084]'
                : 'bg-[#4a9d6c]'
              : 'bg-[#c94a3a]';
            return (
              <li
                key={String(s.id)}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full ${dot}`}
                  />
                  <span className="truncate font-medium">
                    {s.ocppConnectionName || `Charger ${s.id ?? ''}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-foreground/60">
                  {active ? (
                    <span className="inline-flex items-center gap-1">
                      <Zap className="size-3 text-[#05B084]" />
                      Charging
                    </span>
                  ) : s.isOnline ? (
                    <span>Online</span>
                  ) : (
                    <span className="text-foreground/40">Offline</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
