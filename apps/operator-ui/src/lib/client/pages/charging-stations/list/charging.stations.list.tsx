// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import { MenuSection } from '@lib/client/components/main-menu/main.menu';
import { Button } from '@lib/client/components/ui/button';
import { Checkbox } from '@lib/client/components/ui/checkbox';
import { Skeleton } from '@lib/client/components/ui/skeleton';
import { Switch } from '@lib/client/components/ui/switch';
import { useShellArrival } from '@lib/client/hooks/use.shell.arrival';
import { CHARGING_STATIONS_LIST_QUERY } from '@lib/queries/charging.stations';
import { TRANSACTION_LIST_QUERY } from '@lib/queries/transactions';
import { ActionType, ResourceType } from '@lib/utils/access.types';
import { AccessDeniedFallback } from '@lib/utils/AccessDeniedFallback';
import { CanAccess, useDeleteMany, useList } from '@refinedev/core';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@lib/client/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lib/client/components/ui/select';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ListChecks,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Search,
  Square,
  Trash2,
  Unplug,
  Waypoints,
  X,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChargerCreateModal } from '@lib/client/pages/charging-stations/list/charger.create.modal';
import { CommandsUnavailableText } from '@lib/client/pages/charging-stations/commands.unavailable.text';
import type { ChargingStationDto } from '@citrineos/base';
import { useDispatch } from 'react-redux';
import { openModal } from '@lib/utils/store/modal.slice';
import { ModalComponentType } from '@lib/client/components/modals/modal.types';
import { useTranslate } from '@refinedev/core';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@lib/client/components/ui/tooltip';
import { CommandType } from '@lib/utils/access.types';

