// SPDX-License-Identifier: Apache-2.0
'use client';

import { Button } from '@lib/client/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lib/client/components/ui/select';
import { LOCATIONS_LIST_QUERY } from '@lib/queries/locations';
import { CHARGING_STATIONS_CREATE_MUTATION } from '@lib/queries/charging.stations';
import { ResourceType } from '@lib/utils/access.types';
import { useCreate, useList } from '@refinedev/core';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

/// Minimal create form for a new charging station. Mirrors the
/// Constellation create modal in look + choreography — same
/// header/footer chrome, same uppercase-tracked button labels, same
/// autofill-defeat treatment. Fields:
///
///   • OCPP identifier (unique, required) — the string the physical
///     charger appends to the WebSocket URL when it connects.
///   • Unit name (optional) — operator-facing label. Falls back to
///     "{Constellation} · #N" in the list when unset.
///   • Constellation (optional) — parent site.
///   • Protocol (optional) — OCPP version, blank if unknown.
///
/// Extended fields (floor level, parking, capabilities, network
/// profiles) still live on the full-page `/charging-stations/new`
/// editor. This modal is the fast-path "give it a name so it can
/// come online, then edit later" flow.
export function ChargerCreateForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<FormValues>(emptyFormValues);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { mutate: mutateCreate } = useCreate();

  // Location options for the Constellation select. Pulls the full
  // list so the operator can pick from any registered site. Same
  // pattern the Constellation edit form uses for its country /
  // city selects.
  const { query: locQuery } = useList<{ id: number | string; name?: string }>({
    resource: ResourceType.LOCATIONS,
    sorters: [{ field: 'name', order: 'asc' }],
    pagination: { currentPage: 1, pageSize: 500 },
    meta: { gqlQuery: LOCATIONS_LIST_QUERY },
  });
  const locations = (locQuery.data?.data ?? []) as Array<{
    id: number | string;
    name?: string;
  }>;
  const locationOptions = useMemo(
    () =>
      locations
        .filter((l) => l.id != null && (l.name ?? '').trim().length > 0)
        .map((l) => ({ value: String(l.id), label: l.name as string })),
    [locations],
  );

  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = {
      ocppConnectionName: values.ocppConnectionName.trim(),
      displayName: values.displayName.trim(),
    };
    if (!trimmed.ocppConnectionName) {
      setError('OCPP identifier is required.');
      return;
    }
    if (trimmed.ocppConnectionName.length > 36) {
      setError('OCPP identifier must be 36 characters or fewer.');
      return;
    }

    // Nullable fields go out as `null` when unset so Hasura clears
    // the column rather than storing an empty string or throwing
    // on empty-enum validation.
    const payload: Record<string, unknown> = {
      ocppConnectionName: trimmed.ocppConnectionName,
      displayName: trimmed.displayName || null,
      locationId: values.locationId ? Number(values.locationId) : null,
      protocol: values.protocol || null,
      // Chargers boot offline; the OCPP handshake flips this true
      // when the physical unit connects for the first time.
      isOnline: false,
    };

    setIsSaving(true);
    mutateCreate(
      {
        resource: ResourceType.CHARGING_STATIONS,
        values: payload,
        meta: { gqlMutation: CHARGING_STATIONS_CREATE_MUTATION },
        successNotification: {
          message: 'Charger created.',
          type: 'success',
        },
      },
      {
        onSuccess: () => {
          setIsSaving(false);
          onSaved();
        },
        onError: (e) => {
          setIsSaving(false);
          setError(
            (e as { message?: string })?.message ?? 'Failed to create charger.',
          );
        },
      },
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-h-0 flex-1 flex-col"
      autoComplete="off"
    >
      <div className="border-b border-border/40 px-6 py-5">
        <div className="text-lg font-semibold">New charger</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <Section>
          {/* OCPP identifier — the primary technical id. Required.
              Non-standard `name` attribute defeats Chrome's contact
              autofill. */}
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] font-medium text-foreground/70">
              OCPP identifier
              <span className="ml-0.5 text-[#c94a3a]">*</span>
            </span>
            <input
              type="text"
              value={values.ocppConnectionName}
              onChange={(e) => set('ocppConnectionName', e.target.value)}
              placeholder="e.g. ocm-273983"
              maxLength={36}
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              name="charger-ocpp-id"
              className="rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
            <span className="text-[10px] text-foreground/50">
              The string the physical charger sends to the CSMS on connect.
              Must be unique across your fleet.
            </span>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] font-medium text-foreground/70">
              Unit name
            </span>
            <input
              type="text"
              value={values.displayName}
              onChange={(e) => set('displayName', e.target.value)}
              placeholder="e.g. Bay 1, Front lot fast"
              maxLength={80}
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              name="charger-display-name"
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
            <span className="text-[10px] text-foreground/50">
              Optional. Falls back to "{'{Constellation}'} · #N" in the
              list.
            </span>
          </label>

          <SelectField
            label="Constellation"
            value={values.locationId}
            onChange={(v) => set('locationId', v)}
            options={locationOptions}
            placeholder={
              locQuery.isLoading ? 'Loading sites…' : 'Unassigned'
            }
          />

          <SelectField
            label="Protocol"
            value={values.protocol}
            onChange={(v) => set('protocol', v)}
            options={PROTOCOL_OPTIONS}
            placeholder="Unknown"
          />
        </Section>

        {error ? (
          <div className="rounded-md border border-[#c94a3a]/30 bg-[#c94a3a]/5 px-3 py-2 text-xs text-[#c94a3a]">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/40 px-6 py-3">
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
          Create charger
        </Button>
      </div>
    </form>
  );
}

// ─── Form state ─────────────────────────────────────────────────────

type FormValues = {
  ocppConnectionName: string;
  displayName: string;
  locationId: string;
  protocol: string;
};

function emptyFormValues(): FormValues {
  return {
    ocppConnectionName: '',
    displayName: '',
    locationId: '',
    protocol: '',
  };
}

const PROTOCOL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'OCPP16', label: 'OCPP 1.6' },
  { value: 'OCPP201', label: 'OCPP 2.0.1' },
];

// ─── Section wrapper ────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

// ─── Select field ───────────────────────────────────────────────────

const CLEAR = '__clear__';

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
    <label className="flex flex-col gap-1">
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
    </label>
  );
}
