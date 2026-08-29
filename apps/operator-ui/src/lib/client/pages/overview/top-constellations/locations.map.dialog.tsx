// SPDX-License-Identifier: Apache-2.0
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@lib/client/components/ui/dialog';
import { LOCATIONS_LIST_QUERY } from '@lib/queries/locations';
import { ResourceType } from '@lib/utils/access.types';
import config from '@lib/utils/config';
import { useList } from '@refinedev/core';
import { Map as MapIcon, Search, X } from 'lucide-react';
import type { MapRef } from 'react-map-gl/mapbox';
import { Map as MapboxMap, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useCallback, useMemo, useRef, useState } from 'react';

/// Map button + centered ~80% viewport dialog that shows every
/// operator constellation on a minimally-styled Mapbox map.
///
/// - Search field lives centered in the dialog header, pill-shaped
/// - Default Mapbox chrome (attribution, logo, nav controls) is
///   hidden for the dialog aesthetic; restore attribution in prod
/// - Map style: Mapbox `light-v11` for now; swap for a custom
///   Studio style tied to the vSparQ brand later
export function LocationsMapDialog() {
  const [query, setQuery] = useState('');
  const { query: locQuery } = useList({
    resource: ResourceType.LOCATIONS,
    pagination: { currentPage: 1, pageSize: 500 },
    meta: { gqlQuery: LOCATIONS_LIST_QUERY },
  });

  const allLocations = (locQuery.data?.data ?? []) as Array<Location>;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allLocations;
    return allLocations.filter((loc) => {
      const name = String(loc.name ?? '').toLowerCase();
      const address = String(loc.address ?? '').toLowerCase();
      const city = String(loc.city ?? '').toLowerCase();
      return name.includes(q) || address.includes(q) || city.includes(q);
    });
  }, [allLocations, query]);

  const matchLabel = query.trim()
    ? `${filtered.length} of ${allLocations.length}`
    : `${allLocations.length} site${allLocations.length === 1 ? '' : 's'}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Open sites map"
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-widest text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <MapIcon className="size-3.5" />
          Map
        </button>
      </DialogTrigger>
      <DialogContent className="flex h-[80vh] max-h-[900px] w-[80vw] max-w-[1200px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1200px]">
        {/* Three-column header: title/count on the left, centered
            search in the middle, spacer on the right so the search
            stays visually centered regardless of title length. */}
        <DialogHeader className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border/40 p-4">
          <div className="flex items-baseline gap-3">
            <DialogTitle className="text-sm font-semibold">
              Sites map
            </DialogTitle>
            <span className="text-xs text-foreground/50">{matchLabel}</span>
          </div>
          <div className="relative w-80 max-w-full justify-self-center">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-foreground/40"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, address, city…"
              className="w-full rounded-full border border-border bg-background pl-9 pr-9 py-1.5 text-xs text-foreground placeholder:text-foreground/40 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-foreground/40 hover:bg-foreground/5 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
          <div />
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <SitesMap locations={filtered} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Map ────────────────────────────────────────────────────────────

type Location = {
  id?: number | string;
  name?: string;
  address?: string;
  city?: string;
  coordinates?: { coordinates: [number, number] } | null;
};

/// Minimal-chrome Mapbox map with custom mint markers.
///
/// Initial view is scoped to the viewer's geography, NOT the pins:
///   - Ensoledus admin → the full CARIBBEAN_BBOX regional view
///   - Regular operator → their own country's bbox from COUNTRY_BBOXES
///   - Unknown country → falls back to the regional view too
///
/// Pins render wherever they fall inside that view (users can pan/
/// zoom to reach anything off-screen). Search filters what draws
/// but does NOT refit the map — the country/region stays put so
/// spatial context is preserved.
///
/// Style is Mapbox `light-v11` for now; the branded Studio style
/// lands with task #42 (Keycloak / brand rollout).
function SitesMap({ locations }: { locations: Location[] }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapRef = useRef<MapRef | null>(null);

  const points = useMemo(
    () =>
      locations
        .filter((l) => l.coordinates?.coordinates?.length === 2)
        .map((l) => {
          const [lng, lat] = (
            l.coordinates as { coordinates: [number, number] }
          ).coordinates;
          return {
            id: String(l.id ?? l.name ?? ''),
            name: String(l.name ?? ''),
            lat,
            lng,
          };
        }),
    [locations],
  );

  const initialBbox = useMemo(() => {
    if (config.isEnsoledusAdmin) return CARIBBEAN_BBOX;
    const cc = config.operatorCountry.trim().toUpperCase();
    return COUNTRY_BBOXES[cc] ?? CARIBBEAN_BBOX;
  }, []);

  // Fired once when the map completes its first load. Snaps the
  // viewport to the country/region bbox precisely — beats guessing
  // a center+zoom that would look wrong on non-square dialog sizes.
  const onLoad = useCallback(() => {
    mapRef.current?.fitBounds(initialBbox, {
      padding: 40,
      duration: 0,
    });
  }, [initialBbox]);

  if (!token) {
    return (
      <div className="flex size-full items-center justify-center text-xs text-foreground/50">
        Missing NEXT_PUBLIC_MAPBOX_TOKEN
      </div>
    );
  }

  // initialViewState is a coarse first paint so there's no
  // world-view flash before onLoad's fitBounds kicks in.
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
      // Kills all attribution/logo/nav controls for the minimal
      // chrome the dialog is going for. Attribution is legally
      // required by Mapbox TOS — restore in production via
      // <AttributionControl /> or a small footer credit line.
      attributionControl={false}
    >
      {points.map((p) => (
        <Marker
          key={p.id}
          longitude={p.lng}
          latitude={p.lat}
          anchor="center"
        >
          <div
            title={p.name}
            className="size-3 rounded-full border-2 border-white bg-[#05B084] shadow-md"
          />
        </Marker>
      ))}
    </MapboxMap>
  );
}

/// Bounding boxes shaped as `[[west, south], [east, north]]` — the
/// exact tuple shape Mapbox's `fitBounds` expects. Add rows as new
/// operator countries onboard. Missing countries fall through to
/// CARIBBEAN_BBOX (see SitesMap.initialBbox).
type Bbox = [[number, number], [number, number]];

const COUNTRY_BBOXES: Record<string, Bbox> = {
  // Trinidad & Tobago — the two-island bbox, padded slightly so
  // Tobago doesn't sit flush against the top edge of the map.
  TT: [
    [-62.0, 9.9],
    [-60.4, 11.55],
  ],
  // Jamaica.
  JM: [
    [-78.5, 17.6],
    [-76.1, 18.6],
  ],
  // Barbados.
  BB: [
    [-59.75, 13.0],
    [-59.35, 13.4],
  ],
};

/// Regional bbox for the Ensoledus admin view — covers the greater
/// Caribbean basin from Cuba/Bahamas in the north down through
/// Trinidad & the Guianas in the south, and from the Yucatan across
/// to the Lesser Antilles. Loose enough that a new island tenant
/// doesn't require re-tuning.
const CARIBBEAN_BBOX: Bbox = [
  [-85, 8],
  [-60, 25],
];