/// Chargers page — operator-facing rename of `/charging-stations`.
/// Fleet-ops layout: no map, dense table. Each row is one charging
/// station; click a row to expand it inline and reveal per-connector
/// status, action buttons, metadata, and the last few sessions.
///
/// This is pass 1: the shell, header, compact rows, and the
/// expand-in-place choreography. Filters, bulk mode wiring, action
/// buttons, and the lazy recent-transactions query land in later
/// passes.
export const ChargingStationsList = () => {
  const { push } = useRouter();
  const arrived = useShellArrival();

  // Header entrance animations — same treatment as Constellations
  // so the two pages read as a set. Gated on `arrived` so nothing
  // plays behind the loader.
  const leftAnim: React.CSSProperties = arrived
    ? { animation: 'slide-in-left 550ms ease-in both' }
    : { opacity: 0, transform: 'translateX(-15px)' };
  const topAnim = (idx: number): React.CSSProperties =>
    arrived
      ? {
          animation: 'slide-in-top 380ms cubic-bezier(0.16,1,0.3,1) both',
          animationDelay: `${80 + idx * 90}ms`,
        }
      : { opacity: 0, transform: 'translateY(-12px)' };

  const [query, setQuery] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Create-charger modal — the "+ New charger" button opens this
  // instead of routing to /charging-stations/new.
  const [createOpen, setCreateOpen] = useState(false);

  // Filter state — one per chip. Empty string / 'all' / 'any' all
  // read as "no filter" for readability at the call site.
  const [constellationFilter, setConstellationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'faulted'>('all');
  const [sessionFilter, setSessionFilter] = useState<'any' | 'active' | 'idle'>('any');
  const [protocolFilter, setProtocolFilter] = useState<'all' | 'OCPP16' | 'OCPP201'>('all');

  // Pagination — client-side, since filters + search are already
  // in-memory. Default 25 per page; 10 / 25 / 50 offered via a
  // footer selector. Current page resets to 1 whenever the
  // filtered set shrinks (see effect below).
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Row-cascade gate — runs the slide-in-from-left animation on
  // the first render that has data + shell arrival. Flips false
  // ~1s later so subsequent renders (pagination, filter changes,
  // live updates) don't re-cascade. Effect fires further down,
  // after `listQuery` is declared.
  const [rowsCascade, setRowsCascade] = useState(true);

  // Bulk-select state — set of station IDs the operator has ticked
  // via the per-row checkbox or the header select-all. Cleared on
  // bulkMode toggle-off so state doesn't leak between sessions.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  useEffect(() => {
    if (!bulkMode) setSelectedIds(new Set());
  }, [bulkMode]);

  const { mutate: mutateDeleteMany } = useDeleteMany();

  const { query: listQuery } = useList<Charger>({
    resource: ResourceType.CHARGING_STATIONS,
    liveMode: 'auto',
    sorters: [{ field: 'ocppConnectionName', order: 'asc' }],
    pagination: { currentPage: 1, pageSize: 500 },
    meta: { gqlQuery: CHARGING_STATIONS_LIST_QUERY },
  });

  const all = (listQuery.data?.data ?? []) as Charger[];

  useEffect(() => {
    if (arrived && !listQuery.isLoading && rowsCascade) {
      // 550ms base delay + 480ms max stagger + 380ms animation
      // duration = 1410ms until the last row is done; add a small
      // buffer so we don't strip the class mid-flight.
      const t = window.setTimeout(() => setRowsCascade(false), 1600);
      return () => window.clearTimeout(t);
    }
  }, [arrived, listQuery.isLoading, rowsCascade]);

  /// Client-derived "position at site" — orders each site's
  /// chargers by createdAt and numbers them 1..N. Computed off the
  /// FULL dataset (not `filtered`) so filtering / searching doesn't
  /// renumber the visible ones. Feeds the "{Constellation} · #N"
  /// fallback in the Unit name column when no `displayName` is set.
  const positionAtSite = useMemo(() => {
    const groups = new Map<string, Charger[]>();
    for (const c of all) {
      const key = String(c.locationId ?? c.location?.id ?? '');
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    const map = new Map<string, number>();
    for (const list of groups.values()) {
      list.sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return at - bt;
      });
      list.forEach((c, i) => {
        if (c.id != null) map.set(String(c.id), i + 1);
      });
    }
    return map;
  }, [all]);

  /// Unique, sorted list of constellation names present in the
  /// fetched set — feeds the "Constellation" filter chip so the
  /// dropdown only offers sites that actually have chargers.
  const constellationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of all) {
      const n = c.location?.name;
      if (n) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [all]);

  /// Applied filters, ANDed together. Search is a substring match
  /// against unit name / OCPP identity / constellation name. Chip
  /// filters short-circuit early when set to their "no filter"
  /// value so the common case skips the checks entirely.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (
        constellationFilter &&
        String(c.location?.name ?? '') !== constellationFilter
      ) {
        return false;
      }
      if (statusFilter !== 'all') {
        const online = c.isOnline === true;
        const faulted = hasFaultedConnector(c);
        if (statusFilter === 'online' && !online) return false;
        if (statusFilter === 'offline' && online) return false;
        if (statusFilter === 'faulted' && !faulted) return false;
      }
      if (sessionFilter !== 'any') {
        const active = (c.transactions ?? []).some((t) => t.isActive);
        if (sessionFilter === 'active' && !active) return false;
        if (sessionFilter === 'idle' && active) return false;
      }
      if (protocolFilter !== 'all') {
        const key = String(c.protocol ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        // Accept both "OCPP16" and "OCPP1.6" storage variants.
        const short = key.startsWith('OCPP20') ? 'OCPP201' : key.startsWith('OCPP16') ? 'OCPP16' : key;
        if (short !== protocolFilter) return false;
      }
      if (q) {
        const name = String(c.displayName ?? '').toLowerCase();
        const ocpp = String(c.ocppConnectionName ?? '').toLowerCase();
        const site = String(c.location?.name ?? '').toLowerCase();
        if (!name.includes(q) && !ocpp.includes(q) && !site.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [all, query, constellationFilter, statusFilter, sessionFilter, protocolFilter]);

  // Pagination derived state. `pageCount` is at least 1 so the
  // footer's "Page X of Y" never reads "of 0" on an empty set.
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, filtered.length);
  const paged = useMemo(
    () => filtered.slice(pageStart, pageEnd),
    [filtered, pageStart, pageEnd],
  );

  // Reset to page 1 whenever the filtered set changes size — the
  // operator flipped a filter, cleared a search, or a live update
  // pruned rows; either way holding page 5 of a now-4-row list is
  // a dead-end. Also collapse any open expansion.
  useEffect(() => {
    setCurrentPage(1);
    setExpandedId(null);
  }, [query, constellationFilter, statusFilter, sessionFilter, protocolFilter, pageSize]);

  const filteredIds = useMemo(
    () => filtered.map((c) => String(c.id ?? '')).filter(Boolean),
    [filtered],
  );
  const filteredSelectedCount = useMemo(
    () => filteredIds.filter((id) => selectedIds.has(id)).length,
    [filteredIds, selectedIds],
  );
  const allFilteredSelected =
    filteredIds.length > 0 && filteredSelectedCount === filteredIds.length;
  const someFilteredSelected =
    filteredSelectedCount > 0 && filteredSelectedCount < filteredIds.length;
  const selectedCount = selectedIds.size;

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSel = filteredIds.length > 0 && filteredIds.every((id) => next.has(id));
      if (allSel) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }, [filteredIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /// Bulk delete via useDeleteMany. Charger FKs to Transactions
  /// and EVSEs are RESTRICT at the DB level — stations with
  /// history will fail with a constraint error, which surfaces
  /// through Refine's error toast.
  const runBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleteOpen(false);
    setBulkDeleting(true);
    const idsForDelete = Array.from(selectedIds);
    try {
      await new Promise<void>((resolve, reject) => {
        mutateDeleteMany(
          {
            resource: ResourceType.CHARGING_STATIONS,
            ids: idsForDelete,
            mutationMode: 'pessimistic',
            successNotification: {
              message: `Deleted ${idsForDelete.length} charger${idsForDelete.length === 1 ? '' : 's'}`,
              type: 'success',
            },
          },
          { onSuccess: () => resolve(), onError: (e) => reject(e) },
        );
      });
      setSelectedIds(new Set());
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[chargers bulk delete] FAILED:', e);
    } finally {
      setBulkDeleting(false);
    }
  }, [mutateDeleteMany, selectedIds]);

  const runBulkExport = useCallback(() => {
    const rows = all.filter((c) => selectedIds.has(String(c.id ?? '')));
    if (rows.length === 0) return;
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chargers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [all, selectedIds]);

  return (
    <CanAccess
      resource={ResourceType.CHARGING_STATIONS}
      action={ActionType.LIST}
      fallback={<AccessDeniedFallback />}
    >
      {/* Viewport-minus-shell height so the table has a real height
          to fill and scroll within. */}
      <div className="flex min-h-0 flex-col gap-4 h-[calc(100vh-140px)]">
        {/* Header — title + count left, controls cluster right.
            Matches the Constellations header treatment. */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3" style={leftAnim}>
            <h1 className="text-2xl font-semibold tracking-tight">Chargers</h1>
            <span className="flex items-baseline gap-2 text-xs text-foreground/50">
              {listQuery.isLoading
                ? 'Loading…'
                : query.trim() || constellationFilter || statusFilter !== 'all' || sessionFilter !== 'any' || protocolFilter !== 'all'
                  ? `${filtered.length} of ${all.length}`
                  : `${all.length} charger${all.length === 1 ? '' : 's'}`}
              {bulkMode && !listQuery.isLoading && filtered.length > 0 ? (
                <Checkbox
                  aria-label="Select all chargers"
                  checked={
                    allFilteredSelected
                      ? true
                      : someFilteredSelected
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={toggleAllFiltered}
                  className="size-3 cursor-pointer [&_svg]:size-2.5"
                />
              ) : null}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div style={topAnim(0)}>
              <label
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1"
                title={bulkMode ? 'Bulk actions on' : 'Turn on bulk actions'}
              >
                <ListChecks
                  aria-hidden
                  className={
                    'size-3.5 transition-colors ' +
                    (bulkMode ? 'text-foreground' : 'text-foreground/50')
                  }
                />
                <Switch
                  aria-label="Toggle bulk actions"
                  checked={bulkMode}
                  onCheckedChange={setBulkMode}
                  className="cursor-pointer"
                />
              </label>
            </div>
            <div style={topAnim(1)}>
              <SearchInput value={query} onChange={setQuery} />
            </div>
            <div style={topAnim(2)} className="flex items-center gap-1.5">
              <FilterChip
                label="All sites"
                value={constellationFilter}
                onChange={setConstellationFilter}
                options={constellationOptions.map((s) => ({ value: s, label: s }))}
                ariaLabel="Filter by constellation"
              />
              <FilterChip
                label="All statuses"
                value={statusFilter === 'all' ? '' : statusFilter}
                onChange={(v) =>
                  setStatusFilter(
                    (v || 'all') as 'all' | 'online' | 'offline' | 'faulted',
                  )
                }
                options={[
                  { value: 'online', label: 'Online' },
                  { value: 'offline', label: 'Offline' },
                  { value: 'faulted', label: 'Faulted' },
                ]}
                ariaLabel="Filter by status"
              />
              <FilterChip
                label="Any session"
                value={sessionFilter === 'any' ? '' : sessionFilter}
                onChange={(v) =>
                  setSessionFilter((v || 'any') as 'any' | 'active' | 'idle')
                }
                options={[
                  { value: 'active', label: 'In session' },
                  { value: 'idle', label: 'Idle' },
                ]}
                ariaLabel="Filter by session state"
              />
              <FilterChip
                label="Any protocol"
                value={protocolFilter === 'all' ? '' : protocolFilter}
                onChange={(v) =>
                  setProtocolFilter((v || 'all') as 'all' | 'OCPP16' | 'OCPP201')
                }
                options={[
                  { value: 'OCPP16', label: 'OCPP 1.6' },
                  { value: 'OCPP201', label: 'OCPP 2.0.1' },
                ]}
                ariaLabel="Filter by OCPP protocol"
              />
            </div>
            <CanAccess
              resource={ResourceType.CHARGING_STATIONS}
              action={ActionType.CREATE}
            >
              <div style={topAnim(3)}>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  className="cursor-pointer gap-1.5 bg-foreground text-[10px] font-medium uppercase tracking-widest text-background hover:bg-foreground/90"
                >
                  <Plus className="size-3.5" />
                  New charger
                </Button>
              </div>
            </CanAccess>
          </div>
        </div>

        {/* Table shell — bordered card wrapping the scrollable body.
            Column widths defined once at the top so the header + row
            grids stay aligned. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/40 bg-white shadow-sm">
          <TableHeader bulkMode={bulkMode} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listQuery.isLoading ? (
              <RowsSkeleton bulkMode={bulkMode} />
            ) : filtered.length === 0 ? (
              <EmptyState query={query} />
            ) : (
              <ul>
                {paged.map((c, i) => {
                  const idStr = String(c.id);
                  // Two cascade modes:
                  //   • Initial page load — 550ms base so the row
                  //     reveal comes AFTER the page title lands,
                  //     with a leisurely 40ms per-row stagger.
                  //   • Pagination / filter change (`rowsCascade`
                  //     already flipped off) — no base delay,
                  //     tighter 25ms stagger, so the new page
                  //     arrives quickly but with the same reveal
                  //     motion.
                  const cascadeDelayMs = !arrived
                    ? undefined
                    : rowsCascade
                      ? 550 + Math.min(i * 40, 480)
                      : Math.min(i * 25, 300);
                  return (
                    <ChargerRow
                      key={idStr}
                      data={c}
                      position={positionAtSite.get(idStr)}
                      expanded={expandedId === idStr}
                      bulkMode={bulkMode}
                      selected={selectedIds.has(idStr)}
                      onSelectChange={(v) => toggleOne(idStr, v)}
                      onToggle={() =>
                        setExpandedId((prev) => (prev === idStr ? null : idStr))
                      }
                      cascadeDelayMs={cascadeDelayMs}
                    />
                  );
                })}
              </ul>
            )}
          </div>
          {!listQuery.isLoading && filtered.length > 0 ? (
            <PaginationFooter
              rangeStart={pageStart + 1}
              rangeEnd={pageEnd}
              total={filtered.length}
              currentPage={safePage}
              pageCount={pageCount}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          ) : null}
        </div>
      </div>

      {/* Floating bulk-action bar — mirror of the Constellations
          affordance. Fixed to viewport bottom-center so it doesn't
          disturb the table layout. Slides in when ≥1 row is picked. */}
      {selectedCount > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/40 bg-foreground px-3 py-2 text-background shadow-lg">
            <span className="pl-2 text-xs font-medium tabular-nums">
              {selectedCount} selected
            </span>
            <span className="mx-1 h-4 w-px bg-background/20" aria-hidden />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={runBulkExport}
              className="cursor-pointer gap-1.5 rounded-full text-background hover:bg-background/10 hover:text-background"
            >
              <Download className="size-3.5" />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkDeleting}
              className="cursor-pointer gap-1.5 rounded-full text-[#ff8a7a] hover:bg-[#c94a3a]/25 hover:text-[#ff8a7a] disabled:opacity-60"
            >
              {bulkDeleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Delete
            </Button>
            <span className="mx-1 h-4 w-px bg-background/20" aria-hidden />
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Clear selection"
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-background/70 transition-colors hover:bg-background/10 hover:text-background"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} charger{selectedCount === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Chargers with historical
              transactions may fail to delete — the database
              preserves the reference for auditing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runBulkDelete}
              className="cursor-pointer bg-[#c94a3a] text-white hover:bg-[#c94a3a]/90"
            >
              Delete {selectedCount}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChargerCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </CanAccess>
  );
};

// ─── Types ──────────────────────────────────────────────────────────

/// Row-level charger shape. Optional across the board because the
/// Refine table type surface is loose and we tolerate partial rows.
type Charger = {
  id?: number | string;
  ocppConnectionName?: string;
  /// Operator-set display label ("Bay 1", "Front lot fast", …).
  /// Nullable at the DB level — falls back to a derived
  /// "{Constellation} · #N" position label when absent.
  displayName?: string | null;
  isOnline?: boolean;
  protocol?: string;
  locationId?: number | string;
  chargePointVendor?: string;
  chargePointModel?: string;
  firmwareVersion?: string;
  createdAt?: string;
  location?: { id?: number | string; name?: string; country?: string } | null;
  evses?: Array<{ id?: number | string; evseId?: number; physicalReference?: string }> | null;
  connectors?: Array<{
    connectorId?: number;
    status?: string;
    errorCode?: string;
    timestamp?: string;
  }> | null;
  LatestStatusNotifications?: Array<{
    id?: number | string;
    StatusNotification?: {
      connectorId?: number;
      connectorStatus?: string;
      evseId?: number;
      timestamp?: string;
    };
  }> | null;
  transactions?: Array<{
    id?: number | string;
    isActive?: boolean;
    totalKwh?: number | null;
    timeSpentCharging?: number | null;
  }> | null;
};

// ─── Column layout ──────────────────────────────────────────────────

/// Shared grid template used by the table header AND every row so
/// columns line up perfectly. Optional leading `auto` column for
/// the bulk-select checkbox — appears only when bulk mode is on
/// so read mode has no reserved gutter.
///
/// Order: ([checkbox]) [dot] Unit name · Unit code · Constellation ·
/// Protocol · Date added · Session · Last seen · [chevron]. Flex
/// columns (name, constellation) take the slack; the rest are
/// `auto` so they hug their content.
// Single grid template — bulk mode never rewrites the columns.
// The checkbox lives in an absolute overlay on the left, and the
// row's left padding transitions to make room for it. This keeps
// the layout stable and lets the two animations (slide + fade)
// choreograph cleanly.
const ROW_GRID =
  'grid grid-cols-[auto_minmax(140px,1.3fr)_minmax(80px,auto)_minmax(140px,1.2fr)_minmax(80px,auto)_minmax(100px,auto)_minmax(110px,auto)_minmax(90px,auto)_28px] items-center gap-4';

/// Extra left padding reserved for the bulk-mode checkbox overlay.
/// Matches the checkbox's own space (14px checkbox + 12px gap).
const BULK_GUTTER_PX = 30;

/// Shared inline style — row padding-left animates between the
/// read-mode 16px and the bulk-mode 46px. Duration matches the
/// checkbox opacity so the two motions feel like one.
function rowPaddingStyle(bulkMode: boolean): React.CSSProperties {
  return {
    paddingLeft: bulkMode ? 16 + BULK_GUTTER_PX : 16,
    paddingRight: 16,
    transition: 'padding-left 250ms ease-out',
  };
}

/// Checkbox opacity + timing — fades in AFTER the padding has
/// finished sliding (150ms delay); fades out immediately when
/// bulk mode ends so it doesn't linger over shrinking content.
function bulkCheckboxStyle(bulkMode: boolean): React.CSSProperties {
  return {
    opacity: bulkMode ? 1 : 0,
    pointerEvents: bulkMode ? 'auto' : 'none',
    transition: 'opacity 180ms ease-out',
    transitionDelay: bulkMode ? '150ms' : '0ms',
  };
}

function TableHeader({ bulkMode }: { bulkMode: boolean }) {
  return (
    <div className="relative border-b border-border/40">
      <div
        className={`${ROW_GRID} py-2 text-[10px] font-medium uppercase tracking-widest text-foreground/50`}
        style={rowPaddingStyle(bulkMode)}
      >
        <span aria-hidden />
        <span>Unit name</span>
        <span>Unit code</span>
        <span>Constellation</span>
        <span>Protocol</span>
        <span>Date added</span>
        <span>Session</span>
        <span>Last seen</span>
        <span aria-hidden />
      </div>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────

function ChargerRow({
  data,
  position,
  expanded,
  bulkMode,
  selected,
  onSelectChange,
  onToggle,
  cascadeDelayMs,
}: {
  data: Charger;
  /// 1-based position within this charger's parent constellation.
  /// Feeds the derived "{Constellation} · #N" fallback when the
  /// operator hasn't set a `displayName`.
  position: number | undefined;
  expanded: boolean;
  bulkMode: boolean;
  selected: boolean;
  onSelectChange: (checked: boolean) => void;
  onToggle: () => void;
  /// When provided, the row runs the `row-cascade-in` slide-in-
  /// from-left animation with this delay. Only set on the first
  /// render after data + shell-arrival; undefined thereafter so
  /// pagination doesn't re-cascade.
  cascadeDelayMs?: number;
}) {
  const online = data.isOnline === true;
  const active = (data.transactions ?? []).find((t) => t.isActive);
  const kWh = Number(active?.totalKwh ?? 0);
  const lastSeenIso = pickLastSeen(data);
  const dotColor = online ? '#4a9d6c' : '#c94a3a';

  // Cascade only when a delay is provided by the parent — which
  // happens on first render after `arrived` becomes true. Once
  // the parent flips off `rowsCascade`, subsequent renders (page
  // changes, filter tweaks) pass no delay so rows appear
  // instantly.
  const cascadeStyle: React.CSSProperties | undefined =
    cascadeDelayMs != null
      ? ({ ['--row-cascade-delay' as string]: `${cascadeDelayMs}ms` } as React.CSSProperties)
      : undefined;
  return (
    <li
      className={
        'relative border-b border-border/30 last:border-b-0' +
        (cascadeDelayMs != null ? ' row-cascade' : '')
      }
      style={cascadeStyle}
    >
      {/* Checkbox overlay — absolute-positioned so the row's grid
          template never changes when bulk mode toggles. Padding on
          the button below opens space for it; the fade-in delay
          syncs with the padding transition. */}
      <span
        className="absolute left-4 top-1/2 z-10 -translate-y-1/2"
        style={bulkCheckboxStyle(bulkMode)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          aria-label={`Select ${data.ocppConnectionName ?? 'charger'}`}
          checked={selected}
          onCheckedChange={(v) => onSelectChange(v === true)}
          disabled={!bulkMode}
          className="size-3.5 cursor-pointer [&_svg]:size-3"
        />
      </span>
      <button
        type="button"
        onClick={onToggle}
        className={`${ROW_GRID} w-full py-2 text-left text-xs transition-colors hover:bg-foreground/[0.02]`}
        style={rowPaddingStyle(bulkMode)}
      >
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor: dotColor,
            ['--pulse-color' as string]: dotColor,
            animation: online
              ? 'status-dot-pulse 2s cubic-bezier(0.4, 0, 0.2, 1) infinite'
              : undefined,
          }}
        />
        {/* Unit name — best available "friendly" label. Schema
            doesn't yet have a dedicated name column, so we use
            vendor + model (e.g. "ABB Terra 54") when present, else
            fall back to the OCPP identity. Ready to switch when a
            proper `name` field lands. */}
        <span className="truncate font-medium text-foreground">
          {unitName(data, position)}
        </span>
        {/* Unit code — the OCPP endpoint name (e.g. "ocm-273983").
            Muted tabular so it reads as an ID, not a title. */}
        <span className="truncate font-mono text-[11px] tabular-nums text-foreground/60">
          {data.ocppConnectionName || `#${data.id ?? ''}`}
        </span>
        <span className="truncate text-foreground/60">
          {data.location?.name ?? '—'}
        </span>
        <span className="tabular-nums text-foreground/70">
          {formatProtocol(data.protocol)}
        </span>
        <span className="tabular-nums text-foreground/60">
          {formatDateAdded(data.createdAt)}
        </span>
        {active ? (
          <span className="inline-flex items-center gap-1 text-[#05B084]">
            <Zap className="size-3" />
            <span className="tabular-nums">{kWh.toFixed(1)} kWh</span>
          </span>
        ) : (
          <span className="text-foreground/40">Idle</span>
        )}
        <span className="tabular-nums text-foreground/60">
          {lastSeenIso ? relativeTime(lastSeenIso) : '—'}
        </span>
        <ChevronDown
          aria-hidden
          className={
            'size-3.5 justify-self-end text-foreground/50 transition-transform duration-200 ease-out ' +
            (expanded ? 'rotate-180' : '')
          }
        />
      </button>
      {/* Expand-in-place — same grid-template-rows: 0fr → 1fr trick
          used for the Opening Hours section, ease-out this time so
          the panel drops open naturally. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border/30 bg-foreground/[0.015] px-4 py-4">
            <ExpandedContent data={data} expanded={expanded} />
          </div>
        </div>
      </div>
    </li>
  );
}

// ─── Expanded content ───────────────────────────────────────────────

function ExpandedContent({ data, expanded }: { data: Charger; expanded: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,auto)]">
      {/* LEFT column — connectors + recent transactions (the two
          sections that need horizontal room). RIGHT column —
          actions + metadata, narrower and pinned to the side. */}
      <div className="min-w-0 space-y-4">
        <ConnectorsStrip data={data} />
        <RecentTransactions data={data} expanded={expanded} />
      </div>
      <div className="space-y-4">
        <ActionsRow data={data} />
        <MetadataGrid data={data} />
      </div>
    </div>
  );
}

// ─── Connectors strip ───────────────────────────────────────────────

function ConnectorsStrip({ data }: { data: Charger }) {
  // Skeleton until the EVSE list is present. `null` means the
  // charger hasn't reported EVSEs yet; `[]` means we've heard back
  // and there really are none. Only the true-empty state renders
  // the "No EVSEs" copy — pending renders skeleton chips.
  const evses = data.evses;
  if (evses == null) {
    return (
      <SectionBlock label="Connectors">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </SectionBlock>
    );
  }
  // Fold LatestStatusNotifications into a map keyed on evseId (or
  // connectorId when evseId is missing, e.g. OCPP 1.6 stations) so
  // we can render each EVSE with its live status.
  const statusByEvse = new Map<string, string>();
  for (const entry of data.LatestStatusNotifications ?? []) {
    const sn = entry.StatusNotification;
    if (!sn) continue;
    const key =
      sn.evseId != null
        ? `evse:${sn.evseId}`
        : sn.connectorId != null
          ? `conn:${sn.connectorId}`
          : null;
    if (key) statusByEvse.set(key, sn.connectorStatus ?? '');
  }

  return (
    <SectionBlock label="Connectors">
      {evses.length === 0 ? (
        <div className="text-xs text-foreground/40">
          No EVSEs reported yet.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {evses.map((e) => {
            const evseId = e.evseId ?? e.id;
            const status =
              statusByEvse.get(`evse:${evseId}`) ??
              statusByEvse.get(`conn:${evseId}`) ??
              'Unknown';
            const chip = statusChipStyle(status);
            return (
              <span
                key={String(e.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${chip.className}`}
              >
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: chip.dot }}
                />
                <span className="tabular-nums text-foreground/70">
                  EVSE {evseId ?? '—'}
                </span>
                <span className={chip.textClass}>·</span>
                <span className={chip.textClass}>{humanizeStatus(status)}</span>
              </span>
            );
          })}
        </div>
      )}
    </SectionBlock>
  );
}

/// Traffic-light styling for a connector status. Available = green,
/// active = amber (Charging / Preparing / Occupied), Faulted /
/// Unavailable = red, everything else = neutral grey.
function statusChipStyle(status: string): {
  className: string;
  textClass: string;
  dot: string;
} {
  const s = status.toLowerCase();
  if (s === 'available') {
    return {
      className: 'border-[#4a9d6c]/30 bg-[#4a9d6c]/5',
      textClass: 'text-[#4a9d6c]',
      dot: '#4a9d6c',
    };
  }
  if (s === 'faulted' || s === 'unavailable') {
    return {
      className: 'border-[#c94a3a]/30 bg-[#c94a3a]/5',
      textClass: 'text-[#c94a3a]',
      dot: '#c94a3a',
    };
  }
  if (
    s === 'charging' ||
    s === 'preparing' ||
    s === 'suspendedev' ||
    s === 'suspendedevse' ||
    s === 'finishing' ||
    s === 'occupied'
  ) {
    return {
      className: 'border-[#c99039]/30 bg-[#c99039]/5',
      textClass: 'text-[#c99039]',
      dot: '#c99039',
    };
  }
  return {
    className: 'border-border/60 bg-foreground/[0.03]',
    textClass: 'text-foreground/60',
    dot: '#94a3b8',
  };
}

function humanizeStatus(raw: string): string {
  if (!raw) return 'Unknown';
  // Split camelCase / PascalCase into words ("SuspendedEV" → "Suspended EV").
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

// ─── Actions row ────────────────────────────────────────────────────

function ActionsRow({ data }: { data: Charger }) {
  const translate = useTranslate();
  const dispatch = useDispatch();
  const station = data as unknown as ChargingStationDto;

  // Skeleton until we know the connection state.
  if (data.isOnline == null) {
    return (
      <SectionBlock label="Actions">
        <div className="flex gap-2">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </SectionBlock>
    );
  }

  if (data.isOnline !== true) {
    return (
      <SectionBlock label="Actions">
        <CommandsUnavailableText />
      </SectionBlock>
    );
  }

  const openReset = () =>
    dispatch(
      openModal({
        title: translate('ChargingStations.reset'),
        modalComponentType: ModalComponentType.reset,
        modalComponentProps: { station },
      }),
    );
  const openForceDisconnect = () =>
    dispatch(
      openModal({
        title: translate('ChargingStations.forceDisconnect'),
        modalComponentType: ModalComponentType.forceDisconnect,
        modalComponentProps: { station },
      }),
    );

  return (
    <SectionBlock label="Actions">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          <CanAccess
            resource={ResourceType.CHARGING_STATIONS}
            action={ActionType.COMMAND}
            params={{ id: data.id, commandType: CommandType.RESET }}
          >
            <ActionIconButton
              label="Reset"
              icon={<RotateCcw className="size-4" />}
              onClick={openReset}
              tooltipSide="left"
            />
          </CanAccess>
          <CanAccess
            resource={ResourceType.CHARGING_STATIONS}
            action={ActionType.COMMAND}
            params={{ id: data.id, commandType: CommandType.FORCE_DISCONNECT }}
          >
            <ActionIconButton
              label="Force disconnect"
              icon={<Unplug className="size-4" />}
              tone="warning"
              onClick={openForceDisconnect}
              tooltipSide="right"
            />
          </CanAccess>
        </div>
        <SupportToolsCollapse station={station} data={data} />
      </div>
    </SectionBlock>
  );
}

/// Support-tools collapse — hides Start / Stop Transaction behind
/// an explicit disclosure so they aren't equal-weight to Reset /
/// Force Disconnect. Remote-starting bills a real authorization,
/// so it shouldn't be a first-class day-to-day action. Same
/// grid-template-rows: 0fr → 1fr animation trick used elsewhere.
function SupportToolsCollapse({
  station,
  data,
}: {
  station: ChargingStationDto;
  data: Charger;
}) {
  const translate = useTranslate();
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);

  const openStart = () =>
    dispatch(
      openModal({
        title: translate('ChargingStations.remoteStart'),
        modalComponentType: ModalComponentType.remoteStart,
        modalComponentProps: { station },
      }),
    );
  const openStop = () =>
    dispatch(
      openModal({
        title: translate('ChargingStations.remoteStop'),
        modalComponentType: ModalComponentType.remoteStop,
        modalComponentProps: { station },
      }),
    );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium uppercase tracking-widest text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground/80"
      >
        Support tools
        <ChevronDown
          aria-hidden
          className={
            'size-3 transition-transform duration-200 ease-out ' +
            (open ? 'rotate-180' : '')
          }
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-250 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-2 flex flex-wrap gap-1">
            <CanAccess
              resource={ResourceType.CHARGING_STATIONS}
              action={ActionType.COMMAND}
              params={{ id: data.id, commandType: CommandType.START_TRANSACTION }}
            >
              <ActionIconButton
                label="Start transaction"
                icon={<Play className="size-4" />}
                onClick={openStart}
                tooltipSide="left"
              />
            </CanAccess>
            <CanAccess
              resource={ResourceType.CHARGING_STATIONS}
              action={ActionType.COMMAND}
              params={{ id: data.id, commandType: CommandType.STOP_TRANSACTION }}
            >
              <ActionIconButton
                label="Stop transaction"
                icon={<Square className="size-4" />}
                onClick={openStop}
                tooltipSide="right"
              />
            </CanAccess>
          </div>
        </div>
      </div>
    </div>
  );
}

/// Square 32px icon button that opens on hover with a labelled
/// tooltip. `tone` controls colour — `neutral` for everyday ops
/// actions (Reset, Start, Stop), `warning` for actions with real
/// side effects that deserve a visual heads-up (Force Disconnect).
function ActionIconButton({
  label,
  icon,
  onClick,
  tone = 'neutral',
  tooltipSide = 'top',
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: 'neutral' | 'warning';
  /// Side of the tooltip relative to the button. Left-most icons
  /// pass `"left"` so their label pops off-icon on the outside;
  /// right-most icons pass `"right"` for the mirror behaviour.
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const toneClass =
    tone === 'warning'
      ? 'text-[#c94a3a] hover:bg-[#c94a3a]/10 hover:text-[#c94a3a]'
      : 'text-foreground/70 hover:bg-foreground/5 hover:text-foreground';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={
            'flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors ' +
            toneClass
          }
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Metadata grid ──────────────────────────────────────────────────

function MetadataGrid({ data }: { data: Charger }) {
  // Skeleton until at least the "always-present" fields (protocol
  // and evses list) are known — those flip from undefined to a
  // concrete value as soon as the parent list query lands. If
  // both are still absent we've either hit a very new charger
  // that hasn't handshaken yet, or a still-loading row.
  const anyKnown =
    data.protocol != null ||
    data.evses != null ||
    data.chargePointVendor != null ||
    data.chargePointModel != null ||
    data.firmwareVersion != null;
  if (!anyKnown) {
    return (
      <SectionBlock label="Metadata">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex justify-between gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </SectionBlock>
    );
  }
  const rows = [
    { label: 'Protocol', value: formatProtocol(data.protocol) },
    { label: 'Vendor', value: data.chargePointVendor || undefined },
    { label: 'Model', value: data.chargePointModel || undefined },
    { label: 'Firmware', value: data.firmwareVersion || undefined },
    { label: 'EVSEs', value: String((data.evses ?? []).length || 0) },
  ].filter((r) => !!r.value);

  return (
    <SectionBlock label="Metadata">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-2">
            <span className="text-foreground/50">{r.label}</span>
            <span className="truncate text-right font-medium text-foreground/80">
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

// ─── Recent transactions (lazy) ─────────────────────────────────────

function RecentTransactions({ data, expanded }: { data: Charger; expanded: boolean }) {
  const { push } = useRouter();
  // Only fetch once the row has actually been expanded. Refine's
  // `queryOptions.enabled` gate keeps the request off the wire
  // otherwise, so a 200-charger table opens with zero extra load.
  const stationId = Number(data.id);
  const { query: txQuery } = useList({
    resource: ResourceType.TRANSACTIONS,
    filters: [{ field: 'stationId', operator: 'eq', value: stationId }],
    sorters: [{ field: 'startTime', order: 'desc' }],
    pagination: { currentPage: 1, pageSize: 5 },
    meta: { gqlQuery: TRANSACTION_LIST_QUERY },
    queryOptions: {
      enabled: expanded && Number.isFinite(stationId),
    },
  });

  const rows = (txQuery.data?.data ?? []) as Array<{
    id: number | string;
    transactionId?: string;
    startTime?: string;
    endTime?: string;
    totalKwh?: number | null;
    timeSpentCharging?: number | null;
    isActive?: boolean;
  }>;

  return (
    <SectionBlock label="Recent transactions">
      {txQuery.isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-foreground/40">No transactions yet.</div>
      ) : (
        <ul className="divide-y divide-border/30 overflow-hidden rounded-md border border-border/40 bg-white">
          {rows.map((t) => (
            <li key={String(t.id)}>
              <button
                type="button"
                onClick={() =>
                  push(`/${MenuSection.TRANSACTIONS}/${t.id}`)
                }
                className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3 py-1.5 text-left text-xs transition-colors hover:bg-foreground/[0.03]"
              >
                <span className="truncate text-foreground/80">
                  {t.startTime ? formatDateTime(t.startTime) : '—'}
                </span>
                <span className="tabular-nums text-foreground/60">
                  {formatDuration(t.timeSpentCharging)}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums text-foreground/80">
                  <Zap className="size-3 text-[#05B084]" />
                  {(Number(t.totalKwh ?? 0)).toFixed(1)} kWh
                </span>
                <ArrowUpRight aria-hidden className="size-3 text-foreground/40" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionBlock>
  );
}

// ─── Section wrapper ────────────────────────────────────────────────

function SectionBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-foreground/50">
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Loading / empty states ─────────────────────────────────────────

function RowsSkeleton({ bulkMode }: { bulkMode: boolean }) {
  return (
    <ul className="divide-y divide-border/30">
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i} className="relative" aria-hidden>
          <span
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2"
            style={bulkCheckboxStyle(bulkMode)}
          >
            <Skeleton className="size-3.5 rounded" />
          </span>
          <div className={`${ROW_GRID} py-2`} style={rowPaddingStyle(bulkMode)}>
            <Skeleton className="size-1.5 rounded-full" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <span />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ query }: { query: string }) {
  const q = query.trim();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
      <Waypoints className="size-6 text-foreground/30" />
      <div className="text-sm font-medium text-foreground/70">
        {q ? `No chargers match "${q}"` : 'No chargers registered yet'}
      </div>
      <div className="text-xs text-foreground/50">
        {q ? 'Try a different search.' : 'Add one with the "New charger" button.'}
      </div>
    </div>
  );
}

// ─── Search input ───────────────────────────────────────────────────

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative w-64">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-foreground/40"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by name or site…"
        className="w-full rounded-full border border-border bg-background pl-9 pr-9 py-1.5 text-xs text-foreground placeholder:text-foreground/40 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-foreground/40 hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

// ─── Pagination footer ─────────────────────────────────────────────

/// Table footer with page-size selector on the left, current-range
/// text + prev/next controls on the right. Rendered inside the same
/// bordered card as the rows so it reads as one component.
function PaginationFooter({
  rangeStart,
  rangeEnd,
  total,
  currentPage,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  rangeStart: number;
  rangeEnd: number;
  total: number;
  currentPage: number;
  pageCount: number;
  pageSize: 10 | 25 | 50;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: 10 | 25 | 50) => void;
}) {
  const atFirst = currentPage <= 1;
  const atLast = currentPage >= pageCount;
  return (
    <div className="flex items-center justify-between border-t border-border/40 px-4 py-2 text-xs">
      <div className="flex items-center gap-2 text-foreground/60">
        <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
          Rows
        </span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v) as 10 | 25 | 50)}
        >
          <SelectTrigger
            aria-label="Rows per page"
            className="h-auto w-auto cursor-pointer rounded-md border-border bg-background px-2 py-1 text-xs shadow-none focus-visible:border-foreground/30 focus-visible:ring-foreground/10"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50].map((n) => (
              <SelectItem key={n} value={String(n)} className="cursor-pointer text-xs">
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3 text-foreground/60">
        <span className="tabular-nums">
          {total === 0
            ? '0 results'
            : `${rangeStart}–${rangeEnd} of ${total}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={atFirst}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="tabular-nums text-foreground/70">
            {currentPage} / {pageCount}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={atLast}
            onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Filter chip ────────────────────────────────────────────────────

/// Compact pill-shaped Select that reads like a filter chip. When
/// `value` is empty the trigger shows the `label` placeholder (e.g.
/// "All sites"); once a value is picked, that label wins. The "All"
/// slot inside the menu clears the filter.
function FilterChip({
  label,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  if (options.length === 0) return null;
  return (
    <Select
      value={value === '' ? '__ALL__' : value}
      onValueChange={(v) => onChange(v === '__ALL__' ? '' : v)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-auto w-auto cursor-pointer rounded-full border-border bg-background px-3 py-1.5 text-xs shadow-none focus-visible:border-foreground/30 focus-visible:ring-foreground/10"
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__ALL__" className="cursor-pointer text-xs">
          {label}
        </SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="cursor-pointer text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

/// Friendly name for the "Unit name" column. Priority:
///   1. Operator-set `displayName` (e.g. "Bay 1", "Front lot fast").
///   2. Derived "{Constellation} · #{position}" when the site is
///      known and we have a position within it.
///   3. OCPP identity (unit code) as a last-resort so the cell
///      never renders empty.
function unitName(c: Charger, position: number | undefined): string {
  const label = String(c.displayName ?? '').trim();
  if (label) return label;
  const site = String(c.location?.name ?? '').trim();
  if (site && position != null) return `${site} · #${position}`;
  return c.ocppConnectionName || `Charger ${c.id ?? ''}`;
}

/// Normalises the protocol string (e.g. "OCPP16", "OCPP20", "ocpp1.6")
/// into a compact "OCPP 1.6" / "OCPP 2.0.1" label. Unknown values
/// pass through so we don't lose data on new protocols.
function formatProtocol(raw: string | undefined): string {
  if (!raw) return '—';
  const s = raw.toUpperCase().replace(/\s+/g, '');
  if (s === 'OCPP16' || s === 'OCPP1.6') return 'OCPP 1.6';
  if (s === 'OCPP20' || s === 'OCPP2.0' || s === 'OCPP2.0.1') return 'OCPP 2.0.1';
  return raw;
}

/// Compact "Aug 27, 2026" — matches the tabular density of the
/// rest of the row. Returns em-dash when no timestamp.
function formatDateAdded(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/// Human date + time for the recent-transactions rows — short
/// month + day + 24h clock so the column stays narrow.
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/// Session duration in seconds → "1h 23m" / "12m" / "45s".
/// Handles the DB field being null (session mid-flight w/o meter
/// reading) by rendering em-dash.
function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/// Best available "last time we heard from this station" — walks
/// the LatestStatusNotifications array (per-connector) and returns
/// the most recent StatusNotification timestamp. Falls back to null
/// so callers can render a placeholder.
function pickLastSeen(c: Charger): string | null {
  let latest: string | null = null;
  for (const entry of c.LatestStatusNotifications ?? []) {
    const t = entry.StatusNotification?.timestamp;
    if (!t) continue;
    if (!latest || new Date(t).getTime() > new Date(latest).getTime()) {
      latest = t;
    }
  }
  return latest;
}

/// True if any of the charger's connectors has a Faulted status
/// per its most recent StatusNotification. Feeds the "Faulted"
/// filter chip so operators can isolate the fleet subset that
/// needs attention.
function hasFaultedConnector(c: Charger): boolean {
  for (const entry of c.LatestStatusNotifications ?? []) {
    const status = entry.StatusNotification?.connectorStatus ?? '';
    if (status.toLowerCase() === 'faulted') return true;
  }
  return false;
}

/// CSV export payload for bulk-selected chargers. Same columns
/// as the visible table (id, name, code, constellation, protocol,
/// online status, EVSE count, created date). RFC-4180 quoting so
/// values containing commas or quotes round-trip cleanly.
function toCsv(rows: Charger[]): string {
  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    'id',
    'displayName',
    'ocppConnectionName',
    'constellation',
    'protocol',
    'isOnline',
    'evseCount',
    'createdAt',
  ].join(',');
  const body = rows
    .map((c) =>
      [
        esc(c.id),
        esc(c.displayName),
        esc(c.ocppConnectionName),
        esc(c.location?.name),
        esc(c.protocol),
        esc(c.isOnline),
        esc((c.evses ?? []).length),
        esc(c.createdAt),
      ].join(','),
    )
    .join('\n');
  return `${header}\n${body}`;
}

/// Compact relative-time — "12s / 3m / 4h / 2d ago". Deliberately
/// terse so it fits in a narrow column. Anything > 30 days falls
/// back to a date.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
