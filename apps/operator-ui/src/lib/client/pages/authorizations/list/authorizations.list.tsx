// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import { MenuSection } from '@lib/client/components/main-menu/main.menu';
import { Button } from '@lib/client/components/ui/button';
import { Skeleton } from '@lib/client/components/ui/skeleton';
import { useShellArrival } from '@lib/client/hooks/use.shell.arrival';
import { AUTHORIZATIONS_LIST_QUERY } from '@lib/queries/authorizations';
import { ActionType, ResourceType } from '@lib/utils/access.types';
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
  KeyRound,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AuthorizationDetailModal } from '@lib/client/pages/authorizations/detail/authorization.detail.modal';
import { AuthorizationCreateModal } from '@lib/client/pages/authorizations/list/authorization.create.modal';

/// Authorizations page — operator-facing list of ID tokens (RFID
/// cards, Central remote-start allowances, Plug&Charge contract IDs,
/// PIN codes) that can start a charging session on the fleet. Same
/// layout DNA as the Transactions / Chargers pages:
///
///   [dot=status] Token | Type | Status | Concurrent | Last used |
///   Created | [chevron]
///
/// Dot color reflects the authorization's status (accepted / blocked
/// / expired / invalid). Row expands in-place to show configuration
/// (allowed connector types, disallowed EVSE prefixes, cache expiry,
/// group binding). "View details" in the expand block opens the
/// full editor modal reusing the existing `/authorizations/[id]`
/// page.
export const AuthorizationsList = () => {
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
  const [detailId, setDetailId] = useState<string | number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [concurrentFilter, setConcurrentFilter] = useState<
    'any' | 'allowed' | 'blocked'
  >('any');

  const [pageSize, setPageSize] = useState<10 | 25 | 50>(25);
  const [currentPage, setCurrentPage] = useState(1);

  const [rowsCascade, setRowsCascade] = useState(true);

  const { query: listQuery } = useList<Authorization>({
    resource: ResourceType.AUTHORIZATIONS,
    liveMode: 'auto',
    sorters: [{ field: 'idToken', order: 'asc' }],
    pagination: { currentPage: 1, pageSize: 500 },
    meta: { gqlQuery: AUTHORIZATIONS_LIST_QUERY },
  });

  const all = (listQuery.data?.data ?? []) as Authorization[];

  useEffect(() => {
    if (arrived && !listQuery.isLoading && rowsCascade) {
      const t = window.setTimeout(() => setRowsCascade(false), 1600);
      return () => window.clearTimeout(t);
    }
  }, [arrived, listQuery.isLoading, rowsCascade]);

  // Unique sets for the filter chips, sourced from the loaded set
  // so dropdowns only offer values that actually exist.
  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of all) if (a.status) set.add(a.status);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [all]);
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of all) if (a.idTokenType) set.add(a.idTokenType);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((a) => {
      if (statusFilter !== 'all' && String(a.status ?? '') !== statusFilter) {
        return false;
      }
      if (typeFilter !== 'all' && String(a.idTokenType ?? '') !== typeFilter) {
        return false;
      }
      if (concurrentFilter !== 'any') {
        const allowed = a.concurrentTransaction === true;
        if (concurrentFilter === 'allowed' && !allowed) return false;
        if (concurrentFilter === 'blocked' && allowed) return false;
      }
      if (q) {
        const tok = String(a.idToken ?? '').toLowerCase();
        const typ = String(a.idTokenType ?? '').toLowerCase();
        const stat = String(a.status ?? '').toLowerCase();
        if (!tok.includes(q) && !typ.includes(q) && !stat.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [all, query, statusFilter, typeFilter, concurrentFilter]);

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
  }, [query, statusFilter, typeFilter, concurrentFilter, pageSize]);

  const anyFilterActive =
    !!query.trim() ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    concurrentFilter !== 'any';

  return (
    <CanAccess
      resource={ResourceType.AUTHORIZATIONS}
      action={ActionType.LIST}
      fallback={<AccessDeniedFallback />}
    >
      <div className="flex min-h-0 flex-col gap-4 h-[calc(100vh-140px)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3" style={leftAnim}>
            <h1 className="text-2xl font-semibold tracking-tight">
              {translate('Authorizations.Authorizations', 'Authorizations')}
            </h1>
            <span className="text-xs text-foreground/50">
              {listQuery.isLoading
                ? 'Loading…'
                : anyFilterActive
                  ? `${filtered.length} of ${all.length}`
                  : `${all.length} token${all.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div style={topAnim(0)}>
              <SearchInput value={query} onChange={setQuery} />
            </div>
            <div style={topAnim(1)} className="flex items-center gap-1.5">
              <FilterChip
                label="All statuses"
                value={statusFilter === 'all' ? '' : statusFilter}
                onChange={(v) => setStatusFilter(v || 'all')}
                options={statusOptions.map((s) => ({ value: s, label: s }))}
                ariaLabel="Filter by status"
              />
              <FilterChip
                label="All types"
                value={typeFilter === 'all' ? '' : typeFilter}
                onChange={(v) => setTypeFilter(v || 'all')}
                options={typeOptions.map((t) => ({ value: t, label: t }))}
                ariaLabel="Filter by token type"
              />
              <FilterChip
                label="Any concurrency"
                value={concurrentFilter === 'any' ? '' : concurrentFilter}
                onChange={(v) =>
                  setConcurrentFilter((v || 'any') as 'any' | 'allowed' | 'blocked')
                }
                options={[
                  { value: 'allowed', label: 'Concurrent allowed' },
                  { value: 'blocked', label: 'Concurrent blocked' },
                ]}
                ariaLabel="Filter by concurrent transactions"
              />
            </div>
            <CanAccess
              resource={ResourceType.AUTHORIZATIONS}
              action={ActionType.CREATE}
            >
              <div style={topAnim(2)}>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  className="cursor-pointer gap-1.5 bg-foreground text-[10px] font-medium uppercase tracking-widest text-background hover:bg-foreground/90"
                >
                  <Plus className="size-3.5" />
                  New token
                </Button>
              </div>
            </CanAccess>
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
                {paged.map((a, i) => {
                  const idStr = String(a.id);
                  const cascadeDelayMs = !arrived
                    ? undefined
                    : rowsCascade
                      ? 550 + Math.min(i * 40, 480)
                      : Math.min(i * 25, 300);
                  return (
                    <AuthorizationRow
                      key={idStr}
                      data={a}
                      expanded={expandedId === idStr}
                      onToggle={() =>
                        setExpandedId((prev) => (prev === idStr ? null : idStr))
                      }
                      onOpenDetail={(authId) => setDetailId(authId)}
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
      <AuthorizationDetailModal
        authorizationId={detailId}
        open={detailId != null}
        onOpenChange={(next) => {
          if (!next) setDetailId(null);
        }}
      />
      <AuthorizationCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </CanAccess>
  );
};

// ─── Types ──────────────────────────────────────────────────────────

type Authorization = {
  id?: number | string;
  idToken?: string;
  idTokenType?: string;
  status?: string;
  concurrentTransaction?: boolean;
  chargingPriority?: number;
  cacheExpiryDateTime?: string;
  allowedConnectorTypes?: string[] | null;
  disallowedEvseIdPrefixes?: string[] | null;
  groupAuthorizationId?: number | string | null;
  createdAt?: string;
  updatedAt?: string;
  Transactions?: Array<{
    id?: number | string;
    startTime?: string;
    isActive?: boolean;
  }>;
};

// ─── Column layout ──────────────────────────────────────────────────

const ROW_GRID =
  'grid grid-cols-[auto_minmax(160px,1.4fr)_minmax(90px,auto)_minmax(90px,auto)_minmax(110px,auto)_minmax(120px,auto)_minmax(120px,auto)_28px] items-center gap-4';

function TableHeader() {
  return (
    <div className="border-b border-border/40">
      <div
        className={`${ROW_GRID} px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-foreground/50`}
      >
        <span aria-hidden />
        <span>Token</span>
        <span>Type</span>
        <span>Status</span>
        <span>Concurrent</span>
        <span>Last used</span>
        <span>Created</span>
        <span aria-hidden />
      </div>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────

function AuthorizationRow({
  data,
  expanded,
  onToggle,
  onOpenDetail,
  cascadeDelayMs,
}: {
  data: Authorization;
  expanded: boolean;
  onToggle: () => void;
  onOpenDetail: (authorizationId: string | number) => void;
  cascadeDelayMs?: number;
}) {
  const status = String(data.status ?? '').toLowerCase();
  const dotColor = statusDotColor(status);
  const isActiveDot = status === 'accepted';
  const lastUsedIso = data.Transactions?.[0]?.startTime;

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
            animation: isActiveDot
              ? 'status-dot-pulse 2s cubic-bezier(0.4, 0, 0.2, 1) infinite'
              : undefined,
          }}
        />
        <span className="truncate font-mono text-[11px] tabular-nums text-foreground/90">
          {data.idToken || '—'}
        </span>
        <span className="truncate text-foreground/70">
          {data.idTokenType || '—'}
        </span>
        <span className="truncate">
          <StatusChip status={data.status} />
        </span>
        <span className="truncate">
          <ConcurrentChip allowed={data.concurrentTransaction} />
        </span>
        <span className="tabular-nums text-foreground/60">
          {lastUsedIso ? relativeTime(lastUsedIso) : '—'}
        </span>
        <span className="tabular-nums text-foreground/60">
          {formatDate(data.createdAt)}
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
  data: Authorization;
  onOpenDetail: (authorizationId: string | number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,auto)]">
      <div className="min-w-0 space-y-4">
        <IdentityRow data={data} />
        <ConfigGrid data={data} />
      </div>
      <div className="space-y-4">
        <LinksBlock data={data} onOpenDetail={onOpenDetail} />
      </div>
    </div>
  );
}

function IdentityRow({ data }: { data: Authorization }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0">
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-foreground/40">
          Token
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-foreground/90">
            {data.idToken ?? '—'}
          </span>
          {data.idToken ? <CopyButton value={data.idToken} /> : null}
        </div>
      </div>
      <div>
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-foreground/40">
          Type
        </div>
        <span className="font-mono text-xs text-foreground/80">
          {data.idTokenType ?? '—'}
        </span>
      </div>
      <div>
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-foreground/40">
          Group
        </div>
        <span className="font-mono text-xs text-foreground/80">
          {data.groupAuthorizationId != null ? `#${data.groupAuthorizationId}` : '—'}
        </span>
      </div>
    </div>
  );
}

function ConfigGrid({ data }: { data: Authorization }) {
  const allowed = data.allowedConnectorTypes ?? [];
  const disallowed = data.disallowedEvseIdPrefixes ?? [];
  const rows = [
    {
      label: 'Charging priority',
      value:
        data.chargingPriority != null ? String(data.chargingPriority) : '—',
    },
    {
      label: 'Cache expires',
      value: data.cacheExpiryDateTime
        ? formatDateTimeLong(data.cacheExpiryDateTime)
        : '—',
    },
    { label: 'Created', value: formatDateTimeLong(data.createdAt) },
    { label: 'Updated', value: formatDateTimeLong(data.updatedAt) },
  ];
  return (
    <SectionBlock label="Configuration">
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
      {allowed.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-foreground/40">
            Allowed connector types
          </div>
          <div className="flex flex-wrap gap-1">
            {allowed.map((c) => (
              <span
                key={c}
                className="rounded-full border border-border/50 bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-foreground/70"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {disallowed.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-foreground/40">
            Disallowed EVSE prefixes
          </div>
          <div className="flex flex-wrap gap-1">
            {disallowed.map((p) => (
              <span
                key={p}
                className="rounded-full border border-[#c94a3a]/40 bg-[#c94a3a]/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-[#c94a3a]"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </SectionBlock>
  );
}

function LinksBlock({
  data,
  onOpenDetail,
}: {
  data: Authorization;
  onOpenDetail: (authorizationId: string | number) => void;
}) {
  const { push } = useRouter();
  const mostRecent = data.Transactions?.[0];
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
        {mostRecent?.id != null ? (
          <li>
            <button
              type="button"
              onClick={() => push(`/${MenuSection.TRANSACTIONS}/${mostRecent.id}`)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors hover:bg-foreground/[0.03]"
            >
              <span className="text-foreground/80">Most recent session</span>
              <ArrowUpRight aria-hidden className="size-3 text-foreground/40" />
            </button>
          </li>
        ) : null}
      </ul>
    </SectionBlock>
  );
}

// ─── Chips ──────────────────────────────────────────────────────────

function StatusChip({ status }: { status?: string }) {
  if (!status) return <span className="text-foreground/40">—</span>;
  const s = status.toLowerCase();
  const style =
    s === 'accepted'
      ? 'bg-[#05B084]/10 text-[#05B084] border-[#05B084]/30'
      : s === 'blocked' || s === 'invalid'
        ? 'bg-[#c94a3a]/10 text-[#c94a3a] border-[#c94a3a]/30'
        : 'bg-[#e07c1f]/10 text-[#e07c1f] border-[#e07c1f]/30';
  return (
    <span
      className={
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ' +
        style
      }
    >
      {status}
    </span>
  );
}

function ConcurrentChip({ allowed }: { allowed?: boolean }) {
  const style = allowed
    ? 'bg-[#05B084]/10 text-[#05B084] border-[#05B084]/30'
    : 'bg-foreground/[0.04] text-foreground/60 border-border';
  return (
    <span
      className={
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ' +
        style
      }
    >
      {allowed ? 'Allowed' : 'Blocked'}
    </span>
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
          toast.success('Token copied');
        } else {
          toast.error('Clipboard unavailable');
        }
      }}
      aria-label="Copy token"
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
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
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
      <KeyRound className="size-6 text-foreground/30" />
      <div className="text-sm font-medium text-foreground/70">
        {q ? `No tokens match "${q}"` : 'No authorized tokens yet'}
      </div>
      <div className="text-xs text-foreground/50">
        {q
          ? 'Try a different search.'
          : 'Add one with the "New token" button.'}
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
        placeholder="Search by token, type, status…"
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

/// Maps an authorization's status string to the row dot color.
/// Green for accepted, red for blocked / invalid, amber for
/// anything else (expired, unknown, etc.).
function statusDotColor(status: string): string {
  if (status === 'accepted') return '#05B084';
  if (status === 'blocked' || status === 'invalid') return '#c94a3a';
  return '#e07c1f';
}

/// Short date-only formatter for the "Created" column.
function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/// Full date+time for the expanded metadata block.
function formatDateTimeLong(iso: string | undefined): string {
  if (!iso) return '—';
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

/// Compact "12s / 3m / 4h / 2d ago" formatter for the "Last used"
/// column. Anything > 30 days falls back to a date.
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

/// Same clipboard fallback pattern as the transactions list —
/// prefers the modern Clipboard API when the page is served over a
/// secure origin, drops into the legacy execCommand path on plain
/// HTTP (Tailscale / LAN) where the modern API is blocked.
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
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
