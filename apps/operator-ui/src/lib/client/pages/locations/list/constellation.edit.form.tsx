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
import { Button } from '@lib/client/components/ui/button';
import { Checkbox } from '@lib/client/components/ui/checkbox';
import { OpeningHoursForm } from '@lib/client/components/opening-hours';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@lib/client/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lib/client/components/ui/select';
import { LOCATIONS_CREATE_MUTATION, LOCATIONS_EDIT_MUTATION } from '@lib/queries/locations';
import { ResourceType } from '@lib/utils/access.types';
import { useCreate, useDelete, useUpdate, useUpdateMany } from '@refinedev/core';
import {
  LocationFacilityEnum,
  LocationParkingEnum,
  type LocationFacilityEnumType,
  type LocationHours,
  type LocationParkingEnumType,
} from '@citrineos/base';
import { ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import { Map as MapboxMap, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { ConstellationDetail } from './constellation.detail.panel';

/// Quick-edit form that replaces the view content inside the
/// constellation detail modal when the user clicks the pencil.
/// Covers the fields you can safely tweak inline without opening
/// the heavier full-page editor:
///
///   • Name
///   • Address, City, State, Postal, Country
///   • Latitude, Longitude (plain numeric)
///   • Timezone (IANA string)
///   • Parking type (enum)
///
/// Complex fields (map picker, image upload, opening hours, facilities,
/// charging pool) stay on `/locations/[id]/edit` — reached via the
/// "Open full details" button in view mode.
export function ConstellationEditForm({
  constellation,
  mode = 'edit',
  onCancel,
  onSaved,
  onDeleted,
}: {
  /// Required for `mode='edit'` — supplies the initial values and
  /// the id to update. Ignored for `mode='create'` (form starts
  /// blank).
  constellation?: ConstellationDetail;
  /// `edit` (default) hits `useUpdate`; `create` hits `useCreate`
  /// with the same field set and hides the Delete button.
  mode?: 'create' | 'edit';
  onCancel: () => void;
  onSaved: () => void;
  /// Only invoked in edit mode after a successful delete.
  onDeleted?: () => void;
}) {
  const isCreate = mode === 'create';
  const [values, setValues] = useState<FormValues>(() =>
    isCreate || !constellation ? emptyFormValues() : initialFrom(constellation),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { mutate: mutateUpdate } = useUpdate();
  const { mutate: mutateCreate } = useCreate();
  const { mutate: mutateDelete } = useDelete();
  const { mutate: mutateUpdateMany } = useUpdateMany();

  const orbitalCount = constellation?.chargingPool?.length ?? 0;
  const attachedIds = (constellation?.chargingPool ?? [])
    .map((s) => s.id)
    .filter((id): id is number | string => id != null);

  const onDelete = async () => {
    if (!constellation || constellation.id == null) return;
    setConfirmDeleteOpen(false);

    // No chargers — fast path with the pleasant 60s undoable UX.
    if (attachedIds.length === 0) {
      mutateDelete(
        {
          resource: ResourceType.LOCATIONS,
          id: constellation.id,
          mutationMode: 'undoable',
          undoableTimeout: 60,
          successNotification: {
            message: `Deleted "${constellation.name ?? 'constellation'}"`,
            type: 'success',
          },
        },
        {
          onError: (e) => {
            // eslint-disable-next-line no-console
            console.error('[constellation delete] FAILED:', e);
            setError(
              (e as unknown as Error)?.message ?? 'Failed to delete constellation.',
            );
          },
        },
      );
      setTimeout(() => onDeleted?.(), 0);
      return;
    }

    // Chargers attached — two-step cascade. First detach every
    // charger (locationId → null) so the FK constraint is
    // satisfied, then delete the constellation. Pessimistic on
    // both steps so we know each result before proceeding; skips
    // the 60s undoable window because a partial rollback (undo
    // AFTER chargers are already detached) would leave garbage
    // state. Uses the same `mutationMode: 'pessimistic'` +
    // `useUpdateMany` pattern that locations.upsert.tsx uses to
    // attach chargers on save.
    setIsDeleting(true);
    try {
      await new Promise<void>((resolve, reject) => {
        mutateUpdateMany(
          {
            resource: ResourceType.CHARGING_STATIONS,
            ids: attachedIds,
            values: { locationId: null },
            mutationMode: 'pessimistic',
            successNotification: false,
          },
          {
            onSuccess: () => resolve(),
            onError: (e) => reject(e),
          },
        );
      });
      await new Promise<void>((resolve, reject) => {
        mutateDelete(
          {
            resource: ResourceType.LOCATIONS,
            id: constellation.id!,
            mutationMode: 'pessimistic',
            successNotification: {
              message: `Deleted "${constellation.name ?? 'constellation'}" · ${orbitalCount} charger${orbitalCount === 1 ? '' : 's'} detached`,
              type: 'success',
            },
          },
          {
            onSuccess: () => resolve(),
            onError: (e) => reject(e),
          },
        );
      });
      setIsDeleting(false);
      onDeleted?.();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[constellation delete cascade] FAILED:', e);
      setIsDeleting(false);
      setError((e as unknown as Error)?.message ?? 'Failed to delete constellation.');
    }
  };

  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
  };

  // Changing country clears city + state (the geo lists are country-
  // scoped — Barbados parishes don't apply to Jamaica) and swaps in
  // the country's canonical GMT timezone. Timezone is still editable
  // afterwards for the rare charger that needs a manual override.
  const onCountryChange = (v: string) => {
    const nextGeo = COUNTRY_GEO[v];
    setValues((prev) => ({
      ...prev,
      country: v,
      city: '',
      state: '',
      timeZone: nextGeo?.timezone ?? prev.timeZone,
    }));
  };

  const geo = COUNTRY_GEO[values.country];
  const stateLabel = geo?.subdivisionLabel ?? 'Region';

  // City + subdivision option lists: base per-country list, plus the
  // currently-stored value if it isn't in the base list (so legacy
  // freeform data isn't hidden from the editor).
  const cityNames = geo?.cities.map((c) => c.name) ?? [];
  const cityOptions = withExisting(cityNames, values.city);
  const stateOptions = withExisting(geo?.subdivisions ?? [], values.state);

  // Picking a city auto-fills the parish/county/region if we know
  // which one that city belongs to. Users can still change the
  // subdivision manually afterwards — this is a convenience, not
  // a lock.
  const onCityChange = (v: string) => {
    setValues((prev) => {
      const match = geo?.cities.find((c) => c.name === v);
      return {
        ...prev,
        city: v,
        state: match ? match.subdivision : prev.state,
      };
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = trimStrings(values);

    // Client-side sanity check on required text fields — the server
    // enforces the real contract, this just avoids a round-trip on
    // obvious mistakes.
    for (const [k, label] of REQUIRED_FIELDS) {
      if (!trimmed[k]) {
        setError(`${label} is required`);
        return;
      }
    }

    // Coordinates are optional in the form (blank = skip), but if
    // one is set both must be valid numbers, else the GeoJSON Point
    // is malformed. Keep the pair together or don't send either.
    let coordinates: { type: 'Point'; coordinates: [number, number] } | undefined;
    if (trimmed.latitude || trimmed.longitude) {
      const lat = Number(trimmed.latitude);
      const lng = Number(trimmed.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setError('Latitude and longitude must be numbers.');
        return;
      }
      if (lat < -90 || lat > 90) {
        setError('Latitude must be between -90 and 90.');
        return;
      }
      if (lng < -180 || lng > 180) {
        setError('Longitude must be between -180 and 180.');
        return;
      }
      coordinates = { type: 'Point', coordinates: [lng, lat] };
    }

    const payload: Record<string, unknown> = {
      name: trimmed.name,
      address: trimmed.address,
      city: trimmed.city,
      state: trimmed.state,
      postalCode: trimmed.postalCode,
      country: trimmed.country,
      timeZone: trimmed.timeZone,
      // Empty select → send `null` so Hasura clears the column
      // instead of failing enum validation on an empty string.
      parkingType: trimmed.parkingType || null,
      // Empty multi-select → null so the column clears rather than
      // storing an empty array (matches how parkingType is cleared).
      facilities: trimmed.facilities.length > 0 ? trimmed.facilities : null,
      // OCPI-shaped openingHours object. Drop entirely when the user
      // hasn't set anything meaningful (twentyfourSeven=false and
      // no regular/exceptional periods) — sending `{}` would still
      // overwrite the column with a semantically-empty object.
      openingHours: sanitizeOpeningHours(trimmed.openingHours),
    };
    if (coordinates) payload.coordinates = coordinates;

    setIsSaving(true);
    const handlers = {
      onSuccess: () => {
        setIsSaving(false);
        onSaved();
      },
      onError: (e: unknown) => {
        setIsSaving(false);
        setError((e as { message?: string })?.message ?? 'Failed to save changes.');
      },
    };
    if (isCreate) {
      mutateCreate(
        {
          resource: ResourceType.LOCATIONS,
          values: payload,
          meta: { gqlMutation: LOCATIONS_CREATE_MUTATION },
          successNotification: {
            message: 'Constellation created.',
            type: 'success',
          },
        },
        handlers,
      );
    } else {
      // Edit mode — guarded upstream, but assert for TS.
      if (constellation?.id == null) {
        setError('Missing constellation id.');
        setIsSaving(false);
        return;
      }
      mutateUpdate(
        {
          resource: ResourceType.LOCATIONS,
          id: constellation.id,
          values: payload,
          mutationMode: 'pessimistic',
          meta: { gqlMutation: LOCATIONS_EDIT_MUTATION },
          successNotification: {
            message: 'Constellation updated.',
            type: 'success',
          },
        },
        handlers,
      );
    }
  };

  return (
    <>
    <form
      onSubmit={onSubmit}
      className="flex min-h-0 flex-1 flex-col"
      // Form-level autofill kill. Chrome / Safari / LastPass /
      // 1Password all read this attribute on the <form> element
      // and back off from grouping the fields as an address form.
      autoComplete="off"
    >
      {/* Autofill honeypot — Chrome ignores `autoComplete="off"`
          on visible fields when it detects address-shaped fields
          nearby, but it always fills the FIRST matching input in
          a form. We give it a hidden dummy address group to
          consume that autofill instead of our real fields.
          `aria-hidden` + `tabIndex={-1}` keeps it out of the
          keyboard/screen-reader tree. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        <input type="text" name="name" tabIndex={-1} autoComplete="name" />
        <input type="text" name="street-address" tabIndex={-1} autoComplete="street-address" />
        <input type="text" name="postal-code" tabIndex={-1} autoComplete="postal-code" />
      </div>
      <div className="border-b border-border/40 px-6 py-5">
        <div className="text-lg font-semibold">
          {isCreate ? 'New constellation' : 'Edit constellation'}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        {/* Identity — name spans full width, then Country + Parking
            share the second row as two dropdowns, timezone below. */}
        <Section>
          <TextField
            // "Site name" instead of "Name" — Chrome's contact
            // autofill classifier keys off the visible label. A
            // label without "Name" doesn't trigger the person /
            // address dropdown on focus, even when other address-
            // shaped fields are nearby.
            label="Site name"
            value={values.name}
            onChange={(v) => set('name', v)}
            required
            fullWidth
            inputProps={{
              autoComplete: 'off',
              name: 'constellation-site-name',
              'data-lpignore': 'true',
              'data-1p-ignore': 'true',
            } as React.InputHTMLAttributes<HTMLInputElement>}
          />
          <SelectField
            label="Country"
            value={values.country}
            onChange={onCountryChange}
            options={COUNTRY_OPTIONS}
            placeholder="Select a country"
          />
          <SelectField
            label="Parking"
            value={values.parkingType}
            onChange={(v) => set('parkingType', v as LocationParkingEnumType | '')}
            options={PARKING_OPTIONS}
            placeholder="—"
          />
          <TextField
            label="Timezone"
            value={values.timeZone}
            onChange={(v) => set('timeZone', v)}
            placeholder="GMT-4"
            required
          />
          <MultiSelectField
            label="Facilities"
            values={values.facilities}
            onChange={(next) => set('facilities', next)}
            options={FACILITY_OPTIONS}
            placeholder="No facilities"
          />
        </Section>

        <SectionLabel>Address</SectionLabel>
        {/* Two-column layout: form fields left, map picker right.
            The map replaces the numeric lat/lng inputs — click or
            drag to place the pin; coordinates come out of the map,
            not typed. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Street address"
              value={values.address}
              onChange={(v) => set('address', v)}
              required
              fullWidth
            />
            <SelectField
              label="City"
              value={values.city}
              onChange={onCityChange}
              options={cityOptions}
              placeholder={values.country ? 'Select a city' : 'Select country first'}
            />
            <SelectField
              label={stateLabel}
              value={values.state}
              onChange={(v) => set('state', v)}
              options={stateOptions}
              placeholder={
                values.country
                  ? `Select a ${stateLabel.toLowerCase()}`
                  : 'Select country first'
              }
            />
            <TextField
              label="Postal code"
              value={values.postalCode}
              onChange={(v) => set('postalCode', v)}
              fullWidth
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-foreground/70">
              Location on map
            </span>
            <PinPicker
              country={values.country}
              latitude={values.latitude}
              longitude={values.longitude}
              onChange={(lat, lng) =>
                setValues((prev) => ({
                  ...prev,
                  latitude: String(lat),
                  longitude: String(lng),
                }))
              }
            />
          </div>
        </div>

        {/* Divider between Address and Opening Hours — same weight
            as the header + footer separators so the sections read
            as peers. */}
        <div className="border-t border-border/40" />

        <SectionLabel>Opening hours</SectionLabel>
        <OpeningHoursForm
          bare
          value={values.openingHours}
          onChange={(next) => set('openingHours', next)}
        />

        {error ? (
          <div className="rounded-md border border-[#c94a3a]/30 bg-[#c94a3a]/5 px-3 py-2 text-xs text-[#c94a3a]">
            {error}
          </div>
        ) : null}
      </div>

      {/* Custom footer instead of <DialogFooter> so we can put
          Delete on the LEFT and Cancel/Save on the RIGHT — the
          shadcn DialogFooter default is justify-end which fights
          the split layout. Delete slot only renders in edit mode
          (create has nothing to delete yet). */}
      <div className="flex items-center justify-between gap-2 border-t border-border/40 px-6 py-3">
        {isCreate ? (
          <span aria-hidden />
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={isSaving || isDeleting}
            className="cursor-pointer gap-1.5 text-[#c94a3a] hover:bg-[#c94a3a]/10 hover:text-[#c94a3a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Delete
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className="cursor-pointer text-[10px] font-medium uppercase tracking-widest"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSaving}
            className="cursor-pointer gap-1.5 bg-foreground text-[10px] font-medium uppercase tracking-widest text-background hover:bg-foreground/90"
          >
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {isCreate ? 'Create constellation' : 'Save changes'}
          </Button>
        </div>
      </div>

    </form>

    {/* Destructive confirm — hoisted OUT of the <form> above.
        Inside a form, Radix's <AlertDialogAction> renders as a
        native <button> which defaults to type="submit". Clicking
        Delete would submit the surrounding edit form instead of
        firing onDelete — the user reported this as "click Delete,
        nothing happens, no confirmation, no error". Living as a
        sibling of the form fixes it cleanly. */}
    {isCreate ? null : (
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this constellation?</AlertDialogTitle>
            <AlertDialogDescription>
              {orbitalCount === 0 ? (
                <>
                  You'll have <strong>60 seconds</strong> to undo from the
                  notification. After that, "{constellation?.name ?? 'this site'}"
                  will be removed permanently.
                </>
              ) : (
                <>
                  <strong>
                    {orbitalCount} charger{orbitalCount === 1 ? '' : 's'}
                  </strong>{' '}
                  attached to "{constellation?.name ?? 'this site'}" will be
                  <strong> detached</strong> (kept in the system as unassigned,
                  available to re-attach to another constellation later), then
                  the constellation itself will be deleted. This one cannot be
                  undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="cursor-pointer bg-[#c94a3a] text-white hover:bg-[#c94a3a]/90"
            >
              {orbitalCount === 0
                ? 'Delete'
                : `Detach ${orbitalCount} and delete`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}
    </>
  );
}

// ─── Form state ─────────────────────────────────────────────────────

type FormValues = {
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  timeZone: string;
  parkingType: LocationParkingEnumType | '';
  facilities: LocationFacilityEnumType[];
  openingHours: LocationHours | undefined;
  latitude: string;
  longitude: string;
};

// Postal code + city intentionally not required — many Caribbean
// addresses don't have a postal code, and rural chargers may sit
// outside any of the pre-listed cities.
const REQUIRED_FIELDS: Array<[keyof FormValues, string]> = [
  ['name', 'Name'],
  ['address', 'Street address'],
  ['state', 'Region'],
  ['country', 'Country'],
  ['timeZone', 'Timezone'],
];

/// Blank form for `mode='create'`. Every field starts unset;
/// operator fills them in before save. Kept as a separate helper
/// so `initialFrom` can stay focused on mapping from an existing
/// record.
function emptyFormValues(): FormValues {
  return {
    name: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    timeZone: '',
    parkingType: '',
    facilities: [],
    openingHours: undefined,
    latitude: '',
    longitude: '',
  };
}

function initialFrom(c: ConstellationDetail): FormValues {
  const [lng, lat] =
    c.coordinates?.coordinates?.length === 2
      ? c.coordinates.coordinates
      : [undefined, undefined];
  return {
    name: c.name ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    postalCode: c.postalCode ?? '',
    country: normalizeCountry(c.country ?? ''),
    timeZone: c.timeZone ?? '',
    parkingType: (c.parkingType as LocationParkingEnumType | undefined) ?? '',
    facilities: Array.isArray(c.facilities)
      ? (c.facilities.filter(Boolean) as LocationFacilityEnumType[])
      : [],
    openingHours: (c.openingHours ?? undefined) as LocationHours | undefined,
    latitude: lat != null ? String(lat) : '',
    longitude: lng != null ? String(lng) : '',
  };
}

/// Coerces whatever the DB currently stores in the `country` column
/// (full name, ISO alpha-2, ISO alpha-3, "Trinidad & Tobago" with an
/// ampersand, etc.) into the ISO alpha-2 code the dropdown expects.
/// Falls back to the raw string when nothing matches so legacy data
/// isn't silently lost — the field just shows the raw value as a
/// "(custom)" option instead.
function normalizeCountry(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();

  // Already an ISO alpha-2 code we know about.
  if (/^[A-Z]{2}$/.test(upper) && COUNTRY_OPTIONS.some((o) => o.value === upper)) {
    return upper;
  }

  // Match by display name, tolerating ampersand ↔ "and" and extra
  // whitespace differences ("Trinidad & Tobago" vs the canonical
  // "Trinidad and Tobago").
  const canonical = (s: string) =>
    s.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
  const byLabel = COUNTRY_OPTIONS.find(
    (o) => canonical(o.label) === canonical(trimmed),
  );
  if (byLabel) return byLabel.value;

  return trimmed;
}

/// Trim empty period arrays and collapse a no-op configuration to
/// `null` so we don't write meaningless `{ twentyfourSeven: false }`
/// blobs back to the DB. Mirrors the sanitizer on the full upsert
/// page so both entry points produce the same shape on the wire.
function sanitizeOpeningHours(v: LocationHours | undefined): LocationHours | null {
  if (!v) return null;
  const { exceptionalOpenings, exceptionalClosings, regularHours, ...rest } = v;
  const cleaned: Record<string, unknown> = { ...rest };

  const openings = (exceptionalOpenings ?? []).filter((p) => !!p);
  if (openings.length > 0) cleaned.exceptionalOpenings = openings;

  const closings = (exceptionalClosings ?? []).filter((p) => !!p);
  if (closings.length > 0) cleaned.exceptionalClosings = closings;

  if (regularHours && regularHours.length > 0) cleaned.regularHours = regularHours;

  const onlyEmptyToggle =
    Object.keys(cleaned).length === 1 &&
    'twentyfourSeven' in cleaned &&
    cleaned.twentyfourSeven === false;
  if (onlyEmptyToggle) return null;

  return cleaned as unknown as LocationHours;
}

function trimStrings(v: FormValues): FormValues {
  return {
    ...v,
    name: v.name.trim(),
    address: v.address.trim(),
    city: v.city.trim(),
    state: v.state.trim(),
    postalCode: v.postalCode.trim(),
    country: v.country.trim(),
    timeZone: v.timeZone.trim(),
    latitude: v.latitude.trim(),
    longitude: v.longitude.trim(),
  };
}

const PARKING_OPTIONS = Object.keys(LocationParkingEnum).map((k) => ({
  value: k,
  label: humanize(k),
}));

const FACILITY_OPTIONS: Array<{ value: LocationFacilityEnumType; label: string }> =
  (Object.keys(LocationFacilityEnum) as LocationFacilityEnumType[]).map((k) => ({
    value: k,
    label: humanize(k),
  }));

/// Country dropdown options — scoped to the Caribbean markets vSparQ
/// serves today. Add new rows here as the operator rollout expands.
/// Value is the ISO 3166-1 alpha-2 code (matches DB storage), label
/// is the display name.
const COUNTRY_OPTIONS = [
  { value: 'BB', label: 'Barbados' },
  { value: 'JM', label: 'Jamaica' },
  { value: 'TT', label: 'Trinidad and Tobago' },
];

/// Per-country geography — cities + subdivision list + the local name
/// for that subdivision. Barbados and Jamaica use "Parish"; Trinidad
/// & Tobago uses "Region" (its regional corporations, boroughs, and
/// cities are grouped under that single label for simplicity). Extend
/// the city lists as needed — this is not exhaustive, just the major
/// urban centers where chargers are likely to land.
type CountryGeo = {
  /// City list per country. Each city carries its subdivision so
  /// selecting a city can auto-fill the parish/region/county field.
  cities: Array<{ name: string; subdivision: string }>;
  subdivisions: string[];
  subdivisionLabel: 'Parish' | 'Region' | 'County';
  /// Rough [ [west, south], [east, north] ] bounding box the map
  /// picker fits to when this country is selected.
  bbox: [[number, number], [number, number]];
  /// GMT offset for the country. Caribbean countries in scope don't
  /// observe DST, so a static offset is safe. Auto-populates the
  /// Timezone field when the country is selected.
  timezone: string;
};

const COUNTRY_GEO: Record<string, CountryGeo> = {
  BB: {
    cities: [
      { name: 'Bridgetown', subdivision: 'St. Michael' },
      { name: 'Speightstown', subdivision: 'St. Peter' },
      { name: 'Oistins', subdivision: 'Christ Church' },
      { name: 'Holetown', subdivision: 'St. James' },
      { name: 'Bathsheba', subdivision: 'St. Joseph' },
    ],
    subdivisions: [
      'Christ Church',
      'St. Andrew',
      'St. George',
      'St. James',
      'St. John',
      'St. Joseph',
      'St. Lucy',
      'St. Michael',
      'St. Peter',
      'St. Philip',
      'St. Thomas',
    ],
    subdivisionLabel: 'Parish',
    bbox: [
      [-59.75, 13.0],
      [-59.35, 13.4],
    ],
    timezone: 'GMT-4',
  },
  JM: {
    cities: [
      { name: 'Kingston', subdivision: 'Kingston' },
      { name: 'Spanish Town', subdivision: 'St. Catherine' },
      { name: 'Portmore', subdivision: 'St. Catherine' },
      { name: 'Montego Bay', subdivision: 'St. James' },
      { name: 'May Pen', subdivision: 'Clarendon' },
      { name: 'Mandeville', subdivision: 'Manchester' },
      { name: 'Ocho Rios', subdivision: 'St. Ann' },
      { name: 'Negril', subdivision: 'Westmoreland' },
      { name: 'Old Harbour', subdivision: 'St. Catherine' },
      { name: 'Savanna-la-Mar', subdivision: 'Westmoreland' },
      { name: 'Port Antonio', subdivision: 'Portland' },
    ],
    subdivisions: [
      'Clarendon',
      'Hanover',
      'Kingston',
      'Manchester',
      'Portland',
      'St. Andrew',
      'St. Ann',
      'St. Catherine',
      'St. Elizabeth',
      'St. James',
      'St. Mary',
      'St. Thomas',
      'Trelawny',
      'Westmoreland',
    ],
    subdivisionLabel: 'County',
    bbox: [
      [-78.5, 17.6],
      [-76.1, 18.6],
    ],
    timezone: 'GMT-5',
  },
  TT: {
    cities: [
      { name: 'Port of Spain', subdivision: 'Port of Spain' },
      { name: 'San Fernando', subdivision: 'San Fernando' },
      { name: 'Chaguanas', subdivision: 'Chaguanas' },
      { name: 'Arima', subdivision: 'Arima' },
      { name: 'Point Fortin', subdivision: 'Point Fortin' },
      { name: 'Marabella', subdivision: 'San Fernando' },
      { name: 'Sangre Grande', subdivision: 'Sangre Grande' },
      { name: 'Tunapuna', subdivision: 'Tunapuna-Piarco' },
      { name: 'Scarborough', subdivision: 'Tobago' },
      { name: 'Roxborough', subdivision: 'Tobago' },
    ],
    subdivisions: [
      'Arima',
      'Chaguanas',
      'Couva-Tabaquite-Talparo',
      'Diego Martin',
      'Mayaro-Rio Claro',
      'Penal-Debe',
      'Point Fortin',
      'Port of Spain',
      'Princes Town',
      'San Fernando',
      'San Juan-Laventille',
      'Sangre Grande',
      'Siparia',
      'Tobago',
      'Tunapuna-Piarco',
    ],
    subdivisionLabel: 'Region',
    bbox: [
      [-62.0, 9.9],
      [-60.4, 11.55],
    ],
    timezone: 'GMT-4',
  },
};

/// Wraps an options list so the currently-stored value stays visible
/// even if it isn't in the hardcoded list (legacy freeform data or a
/// city we haven't added yet). Also handles the "no country picked
/// yet" case where the base list is empty.
function withExisting(base: string[], existing: string): Array<{ value: string; label: string }> {
  const options = base.map((v) => ({ value: v, label: v }));
  const trimmed = existing.trim();
  if (trimmed && !base.includes(trimmed)) {
    options.unshift({ value: trimmed, label: `${trimmed} (custom)` });
  }
  return options;
}

/// Turn an enum key (`alongMotorway`, `PARKING_LOT`, `AlongMotorway`)
/// into a readable label ("Along Motorway"). Handles all three casing
/// conventions in one pass by inserting spaces at underscore
/// boundaries AND at lower→upper case transitions before title-casing.
function humanize(raw: string): string {
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

// ─── Field primitives ───────────────────────────────────────────────

/// Two-column responsive grid — `fullWidth` on a field spans both.
function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  fullWidth,
  inputProps,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  fullWidth?: boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  // Readonly-on-mount defeats Chrome's aggressive address
  // autofill. Chrome skips readonly inputs entirely; we flip it
  // off on the first focus so the field becomes editable
  // exactly when the user actually clicks it. Standard
  // `autoComplete="off"` alone isn't enough — Chrome ignores it
  // when it detects an address-shaped form.
  const [readOnly, setReadOnly] = useState(true);
  return (
    <label className={'flex flex-col gap-1 ' + (fullWidth ? 'sm:col-span-2' : '')}>
      <span className="text-[11px] font-medium text-foreground/70">
        {label}
        {required ? <span className="ml-0.5 text-[#c94a3a]">*</span> : null}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        onFocus={() => setReadOnly(false)}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
        {...inputProps}
        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
      />
    </label>
  );
}

/// Sentinel used to represent "cleared / no selection" in the Radix
/// Select — Radix does not allow empty-string values (throws), so we
/// swap `""` ↔ CLEAR at the Select boundary while the outer form
/// state stays clean.
const CLEAR = '__clear__';

// ─── Map pin picker ─────────────────────────────────────────────────

/// Click-or-drag Mapbox map that replaces the numeric coordinate
/// inputs. Behavior:
///   • On mount, fits to the selected country's bbox (or falls back
///     to a Caribbean-wide view when no country is set yet).
///   • Click anywhere on the map → drop / move the pin.
///   • Drag the existing pin → live-update coords while dragging.
///   • Coordinate readout under the map shows the current pin
///     position (6 decimal places, GeoJSON [lng, lat] order flipped
///     to the more familiar lat, lng).
function PinPicker({
  country,
  latitude,
  longitude,
  onChange,
}: {
  country: string;
  latitude: string;
  longitude: string;
  onChange: (lat: number, lng: number) => void;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapRef = useRef<MapRef | null>(null);
  const bbox = COUNTRY_GEO[country]?.bbox ?? DEFAULT_BBOX;

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);

  // On load: if a pin already exists, center on it; otherwise fit to
  // the country/default bbox. Runs once per map instance.
  const onLoad = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hasPin) {
      map.easeTo({ center: [lng, lat], zoom: 13, duration: 0 });
    } else {
      map.fitBounds(bbox, { padding: 30, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit whenever the country changes AND no pin is set — dragging
  // the country dropdown should refocus an empty map, but must not
  // steal focus from an existing pin the user has already placed.
  useEffect(() => {
    if (hasPin) return;
    mapRef.current?.fitBounds(bbox, { padding: 30, duration: 400 });
  }, [country, bbox, hasPin]);

  if (!token) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-md border border-border bg-foreground/[0.02] text-xs text-foreground/50">
        Missing NEXT_PUBLIC_MAPBOX_TOKEN
      </div>
    );
  }

  const [[west, south], [east, north]] = bbox;
  const initialCenter: [number, number] = hasPin
    ? [lng, lat]
    : [(west + east) / 2, (south + north) / 2];

  return (
    <>
      <div className="min-h-[220px] flex-1 overflow-hidden rounded-md border border-border">
        <MapboxMap
          ref={mapRef}
          mapboxAccessToken={token}
          initialViewState={{
            longitude: initialCenter[0],
            latitude: initialCenter[1],
            zoom: hasPin ? 13 : 8,
          }}
          onLoad={onLoad}
          onClick={(e) => onChange(e.lngLat.lat, e.lngLat.lng)}
          mapStyle="mapbox://styles/mapbox/light-v11"
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
          cursor="crosshair"
        >
          {hasPin ? (
            <Marker
              longitude={lng}
              latitude={lat}
              anchor="center"
              draggable
              onDragEnd={(e) => onChange(e.lngLat.lat, e.lngLat.lng)}
            >
              <div className="size-4 cursor-grab rounded-full border-2 border-white bg-[#05B084] shadow-md active:cursor-grabbing" />
            </Marker>
          ) : null}
        </MapboxMap>
      </div>
      <div className="text-[10px] tabular-nums text-foreground/50">
        {hasPin
          ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
          : 'Click the map to place a pin.'}
      </div>
    </>
  );
}

/// Caribbean-wide fallback when no country is selected — covers
/// Cuba/Bahamas → Trinidad/Guianas → Yucatan → Lesser Antilles.
const DEFAULT_BBOX: [[number, number], [number, number]] = [
  [-85, 8],
  [-60, 25],
];

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-foreground/70">{label}</span>
      <Select
        value={value === '' ? CLEAR : value}
        onValueChange={(v) => onChange(v === CLEAR ? '' : v)}
      >
        <SelectTrigger className="h-auto w-full cursor-pointer rounded-md border-border bg-background px-2.5 py-1.5 text-xs shadow-none focus-visible:border-foreground/30 focus-visible:ring-foreground/10">
          <SelectValue placeholder={placeholder ?? '—'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CLEAR} className="cursor-pointer text-xs">
            {placeholder ?? '—'}
          </SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="cursor-pointer text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/// Compact multi-select rendered as a Popover with a checkbox list.
/// Trigger reads either the placeholder (no selection), the single
/// label (one selected), or "N selected" (2+) to keep the row height
/// stable regardless of picks. Selection state is uncontrolled inside
/// the popover — toggles emit the full next array up to the parent.
function MultiSelectField<T extends string>({
  label,
  values,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  values: T[];
  onChange: (next: T[]) => void;
  options: Array<{ value: T; label: string }>;
  placeholder?: string;
}) {
  const toggle = (v: T, checked: boolean) => {
    onChange(
      checked ? Array.from(new Set([...values, v])) : values.filter((x) => x !== v),
    );
  };

  const isEmpty = values.length === 0;
  const selectedLabels = values.map(
    (v) => options.find((o) => o.value === v)?.label ?? v,
  );

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-foreground/70">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          {/* Trigger grows vertically to fit its chips — the field
              always shows every selected facility as its own pill,
              wrapping to new lines as needed. `min-h-[30px]` keeps
              the empty state the same height as sibling one-line
              fields so the identity grid doesn't jump. */}
          <button
            type="button"
            className="flex min-h-[30px] w-full cursor-pointer items-start justify-between gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground shadow-none transition-colors hover:border-foreground/30 focus-visible:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10"
          >
            {isEmpty ? (
              <span className="flex-1 self-center px-1 text-left text-foreground/40">
                {placeholder ?? '—'}
              </span>
            ) : (
              <ul className="flex flex-1 flex-wrap gap-1">
                {selectedLabels.map((label, i) => (
                  <li
                    key={`${label}-${i}`}
                    className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[11px] leading-tight text-foreground"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            )}
            <ChevronDown className="mt-1 size-3.5 shrink-0 text-foreground/50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] max-h-64 overflow-y-auto p-1"
        >
          {options.map((opt) => {
            const checked = values.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-foreground/5"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => toggle(opt.value, v === true)}
                  className="cursor-pointer"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}

