// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

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
import { MenuSection } from '@lib/client/components/main-menu/main.menu';
import { Button } from '@lib/client/components/ui/button';
import { Checkbox } from '@lib/client/components/ui/checkbox';
import { Skeleton } from '@lib/client/components/ui/skeleton';
import { Switch } from '@lib/client/components/ui/switch';
import { useShellArrival } from '@lib/client/hooks/use.shell.arrival';
import { ConstellationCreateModal } from '@lib/client/pages/locations/list/constellation.create.modal';
import { ConstellationDetailPanel } from '@lib/client/pages/locations/list/constellation.detail.panel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lib/client/components/ui/select';
import { LOCATIONS_LIST_QUERY } from '@lib/queries/locations';
import { ActionType, ResourceType } from '@lib/utils/access.types';
import { AccessDeniedFallback } from '@lib/utils/AccessDeniedFallback';
import config from '@lib/utils/config';
import { CanAccess, useDeleteMany, useList, useUpdateMany } from '@refinedev/core';
import { Download, ListChecks, Loader2, Plus, Search, Trash2, X, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import { Map as MapboxMap, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

/// Constellations page — the operator-facing rename of Refine's
/// `/locations` route. Renders a full-height map + card-list split:
///
///   • Left column (60%): Mapbox map, opens fit to the operator's
///     country (or the Caribbean bbox for Ensoledus admins). Pins
///     are the mint dot from the overview's Sites dialog.
///   • Right column (40%): scrollable list of constellation cards
///     with live station counts.
///
/// Hovering a card highlights its pin; clicking a pin scrolls its
/// card into view and highlights it. Clicking a card routes to the
/// existing detail page at `/locations/[id]`.
/// Duration of the takeover panel's morph transition (FLIP grow /
/// shrink between origin card rect and full-panel size). Sibling
/// shrink and content fade are pegged around this value.
const PANEL_MORPH_MS = 380;

export const LocationsList = () => {
  const { push } = useRouter();
  const arrived = useShellArrival();
  // Header entrance animations are gated on `arrived` so they don't
  // play behind the full-screen loader flash. Pre-arrival: elements
  // sit invisible at their offset positions; on arrival, CSS
  // keyframes drive them to their resting state.
  // Duration + easing + travel mirror the Overview greeting so the
  // two page headers feel like siblings, not just cousins.
  const leftAnim: React.CSSProperties = arrived
    ? { animation: 'slide-in-left 550ms ease-in both' }
    : { opacity: 0, transform: 'translateX(-15px)' };
  const topAnim = (idx: number): React.CSSProperties =>
    arrived
      ? {
          animation: `slide-in-top 380ms cubic-bezier(0.16,1,0.3,1) both`,
          animationDelay: `${80 + idx * 90}ms`,
        }
      : { opacity: 0, transform: 'translateY(-12px)' };
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /// The card whose detail panel is taking over the RHS. Also
  /// doubles as the "focused pin" state for the map — isolates
  /// that pin and drives the flyTo. Card body click OR pin click
  /// sets this.
  const [openId, setOpenId] = useState<string | null>(null);
  /// FLIP origin — the visible rect of the clicked card at the
  /// moment it was picked, relative to the RHS panel container.
  /// null when the picked card was offscreen (panel just fades in
  /// at slot 1 instead of morphing).
  const [originRect, setOriginRect] = useState<
    { top: number; left: number; width: number; height: number } | null
  >(null);
  /// Two-step animation flag. On open we mount the panel at the
  /// origin rect, wait one paint, then flip `expanded` to true
  /// which triggers the CSS transition to full-panel size. On
  /// close we flip it back to false, wait for the transition, then
  /// unmount.
  const [expanded, setExpanded] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  // Bulk-select state — off by default. When `bulkMode` is on, cards
  // grow a select checkbox and the header select-all + floating
  // action bar become available. Toggling bulk mode OFF clears any
  // pending selections so state doesn't leak between sessions.
  const [bulkMode, setBulkMode] = useState(false);

  // Card-cascade gate — runs a slide-in-from-left animation on the
  // grid the first time it renders with data + shell arrival.
  // Flips false ~1s later so subsequent renders (filter changes,
  // live updates, bulk toggles) don't re-cascade.
  const [rowsCascade, setRowsCascade] = useState(true);

  // Create-constellation modal — the "+ New constellation" button
  // opens this instead of routing to /locations/new.
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  useEffect(() => {
    if (!bulkMode) setSelectedIds(new Set());
  }, [bulkMode]);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rhsPanelRef = useRef<HTMLDivElement | null>(null);
  const { mutate: mutateDeleteMany } = useDeleteMany();
  const { mutate: mutateUpdateMany } = useUpdateMany();

  const { query: listQuery } = useList<Constellation>({
    resource: ResourceType.LOCATIONS,
    liveMode: 'auto',
    sorters: [{ field: 'name', order: 'asc' }],
    pagination: { currentPage: 1, pageSize: 500 },
    meta: { gqlQuery: LOCATIONS_LIST_QUERY },
  });

  const all = (listQuery.data?.data ?? []) as Constellation[];

  useEffect(() => {
    if (arrived && !listQuery.isLoading && rowsCascade) {
      // 550ms base delay + 480ms max stagger + 380ms animation
      // duration = 1410ms until the last card is done; add
      // buffer so we don't strip the class mid-flight.
      const t = window.setTimeout(() => setRowsCascade(false), 1600);
      return () => window.clearTimeout(t);
    }
  }, [arrived, listQuery.isLoading, rowsCascade]);

  // Always filter by country — the previous admin/operator split
  // (country vs state) was confusing when operators only had one
  // country to filter by anyway. Country dropdown grows organically
  // as new sites are onboarded.
  const regionKey = 'country' as const;
  const regionLabel = 'Country';
  // Normalize each raw country value ("JM", "Jamaica", "Trinidad And
  // Tobago", "TT", …) to its canonical display name BEFORE dedup so
  // the dropdown shows one row per real-world country instead of one
  // per variant spelling in the DB.
  const regionOptions = useMemo(
    () =>
      uniqueSorted(all.map((c) => canonicalCountry(String(c[regionKey] ?? '')))),
    [all],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (
        regionFilter &&
        canonicalCountry(String(c[regionKey] ?? '')) !== regionFilter
      ) {
        return false;
      }
      if (!q) return true;
      const n = String(c.name ?? '').toLowerCase();
      const a = String(c.address ?? '').toLowerCase();
      const city = String(c.city ?? '').toLowerCase();
      return n.includes(q) || a.includes(q) || city.includes(q);
    });
  }, [all, query, regionFilter]);

  // If the open site drops out of the filtered set (search /
  // region filter change while the takeover is up), leave the
  // panel visible — user can close it via the back button. Only
  // clear openId when the panel isn't mounted (stale state from
  // some other reset path).
  useEffect(() => {
    if (!openId || panelMounted) return;
    if (!filtered.some((c) => String(c.id) === openId)) {
      setOpenId(null);
    }
  }, [openId, filtered, panelMounted]);

  /// Takeover open. Measures the clicked card's rect (relative to
  /// the RHS panel) to seed the FLIP origin, mounts the panel, then
  /// on the next paint flips `expanded=true` so the CSS transition
  /// runs from origin → full. If the card is offscreen (or the pin
  /// click came from the map before the card was ever laid out),
  /// `originRect=null` and the panel fades in at full size.
  const openCard = useCallback((id: string) => {
    setOpenId(id);
    const cardEl = cardRefs.current[id];
    const rhsEl = rhsPanelRef.current;
    if (cardEl && rhsEl) {
      const cr = cardEl.getBoundingClientRect();
      const rr = rhsEl.getBoundingClientRect();
      const visible = cr.bottom > rr.top && cr.top < rr.bottom;
      setOriginRect(
        visible
          ? {
              top: cr.top - rr.top,
              left: cr.left - rr.left,
              width: cr.width,
              height: cr.height,
            }
          : null,
      );
    } else {
      setOriginRect(null);
    }
    setPanelMounted(true);
    setExpanded(false);
    // Two rAFs: React commits DOM → first rAF ensures paint at
    // origin → second rAF flips the target so the transition has a
    // distinct starting frame to interpolate from. Without the
    // double-rAF, some browsers batch styles and skip the animation.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setExpanded(true));
    });
  }, []);

  /// Takeover close. Reverses the transition (`expanded=false`),
  /// then after PANEL_MORPH_MS unmounts the panel and clears
  /// `openId` so siblings fade back in.
  const closeCard = useCallback(() => {
    setExpanded(false);
    const t = window.setTimeout(() => {
      setPanelMounted(false);
      setOpenId(null);
      setOriginRect(null);
    }, PANEL_MORPH_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Bulk-select derived helpers. `filteredSelectedCount` is what
  // the select-all checkbox in the header reflects — checking it
  // ticks every card currently visible under the search+region
  // filter, not the entire dataset.
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
      const allSelected =
        filteredIds.length > 0 && filteredIds.every((id) => next.has(id));
      if (allSelected) {
        // Unselect every currently-filtered row. Rows selected but
        // hidden by the filter stay selected — this way filtering
        // is non-destructive to intent.
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [filteredIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /// Aggregate charger count across every selected constellation.
  /// Drives the bulk-delete confirmation copy ("...detach N chargers...").
  const selectedChargerCount = useMemo(
    () =>
      all.reduce((acc, c) => {
        if (!selectedIds.has(String(c.id ?? ''))) return acc;
        return acc + (c.chargingPool?.length ?? 0);
      }, 0),
    [all, selectedIds],
  );

  const runBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleteOpen(false);
    setBulkDeleting(true);

    // Collect every attached charger across the selected
    // constellations. Bulk-update them to locationId=null in ONE
    // Refine call to satisfy the FK before deleting the sites.
    const chargerIds: Array<number | string> = [];
    for (const c of all) {
      if (!selectedIds.has(String(c.id ?? ''))) continue;
      for (const s of c.chargingPool ?? []) {
        if (s.id != null) chargerIds.push(s.id);
      }
    }

    try {
      if (chargerIds.length > 0) {
        await new Promise<void>((resolve, reject) => {
          mutateUpdateMany(
            {
              resource: ResourceType.CHARGING_STATIONS,
              ids: chargerIds,
              values: { locationId: null },
              mutationMode: 'pessimistic',
              successNotification: false,
            },
            { onSuccess: () => resolve(), onError: (e) => reject(e) },
          );
        });
      }
      const idsForDelete = Array.from(selectedIds);
      await new Promise<void>((resolve, reject) => {
        mutateDeleteMany(
          {
            resource: ResourceType.LOCATIONS,
            ids: idsForDelete,
            mutationMode: 'pessimistic',
            successNotification: {
              message: `Deleted ${idsForDelete.length} constellation${idsForDelete.length === 1 ? '' : 's'}${chargerIds.length ? ` · ${chargerIds.length} charger${chargerIds.length === 1 ? '' : 's'} detached` : ''}`,
              type: 'success',
            },
          },
          { onSuccess: () => resolve(), onError: (e) => reject(e) },
        );
      });
      setSelectedIds(new Set());
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[constellations bulk delete] FAILED:', e);
    } finally {
      setBulkDeleting(false);
    }
  }, [all, mutateDeleteMany, mutateUpdateMany, selectedIds]);

  const runBulkExport = useCallback(() => {
    const rows = all.filter((c) => selectedIds.has(String(c.id ?? '')));
    if (rows.length === 0) return;
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `constellations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [all, selectedIds]);

  return (
    <CanAccess
      resource={ResourceType.LOCATIONS}
      action={ActionType.LIST}
      fallback={<AccessDeniedFallback />}
    >
      {/* Viewport-minus-shell height so the map + card split has a
          real height to fill. Shell = top-nav (~56px) + py-8 chrome. */}
      <div className="flex min-h-0 flex-col gap-4 h-[calc(100vh-140px)]">
        {/* Header row — title + count on the left, search + add on the right. */}
        <div className="flex items-center justify-between gap-4">
          {/* `items-baseline` bottom-aligns the count text to the
              "Constellations" title so the tiny "53 sites" reads as
              a sub-caption pinned to the title's foot. In bulk mode
              the select-all checkbox sits to the RIGHT of the count
              and is sized down (`size-3`) to match the 12px text
              height. Slides in from the left on shell arrival. */}
          <div className="flex items-baseline gap-3" style={leftAnim}>
            <h1 className="text-2xl font-semibold tracking-tight">
              Constellations
            </h1>
            <span className="flex items-baseline gap-2 text-xs text-foreground/50">
              {listQuery.isLoading
                ? 'Loading…'
                : query.trim()
                  ? `${filtered.length} of ${all.length}`
                  : `${all.length} site${all.length === 1 ? '' : 's'}`}
              {bulkMode && !listQuery.isLoading && filtered.length > 0 ? (
                <Checkbox
                  aria-label="Select all constellations"
                  checked={
                    allFilteredSelected
                      ? true
                      : someFilteredSelected
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={toggleAllFiltered}
                  // `[&_svg]:size-2.5` shrinks the inner CheckIcon
                  // to fit the 12px box — the shadcn Checkbox hard-
                  // codes a 14px icon, which overflowed our size-3
                  // box on check and made the whole control pop /
                  // jump on toggle. Also lock translate:none to
                  // suppress any layout-shift ripple.
                  className="size-3 cursor-pointer [&_svg]:size-2.5"
                />
              ) : null}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Each control gets its own staggered top-slide via
                `topAnim(idx)` — reads left-to-right as a cascade. */}
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
            <div style={topAnim(2)}>
              <RegionFilter
                label={regionLabel}
                value={regionFilter}
                options={regionOptions}
                onChange={setRegionFilter}
              />
            </div>
            <CanAccess resource={ResourceType.LOCATIONS} action={ActionType.CREATE}>
              <div style={topAnim(3)}>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  className="cursor-pointer gap-1.5 bg-foreground text-[10px] font-medium uppercase tracking-widest text-background hover:bg-foreground/90"
                >
                  <Plus className="size-3.5" />
                  New constellation
                </Button>
              </div>
            </CanAccess>
          </div>
        </div>

        {/* Split — map left, cards right. min-h-0 lets the flex
            children shrink so the scroll container gets its own
            height instead of overflowing the page. */}
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[3fr_2fr]">
          <div className="relative min-h-0 overflow-hidden rounded-xl bg-white shadow-sm">
            {listQuery.isLoading ? (
              <Skeleton className="size-full" />
            ) : (
              <ConstellationMap
                constellations={filtered}
                hoveredId={hoveredId}
                focusedId={openId}
                regionFilter={regionFilter}
                onPinHover={setHoveredId}
                onPinClick={openCard}
                onRegionSelect={setRegionFilter}
              />
            )}
          </div>
          {/* RHS panel — hosts the card grid + the takeover overlay.
              `relative` gives the absolute-positioned takeover panel
              a coordinate system to morph inside. Ref is measured on
              takeover open to translate the clicked card's viewport
              rect into panel-local coordinates. Overlay is a SIBLING
              of the scroll container (not a child) so it is not
              clipped by `overflow-y: auto` and can't be scrolled with
              the underlying list. */}
          <div ref={rhsPanelRef} className="relative min-h-0">
            <div className="h-full overflow-y-auto px-2 py-2">
              {listQuery.isLoading ? (
                <CardListSkeleton />
              ) : filtered.length === 0 ? (
                <EmptyState query={query} />
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {filtered.map((c, i) => {
                    const idStr = String(c.id);
                    const isOpen = openId === idStr;
                    const isSibling = !!openId && !isOpen;
                    // Staggered shrink from outside-in reads as a
                    // collapse toward the picked card rather than a
                    // synchronized snap. Delay caps at ~140ms so long
                    // lists don't drag.
                    const staggerDelay = Math.min(i * 18, 140);
                    // Two cascade modes:
                    //   • Initial page load — 550ms base so the
                    //     reveal comes AFTER the page title lands,
                    //     with a 40ms per-row stagger.
                    //   • Filter change (`rowsCascade` off) — no
                    //     base delay, tighter 25ms stagger. Cards
                    //     that re-mount after a filter tweak still
                    //     get the reveal motion.
                    const cascadeDelay = !arrived
                      ? null
                      : rowsCascade
                        ? 550 + Math.min(i * 40, 480)
                        : Math.min(i * 25, 300);
                    const cascadeStyle: React.CSSProperties | undefined =
                      cascadeDelay != null
                        ? ({
                            ['--row-cascade-delay' as string]: `${cascadeDelay}ms`,
                          } as React.CSSProperties)
                        : undefined;
                    return (
                      <li
                        key={c.id ?? c.name}
                        style={{
                          transformOrigin: 'center',
                          transform: isSibling ? 'scale(0)' : 'scale(1)',
                          opacity: isSibling ? 0 : 1,
                          visibility: isOpen && panelMounted ? 'hidden' : 'visible',
                          transition: isSibling
                            ? `transform 240ms cubic-bezier(0.4,0,0.2,1) ${staggerDelay}ms, opacity 240ms ease-in ${staggerDelay}ms`
                            : `transform 280ms cubic-bezier(0.16,1,0.3,1) ${staggerDelay}ms, opacity 280ms ease-out ${staggerDelay}ms`,
                        }}
                      >
                        <div
                          className={cascadeDelay != null ? 'row-cascade' : undefined}
                          style={cascadeStyle}
                        >
                          <ConstellationCard
                            ref={(el) => {
                              cardRefs.current[idStr] = el;
                            }}
                            data={c}
                            hovered={idStr === hoveredId}
                            focused={idStr === openId}
                            bulkMode={bulkMode}
                            selected={selectedIds.has(idStr)}
                            onSelectChange={(v) => toggleOne(idStr, v)}
                            onHover={() => setHoveredId(idStr)}
                            onLeave={() => setHoveredId(null)}
                            onFocus={() => openCard(idStr)}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Takeover overlay — absolute inside RHS panel, sibling
                to the scroll container. On open, starts at the
                clicked card's rect (or fades in at slot 1 for
                offscreen picks) and morphs to fill the whole RHS. On
                close, reverses. Content fades in after the morph so
                the interior doesn't look distorted mid-transition. */}
            {panelMounted && openId && (() => {
              const openConstellation = all.find(
                (c) => String(c.id) === openId,
              );
              if (!openConstellation) return null;
              const hasOrigin = !!originRect;
              const morphStyle: React.CSSProperties = expanded
                ? {
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                  }
                : hasOrigin
                  ? {
                      top: originRect.top,
                      left: originRect.left,
                      width: originRect.width,
                      height: originRect.height,
                    }
                  : {
                      // Offscreen origin fallback — mount at slot 1
                      // (top-left) at half size and fade in, then rAF
                      // flips `expanded=true` to grow to full.
                      top: 0,
                      left: 0,
                      width: '50%',
                      height: '40%',
                    };
              return (
                <div
                  className="absolute z-30"
                  style={{
                    ...morphStyle,
                    opacity: expanded || hasOrigin ? 1 : 0,
                    transition: `top ${PANEL_MORPH_MS}ms cubic-bezier(0.4,0,0.2,1), left ${PANEL_MORPH_MS}ms cubic-bezier(0.4,0,0.2,1), width ${PANEL_MORPH_MS}ms cubic-bezier(0.4,0,0.2,1), height ${PANEL_MORPH_MS}ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease-out`,
                  }}
                >
                  <div
                    className="h-full"
                    style={{
                      opacity: expanded ? 1 : 0,
                      transition: 'opacity 200ms ease-out',
                      transitionDelay: expanded
                        ? `${Math.round(PANEL_MORPH_MS * 0.6)}ms`
                        : '0ms',
                    }}
                  >
                    <ConstellationDetailPanel
                      constellation={openConstellation}
                      onClose={closeCard}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Bulk-action bar. Slides up from the bottom when ≥1 card is
          selected. Fixed-position so the map/list layout above is
          unaffected. Contains counts, export (CSV), delete, and a
          clear-selection button. */}
      {selectedCount > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/40 bg-foreground px-3 py-2 text-background shadow-lg">
            <span className="pl-2 text-xs font-medium tabular-nums">
              {selectedCount} selected
              {selectedChargerCount > 0
                ? ` · ${selectedChargerCount} charger${selectedChargerCount === 1 ? '' : 's'}`
                : ''}
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
              Delete {selectedCount} constellation
              {selectedCount === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedChargerCount > 0 ? (
                <>
                  <strong>
                    {selectedChargerCount} charger
                    {selectedChargerCount === 1 ? '' : 's'}
                  </strong>{' '}
                  attached will be <strong>detached</strong> (kept in the
                  system as unassigned, ready to re-attach later), then the
                  selected constellations will be deleted. This cannot be
                  undone.
                </>
              ) : (
                <>This cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runBulkDelete}
              className="cursor-pointer bg-[#c94a3a] text-white hover:bg-[#c94a3a]/90"
            >
              {selectedChargerCount > 0
                ? `Detach ${selectedChargerCount} and delete ${selectedCount}`
                : `Delete ${selectedCount}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConstellationCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </CanAccess>
  );
};

// ─── Types ──────────────────────────────────────────────────────────

type Constellation = {
  id?: number | string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
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
        placeholder="Search by name, address, city…"
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

/// Sentinel used to represent the "all regions" reset — Radix Select
/// values cannot be empty strings, so we swap "" ↔ ALL at the Select
/// boundary while the outer filter state stays as "" for no-filter.
const ALL = '__all__';

/// Region / country filter pill next to the search. The label
/// switches based on viewer role (Ensoledus admin → "Country",
/// regular operator → "Region"); options are unique values pulled
/// from the loaded constellations, so the dropdown grows organically
/// as new sites are onboarded.
///
/// Uses shadcn's Radix Select — consistent rendering across OSes,
/// keyboard navigation, portal-based popover that escapes overflow.
function RegionFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  if (options.length === 0) return null;
  const allLabel = `All ${pluralize(label).toLowerCase()}`;
  return (
    <Select
      value={value === '' ? ALL : value}
      onValueChange={(v) => onChange(v === ALL ? '' : v)}
    >
      <SelectTrigger
        aria-label={`Filter by ${label.toLowerCase()}`}
        className="h-auto w-auto cursor-pointer rounded-full border-border bg-background px-3 py-1.5 text-xs shadow-none focus-visible:border-foreground/30 focus-visible:ring-foreground/10"
      >
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="cursor-pointer text-xs">
          {allLabel}
        </SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="cursor-pointer text-xs">
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/// Canonical display name for a raw country value pulled from the
/// DB. The `country` column stores freeform strings ("JM", "Jamaica",
/// "Trinidad And Tobago", "Trinidad & Tobago", "TT", …) — this
/// collapses those variants to a single canonical form so the filter
/// dropdown shows one row per real-world country. Unknown values
/// pass through unchanged so the operator can still see and filter
/// on them.
function canonicalCountry(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const key = trimmed
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/\s+/g, ' ');
  return COUNTRY_ALIASES[key] ?? trimmed;
}

/// Multiple DB spellings → one canonical name. Extend as new
/// operator markets onboard.
const COUNTRY_ALIASES: Record<string, string> = {
  BB: 'Barbados',
  BARBADOS: 'Barbados',
  JM: 'Jamaica',
  JAMAICA: 'Jamaica',
  TT: 'Trinidad and Tobago',
  TTO: 'Trinidad and Tobago',
  'TRINIDAD AND TOBAGO': 'Trinidad and Tobago',
  LC: 'Saint Lucia',
  LCA: 'Saint Lucia',
  'SAINT LUCIA': 'Saint Lucia',
  'ST LUCIA': 'Saint Lucia',
  'ST. LUCIA': 'Saint Lucia',
};

/// Naive English pluralizer for the filter label. Handles the two
/// endings that matter for the current label set (Country, Parish,
/// Region, County): `y` → `ies`, sibilants → `es`, otherwise `s`.
function pluralize(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  if (/(s|sh|ch|x|z)$/i.test(word)) return word + 'es';
  return word + 's';
}

/// Unique, non-empty, alphabetically sorted string values.
/// Used to feed the region/country filter dropdown from the
/// currently-loaded constellations.
function uniqueSorted(values: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// ─── Cards ──────────────────────────────────────────────────────────

/// Aggregate live stats for a constellation. Derived from the
/// nested chargingPool the LOCATIONS_LIST_QUERY already fetches,
/// so no extra request is needed to render the summary.
function stats(c: Constellation) {
  const pool = c.chargingPool ?? [];
  const total = pool.length;
  const online = pool.filter((s) => s.isOnline).length;
  let activeSessions = 0;
  let kwhInProgress = 0;
  for (const s of pool) {
    for (const t of s.transactions ?? []) {
      if (t.isActive) {
        activeSessions += 1;
        kwhInProgress += Number(t.totalKwh ?? 0);
      }
    }
  }
  return { total, online, activeSessions, kwhInProgress };
}

const ConstellationCard = ({
  ref,
  data,
  hovered,
  focused,
  bulkMode,
  selected,
  onSelectChange,
  onHover,
  onLeave,
  onFocus,
}: {
  ref: (el: HTMLDivElement | null) => void;
  data: Constellation;
  hovered: boolean;
  focused: boolean;
  /// When true, the bottom-right select checkbox is rendered so
  /// operators can pick this card for the floating bulk-action bar.
  /// Off by default — checkbox stays hidden and the card is fully
  /// clickable to open the detail takeover.
  bulkMode: boolean;
  selected: boolean;
  onSelectChange: (checked: boolean) => void;
  onHover: () => void;
  onLeave: () => void;
  onFocus: () => void;
}) => {
  const { total, online, activeSessions, kwhInProgress } = stats(data);
  const address = [data.address, data.city].filter(Boolean).join(' · ') || '—';
  const healthy = total > 0 && online === total;
  const partial = online > 0 && online < total;
  const dotClass = healthy
    ? 'bg-[#4a9d6c]'
    : partial
      ? 'bg-[#c99039]'
      : 'bg-[#c94a3a]';
  // Pulse ring color matches the dot fill so the ping reads as a
  // ripple of the same status color. Fed to `--pulse-color` on the
  // dot; the keyframe interpolates it out to transparent.
  const pulseColor = healthy ? '#4a9d6c' : partial ? '#c99039' : '#c94a3a';

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-pressed={focused}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onFocus}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFocus();
        }
      }}
      className={
        // `overflow-hidden` clips the SVG beam's outside-bleed
        // (half the 5px stroke sits outside the card edge); without
        // it, the transparent gap in the beam reveals the page bg
        // in that 2.5px outer band, reading as a grey ghost line.
        // Base has NO border — added only in the non-focused
        // branches so the beam owns the whole outline when active.
        'group relative w-full cursor-pointer overflow-hidden rounded-xl bg-white p-4 text-left transition-all ' +
        (focused
          ? ''
          : hovered
            ? 'border border-foreground/15 shadow-sm'
            : 'border border-transparent shadow-sm hover:border-foreground/10')
      }
    >
      {/* SVG overlay draws a rounded-rect stroke with an animated
          `stroke-dashoffset`, giving a uniform-speed comet sweep
          around the perimeter. Unlike conic-gradient, arc-length is
          constant per unit of time so the beam doesn't accelerate
          around corners. Only mounted when focused. */}
      {focused ? <BeamBorder /> : null}

      {/* Selection checkbox — bottom-right, bulk-mode only. Sits
          absolute above the card body so the card's baseline layout
          stays identical whether bulk is on or off (no reflow when
          toggling the switch). stopPropagation keeps the outer
          card-click (open takeover) from firing when the user just
          wants to tick/untick the box. */}
      {bulkMode ? (
        <div
          className="absolute bottom-3 right-3"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            aria-label={`Select ${data.name ?? 'constellation'}`}
            checked={selected}
            onCheckedChange={(v) => onSelectChange(v === true)}
            className="cursor-pointer"
          />
        </div>
      ) : null}

      {/* Info icon retired — the whole card body opens the detail
          takeover. No horizontal padding reserved for controls
          since the bulk checkbox sits in the bottom-right and
          doesn't collide with the header row. */}
      <div className="min-w-0 pr-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${dotClass}`}
            style={{
              ['--pulse-color' as string]: pulseColor,
              animation:
                'status-dot-pulse 2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            }}
          />
          <h3 className="truncate text-sm font-semibold">
            {data.name || `Constellation ${data.id ?? ''}`}
          </h3>
        </div>
        <p className="mt-1 truncate text-xs text-foreground/60">{address}</p>
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{online}</span>
          <span className="text-xs text-foreground/50">of {total} online</span>
        </div>
        {activeSessions > 0 ? (
          <div className="flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-medium text-foreground/70">
            <Zap className="size-3 text-[#05B084]" />
            <span className="tabular-nums">{activeSessions}</span>
            <span className="text-foreground/50">
              · {kwhInProgress.toFixed(1)} kWh
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ─── Loading / empty states ─────────────────────────────────────────

function CardListSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <li
          key={i}
          className="rounded-xl border border-transparent bg-white p-4 shadow-sm"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
          <Skeleton className="mt-4 h-6 w-20" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ query }: { query: string }) {
  const q = query.trim();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-foreground/60">
      <p className="font-medium">
        {q ? `No matches for "${q}"` : 'No constellations yet'}
      </p>
      <p className="text-xs text-foreground/40">
        {q
          ? 'Try a different name, address, or city.'
          : 'Add your first site to start seeing it here.'}
      </p>
    </div>
  );
}

// ─── Map ────────────────────────────────────────────────────────────

/// Reuses the same country/regional-bbox behavior as the overview's
/// Sites map dialog so the two feel like one continuous experience:
/// Ensoledus admins land on the Caribbean bbox, regular operators
/// land on their own country (see `COUNTRY_BBOXES`).
function ConstellationMap({
  constellations,
  hoveredId,
  focusedId,
  regionFilter,
  onPinHover,
  onPinClick,
  onRegionSelect,
}: {
  constellations: Constellation[];
  hoveredId: string | null;
  focusedId: string | null;
  /// Canonical country display name from the RegionFilter (e.g.
  /// "Jamaica" / "Trinidad and Tobago"). Empty string means "All
  /// countries" and flies back to the initial regional/country
  /// view.
  regionFilter: string;
  onPinHover: (id: string | null) => void;
  onPinClick: (id: string) => void;
  /// Clicked-cluster-badge callback — sets the region filter to
  /// that country so the map flies in and the list narrows.
  onRegionSelect: (region: string) => void;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapRef = useRef<MapRef | null>(null);
  const prevRegionRef = useRef<string>(regionFilter);
  const prevFocusedRef = useRef<string | null>(focusedId);

  const points = useMemo(
    () =>
      constellations
        .filter((c) => c.coordinates?.coordinates?.length === 2)
        .map((c) => {
          const [lng, lat] = (
            c.coordinates as { coordinates: [number, number] }
          ).coordinates;
          return {
            id: String(c.id ?? c.name ?? ''),
            name: c.name ?? '',
            country: canonicalCountry(String(c.country ?? '')),
            lat,
            lng,
          };
        }),
    [constellations],
  );

  // In the region view (no country filter) we collapse pins into
  // one badge per country — a circle with the site count. Reduces
  // visual clutter at low zoom and gives operators a fleet-level
  // read of where their footprint is.
  const clusters = useMemo(() => {
    const byCountry = new Map<string, { lat: number; lng: number; count: number }>();
    for (const p of points) {
      const key = p.country || 'Unknown';
      const prev = byCountry.get(key);
      if (prev) {
        prev.lat += p.lat;
        prev.lng += p.lng;
        prev.count += 1;
      } else {
        byCountry.set(key, { lat: p.lat, lng: p.lng, count: 1 });
      }
    }
    return Array.from(byCountry.entries()).map(([country, { lat, lng, count }]) => ({
      country,
      lat: lat / count,
      lng: lng / count,
      count,
    }));
  }, [points]);

  // Initial framing follows the current filter — empty (region
  // view) always frames the whole Caribbean so the cluster badges
  // are all visible on load. A pre-set country filter lands the
  // map directly in that country's bbox. `config.operatorCountry`
  // is no longer used to bias the initial view — the badge overlay
  // already tells the operator where their fleet lives.
  const initialBbox = useMemo(() => {
    if (regionFilter) return bboxForRegion(regionFilter) ?? CARIBBEAN_BBOX;
    return CARIBBEAN_BBOX;
    // Deps intentionally empty — only used at mount by onLoad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoad = useCallback(() => {
    mapRef.current?.fitBounds(initialBbox, { padding: 40, duration: 0 });
  }, [initialBbox]);

  // Card focus drives a curved dive-in; deselect flies back out
  // to whatever framing matches the current filter — country bbox
  // if one is picked, Caribbean region otherwise. `prevFocusedRef`
  // lets us tell "just-deselected" apart from "already unfocused
  // on mount" so we don't fire a spurious zoom-out on first render.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const prev = prevFocusedRef.current;
    prevFocusedRef.current = focusedId;

    if (focusedId) {
      const p = points.find((pt) => pt.id === focusedId);
      if (!p) return;
      const targetZoom = Math.max(map.getZoom(), 12);
      map.flyTo({
        center: [p.lng, p.lat],
        zoom: targetZoom,
        curve: 1.1,
        speed: 1.0,
        essential: true,
      });
      return;
    }

    // focusedId is null — only fly out if we're actually
    // transitioning FROM a focused state (not just initial mount).
    if (!prev) return;
    const targetBbox = regionFilter
      ? bboxForRegion(regionFilter) ?? CARIBBEAN_BBOX
      : CARIBBEAN_BBOX;
    const cam = map.cameraForBounds(targetBbox, { padding: 40 });
    if (!cam || cam.center == null || cam.zoom == null) return;
    const center = 'lng' in cam.center
      ? [cam.center.lng, cam.center.lat] as [number, number]
      : (cam.center as [number, number]);
    map.flyTo({
      center,
      zoom: cam.zoom,
      curve: 1.1,
      speed: 0.9,
      essential: true,
    });
  }, [focusedId, points, regionFilter]);

  // When the region filter changes, fly the camera on a curved
  // trajectory that arcs up (zooms out), traverses the globe, and
  // settles on the target country. `flyTo` naturally produces that
  // trajectory — the `curve` parameter tunes how high the arc goes.
  // The first mount is skipped so we don't fight `onLoad`'s
  // duration-0 fitBounds.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Skip first run — regionFilter is set at mount and the map is
    // already framed by onLoad.
    if (prevRegionRef.current === regionFilter) return;
    prevRegionRef.current = regionFilter;

    // "All countries" (empty filter) always frames the whole
    // regional footprint (Caribbean), not the operator's home
    // country — otherwise switching from e.g. Saint Lucia back to
    // "All" would leave the map stranded on the last country.
    const targetBbox = regionFilter
      ? bboxForRegion(regionFilter) ?? CARIBBEAN_BBOX
      : CARIBBEAN_BBOX;
    const cam = map.cameraForBounds(targetBbox, { padding: 40 });
    if (!cam || cam.center == null || cam.zoom == null) return;

    // Destructure so react-map-gl's LngLat / plain-object union both
    // work — we hand mapbox-gl a plain [lng, lat] tuple.
    const center = 'lng' in cam.center
      ? [cam.center.lng, cam.center.lat] as [number, number]
      : (cam.center as [number, number]);

    map.flyTo({
      center,
      zoom: cam.zoom,
      // curve controls how high the arc pulls back. 1.0 = flat pan,
      // higher = more zoom-out. Keep it just above flat so the motion
      // reads as a subtle step-back, not a full zoom-to-space.
      curve: 1.1,
      // speed 1.0 is the default; 0.9 stretches it a hair so the
      // curve still reads even at the shallower arc.
      speed: 0.9,
      essential: true,
    });
  }, [regionFilter, initialBbox]);

  if (!token) {
    return (
      <div className="flex size-full items-center justify-center text-xs text-foreground/50">
        Missing NEXT_PUBLIC_MAPBOX_TOKEN
      </div>
    );
  }

  const [[west, south], [east, north]] = initialBbox;
  const initialCenter: [number, number] = [
    (west + east) / 2,
    (south + north) / 2,
  ];

  return (
    <MapboxMap
      ref={mapRef}
      mapboxAccessToken={token}
      initialViewState={{
        longitude: initialCenter[0],
        latitude: initialCenter[1],
        zoom: 4,
      }}
      onLoad={onLoad}
      mapStyle="mapbox://styles/mapbox/light-v11"
      style={{ width: '100%', height: '100%' }}
      attributionControl={false}
    >
      {/* Region view (no country filter, no focused site) — render
          one count-badge per country. Clicking a badge sets the
          region filter, which triggers the flyTo arc into that
          country and switches to individual pins. Hidden the moment
          a site is focused so the focused pin isn't buried under a
          cluster badge sitting on the country centroid. */}
      {!regionFilter && !focusedId &&
        clusters.map((c) => (
          <Marker
            key={`cluster-${c.country}`}
            longitude={c.lng}
            latitude={c.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onRegionSelect(c.country);
            }}
          >
            <button
              type="button"
              title={`${c.country} — ${c.count} site${c.count === 1 ? '' : 's'}`}
              className="flex size-9 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-[#05B084] text-xs font-semibold tabular-nums text-white shadow-md transition-transform hover:scale-110"
            >
              {c.count}
            </button>
          </Marker>
        ))}

      {/* Individual pins — shown whenever we're in country view OR
          when the operator has focused a specific site (even from
          the region view, so the focused pin actually appears on
          the map). Isolation rule stays the same: focus hides the
          other pins so nothing distracts from the pick. Stale
          focusedId falls back to full pin set. */}
      {(regionFilter || focusedId) &&
        (() => {
          if (!focusedId) return points;
          const isolated = points.filter((p) => p.id === focusedId);
          return isolated.length > 0 ? isolated : points;
        })().map((p) => {
          const isHovered = p.id === hoveredId;
          const isFocused = p.id === focusedId;
          const active = isHovered || isFocused;
          return (
            <Marker
              key={p.id}
              longitude={p.lng}
              latitude={p.lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onPinClick(p.id);
              }}
            >
              <div
                onMouseEnter={() => onPinHover(p.id)}
                onMouseLeave={() => onPinHover(null)}
                title={p.name}
                className={
                  'cursor-pointer rounded-full border-2 border-white bg-[#05B084] shadow-md transition-all ' +
                  (isFocused
                    ? 'size-4 ring-2 ring-[#05B084]/40'
                    : active
                      ? 'size-4'
                      : 'size-3')
                }
              />
            </Marker>
          );
        })}
    </MapboxMap>
  );
}

