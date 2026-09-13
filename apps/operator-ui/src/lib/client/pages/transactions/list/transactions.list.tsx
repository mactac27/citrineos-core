// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import { MenuSection } from '@lib/client/components/main-menu/main.menu';
import { Skeleton } from '@lib/client/components/ui/skeleton';
import { useShellArrival } from '@lib/client/hooks/use.shell.arrival';
import { TRANSACTION_LIST_QUERY } from '@lib/queries/transactions';
import { ActionType, CommandType, ResourceType } from '@lib/utils/access.types';
import { AccessDeniedFallback } from '@lib/utils/AccessDeniedFallback';
import { CanAccess, useList, useTranslate } from '@refinedev/core';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lib/client/components/ui/select';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Receipt,
  Search,
  Square,
  X,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDispatch } from 'react-redux';
import { openModal } from '@lib/utils/store/modal.slice';
import { TransactionDetailModal } from '@lib/client/pages/transactions/detail/transaction.detail.modal';
import { ModalComponentType } from '@lib/client/components/modals/modal.types';
import { instanceToPlain } from 'class-transformer';
import type { ChargingStationDto } from '@citrineos/base';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@lib/client/components/ui/tooltip';

/// Transactions page — operator-facing session/CDR list. Same
/// layout DNA as the Chargers page (dense table, expand-in-place
/// row, sticky sub-header, cascade animation, pagination footer),
/// with the columns tuned for session records:
///
///   [dot=active] Constellation · Station | Driver | kWh |
///   Duration | Started | Ended | [chevron]
///
/// Transaction ID is intentionally NOT in the primary row — it's
/// an opaque UUID-ish string that eats horizontal space and only
/// matters when you're already digging into a specific record. It
/// moves to the expanded dropdown with a copy button.
export const TransactionsList = () => {
  const arrived = useShellArrival();
  const translate = useTranslate();

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Full-detail modal is local state (see TransactionDetailModal for
  // why we're not using an intercepted route). `null` = closed.
  const [detailId, setDetailId] = useState<string | number | null>(null);

  const [constellationFilter, setConstellationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [protocolFilter, setProtocolFilter] = useState<'all' | 'OCPP16' | 'OCPP201'>('all');

  const [pageSize, setPageSize] = useState<10 | 25 | 50>(25);
  const [currentPage, setCurrentPage] = useState(1);

  // First-render row cascade. Same gating as Chargers so nothing
  // plays behind the shell loader.
  const [rowsCascade, setRowsCascade] = useState(true);

  const { query: listQuery } = useList<Transaction>({
    resource: ResourceType.TRANSACTIONS,
    liveMode: 'auto',
    sorters: [{ field: 'startTime', order: 'desc' }],
    pagination: { currentPage: 1, pageSize: 500 },
    meta: { gqlQuery: TRANSACTION_LIST_QUERY },
  });

  const all = (listQuery.data?.data ?? []) as Transaction[];

  useEffect(() => {
    if (arrived && !listQuery.isLoading && rowsCascade) {
      const t = window.setTimeout(() => setRowsCascade(false), 1600);
      return () => window.clearTimeout(t);
    }
  }, [arrived, listQuery.isLoading, rowsCascade]);

  /// Sites present in the loaded set, for the Constellation filter
  /// chip. Growing organically off the actual data avoids showing
  /// dead options that would yield an empty table.
  const constellationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of all) {
      const n = t.chargingStation?.location?.name;
      if (n) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((t) => {
      if (
        constellationFilter &&
        String(t.chargingStation?.location?.name ?? '') !== constellationFilter
      ) {
        return false;
      }
      if (statusFilter !== 'all') {
        const active = t.isActive === true;
        if (statusFilter === 'active' && !active) return false;
        if (statusFilter === 'completed' && active) return false;
      }
      if (protocolFilter !== 'all') {
        const key = String(t.chargingStation?.protocol ?? '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');
        const short = key.startsWith('OCPP20')
          ? 'OCPP201'
          : key.startsWith('OCPP16')
            ? 'OCPP16'
            : key;
        if (short !== protocolFilter) return false;
      }
      if (q) {
        const site = String(t.chargingStation?.location?.name ?? '').toLowerCase();
        const stn = String(t.chargingStation?.ocppConnectionName ?? '').toLowerCase();
        const dn = String(t.chargingStation?.displayName ?? '').toLowerCase();
        const tok = String(t.authorization?.idToken ?? '').toLowerCase();
        const txid = String(t.transactionId ?? '').toLowerCase();
        if (
          !site.includes(q) &&
          !stn.includes(q) &&
          !dn.includes(q) &&
          !tok.includes(q) &&
          !txid.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [all, query, constellationFilter, statusFilter, protocolFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, filtered.length);
  const paged = useMemo(
    () => filtered.slice(pageStart, pageEnd),
    [filtered, pageStart, pageEnd],
  );

  useEffect(() => {
    setCurrentPage(1);
    setExpandedId(null);
  }, [query, constellationFilter, statusFilter, protocolFilter, pageSize]);

  const anyFilterActive =
    !!query.trim() ||
    !!constellationFilter ||
    statusFilter !== 'all' ||
    protocolFilter !== 'all';

  return (
    <CanAccess
      resource={ResourceType.TRANSACTIONS}
      action={ActionType.LIST}
      fallback={<AccessDeniedFallback />}
    >
      <div className="flex min-h-0 flex-col gap-4 h-[calc(100vh-140px)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3" style={leftAnim}>
            <h1 className="text-2xl font-semibold tracking-tight">
              {translate('Transactions.Transactions', 'Transactions')}
            </h1>
            <span className="text-xs text-foreground/50">
              {listQuery.isLoading
                ? 'Loading…'
                : anyFilterActive
                  ? `${filtered.length} of ${all.length}`
                  : `${all.length} session${all.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div style={topAnim(0)}>
              <SearchInput value={query} onChange={setQuery} />
            </div>
            <div style={topAnim(1)} className="flex items-center gap-1.5">
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
                  setStatusFilter((v || 'all') as 'all' | 'active' | 'completed')
                }
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'completed', label: 'Completed' },
                ]}
                ariaLabel="Filter by status"
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
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/40 bg-white shadow-sm">
          <TableHeader />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listQuery.isLoading ? (
              <RowsSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyState query={query} />
            ) : (
              <ul>
                {paged.map((t, i) => {
                  const idStr = String(t.id);
                  const cascadeDelayMs = !arrived
                    ? undefined
                    : rowsCascade
                      ? 550 + Math.min(i * 40, 480)
                      : Math.min(i * 25, 300);
                  return (
                    <TransactionRow
                      key={idStr}
                      data={t}
                      expanded={expandedId === idStr}
                      onToggle={() =>
                        setExpandedId((prev) => (prev === idStr ? null : idStr))
                      }
                      onOpenDetail={(txId) => setDetailId(txId)}
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
      <TransactionDetailModal
        transactionId={detailId}
        open={detailId != null}
        onOpenChange={(next) => {
          if (!next) setDetailId(null);
        }}
      />
    </CanAccess>
  );
};

// ─── Types ──────────────────────────────────────────────────────────

type Transaction = {
  id?: number | string;
  transactionId?: string;
  isActive?: boolean;
  chargingState?: string | null;
  stoppedReason?: string | null;
  totalKwh?: number | null;
  timeSpentCharging?: number | null;
  startTime?: string;
  endTime?: string;
  createdAt?: string;
  updatedAt?: string;
  chargingStation?: {
    id?: number | string;
    ocppConnectionName?: string;
    displayName?: string | null;
    protocol?: string;
    isOnline?: boolean;
    locationId?: number | string;
    location?: {
      id?: number | string;
      name?: string;
      country?: string;
    } | null;
  } | null;
  authorization?: {
    id?: number | string;
    idToken?: string;
    idTokenType?: string;
  } | null;
  evse?: { id?: number | string } | null;
  connector?: { id?: number | string; connectorId?: number; type?: string } | null;
};

// ─── Column layout ──────────────────────────────────────────────────

/// Row grid — no bulk column so no absolute overlay to reserve
/// space for. Widths tuned so the timestamp columns stay tabular
/// and the Constellation · Station cell takes the slack.
///
/// Order: [dot] Constellation · Station | Driver | kWh | Duration
/// | Started | Ended | [chevron]
const ROW_GRID =
  'grid grid-cols-[auto_minmax(160px,1.6fr)_minmax(120px,1fr)_minmax(70px,auto)_minmax(70px,auto)_minmax(130px,auto)_minmax(130px,auto)_28px] items-center gap-4';

function TableHeader() {
  return (
    <div className="border-b border-border/40">
      <div
        className={`${ROW_GRID} px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-foreground/50`}
      >
        <span aria-hidden />
        <span>Constellation · Station</span>
        <span>Driver</span>
        <span>kWh</span>
        <span>Duration</span>
        <span>Started</span>
        <span>Ended</span>
        <span aria-hidden />
      </div>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────

function TransactionRow({
  data,
  expanded,
  onToggle,
  onOpenDetail,
  cascadeDelayMs,
}: {
  data: Transaction;
  expanded: boolean;
  onToggle: () => void;
  onOpenDetail: (transactionId: string | number) => void;
  cascadeDelayMs?: number;
}) {
  const active = data.isActive === true;
  const kWh = Number(data.totalKwh ?? 0);
  const dotColor = active ? '#05B084' : '#9c9793';
  const site = data.chargingStation?.location?.name ?? '';
  const stationLabel =
    stationDisplay(data.chargingStation);

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
      <button
        type="button"
        onClick={onToggle}
        className={`${ROW_GRID} w-full px-4 py-2 text-left text-xs transition-colors hover:bg-foreground/[0.02]`}
      >
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor: dotColor,
            ['--pulse-color' as string]: dotColor,
            animation: active
              ? 'status-dot-pulse 2s cubic-bezier(0.4, 0, 0.2, 1) infinite'
              : undefined,
          }}
        />
        {/* Constellation · Station — composite cell like Chargers'
            Unit name. Site name reads as primary; station code
            follows in muted mono after a middle dot. */}
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">
            {site || '—'}
          </span>
          <span className="mx-1.5 text-foreground/30">·</span>
          <span className="font-mono text-[11px] tabular-nums text-foreground/60">
            {stationLabel}
          </span>
        </span>
        <span className="truncate font-mono text-[11px] tabular-nums text-foreground/60">
          {data.authorization?.idToken ?? '—'}
        </span>
        {active ? (
          <span className="inline-flex items-center gap-1 tabular-nums text-[#05B084]">
            <Zap className="size-3" />
            {kWh.toFixed(1)}
          </span>
        ) : (
          <span className="tabular-nums text-foreground/70">
            {data.totalKwh != null ? kWh.toFixed(1) : '—'}
          </span>
        )}
        <span className="tabular-nums text-foreground/60">
          {formatDuration(computeDurationSec(data))}
        </span>
        <span className="tabular-nums text-foreground/60">
          {data.startTime ? formatDateTime(data.startTime) : '—'}
        </span>
        <span className="tabular-nums text-foreground/60">
          {data.endTime ? (
            formatDateTime(data.endTime)
          ) : active ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#05B084]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-[#05B084]">
              Active
            </span>
          ) : (
            '—'
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={
            'size-3.5 justify-self-end text-foreground/50 transition-transform duration-200 ease-out ' +
            (expanded ? 'rotate-180' : '')
          }
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border/30 bg-foreground/[0.015] px-4 py-4">
            <ExpandedContent data={data} onOpenDetail={onOpenDetail} />
          </div>
        </div>
      </div>
    </li>
  );
}

// ─── Expanded content ───────────────────────────────────────────────

function ExpandedContent({
  data,
  onOpenDetail,
}: {
  data: Transaction;
  onOpenDetail: (transactionId: string | number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,auto)]">
      <div className="min-w-0 space-y-4">
        <IdentityRow data={data} />
        <MetricsGrid data={data} />
      </div>
      <div className="space-y-4">
        <ActionsRow data={data} />
        <LinksBlock data={data} onOpenDetail={onOpenDetail} />
      </div>
    </div>
  );
}

// ─── Identity row (Transaction ID, chargingState, stoppedReason) ────

function IdentityRow({ data }: { data: Transaction }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0">
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-foreground/40">
          Transaction ID
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-foreground/90">
            {data.transactionId ?? '—'}
          </span>
          {data.transactionId ? <CopyButton value={data.transactionId} /> : null}
        </div>
      </div>
      <div>
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-foreground/40">
          Charging state
        </div>
        <span className="font-mono text-xs text-foreground/80">
          {data.chargingState ?? '—'}
        </span>
      </div>
      <div>
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-foreground/40">
          Stopped reason
        </div>
        <span className="font-mono text-xs text-foreground/80">
          {data.stoppedReason ?? '—'}
        </span>
      </div>
    </div>
  );
}

// ─── Metrics grid (kWh, duration, timestamps) ───────────────────────

function MetricsGrid({ data }: { data: Transaction }) {
  const durationSec = computeDurationSec(data);
  const rows = [
    { label: 'Total kWh', value: data.totalKwh != null ? `${Number(data.totalKwh).toFixed(2)} kWh` : '—' },
    { label: 'Duration', value: formatDuration(durationSec) },
    { label: 'Started', value: data.startTime ? formatDateTimeLong(data.startTime) : '—' },
    { label: 'Ended', value: data.endTime ? formatDateTimeLong(data.endTime) : '—' },
    { label: 'Created', value: data.createdAt ? formatDateTimeLong(data.createdAt) : '—' },
    { label: 'Updated', value: data.updatedAt ? formatDateTimeLong(data.updatedAt) : '—' },
  ];
  return (
    <SectionBlock label="Session">
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

// ─── Actions (Stop, if active) ──────────────────────────────────────

function ActionsRow({ data }: { data: Transaction }) {
  const dispatch = useDispatch();
  const translate = useTranslate();
  const active = data.isActive === true;
  const station = data.chargingStation;
  const canStop = active && !!station?.id;
  return (
    <SectionBlock label="Actions">
      <div className="flex items-center gap-2">
        {canStop ? (
          <CanAccess
            resource={ResourceType.CHARGING_STATIONS}
            action={ActionType.COMMAND}
            params={{
              id: station!.id,
              commandType: CommandType.STOP_TRANSACTION,
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() =>
                    dispatch(
                      openModal({
                        title: translate('ChargingStations.remoteStop'),
                        modalComponentType: ModalComponentType.remoteStop,
                        modalComponentProps: {
                          station: instanceToPlain(station as unknown as ChargingStationDto),
                        },
                      }),
                    )
                  }
                  aria-label="Stop transaction"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-border/50 bg-background text-foreground/70 transition-colors hover:border-[#c94a3a]/40 hover:bg-[#c94a3a]/10 hover:text-[#c94a3a]"
                >
                  <Square className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Stop transaction</TooltipContent>
            </Tooltip>
          </CanAccess>
        ) : (
          <span className="text-xs text-foreground/40">
            No actions available.
          </span>
        )}
      </div>
    </SectionBlock>
  );
}

// ─── Links (station, constellation, driver, full detail) ────────────

function LinksBlock({
  data,
  onOpenDetail,
}: {
  data: Transaction;
  onOpenDetail: (transactionId: string | number) => void;
}) {
  const { push } = useRouter();
  const station = data.chargingStation;
  const location = station?.location;
  const auth = data.authorization;

  // "View details" opens the local-state modal; every other link
  // routes normally. Split them into two lists so the row-level
  // action reads distinct from the outbound navigations.
  const outLinks: Array<{ label: string; href: string }> = [];
  if (station?.id != null) {
    outLinks.push({
      label: 'Charger',
      href: `/${MenuSection.CHARGING_STATIONS}/${station.id}`,
    });
  }
  if (location?.id != null) {
    outLinks.push({
      label: 'Constellation',
      href: `/${MenuSection.LOCATIONS}/${location.id}`,
    });
  }
  if (auth?.id != null) {
    outLinks.push({
      label: 'Authorization',
      href: `/${MenuSection.AUTHORIZATIONS}/${auth.id}`,
    });
  }

  return (
    <SectionBlock label="Links">
      <ul className="divide-y divide-border/30 overflow-hidden rounded-md border border-border/40 bg-white">
        {data.id != null ? (
          <li>
            <button
              type="button"
              onClick={() => onOpenDetail(data.id!)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors hover:bg-foreground/[0.03]"
            >
              <span className="text-foreground/80">View details</span>
              <ArrowUpRight aria-hidden className="size-3 text-foreground/40" />
            </button>
          </li>
        ) : null}
        {outLinks.map((l) => (
          <li key={l.href}>
            <button
              type="button"
              onClick={() => push(l.href)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors hover:bg-foreground/[0.03]"
            >
              <span className="text-foreground/80">{l.label}</span>
              <ArrowUpRight aria-hidden className="size-3 text-foreground/40" />
            </button>
          </li>
        ))}
      </ul>
    </SectionBlock>
  );
}

// ─── Small components ───────────────────────────────────────────────

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

/// Copy-to-clipboard chip with success confirmation. Two-second
/// checkmark flash then reverts. Isolated so any long ID field can
/// reuse it later.
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboard(value);
        if (ok) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
          toast.success('Transaction ID copied');
        } else {
          toast.error('Clipboard unavailable');
        }
      }}
      aria-label="Copy transaction ID"
      className="flex size-5 cursor-pointer items-center justify-center rounded text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground"
    >
      {copied ? (
        <Check className="size-3 text-[#05B084]" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
}

function RowsSkeleton() {
  return (
    <ul className="divide-y divide-border/30">
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i} className="relative" aria-hidden>
          <div className={`${ROW_GRID} px-4 py-2`}>
            <Skeleton className="size-1.5 rounded-full" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-24" />
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
      <Receipt className="size-6 text-foreground/30" />
      <div className="text-sm font-medium text-foreground/70">
        {q ? `No sessions match "${q}"` : 'No sessions yet'}
      </div>
      <div className="text-xs text-foreground/50">
        {q
          ? 'Try a different search.'
          : 'Sessions appear here once a driver starts charging.'}
      </div>
    </div>
  );
}

// ─── Search + filter chip ──────────────────────────────────────────

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
        placeholder="Search by site, station, driver, ID…"
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

// ─── Pagination footer ─────────────────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────

/// Station display label for the composite Constellation · Station
/// cell. Priority: operator-set displayName → OCPP identity. Falls
/// back to em-dash when both are absent.
function stationDisplay(
  station: Transaction['chargingStation'],
): string {
  if (!station) return '—';
  const dn = String(station.displayName ?? '').trim();
  if (dn) return dn;
  return station.ocppConnectionName || `#${station.id ?? ''}`;
}

/// Session duration in seconds. Prefers the stored
/// `timeSpentCharging` when the DB has it (post-stop); otherwise
/// derives from start→now (active) or start→end (completed but
/// unpopulated).
function computeDurationSec(t: Transaction): number | null {
  if (t.timeSpentCharging != null && Number.isFinite(t.timeSpentCharging)) {
    return Number(t.timeSpentCharging);
  }
  const startMs = t.startTime ? new Date(t.startTime).getTime() : NaN;
  if (!Number.isFinite(startMs)) return null;
  const endMs = t.endTime
    ? new Date(t.endTime).getTime()
    : t.isActive
      ? Date.now()
      : NaN;
  if (!Number.isFinite(endMs)) return null;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/// Short date+time for the compact row cells. 24h clock, month
/// abbreviated so it fits in a narrow column.
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

/// Full date+time with year for the expanded metadata block. Not
/// used in the row since it's too wide.
/// Copies `text` to the OS clipboard. Prefers the modern async
/// Clipboard API; falls back to the legacy hidden-textarea +
/// `document.execCommand('copy')` when the app is served over an
/// insecure origin (Tailscale IP, LAN IP, plain HTTP) where the
/// Clipboard API is disabled at the browser level. Returns true on
/// success, false on any failure.
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function formatDateTimeLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