// ─── Bounding boxes (mirror of overview/Sites dialog) ───────────────

type Bbox = [[number, number], [number, number]];

const COUNTRY_BBOXES: Record<string, Bbox> = {
  TT: [
    [-62.0, 9.9],
    [-60.4, 11.55],
  ],
  JM: [
    [-78.5, 17.6],
    [-76.1, 18.6],
  ],
  BB: [
    [-59.75, 13.0],
    [-59.35, 13.4],
  ],
  LC: [
    [-61.15, 13.7],
    [-60.85, 14.15],
  ],
};

const CARIBBEAN_BBOX: Bbox = [
  [-85, 8],
  [-60, 25],
];

/// Canonical country display name → bbox. Kept in sync with
/// `COUNTRY_ALIASES` — same set of countries, keyed by the label
/// the region filter dropdown emits ("Jamaica" not "JM"). Returns
/// null for unknown / empty input so the caller can fall back to
/// the map's default framing (e.g. the whole Caribbean).
function bboxForRegion(region: string): Bbox | null {
  const iso = CANONICAL_TO_ISO[region];
  if (!iso) return null;
  return COUNTRY_BBOXES[iso] ?? null;
}

const CANONICAL_TO_ISO: Record<string, string> = {
  Barbados: 'BB',
  Jamaica: 'JM',
  'Trinidad and Tobago': 'TT',
  'Saint Lucia': 'LC',
};

// ─── Animated beam border (SVG) ─────────────────────────────────────

/// Rounded-rect stroke that sweeps around the card's perimeter at
/// uniform arc-length speed via `stroke-dashoffset` — no corner
/// acceleration (the flaw with the previous conic-gradient version).
///
/// How it works:
///   • `pathLength="100"` normalizes the rect's perimeter to 100
///     units regardless of the card's actual pixel size or aspect
///     ratio, so the dash math is stable.
///   • `stroke-dasharray="87.5 12.5"` = 87.5-unit visible arc + 12.5
///     unit transparent gap. Same 87.5% beam ratio as before.
///   • Animating `stroke-dashoffset` from 0 → -100 slides the beam
///     around the perimeter linearly.
///   • Stroke uses a linearGradient (`#beam-gradient`) so the visible
///     arc has the warm palette baked in. The gradient is fixed in
///     SVG space, so as the beam slides past it picks up the color
///     at each position — reads like the beam shifting hue mid-sweep.
///   • Uses `vectorEffect="non-scaling-stroke"` so the 1px stroke
///     stays crisp even at any aspect ratio.
function BeamBorder() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="beam-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c65108" />
          <stop offset="50%" stopColor="#ff9f43" />
          <stop offset="100%" stopColor="#ffd93d" />
        </linearGradient>
      </defs>
      <rect
        x="0"
        y="0"
        rx="12"
        ry="12"
        width="100%"
        height="100%"
        fill="none"
        stroke="url(#beam-gradient)"
        strokeWidth={5}
        pathLength={100}
        strokeDasharray="87.5 12.5"
        vectorEffect="non-scaling-stroke"
        style={{
          // Stroke centered on the card's edge — half inside, half
          // outside. `overflow-visible` on the SVG lets the outer
          // half bleed past the SVG bounds so the beam sits at the
          // exact card perimeter, not inset from it.
          animation: 'beam-sweep 4s linear infinite',
        }}
      />
    </svg>
  );
}

// ─── CSV export ─────────────────────────────────────────────────────

/// Serialize the given constellation rows into RFC-4180-ish CSV.
/// Only cells that need it get wrapped in quotes (any field
/// containing a comma, quote, or newline). Header row is a subset
/// of Location columns useful for reimport / finance handoff.
function toCsv(rows: Constellation[]): string {
  const headers = [
    'id',
    'name',
    'address',
    'city',
    'state',
    'postalCode',
    'country',
    'latitude',
    'longitude',
    'chargerCount',
  ];
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const c of rows) {
    const coords = c.coordinates?.coordinates;
    const [lng, lat] =
      coords && coords.length === 2 ? coords : [undefined, undefined];
    lines.push(
      [
        c.id,
        c.name,
        c.address,
        c.city,
        c.state,
        c.postalCode,
        c.country,
        lat,
        lng,
        c.chargingPool?.length ?? 0,
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\n');
}
