// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import {
  type AuthorizationDto,
  AuthorizationProps,
  AuthorizationSchema,
  AuthorizationWhitelistEnum,
  OCPP2_0_1,
} from '@citrineos/base';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from '@lib/client/components/form';
import {
  CheckboxFormField,
  ComboboxFormField,
  FormField,
  nestedFormRowFlex,
} from '@lib/client/components/form/field';
import { Input } from '@lib/client/components/ui/input';
import { AuthorizationClass } from '@lib/cls/authorization.dto';
import {
  AUTHORIZATIONS_CREATE_MUTATION,
  AUTHORIZATIONS_EDIT_MUTATION,
  AUTHORIZATIONS_PICKER_QUERY,
  AUTHORIZATIONS_SHOW_QUERY,
} from '@lib/queries/authorizations';
import { ActionType, ResourceType } from '@lib/utils/access.types';
import { getSerializedValues } from '@lib/utils/middleware';
import { CanAccess, type GetOneResponse, useList, useTranslate } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import z from 'zod';
import { AccessDeniedFallback } from '@lib/utils/AccessDeniedFallback';
import React, { useState } from 'react';
import { Controller, useFieldArray, useWatch } from 'react-hook-form';
import { Field, FieldLabel } from '@lib/client/components/ui/field';
import { Calendar } from '@lib/client/components/ui/calendar';
import { Switch } from '@lib/client/components/ui/switch';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lib/client/components/ui/select';
import { cn } from '@lib/utils/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@lib/client/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@lib/client/components/ui/command';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Clock,
  HardDrive,
  HelpCircle,
  IdCard,
  Loader2,
  Plus,
  PlugZap,
  Smartphone,
  Wifi,
  WifiOff,
  X as XIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTokenUniqueness } from '@lib/client/hooks/use.token.uniqueness';
import type { LucideIcon } from 'lucide-react';
import { RemoveArrayItemButton } from '@lib/client/components/form/remove-array-item-button';
import { Card, CardContent, CardHeader } from '@lib/client/components/ui/card';
import { heading2Style, pageMargin } from '@lib/client/styles/page';
import { cardHeaderFlex } from '@lib/client/styles/card';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTenantId } from '@lib/client/hooks/useTenantId';

type AuthorizationUpsertProps = {
  params: { id?: string };
  /// 'page' (default) wraps the form in a full page Card with a
  /// back-chevron header and redirects to the list on save.
  /// 'modal' strips the wrapping Card + header (the modal chrome
  /// supplies those), suppresses the auto-redirect, and calls
  /// `onSaved` when the mutation lands so the modal can close.
  mode?: 'page' | 'modal';
  /// Called after a successful save when mode='modal'. Ignored in
  /// page mode (Refine's `redirect: 'list'` handles that path).
  onSaved?: () => void;
  /// Called when the operator cancels in modal mode.
  onCancel?: () => void;
  /// Called when the operator clicks the top-right close button
  /// (rendered inline with the stepper in modal mode). Distinct
  /// from `onCancel` conceptually (dismiss vs. cancel-and-discard),
  /// even though they usually resolve to the same behavior.
  onClose?: () => void;
};

// Defense-in-depth character rules. Server-side `AuthorizationSchema`
// in packages/base only requires `z.string()` for idToken and the
// language / URL fields — no length or character-set constraint.
// GraphQL / Sequelize parameterisation blocks SQL injection through
// this input regardless, but there's still value in refusing malformed
// data at the client (uglier logs, downstream integration surprises,
// bypass paths through direct API access still get caught if this
// same schema is later reused server-side).

/// Printable-ASCII, alphanumeric + safe punctuation. Covers RFID
/// hex UIDs (`04A1B2C3D4`), colon-delimited MACs (`04:A1:B2:C3`),
/// UUIDs, eMAID format (`DE-8AA-1234567-8`), and our own vSparQ
/// tokens (`v-6b9302e90bf2`). Rejects newlines, tabs, control
/// chars, non-ASCII, and anything else with meaning in a shell /
/// log / URL context.
const ID_TOKEN_ALLOWED = /^[A-Za-z0-9._:@\-]+$/;

/// Loose RFC 5646 pattern — primary language tag optionally with
/// subtags. Restricts to letters/digits/hyphen up to 12 chars total
/// so someone can't stuff a novel into the language field.
const LANGUAGE_TAG_ALLOWED = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

const AuthorizationCreateSchema = AuthorizationSchema.pick({
  [AuthorizationProps.idToken]: true,
  [AuthorizationProps.idTokenType]: true,
  [AuthorizationProps.status]: true,
  [AuthorizationProps.cacheExpiryDateTime]: true,
  [AuthorizationProps.language1]: true,
  [AuthorizationProps.language2]: true,
  [AuthorizationProps.personalMessage]: true,
  [AuthorizationProps.disallowedEvseIdPrefixes]: true,
  [AuthorizationProps.realTimeAuth]: true,
  [AuthorizationProps.realTimeAuthUrl]: true,
  [AuthorizationProps.concurrentTransaction]: true,
}).extend({
  // Defense-in-depth: OCPP 2.0.1 caps idToken at 36 chars and
  // restricts to printable ASCII. Enforcing here on the client
  // ensures even an operator with clipboard garbage in it can't
  // create a corrupted record.
  [AuthorizationProps.idToken]: z
    .string()
    .min(1, 'ID Token is required.')
    .max(36, 'ID Token must be 36 characters or fewer.')
    .regex(
      ID_TOKEN_ALLOWED,
      'Only letters, digits, and . _ : @ - are allowed.',
    ),
  [AuthorizationProps.language1]: z
    .string()
    .max(12)
    .regex(LANGUAGE_TAG_ALLOWED, 'Use an RFC 5646 language tag (e.g., en, en-US).')
    .nullable()
    .optional()
    .or(z.literal('')),
  [AuthorizationProps.language2]: z
    .string()
    .max(12)
    .regex(LANGUAGE_TAG_ALLOWED, 'Use an RFC 5646 language tag (e.g., en, en-US).')
    .nullable()
    .optional()
    .or(z.literal('')),
  [AuthorizationProps.personalMessage]: z
    .string()
    .max(500, 'Personal message must be 500 characters or fewer.')
    .nullable()
    .optional(),
  [AuthorizationProps.realTimeAuthUrl]: z
    .string()
    .url('Enter a valid https:// URL.')
    .nullable()
    .optional()
    .or(z.literal('')),
  // Override the base schema's `cacheExpiryDateTime`. The picked
  // definition is a strict `z.string().datetime()` which rejects
  // null AND empty string. Loaded rows very often carry null (no
  // expiry set), so relax: nullable, and accept the empty string
  // that reset produces. We don't re-enforce datetime format
  // because the inline Calendar always emits `.toISOString()`.
  [AuthorizationProps.cacheExpiryDateTime]: z
    .string()
    .nullable()
    .or(z.literal(''))
    .or(z.undefined()),
  [AuthorizationProps.allowedConnectorTypes]: z.string().nullable().optional(),
  [AuthorizationProps.disallowedEvseIdPrefixes]: z.string().nullable().optional(),
  [AuthorizationProps.groupAuthorizationId]: z.coerce.number<number>().nullable().optional(),
  [AuthorizationProps.chargingPriority]: z.coerce.number<number>().nullable().optional(),
  [AuthorizationProps.additionalInfo]: z
    .array(z.object({ additionalIdToken: z.string(), type: z.string() }))
    .nullable()
    .optional(),
  realTimeAuthTimeout: z.coerce.number<number>().nullable().optional(),
});

const defaultValues = {
  [AuthorizationProps.idToken]: '',
  [AuthorizationProps.idTokenType]: OCPP2_0_1.IdTokenEnumType.Central,
  [AuthorizationProps.status]: OCPP2_0_1.AuthorizationStatusEnumType.Unknown,
  [AuthorizationProps.cacheExpiryDateTime]: undefined,
  [AuthorizationProps.chargingPriority]: undefined,
  [AuthorizationProps.language1]: '',
  [AuthorizationProps.language2]: '',
  [AuthorizationProps.personalMessage]: '',
  [AuthorizationProps.groupAuthorizationId]: undefined,
  [AuthorizationProps.allowedConnectorTypes]: '',
  [AuthorizationProps.disallowedEvseIdPrefixes]: '',
  [AuthorizationProps.realTimeAuth]: undefined,
  [AuthorizationProps.realTimeAuthUrl]: '',
  [AuthorizationProps.realTimeAuthTimeout]: undefined,
  [AuthorizationProps.additionalInfo]: [],
  [AuthorizationProps.concurrentTransaction]: false,
};

export type AuthorizationCreateDto = z.infer<typeof AuthorizationCreateSchema>;

// idTokenTypes no longer surfaced as a combobox — the curated
// button group `TokenTypeButtons` below owns the visible options.
const authorizationStatuses = Object.keys(OCPP2_0_1.AuthorizationStatusEnumType);
const authorizationWhitelistOptions = Object.keys(AuthorizationWhitelistEnum);

export const AuthorizationUpsert = ({
  params,
  mode = 'page',
  onSaved,
  onCancel,
  onClose,
}: AuthorizationUpsertProps) => {
  const { id } = params;
  const { back } = useRouter();
  const translate = useTranslate();

  const tenantId = useTenantId();

  const form = useForm({
    refineCoreProps: {
      resource: ResourceType.AUTHORIZATIONS,
      // Passing `id` explicitly is required in modal mode: Refine's
      // useForm defaults to reading id from the current URL, and
      // when the modal opens over the list page the URL has no id,
      // so the initial data query never fires and the form stays
      // on its empty defaults. Passing this on page mode too is
      // harmless (matches what Refine would derive from the URL).
      id: id,
      // In modal mode the parent controls what happens after save
      // (close modal + refresh detail); Refine's built-in redirect
      // would fight that navigation.
      redirect: mode === 'modal' ? false : 'list',
      onMutationSuccess:
        mode === 'modal'
          ? () => {
              setMutationError(null);
              onSaved?.();
            }
          : undefined,
      onMutationError: (err: any) => {
        // Surface Hasura / API errors inside the review so the
        // operator can Back to Edit and try again. Never auto-close.
        // eslint-disable-next-line no-console
        console.error('[Authorization Save] mutation failed', err);
        const msg =
          err?.response?.errors?.[0]?.message ||
          err?.message ||
          'Save failed. Please try again.';
        setMutationError(String(msg));
        toast.error(`Save failed: ${msg}`);
      },
      queryOptions: {
        enabled: !!id,
        select: (data: GetOneResponse<AuthorizationDto>) => {
          // Convert arrays to comma-separated strings for form display
          const formData = {
            ...data.data,
            allowedConnectorTypes: data.data?.allowedConnectorTypes?.join?.(', '),
            disallowedEvseIdPrefixes: data.data?.disallowedEvseIdPrefixes?.join?.(', '),
            realTimeAuthUrl: data.data?.realTimeAuthUrl ?? '',
          };
          return { ...data, data: formData };
        },
      },
      mutationMode: 'pessimistic',
      action: id ? 'edit' : 'create',
      // Live subscription requires `params.id`; it warns loudly in
      // create mode (no id yet) and in the modal edit flow where
      // the operator is actively editing anyway. Turn off — the
      // detail modal below re-fetches on close via Refine's cache
      // invalidation from the save mutation.
      liveMode: mode === 'modal' ? 'off' : 'auto',
      meta: {
        gqlQuery: AUTHORIZATIONS_SHOW_QUERY,
        gqlMutation: id ? AUTHORIZATIONS_EDIT_MUTATION : AUTHORIZATIONS_CREATE_MUTATION,
      },
    },
    defaultValues: { ...defaultValues },
    resolver: zodResolver(AuthorizationCreateSchema),
    warnWhenUnsavedChanges: true,
  });

  const {
    fields: additionalInfoFields,
    append: appendAdditionalInfo,
    remove: removeAdditionalInfo,
  } = useFieldArray({
    control: form.control,
    name: AuthorizationProps.additionalInfo as 'additionalInfo',
  });

  const handleOnFinish = async (values: AuthorizationCreateDto) => {
    // eslint-disable-next-line no-console
    console.log('[Auth handleOnFinish]', {
      isModal,
      reviewing,
      hasId: Boolean(id),
    });
    // Review-first gate: in modal mode, the FIRST submit (from
    // the Review button OR an Enter-key press in any field) just
    // flips to the review screen. The actual mutation only fires
    // when the operator clicks Confirm & Save while already in
    // review mode. Without this gate, hitting Enter mid-form
    // would silently persist changes with no confirmation.
    if (isModal && !reviewing) {
      // eslint-disable-next-line no-console
      console.log('[Auth handleOnFinish] → gated to Review');
      setReviewing(true);
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[Auth handleOnFinish] → running mutation');

    const now = new Date().toISOString();
    const newItem: any = getSerializedValues(values, AuthorizationClass);

    // Trim whitespace from string fields
    const stringFields = [
      'idToken',
      'language1',
      'language2',
      'personalMessage',
      'realTimeAuthUrl',
    ];
    for (const field of stringFields) {
      if (typeof newItem[field] === 'string') {
        newItem[field] = newItem[field].trim();
      }
    }

    // Convert comma-separated strings back to arrays, set to undefined if empty
    if (typeof newItem.allowedConnectorTypes === 'string') {
      const arr = newItem.allowedConnectorTypes
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      newItem.allowedConnectorTypes = arr.length > 0 ? arr : undefined;
    }
    if (typeof newItem.disallowedEvseIdPrefixes === 'string') {
      const arr = newItem.disallowedEvseIdPrefixes
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      newItem.disallowedEvseIdPrefixes = arr.length > 0 ? arr : undefined;
    }

    // Convert empty strings to undefined
    const optionalStringFields = ['language1', 'language2', 'personalMessage', 'realTimeAuthUrl'];
    for (const field of optionalStringFields) {
      if (newItem[field] === '') {
        newItem[field] = undefined;
      }
    }

    if (!newItem.additionalInfo || newItem.additionalInfo.length === 0) {
      newItem.additionalInfo = null;
    }

    if (!id) {
      newItem.tenantId = tenantId;
      newItem.createdAt = now;
    }
    newItem.updatedAt = now;

    form.refineCore.onFinish?.(newItem);
  };

  // In modal mode the form body renders bare (no Card / no header /
  // no page margin) so the modal chrome owns the presentation. The
  // `data-detail-mode="modal"` wrapper picks up the existing scoped
  // CSS (small-caps labels, no card tiles, etc.) added earlier for
  // the detail modals.
  const isModal = mode === 'modal';

  // Wizard state — only used in modal mode. Page mode renders all
  // sections stacked as before; modal mode walks through one at a
  // time with Prev/Next + a clickable stepper.
  const [step, setStep] = useState(0);

  // Review-before-save intercept. On the last step, "Save" first
  // flips this to true, which swaps the section render for a
  // ReviewSummary. Only the ReviewSummary's "Confirm & Save"
  // button actually submits the form. "Back" returns to editing
  // without touching any values.
  const [reviewing, setReviewing] = useState(false);
  // Server-side mutation error (network / Hasura / RLS reject).
  // Kept separate from react-hook-form's `formState.errors` because
  // those are strictly client-side Zod failures. Displayed inside
  // the ReviewSummary so the operator can Back to Edit without
  // dismissing anything.
  const [mutationError, setMutationError] = useState<string | null>(null);

  // "Advanced" toggle for the Status field. Lifted from the LHS
  // StatusButtons component so it can live in the RHS help panel
  // (Status & Lifecycle step) instead of cluttering the label row
  // above the buttons. Watch the current status so we auto-flip
  // into advanced mode when the loaded DB value is an OCPP edge
  // case the four buttons can't represent.
  const currentStatusValue = useWatch({
    control: form.control,
    name: AuthorizationProps.status as any,
  }) as unknown as string | null | undefined;
  const isStatusEdgeCase =
    currentStatusValue != null &&
    currentStatusValue !== '' &&
    !SIMPLE_STATUS_VALUES.has(String(currentStatusValue));
  const [statusAdvanced, setStatusAdvanced] = useState(isStatusEdgeCase);
  React.useEffect(() => {
    if (isStatusEdgeCase) setStatusAdvanced(true);
  }, [isStatusEdgeCase]);

  // Section definitions — the SAME array drives both modes so
  // there's exactly one place to edit the field grouping. In modal
  // mode the stepper indexes into this and the RHS `help` panel
  // renders alongside; in page mode we render all entries stacked
  // without the help copy.
  const sections: Array<{
    id: string;
    title: string;
    render: () => React.ReactNode;
    help: React.ReactNode;
    /// Optional element rendered to the right of the section
    /// title in the wizard chrome. Used by the Additional Info
    /// step to surface a "+" icon button so operators can add a
    /// row without a bulky standalone button in the section body.
    titleAction?: React.ReactNode;
  }> = [
    {
      id: 'identity',
      title: 'Identity',
      render: () => (
        <IdentitySection
          control={form.control}
          translate={translate}
          currentId={id}
        />
      ),
      help: (
        <>
          <HelpLead>Who is this token, and how did the driver present it?</HelpLead>
          <HelpItem term="ID Token">
            The literal string the charger reports when the driver presents
            credentials. For app-triggered sessions this is auto-generated;
            for RFID cards it's the UID printed or programmed on the card.
          </HelpItem>
          <HelpItem term="Type">
            How the driver identified themselves. Only the four types actually
            used in the fleet are exposed: <em>App / Remote</em>,
            <em> RFID Card</em>, <em>Plug &amp; Charge</em>, <em>Local</em>.
          </HelpItem>
          <HelpItem term="Group">
            Points to a parent token this record inherits from
            (concurrent limits, blocks, priority). Only visible for RFID
            and Local types — grouping doesn't apply to app-triggered
            or Plug &amp; Charge tokens.
          </HelpItem>
        </>
      ),
    },
    {
      id: 'status',
      title: 'Status & lifecycle',
      render: () => (
        <div className="flex h-full min-h-0 flex-col gap-4">
          {/* Status circle-buttons on the LHS + Concurrent
              checkbox on the RHS; calendar inline below for
              cache expiry so the operator can pick a date
              without popping a dropdown. The buttons cover the
              four everyday statuses (Accepted / Blocked /
              Expired / Unknown); edge-case OCPP statuses
              (Invalid, ConcurrentTx, etc.) are still valid on
              the wire but not exposed here — the button group
              won't display them as selected. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <StatusButtons
              control={form.control}
              name={AuthorizationProps.status}
              label={translate('Authorizations.fields.status')}
              advanced={statusAdvanced}
            />
            <div className="flex items-end">
              <CheckboxFormField
                control={form.control}
                label={translate('Authorizations.fields.concurrentTransaction')}
                name={AuthorizationProps.concurrentTransaction}
              />
            </div>
          </div>
          <Controller
            control={form.control}
            name={AuthorizationProps.cacheExpiryDateTime as any}
            render={({ field }) => {
              // Value on the wire is an ISO string (or nullish).
              // Convert to Date for the calendar and back to ISO
              // when the operator picks a new value.
              const currentDate =
                field.value && typeof field.value === 'string'
                  ? new Date(field.value)
                  : field.value instanceof Date
                    ? field.value
                    : undefined;
              // Break the current time into 12-hour parts for the
              // three inline selects. Default to 12:00 AM when
              // nothing's picked yet.
              const rawHour24 = currentDate ? currentDate.getHours() : 0;
              const rawMinute = currentDate ? currentDate.getMinutes() : 0;
              const period: 'AM' | 'PM' = rawHour24 >= 12 ? 'PM' : 'AM';
              const hour12 = ((rawHour24 + 11) % 12) + 1; // 1-12
              const handleDayPick = (d: Date | undefined) => {
                if (!d) {
                  field.onChange(null);
                  return;
                }
                // Keep the previously-picked time when only the
                // day changes.
                const base = currentDate ?? new Date();
                const composed = new Date(d);
                composed.setHours(base.getHours());
                composed.setMinutes(base.getMinutes());
                composed.setSeconds(0);
                field.onChange(composed.toISOString());
              };
              /// Compose a new ISO string from (hour12, minute, period).
              /// Uses the existing date-part or "now" if none exists yet.
              const commitTime = (
                h12: number,
                m: number,
                p: 'AM' | 'PM',
              ) => {
                const base = currentDate ?? new Date();
                const composed = new Date(base);
                const hour24 =
                  p === 'AM'
                    ? h12 === 12
                      ? 0
                      : h12
                    : h12 === 12
                      ? 12
                      : h12 + 12;
                composed.setHours(hour24);
                composed.setMinutes(m);
                composed.setSeconds(0);
                field.onChange(composed.toISOString());
              };
              return (
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                  <div className="flex shrink-0 items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/60">
                      {translate('Authorizations.fields.cacheExpiryDateTime')}
                    </span>
                    {currentDate ? (
                      <button
                        type="button"
                        onClick={() => field.onChange(null)}
                        className="cursor-pointer text-[10px] font-medium uppercase tracking-widest text-foreground/50 hover:text-[#c94a3a]"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  {/* Calendar on the LHS, time picker + human
                      readout on the RHS. Calendar autosizes to
                      its natural width; the right column takes
                      whatever's left. Borderless — the calendar
                      sits directly on the modal surface.

                      `fixedWeeks` forces react-day-picker to
                      render 6 rows every month, so the calendar
                      is always the same physical height. That
                      means (a) 6-week months no longer push the
                      wizard footer, and (b) the RHS column,
                      which stretches to the calendar's height by
                      default, lines up exactly — its
                      `justify-between` lands the Expires readout
                      right at the calendar's baseline instead of
                      floating below the last visible row.

                      No `flex-1` on the row — it auto-sizes to
                      the calendar's intrinsic 6-row height so RHS
                      stretches to exactly that, not to whatever
                      leftover space the section had. Any unused
                      space in the section falls below the row
                      and stays invisible. */}
                  <div className="flex gap-3">
                    {/* Explicit width on the calendar wrapper —
                        without this, its week rows (flex w-full)
                        expand to fill the LHS column, cells
                        (aspect-square) balloon to ~80px each and
                        the calendar's total height blows past the
                        HelpPanel envelope, pushing the wizard
                        footer off the modal. 280px width keeps
                        cells at 40px, calendar at ~330px total. */}
                    <div className="w-[280px] shrink-0">
                      <Calendar
                        mode="single"
                        selected={currentDate}
                        onSelect={handleDayPick}
                        required={false}
                        fixedWeeks
                        showOutsideDays={false}
                        className="p-0"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 border-l border-border/40 pl-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-widest text-foreground/60">
                          Time
                        </label>
                        {/* Custom time picker — three inline
                            shadcn Selects (Hour / Minute / AM-PM).
                            Replaces the native `<input type="time">`
                            so the popover is styleable (browser
                            popup is chrome we can't restyle). All
                            three write back through a single
                            `commitTime` composer. */}
                        <div className="flex items-center gap-1.5">
                          <Select
                            value={String(hour12)}
                            onValueChange={(v) =>
                              commitTime(Number(v), rawMinute, period)
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              className="h-8 min-w-[58px] font-mono tabular-nums text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[220px]">
                              {Array.from({ length: 12 }, (_, i) => i + 1).map(
                                (h) => (
                                  <SelectItem
                                    key={h}
                                    value={String(h)}
                                    className="font-mono tabular-nums text-xs"
                                  >
                                    {String(h).padStart(2, '0')}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-foreground/40">:</span>
                          <Select
                            value={String(rawMinute)}
                            onValueChange={(v) =>
                              commitTime(hour12, Number(v), period)
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              className="h-8 min-w-[58px] font-mono tabular-nums text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[220px]">
                              {Array.from({ length: 60 }, (_, i) => i).map(
                                (m) => (
                                  <SelectItem
                                    key={m}
                                    value={String(m)}
                                    className="font-mono tabular-nums text-xs"
                                  >
                                    {String(m).padStart(2, '0')}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                          <Select
                            value={period}
                            onValueChange={(v) =>
                              commitTime(hour12, rawMinute, v as 'AM' | 'PM')
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              className="h-8 min-w-[58px] text-xs uppercase tracking-widest"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem
                                value="AM"
                                className="text-xs uppercase tracking-widest"
                              >
                                AM
                              </SelectItem>
                              <SelectItem
                                value="PM"
                                className="text-xs uppercase tracking-widest"
                              >
                                PM
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {currentDate ? (
                        // Border-only pill with a soft warm glow.
                        // `expires-glow` breathes the glow so it
                        // feels alive. Extra top/left/bottom
                        // margin so the halo has room to bloom
                        // without being clipped by the section's
                        // `overflow-hidden` motion.div or the RHS
                        // `border-l` divider.
                        <div
                          className="expires-glow mt-2 ml-2 mb-2 flex w-max max-w-full items-center gap-1.5 self-start whitespace-nowrap rounded-full border border-foreground/40 bg-transparent px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-foreground/70"
                        >
                          <span className="text-foreground/50">Expires on</span>
                          <span className="text-foreground">
                            {currentDate.toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          <span className="text-foreground/50">@</span>
                          <span className="font-mono tabular-nums text-foreground">
                            {currentDate.toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-foreground/40">
                          Pick a day to set an expiry.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
          />
        </div>
      ),
      help: (
        <>
          <HelpLead>Is this token allowed to start sessions right now?</HelpLead>
          <HelpItem term="Status">
            <em>Accepted</em> = go. <em>Blocked</em> = deny (deliberate).
            <em> Expired</em> / <em>Invalid</em> = out of validity window.
            <em> Unknown</em> = never seen. Everything else is edge cases
            from the OCPP spec.
          </HelpItem>
          <HelpItem term="Cache expires">
            When the charger should stop trusting its cached copy of this
            authorization and re-check with the CSMS. Leave blank for no
            expiry.
          </HelpItem>
          <HelpItem term="Concurrent">
            Off = one active session at a time. On = multiple concurrent
            sessions allowed (useful for a shared fleet card).
          </HelpItem>
          {/* Advanced toggle sits at the bottom-left of the help
              panel. `mt-auto` pushes it to the panel's floor
              regardless of how much help copy is above; when the
              current status is an OCPP edge case the switch is
              locked ON since we can't collapse back to the four
              buttons without losing that value. */}
          <div className="mt-auto flex items-center gap-2 pt-3">
            <Switch
              id="status-advanced"
              checked={statusAdvanced}
              onCheckedChange={setStatusAdvanced}
              disabled={isStatusEdgeCase}
            />
            <label
              htmlFor="status-advanced"
              className={cn(
                'text-[10px] font-medium uppercase tracking-widest text-foreground/60',
                isStatusEdgeCase ? 'cursor-not-allowed' : 'cursor-pointer',
              )}
              title={
                isStatusEdgeCase
                  ? 'Current value is an OCPP edge case; only the dropdown can represent it.'
                  : 'Show every OCPP status, including edge cases.'
              }
            >
              Advanced
            </label>
          </div>
        </>
      ),
    },
    {
      id: 'charging',
      title: 'Charging rules',
      render: () => (
        <div className="flex flex-col gap-5">
          {/* Priority takes the full row via a custom stylized
              slider (0-9 discrete). Sits ABOVE the field grid so
              the two remaining text inputs can stretch to a
              wider 2-col layout below. */}
          <PrioritySlider
            control={form.control}
            name={AuthorizationProps.chargingPriority}
            label={translate('Authorizations.fields.chargingPriority')}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              label={translate('Authorizations.fields.allowedConnectorTypes')}
              name="allowedConnectorTypes"
            >
              <Input
                placeholder={translate(
                  'Authorizations.placeholders.allowedConnectorTypes',
                )}
              />
            </FormField>
            <FormField
              control={form.control}
              label={translate('Authorizations.fields.disallowedEvseIdPrefixes')}
              name="disallowedEvseIdPrefixes"
            >
              <Input
                placeholder={translate(
                  'Authorizations.placeholders.disallowedEvseIdPrefixes',
                )}
              />
            </FormField>
          </div>
        </div>
      ),
      help: (
        <>
          <HelpLead>What can this token charge, and how does it rank?</HelpLead>
          <HelpItem term="Priority">
            0–9 integer. Higher gets priority when load management or
            smart-charging kicks in and has to shed. Leave blank for the
            default (0).
          </HelpItem>
          <HelpItem term="Allowed connector types">
            Whitelist of connector types this token may use. Comma-separated
            (<em>Type2, CCS</em>). Blank = no restriction.
          </HelpItem>
          <HelpItem term="Disallowed EVSE prefixes">
            Blacklist. Session denied if the EVSE ID starts with any listed
            prefix. Useful for regional restrictions
            (<em>NL-*, DE-*</em>) or barring a specific site.
          </HelpItem>
        </>
      ),
    },
    {
      id: 'rta',
      title: 'Real-time authentication',
      render: () => (
        // Labels shortened to "Mode / URL / Timeout" — the section
        // title above already carries the "Real-time
        // authentication" context, so repeating it on every field
        // was forcing wraps to a second line and mis-aligning the
        // inputs. `items-end` keeps the inputs bottom-aligned as
        // a fail-safe if a translation grows to two lines again.
        // Wrapper caps at 96% and centers so the trio doesn't
        // sprawl across the whole LHS.
        <div className="mx-auto grid w-[96%] grid-cols-1 items-end gap-3 sm:grid-cols-3">
          <RtaModeButtons
            control={form.control}
            name={AuthorizationProps.realTimeAuth}
            label="Mode"
          />
          <FormField
            control={form.control}
            label="URL"
            name={AuthorizationProps.realTimeAuthUrl}
          >
            <Input type="url" />
          </FormField>
          <FormField
            control={form.control}
            label="Timeout (s)"
            name="realTimeAuthTimeout"
          >
            <Input type="number" min="0" />
          </FormField>
        </div>
      ),
      help: (
        <>
          <HelpLead>
            When should the CSMS phone home to an external service to
            approve the session?
          </HelpLead>
          <HelpItem term="Mode">
            Choose how strict the CSMS should be about calling out for a
            fresh authorization decision. Default is fine for most fleet
            cards; enterprise deployments with external identity systems
            override this.
          </HelpItem>
          <HelpItem term="URL">
            HTTPS endpoint that returns Accept / Deny for this token. Only
            called when the mode is set to invoke it.
          </HelpItem>
          <HelpItem term="Timeout">
            Max seconds to wait for the RTA response. If the endpoint is
            slow or down, the session is rejected past this window.
          </HelpItem>
        </>
      ),
    },
    {
      id: 'preferences',
      title: 'Driver preferences',
      render: () => (
        <FieldGrid>
          <FormField
            control={form.control}
            label={translate('Authorizations.fields.language1')}
            name={AuthorizationProps.language1}
          >
            <Input />
          </FormField>
          <FormField
            control={form.control}
            label={translate('Authorizations.fields.language2')}
            name={AuthorizationProps.language2}
          >
            <Input />
          </FormField>
          <FormField
            control={form.control}
            label={translate('Authorizations.fields.personalMessage')}
            name={AuthorizationProps.personalMessage}
          >
            <Input />
          </FormField>
        </FieldGrid>
      ),
      help: (
        <>
          <HelpLead>Presentation on the charger's screen for this driver.</HelpLead>
          <HelpItem term="Language 1 / 2">
            RFC-5646 language tags (<em>en</em>, <em>es</em>,
            <em> fr</em>) shown as the primary and fallback UI language on
            the charger. Ignored if the charger doesn't support i18n.
          </HelpItem>
          <HelpItem term="Personal message">
            A one-line greeting shown when this token starts a session
            (e.g., "Welcome back, Kyle"). Optional.
          </HelpItem>
        </>
      ),
    },
    {
      id: 'additional',
      title: 'Additional info',
      titleAction: (
        // Light grey filled circle with the "+" cut out in the
        // modal's background color — reads as a subtle "add"
        // affordance in the section header instead of a bordered
        // outline button.
        <button
          type="button"
          onClick={() =>
            appendAdditionalInfo({ additionalIdToken: '', type: '' })
          }
          aria-label="Add additional info"
          title={translate('Authorizations.fields.additionalInfo', {}, 'Add row')}
          className="flex size-6 cursor-pointer items-center justify-center rounded-full bg-foreground/15 text-background transition-colors hover:bg-foreground/25"
        >
          <Plus className="size-3.5" />
        </button>
      ),
      render: () => (
        // List claims the full height and scrolls internally
        // once row count exceeds ~3 (see `max-h-[220px]` below).
        // A muted count line sits below the scroll region so the
        // operator sees the total even when items scroll out of
        // view.
        <div className="flex h-full min-h-0 flex-col gap-2">
          {additionalInfoFields.length > 0 ? (
            // Explicit `max-h-[220px]` caps the list at roughly
            // three rows (each row ≈ 55px label+input + 16px
            // gap). Anything taller scrolls inside this container
            // regardless of what the parent chain does.
            <div className="flex max-h-[220px] min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
              {additionalInfoFields.map((field, index) => (
                <div key={field.id} className={nestedFormRowFlex}>
                  <FormField
                    control={form.control}
                    label={translate('Authorizations.fields.additionalIdToken', {
                      index: index + 1,
                    })}
                    name={`additionalInfo.${index}.additionalIdToken`}
                  >
                    <Input
                      placeholder={translate('Authorizations.placeholders.additionalInfo')}
                    />
                  </FormField>
                  <FormField
                    control={form.control}
                    label={translate('Authorizations.fields.typeNumbered', {
                      index: index + 1,
                    })}
                    name={`additionalInfo.${index}.type`}
                  >
                    <Input placeholder={translate('Authorizations.placeholders.type')} />
                  </FormField>
                  <RemoveArrayItemButton
                    onRemoveAction={() => removeAdditionalInfo(index)}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {additionalInfoFields.length > 0 ? (
            <div className="shrink-0 self-end text-[10px] font-medium uppercase tracking-widest text-foreground/50 tabular-nums">
              {additionalInfoFields.length}{' '}
              {additionalInfoFields.length === 1 ? 'item' : 'items'}
            </div>
          ) : null}
        </div>
      ),
      help: (
        <>
          <HelpLead>
            Optional secondary identifiers that travel with the primary
            token.
          </HelpLead>
          <HelpItem term="Additional info">
            Pairs of <em>{'{token, type}'}</em> attached to this
            authorization. Typical uses: a company employee ID paired to
            the primary RFID, or a legacy token that maps to a new one
            during migration.
          </HelpItem>
          <HelpItem term="When to skip">
            Most tokens don't need this. Leave empty unless you're
            explicitly integrating with an external identity system that
            needs the extra tag.
          </HelpItem>
        </>
      ),
    },
  ];

  const atFirst = step === 0;
  const atLast = step === sections.length - 1;

  const body = (
    <div
      // Equal 24px padding all sides so the wizard content has
      // consistent breathing room top / bottom / left / right —
      // previously px-6 / py-4 gave 24px horizontal and only 16px
      // vertical, which read as top-heavy. `h-full min-h-0` lets
      // this wrapper claim the modal body's flex-1 height so the
      // inner form + section content can flex properly and the
      // wizard footer stays pinned at the bottom.
      className={isModal ? 'flex h-full min-h-0 flex-col gap-5 p-6' : ''}
      data-detail-mode={mode}
    >
      {isModal ? (
        // Top row — "EDIT TOKEN" label on the left, stepper
        // absolutely centered on the row, close button on the
        // right. Replaces the previous full header block.
        <div className="relative flex shrink-0 items-center">
          <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
            Edit token
          </span>
          <div className="absolute left-1/2 -translate-x-1/2">
            <Stepper
              steps={sections.map((s) => s.title)}
              current={step}
              onSelect={setStep}
            />
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close"
              className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
      ) : null}
      <Form
        {...form}
        submitHandler={handleOnFinish}
        cancelHandler={onCancel}
        hideCancel={isModal}
        hideSubmit={isModal}
        errorHandler={(errors) => {
          // Surface silent validation failures. Without this, an
          // invalid form makes Confirm & Save look broken because
          // react-hook-form quietly refuses to submit. Log the
          // structured error map and toast the first field name
          // so the operator knows what to fix.
          // eslint-disable-next-line no-console
          console.warn('[Authorization Save] validation failed', errors);
          const firstKey = Object.keys(errors)[0];
          const anyErr = errors as any;
          const firstMsg =
            (firstKey && anyErr[firstKey]?.message) ||
            'Please review highlighted fields and try again.';
          toast.error(
            firstKey
              ? `Cannot save: "${firstKey}" — ${firstMsg}`
              : 'Cannot save — validation failed',
          );
        }}
        // In modal mode: BOTH the <form> element AND its inner
        // wrapper participate in the flex chain. Without the
        // form itself being `flex h-full min-h-0 flex-col`, the
        // inner div's `h-full` resolves to 100% of an
        // undefined-height parent (= auto), which breaks
        // `flex-1 min-h-0` downstream — the RHS help panel's
        // `min-h-[560px]` then grows the tree past the modal
        // shell, pushing the wizard footer off-screen.
        formProps={
          isModal
            ? { className: 'flex h-full min-h-0 flex-col' }
            : undefined
        }
        contentClassName={
          isModal
            ? 'flex h-full min-h-0 flex-col gap-6 w-full'
            : 'flex flex-col gap-6 w-full'
        }
      >
            {/* Section rendering: in page mode all six sections
                render stacked (one continuous scroll); in modal
                mode only the current step renders as a two-column
                layout (LHS = inputs, RHS = explanatory copy),
                driven by the stepper above. */}
            {isModal && reviewing ? (
              // Review layer replaces the wizard grid when the
              // operator clicks Save. Takes the same `min-h-0
              // flex-1` slot so the footer stays pinned. Wrapped
              // in an ErrorBoundary so a bad extractor / cast
              // shows a friendly message instead of crashing the
              // whole modal.
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ReviewErrorBoundary
                  onBack={() => setReviewing(false)}
                >
                  <ReviewSummary
                    values={form.getValues() as Record<string, any>}
                    originalData={
                      form.refineCore.query?.data?.data as
                        | AuthorizationDto
                        | undefined
                    }
                    onEditSection={(idx) => {
                      setReviewing(false);
                      setMutationError(null);
                      setStep(idx);
                    }}
                    sections={sections.map((s) => ({
                      id: s.id,
                      title: s.title,
                    }))}
                    errors={form.formState.errors as Record<string, any>}
                    mutationError={mutationError}
                  />
                </ReviewErrorBoundary>
              </div>
            ) : isModal ? (
              // Two independent AnimatePresence blocks — one per
              // column — so the LHS inputs slide in from the left
              // edge and the RHS help panel slides in from the
              // right edge. Both fade with the same 320ms /
              // decelerating cubic-bezier so they land in sync
              // even though they travel opposite directions.
              // `mode="wait"` inside each column gates the outgoing
              // content out before the incoming enters so the two
              // don't visually collide.
              // `flex-1 min-h-0` = the grid claims the remaining
              // vertical space between the stepper and the wizard
              // footer. That way every step has the SAME section
              // area height (footer stays pinned), and the LHS
              // motion.div's internal scroll region handles overflow
              // for tall steps (Additional Info with many rows).
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(220px,1fr)]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    // `h-full` claims the grid cell's stretched
                    // height (380px floor) so the inner section can
                    // flex; `overflow-hidden` prevents the whole
                    // step from growing the modal when a step
                    // exceeds the floor (e.g., Additional Info
                    // with many rows).
                    className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
                  >
                    {/* Section title removed — the active step's
                        pill in the stepper above already shows the
                        section name (e.g. "IDENTITY"). Only render
                        the row when the section has a titleAction
                        (e.g., Additional Info's "+" button) so
                        that affordance still has a home. */}
                    {sections[step].titleAction ? (
                      <div className="flex shrink-0 items-center justify-end gap-2">
                        {sections[step].titleAction}
                      </div>
                    ) : null}
                    {/* Parent region gives each section its own
                        h-full min-h-0 slot; overflow is `hidden`
                        (not `auto`) so each section renders its
                        own scroll strategy — Additional Info
                        pins its Add button and scrolls the list
                        below it, other sections just fit. */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      {sections[step].render()}
                    </div>
                  </motion.div>
                </AnimatePresence>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.aside
                    key={step}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    // `h-full` gives the HelpPanel below a target
                    // to fill — grid default is `align-items:
                    // stretch` so this cell is already 380px tall.
                    className="hidden h-full lg:block"
                  >
                    <HelpPanel>{sections[step].help}</HelpPanel>
                  </motion.aside>
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {sections.map((s) => (
                  <FormSection key={s.id} title={s.title}>
                    {s.render()}
                  </FormSection>
                ))}
              </div>
            )}
            {isModal ? (
              <WizardFooter
                atFirst={atFirst}
                atLast={atLast}
                reviewing={reviewing}
                loading={form.refineCore.formLoading}
                onPrev={() => setStep((s) => Math.max(0, s - 1))}
                onNext={() => setStep((s) => Math.min(sections.length - 1, s + 1))}
                onReview={() => {
                  // eslint-disable-next-line no-console
                  console.log('[Auth] Review button clicked → setReviewing(true)');
                  setReviewing(true);
                }}
                onEditFromReview={() => setReviewing(false)}
                onCancel={onCancel}
              />
            ) : null}
          </Form>
    </div>
  );

  return (
    <CanAccess
      resource={ResourceType.AUTHORIZATIONS}
      action={ActionType.EDIT}
      fallback={<AccessDeniedFallback />}
      params={{ id }}
    >
      {isModal ? (
        body
      ) : (
        <Card className={pageMargin}>
          <CardHeader>
            <div className={cardHeaderFlex}>
              <ChevronLeft onClick={() => back()} className="cursor-pointer" />
              <h2 className={heading2Style}>
                {translate(`actions.${id ? 'edit' : 'create'}`)}{' '}
                {translate('Authorizations.authorization')}
              </h2>
            </div>
          </CardHeader>
          <CardContent>{body}</CardContent>
        </Card>
      )}
    </CanAccess>
  );
};

// ─── Section + grid helpers ─────────────────────────────────────────

/// Section wrapper — small-caps tracked micro-label header sitting
/// above a hairline divider, then the section's fields. Matches the
/// platform's rhythm (Chargers detail page, Constellation detail).
function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
          {title}
        </span>
        <span className="h-px flex-1 bg-border/60" aria-hidden />
      </div>
      {children}
    </section>
  );
}

/// 3-column grid at wide widths, collapsing to 2 at md and 1 on
/// narrow. Matches the density of the New charger / New token
/// modals; keeps every section's field density consistent.
function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {children}
    </div>
  );
}

// ─── Help panel (modal RHS) ─────────────────────────────────────────

/// RHS help panel for the wizard. Neutral fill, comfortable padding,
/// small typography — reads as guidance, not as a form field.
///
/// `min-h-[400px]` locks the panel at the tallest step's height —
/// Status & Lifecycle, which hosts the inline calendar (280px wide,
/// 40px cells: 6 weeks + weekday + caption ≈ 300px, plus status
/// buttons row + cache-expiry label ≈ 400px total). Grid's default
/// `align-items: stretch` propagates that height to the LHS on
/// every other step, so the section content area is identical
/// across the wizard and the footer (Previous / Cancel / Next)
/// never shifts y-position. Shorter steps leave empty space below
/// their inputs; longer help copy scrolls internally via the
/// panel's own `overflow-y-auto`.
function HelpPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 overflow-y-auto rounded-lg border border-border/40 bg-foreground/[0.02] p-4">
      {children}
    </div>
  );
}

/// Lead sentence for a help panel. Slightly heavier weight so it
/// reads as the panel's "topic line."
function HelpLead({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-foreground/80">{children}</p>
  );
}

/// One field-level explanation inside a help panel. `term` is the
/// field name in small-caps tracked micro-label form; the body is
/// short prose (2–3 sentences max).
function HelpItem({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
        {term}
      </span>
      <p className="text-[11px] leading-relaxed text-foreground/70">
        {children}
      </p>
    </div>
  );
}

// ─── Token-type picker ──────────────────────────────────────────────

/// Inline availability indicator for the ID Token uniqueness check.
/// Same three-state rendering the create modal uses; kept here as a
/// separate component (rather than shared with the create form)
/// because that form's version lives inline in a slightly different
/// visual context and the copy tuning may diverge.
function TokenUniquenessIndicator({
  uniqueness,
}: {
  uniqueness: {
    state: 'idle' | 'checking' | 'available' | 'taken';
    collidingType?: string;
  };
}) {
  if (uniqueness.state === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-foreground/50">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Checking availability…
      </span>
    );
  }
  if (uniqueness.state === 'available') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[#05B084]">
        <Check className="size-3" aria-hidden />
        Available
      </span>
    );
  }
  if (uniqueness.state === 'taken') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[#c94a3a]">
        <AlertCircle className="size-3" aria-hidden />
        Token already exists
        {uniqueness.collidingType ? ` (${uniqueness.collidingType})` : ''}
      </span>
    );
  }
  return null;
}

/// Curated set of ID-token types shown as a button group instead of
/// the full OCPP `IdTokenEnumType` combobox. Only the four types
/// actually used in the vSparQ Trinidad market are exposed:
///
///   - Central   — App / remote (CSMS-triggered via vSparQ app or
///                 the ops UI). Default and by far the most common.
///   - ISO14443  — Standard fleet RFID card (MIFARE, key fob).
///   - eMAID     — Plug & Charge via ISO 15118 (rolling out later,
///                 task #33).
///   - Local     — Charger's local whitelist (offline / VIP path).
///
/// Rare / unused values (ISO15693, KeyCode, MacAddress,
/// NoAuthorization) are deliberately hidden from the UI to reduce
/// cognitive load. The DB accepts any OCPP enum value, so records
/// created via API with those types still render fine.
const TOKEN_TYPE_OPTIONS: Array<{
  value: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  /// Highlight color used when this button is the selected type.
  /// Applied to border, icon, title, and a 10% background tint.
  /// Chosen to be semantically evocative:
  ///   Central   → blue (tech/digital)
  ///   ISO14443  → brand green (most common flow)
  ///   eMAID     → amber (energy/electric)
  ///   Local     → slate purple (offline/system)
  color: string;
}> = [
  {
    value: 'Central',
    label: 'App / Remote',
    subtitle: 'CSMS-triggered start',
    icon: Smartphone,
    color: '#6e87ff',
  },
  {
    value: 'ISO14443',
    label: 'RFID Card',
    subtitle: 'ISO 14443 fleet card',
    icon: IdCard,
    color: '#05B084',
  },
  {
    value: 'eMAID',
    label: 'Plug & Charge',
    subtitle: 'ISO 15118 contract',
    icon: PlugZap,
    color: '#e07c1f',
  },
  {
    value: 'Local',
    label: 'Local',
    subtitle: 'Offline whitelist',
    icon: HardDrive,
    color: '#7c74b8',
  },
];

function TokenTypeButtons({
  control,
  name,
  label,
}: {
  control: any;
  name: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-foreground/60">
        {label}
        <span className="text-[#c94a3a]">*</span>
      </div>
      <Controller
        control={control}
        name={name as any}
        render={({ field }) => (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TOKEN_TYPE_OPTIONS.map((opt) => {
              const selected = field.value === opt.value;
              const Icon = opt.icon;
              // Selected state uses the option's brand color for
              // the border + icon + title, plus a 10% tint fill.
              // Applied via inline style because Tailwind can't
              // generate arbitrary hex-based classes at runtime.
              const selectedStyle: React.CSSProperties | undefined = selected
                ? {
                    borderColor: opt.color,
                    backgroundColor: `${opt.color}1a`, // ~10% alpha
                  }
                : undefined;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => field.onChange(opt.value)}
                  aria-pressed={selected}
                  style={selectedStyle}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-1.5 rounded-md border p-3 text-center transition-colors',
                    selected
                      ? ''
                      : 'border-border bg-background text-foreground/80 hover:border-foreground/40',
                  )}
                >
                  <Icon
                    className="size-5 transition-colors"
                    style={{
                      color: selected ? opt.color : undefined,
                    }}
                    aria-hidden
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: selected ? opt.color : undefined }}
                  >
                    {opt.label}
                  </span>
                  <span className="text-[10px] leading-tight text-foreground/50">
                    {opt.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      />
    </div>
  );
}

// ─── Status circle-buttons ──────────────────────────────────────────

/// Four everyday authorization statuses surfaced as circle buttons.
/// Values are literal OCPP 2.0.1 `AuthorizationStatusEnumType`
/// members — no string massaging on save.
///
/// Monochrome by design — selected state uses foreground fill on
/// background icon; the icon glyph carries the semantic distinction,
/// not colour. Keeps the modal's LHS visually calm alongside the
/// calendar and stepper.
const STATUS_OPTIONS: Array<{
  value: string;
  label: string;
  /// Hover-tooltip copy. Explains what the status means for
  /// real-time session authorization at the charger. Deliberately
  /// short — one clause, no jargon — so it reads at a glance.
  tooltip: string;
  icon: LucideIcon;
}> = [
  {
    value: 'Accepted',
    label: 'Accepted',
    tooltip: 'Token can start sessions right now.',
    icon: CheckCircle2,
  },
  {
    value: 'Blocked',
    label: 'Blocked',
    tooltip: 'Deliberately denied. Charger rejects on scan.',
    icon: Ban,
  },
  {
    value: 'Expired',
    label: 'Expired',
    tooltip: 'Outside its validity window. No sessions.',
    icon: Clock,
  },
  {
    value: 'Unknown',
    label: 'Unknown',
    tooltip: 'Never seen by the CSMS. Default for new tokens.',
    icon: HelpCircle,
  },
];

/// Set of values the circle-button UI can represent. Any DB value
/// outside this set is an OCPP edge case (Invalid, ConcurrentTx,
/// NoCredit, NotAtThisLocation, NotAtThisTime, etc.) and needs the
/// advanced dropdown to be seen/edited.
const SIMPLE_STATUS_VALUES = new Set(STATUS_OPTIONS.map((o) => o.value));

function StatusButtons({
  control,
  name,
  label,
  advanced,
}: {
  control: any;
  name: string;
  label: string;
  /// Whether the Advanced dropdown is active. Owned by the
  /// wizard parent so the Switch that toggles it can live in
  /// the RHS help panel; StatusButtons is purely presentational.
  advanced: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-foreground/60">
        {label}
        <span className="text-[#c94a3a]">*</span>
      </div>
      <Controller
        control={control}
        name={name as any}
        render={({ field }) =>
          advanced ? (
            // Compact shadcn Select — same primitive the Time
            // picker above uses, so the popover matches. Only ~10
            // OCPP statuses so no search needed. Combobox
            // (searchable) was replaced because its popover
            // portals outside the modal DOM and skips the
            // `[data-detail-mode='modal']` typography scope.
            <Select
              value={field.value ?? undefined}
              onValueChange={(v) => field.onChange(v)}
            >
              <SelectTrigger
                size="sm"
                className="h-8 w-[220px] text-xs"
              >
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent className="max-h-[260px]">
                {authorizationStatuses.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-start gap-3">
              {STATUS_OPTIONS.map((opt) => {
                const selected = field.value === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => field.onChange(opt.value)}
                    aria-pressed={selected}
                    // Native title tooltip — Radix Tooltip was
                    // avoided elsewhere in this modal because its
                    // focus-show behaviour fires when the Dialog
                    // auto-focuses on open, leaving the tooltip
                    // stuck open. Native `title` has a longer
                    // delay but no false-open.
                    title={`${opt.label} — ${opt.tooltip}`}
                    className="group flex cursor-pointer flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full transition-colors',
                        selected
                          ? 'bg-foreground text-background'
                          : 'bg-transparent text-foreground/60 group-hover:bg-foreground/10 group-hover:text-foreground/80',
                      )}
                    >
                      <Icon className="size-3" aria-hidden />
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-medium uppercase tracking-widest transition-colors',
                        selected ? 'text-foreground' : 'text-foreground/60',
                      )}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )
        }
      />
    </div>
  );
}

// ─── Review error boundary ──────────────────────────────────────────

/// Catches render-time crashes inside the ReviewSummary tree.
/// React error boundaries can only be class components — this is
/// the minimal viable version. Logs the error to console and
/// shows a small message with a Back button so the operator can
/// escape the crashed state without reloading the page.
class ReviewErrorBoundary extends React.Component<
  { children: React.ReactNode; onBack: () => void },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onBack: () => void }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ReviewSummary crash]', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-[11px] font-medium uppercase tracking-widest text-destructive">
            Review failed to render
          </div>
          <pre className="max-h-40 overflow-auto rounded border border-destructive/40 bg-destructive/5 p-2 text-left text-[10px] text-destructive">
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <button
            type="button"
            onClick={this.props.onBack}
            className="cursor-pointer rounded-md bg-foreground px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-background hover:bg-foreground/90"
          >
            Back to edit
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Review summary (pre-save confirmation) ─────────────────────────

/// Field spec that drives the ReviewSummary diff. `path` reads
/// from both the current form values and the original loaded
/// AuthorizationDto so the comparison is 1:1.
type ReviewField = {
  section: string;
  label: string;
  /// Extract the display value from the form / original snapshot.
  extract: (row: any) => unknown;
  /// Optional formatter for display; defaults to `formatReviewValue`.
  format?: (raw: unknown) => string;
};

/// Human-friendly formatter for review values. Falls back to
/// "—" for null/empty so the review reads as "cleared" rather
/// than blank.
function formatReviewValue(raw: unknown): string {
  if (raw == null || raw === '') return '—';
  if (typeof raw === 'boolean') return raw ? 'On' : 'Off';
  if (Array.isArray(raw)) return raw.length === 0 ? '—' : raw.join(', ');
  if (typeof raw === 'object') {
    // AdditionalInfo array items etc. — collapse count.
    return JSON.stringify(raw);
  }
  return String(raw);
}

function ReviewSummary({
  values,
  originalData,
  onEditSection,
  sections,
  errors,
  mutationError,
}: {
  /// Snapshot of the current form values. Parent calls
  /// `form.getValues()` at render time — we don't `useWatch` here
  /// because passing `control` without a `name` and letting the
  /// child subscribe to the whole form was crashing at mount.
  values: Record<string, any>;
  originalData: AuthorizationDto | undefined;
  onEditSection: (sectionIndex: number) => void;
  sections: Array<{ id: string; title: string }>;
  /// Client-side (Zod) validation errors. When populated, Confirm &
  /// Save will silently refuse — surface the failing fields inline
  /// so the operator knows what to fix.
  errors?: Record<string, any>;
  /// Server-side mutation error from the last save attempt. Reads
  /// as a distinct red banner so the operator can distinguish
  /// "your data is bad" from "the server rejected it".
  mutationError?: string | null;
}) {
  const errorEntries = errors ? Object.entries(errors) : [];

  // Field roster grouped by wizard section. Kept as a flat array
  // (with `section` marker) so we can render grouped and count
  // changes per group in one pass.
  const fields: ReviewField[] = React.useMemo(
    () => [
      // 1. Identity
      { section: 'identity', label: 'ID Token', extract: (r) => r.idToken },
      {
        section: 'identity',
        label: 'Token Type',
        extract: (r) => r.idTokenType,
      },
      {
        section: 'identity',
        label: 'Group Authorization',
        extract: (r) => r.groupAuthorizationId,
      },
      // 2. Status & lifecycle
      { section: 'status', label: 'Status', extract: (r) => r.status },
      {
        section: 'status',
        label: 'Concurrent',
        extract: (r) => r.concurrentTransaction,
      },
      {
        section: 'status',
        label: 'Cache Expiry',
        extract: (r) => r.cacheExpiryDateTime,
        format: (raw) =>
          raw ? new Date(String(raw)).toLocaleString() : '—',
      },
      // 3. Charging rules
      {
        section: 'charging',
        label: 'Priority',
        extract: (r) => r.chargingPriority,
      },
      {
        section: 'charging',
        label: 'Allowed Connectors',
        extract: (r) => r.allowedConnectorTypes,
      },
      {
        section: 'charging',
        label: 'Disallowed EVSE Prefixes',
        extract: (r) => r.disallowedEvseIdPrefixes,
      },
      // 4. Real-time auth
      {
        section: 'rta',
        label: 'Mode',
        extract: (r) => r.realTimeAuth,
      },
      {
        section: 'rta',
        label: 'URL',
        extract: (r) => r.realTimeAuthUrl,
      },
      {
        section: 'rta',
        label: 'Timeout',
        extract: (r) => r.realTimeAuthTimeout,
        format: (raw) => (raw == null || raw === '' ? '—' : `${raw}s`),
      },
      // 5. Driver preferences
      {
        section: 'preferences',
        label: 'Language 1',
        extract: (r) => r.language1,
      },
      {
        section: 'preferences',
        label: 'Language 2',
        extract: (r) => r.language2,
      },
      {
        section: 'preferences',
        label: 'Personal Message',
        // `personalMessage` may be either a plain string (form
        // state after handleOnFinish trims it) or a `{ content }`
        // object (from the OCPP-shaped original snapshot). Handle
        // both without throwing.
        extract: (r) => {
          const pm = r?.personalMessage;
          if (pm == null) return undefined;
          if (typeof pm === 'string') return pm;
          if (typeof pm === 'object') return (pm as any).content;
          return undefined;
        },
      },
      // 6. Additional info
      {
        section: 'additional',
        label: 'Additional Info',
        extract: (r) =>
          Array.isArray(r.additionalInfo)
            ? r.additionalInfo.length
            : 0,
        format: (raw) => `${raw} item${Number(raw) === 1 ? '' : 's'}`,
      },
    ],
    [],
  );

  // Normalize for comparison: `null`, `undefined`, and `''` are
  // all "empty" and should compare equal. Arrays compare by
  // stringified content since form arrays may be comma-strings
  // and original arrays are true arrays.
  const equal = (a: unknown, b: unknown) => {
    const na = a == null || a === '' ? null : a;
    const nb = b == null || b === '' ? null : b;
    if (na == null && nb == null) return true;
    if (na == null || nb == null) return false;
    if (Array.isArray(na) || Array.isArray(nb)) {
      const sa = Array.isArray(na) ? na.join(',') : String(na);
      const sb = Array.isArray(nb) ? nb.join(',') : String(nb);
      return sa === sb;
    }
    if (typeof na === 'object' || typeof nb === 'object') {
      return JSON.stringify(na) === JSON.stringify(nb);
    }
    return String(na) === String(nb);
  };

  const safeExtract = (fn: (r: any) => unknown, row: any) => {
    try {
      return fn(row);
    } catch {
      return undefined;
    }
  };
  const rows = fields.map((f) => {
    const nextRaw = safeExtract(f.extract, values ?? {});
    const prevRaw = originalData
      ? safeExtract(f.extract, originalData)
      : undefined;
    const changed = originalData ? !equal(prevRaw, nextRaw) : true;
    const fmt = f.format ?? formatReviewValue;
    return {
      ...f,
      next: fmt(nextRaw),
      prev: fmt(prevRaw),
      changed,
    };
  });
  const totalChanges = rows.filter((r) => r.changed).length;

  // Group into sections and compute per-section change counts so
  // the operator can jump straight back to the section with the
  // most edits.
  const grouped = sections.map((s, idx) => ({
    idx,
    id: s.id,
    title: s.title,
    rows: rows.filter((r) => r.section === s.id),
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-baseline justify-between gap-3">
        <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/60">
          Review changes
        </div>
        <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
          {totalChanges === 0
            ? 'No changes'
            : `${totalChanges} change${totalChanges === 1 ? '' : 's'}`}
        </div>
      </div>
      {mutationError ? (
        <div className="shrink-0 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-[11px] text-destructive">
          <div className="mb-1 font-medium uppercase tracking-widest">
            Save failed
          </div>
          <div className="text-destructive/90">{mutationError}</div>
          <div className="mt-1 text-[10px] text-destructive/70">
            Use <span className="font-medium">Back to Edit</span> to adjust
            the highlighted values, or retry Confirm &amp; Save.
          </div>
        </div>
      ) : null}
      {errorEntries.length > 0 ? (
        <div className="shrink-0 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-[11px] text-destructive">
          <div className="mb-1 font-medium uppercase tracking-widest">
            Fix before saving
          </div>
          <ul className="space-y-0.5">
            {errorEntries.map(([field, err]) => (
              <li key={field}>
                <span className="font-mono">{field}</span>
                {err?.message ? (
                  <span className="text-destructive/80"> — {err.message}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-4">
          {grouped.map((g) => {
            const groupChanged = g.rows.filter((r) => r.changed).length;
            return (
              <div key={g.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onEditSection(g.idx)}
                    className="cursor-pointer text-[10px] font-medium uppercase tracking-widest text-foreground/60 hover:text-foreground"
                  >
                    {g.idx + 1} · {g.title}
                  </button>
                  {groupChanged > 0 ? (
                    <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-widest text-background">
                      {groupChanged}
                    </span>
                  ) : (
                    <span className="text-[9px] font-medium uppercase tracking-widest text-foreground/30">
                      Unchanged
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 rounded-md border border-border/40 bg-background p-2">
                  {g.rows.map((r) => (
                    <div
                      key={r.label}
                      className="grid grid-cols-[minmax(120px,1fr)_minmax(0,2fr)] items-baseline gap-2 py-0.5"
                    >
                      <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
                        {r.label}
                      </div>
                      <div className="min-w-0">
                        {r.changed ? (
                          <div className="flex flex-wrap items-baseline gap-1.5">
                            <span className="truncate text-[11px] text-foreground/40 line-through">
                              {r.prev}
                            </span>
                            <span className="text-foreground/40">→</span>
                            <span className="truncate rounded-sm bg-foreground/10 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                              {r.next}
                            </span>
                          </div>
                        ) : (
                          <span className="truncate text-[11px] text-foreground/60">
                            {r.next}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── RTA mode buttons ───────────────────────────────────────────────

/// Three icon buttons for the OCPP real-time-authentication mode.
/// Semantic mapping (same as the OCPP spec's fallback contract):
///   Never          → local list only, no CSMS call ever
///   Allowed        → must call CSMS; if offline → deny
///   AllowedOffline → call CSMS if online, else allow via cache
///
/// Icons pick network availability as the visual axis: Ban =
/// no real-time, Wifi = requires live, WifiOff = works offline.
const RTA_MODE_OPTIONS: Array<{
  value: string;
  label: string;
  tooltip: string;
  icon: LucideIcon;
}> = [
  {
    value: 'Never',
    label: 'Never',
    tooltip:
      'Local list only. Charger never phones home to the CSMS for authorization.',
    icon: Ban,
  },
  {
    value: 'Allowed',
    label: 'Allowed',
    tooltip:
      'Requires live CSMS check. If the charger is offline, the session is denied.',
    icon: Wifi,
  },
  {
    value: 'AllowedOffline',
    label: 'Allow Offline',
    tooltip:
      'Prefers a live CSMS check, but falls back to the cached decision when offline.',
    icon: WifiOff,
  },
];

function RtaModeButtons({
  control,
  name,
  label,
}: {
  control: any;
  name: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/60">
        {label}
      </div>
      <Controller
        control={control}
        name={name as any}
        render={({ field }) => (
          <div className="flex items-start gap-3">
            {RTA_MODE_OPTIONS.map((opt) => {
              const selected = field.value === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => field.onChange(opt.value)}
                  aria-pressed={selected}
                  title={`${opt.label} — ${opt.tooltip}`}
                  className="group flex cursor-pointer flex-col items-center gap-1"
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full transition-colors',
                      selected
                        ? 'bg-foreground text-background'
                        : 'bg-transparent text-foreground/60 group-hover:bg-foreground/10 group-hover:text-foreground/80',
                    )}
                  >
                    <Icon className="size-3" aria-hidden />
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-medium uppercase tracking-widest transition-colors',
                      selected ? 'text-foreground' : 'text-foreground/60',
                    )}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      />
    </div>
  );
}

// ─── Priority slider ────────────────────────────────────────────────

/// Full-row 0–9 slider for OCPP `chargingPriority`. Uses a native
/// `<input type="range">` under the hood (no new dependency) with
/// heavy scoped CSS in globals — track fills up to the selected
/// step in the foreground colour, unselected tail sits at
/// border-alpha, and 10 tick marks anchor the discrete positions.
///
/// Value model: `null` when the operator hasn't touched it (CSMS
/// treats it as default 0); otherwise `0-9` int.
function PrioritySlider({
  control,
  name,
  label,
}: {
  control: any;
  name: string;
  label: string;
}) {
  return (
    <Controller
      control={control}
      name={name as any}
      render={({ field }) => {
        const numeric =
          typeof field.value === 'number'
            ? field.value
            : field.value != null && field.value !== ''
              ? Number(field.value)
              : null;
        const displayValue = numeric ?? 0;
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/60">
                {label}
              </span>
              {numeric != null ? (
                <button
                  type="button"
                  onClick={() => field.onChange(null)}
                  className="cursor-pointer text-[10px] font-medium uppercase tracking-widest text-foreground/50 hover:text-[#c94a3a]"
                >
                  Reset
                </button>
              ) : null}
            </div>
            {/* 10 numbered steps in a row, 80% row width.
                Selected step gets a foreground-filled circle;
                the others render as bare, muted numerals.
                Every number is clickable so the operator can
                jump straight to a value without dragging. */}
            <div
              role="radiogroup"
              aria-label={label}
              className="mx-auto flex w-[96%] items-center justify-between"
            >
              {Array.from({ length: 10 }, (_, i) => i).map((i) => {
                const selected = i === displayValue;
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => field.onChange(i)}
                    className={cn(
                      'flex size-7 cursor-pointer items-center justify-center rounded-full font-mono text-xs tabular-nums transition-colors',
                      selected
                        ? 'bg-foreground text-background'
                        : 'text-foreground/45 hover:text-foreground/80',
                    )}
                  >
                    {i}
                  </button>
                );
              })}
            </div>
            <div className="mx-auto mt-0.5 flex w-[96%] justify-between text-[9px] font-medium uppercase tracking-widest text-foreground/40">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        );
      }}
    />
  );
}

// ─── Identity section ───────────────────────────────────────────────

/// Token types where a group parent is a sensible concept:
///   - ISO14443 — physical fleet cards (primary + backup / hierarchy).
///   - Local    — offline whitelist tokens (VIP tier).
///
/// Hidden for:
///   - Central  — the app IS the identity; grouping doesn't apply.
///   - eMAID    — each ISO 15118 contract certificate is unique per
///                vehicle; grouping is theoretical but never used
///                in practice.
///
/// Kept as a constant so the same rule drives both UI hide + any
/// future validation ("clear group if type flipped out of the set").
const GROUP_ELIGIBLE_TOKEN_TYPES = new Set(['ISO14443', 'Local']);

/// Identity section renderer split out into its own component so we
/// can call `useWatch` (a hook) at render time to reactively hide
/// the group picker when the operator changes the token type.
function IdentitySection({
  control,
  translate,
  currentId,
}: {
  control: any;
  translate: (key: string, options?: any) => string;
  currentId?: string;
}) {
  const currentType = useWatch({
    control,
    name: AuthorizationProps.idTokenType,
  }) as string | undefined;
  const currentIdToken = useWatch({
    control,
    name: AuthorizationProps.idToken,
  }) as string | undefined;
  const groupApplies = GROUP_ELIGIBLE_TOKEN_TYPES.has(String(currentType ?? ''));
  const uniqueness = useTokenUniqueness({
    token: String(currentIdToken ?? ''),
    excludeId: currentId,
  });
  return (
    <div className="flex flex-col gap-4">
      {/* Always a 2-column grid so the ID Token width stays stable
          regardless of whether the Group Authorization picker is
          visible. When grouping doesn't apply, the second cell is
          empty and the ID Token doesn't stretch to fill it. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <FormField
            control={control}
            label={translate('Authorizations.fields.idToken')}
            name={AuthorizationProps.idToken}
            required
          >
            <Input />
          </FormField>
          {String(currentIdToken ?? '').trim() ? (
            <TokenUniquenessIndicator uniqueness={uniqueness} />
          ) : null}
        </div>
        {groupApplies ? (
          <GroupAuthorizationPicker
            control={control}
            name={AuthorizationProps.groupAuthorizationId}
            label={translate('Authorizations.fields.groupAuthorizationId')}
            excludeId={currentId}
          />
        ) : null}
      </div>
      <TokenTypeButtons
        control={control}
        name={AuthorizationProps.idTokenType}
        label={translate('Authorizations.fields.idTokenType')}
      />
    </div>
  );
}

// ─── Group Authorization picker ─────────────────────────────────────

/// Searchable dropdown for selecting a parent authorization by its
/// idToken. Fetches up to 500 authorizations via `useList`; filters
/// client-side by the Command's built-in search. Writes the DB id
/// (integer) of the picked record to the form field, so the shape
/// on the wire matches what the plain-integer input used to send.
///
/// Excludes `excludeId` from the list so a token can't be its own
/// group parent (would create a cycle at auth-evaluation time).
function GroupAuthorizationPicker({
  control,
  name,
  label,
  excludeId,
}: {
  control: any;
  name: string;
  label: string;
  excludeId?: string;
}) {
  const { query } = useList<{
    id: number;
    idToken?: string;
    idTokenType?: string;
  }>({
    resource: ResourceType.AUTHORIZATIONS,
    pagination: { currentPage: 1, pageSize: 500 },
    sorters: [{ field: 'idToken', order: 'asc' }],
    meta: { gqlQuery: AUTHORIZATIONS_PICKER_QUERY },
  });

  const options = React.useMemo(() => {
    const rows = (query.data?.data ?? []) as Array<{
      id: number;
      idToken?: string;
      idTokenType?: string;
    }>;
    const excludeNum = excludeId != null ? Number(excludeId) : null;
    return rows
      .filter((r) => r.id != null && r.idToken)
      .filter((r) => excludeNum == null || r.id !== excludeNum);
  }, [query.data, excludeId]);

  return (
    // Use the shared Field + FieldLabel components (same as
    // FormField uses internally) so this picker's label wrapper +
    // label→control gap match the FormField inputs beside it
    // pixel-for-pixel. The `<span>` inside FieldLabel picks up the
    // modal-scoped CSS that shrinks the label to 10px tracked.
    <Field>
      {/* Match `formLabelWrapperStyle` from `form/field.tsx` exactly
          (`flex items-center gap-2`) so the label wrapper renders
          with identical alignment + gap to what FormField uses
          internally. Without `items-center` on the wrapper, the
          span drops to baseline alignment and the label sits a
          fraction of a pixel higher, shifting the control below. */}
      <FieldLabel className="flex items-center gap-2">
        <span className="text-base font-semibold">{label}</span>
      </FieldLabel>
      <Controller
        control={control}
        name={name as any}
        render={({ field }) => {
          const selected =
            field.value != null
              ? options.find((o) => String(o.id) === String(field.value))
              : undefined;
          return (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  // Height + padding match the scoped input rule in
                  // globals.css exactly (padding 6px 10px, min-height
                  // 32px, font-size 12px) so the two field controls
                  // sit on the same baseline. Height forced via
                  // inline style because Tailwind h-8 was being
                  // overridden somewhere in the modal cascade.
                  style={{ height: 32, minHeight: 32, padding: '0 10px' }}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-background text-left text-xs shadow-sm hover:border-foreground/30"
                >
                  <span className="min-w-0 truncate">
                    {selected ? (
                      <>
                        <span className="font-mono text-foreground">
                          {selected.idToken}
                        </span>
                        <span className="ml-2 text-foreground/40">
                          #{selected.id}
                        </span>
                      </>
                    ) : field.value != null && field.value !== '' ? (
                      // Value set but not resolved (list still loading
                      // or parent was deleted). Show the raw id.
                      <span className="text-foreground/60">#{field.value}</span>
                    ) : (
                      <span className="text-foreground/40">
                        No parent group
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    {field.value != null && field.value !== '' ? (
                      <XIcon
                        className="size-3.5 cursor-pointer text-foreground/40 hover:text-[#c94a3a]"
                        onClick={(e) => {
                          e.stopPropagation();
                          field.onChange(null);
                        }}
                      />
                    ) : null}
                    <ChevronsUpDown className="size-3.5 shrink-0 text-foreground/40" />
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-(--radix-popover-trigger-width) p-0"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Search by token…" />
                  <CommandList>
                    <CommandEmpty>
                      {query.isLoading ? 'Loading…' : 'No tokens found.'}
                    </CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__"
                        onSelect={() => field.onChange(null)}
                        className="cursor-pointer text-xs"
                      >
                        <Check
                          className={cn(
                            'mr-2 size-3.5',
                            field.value == null || field.value === ''
                              ? 'opacity-100 text-foreground'
                              : 'opacity-0',
                          )}
                        />
                        <span className="text-foreground/60">
                          No parent group
                        </span>
                      </CommandItem>
                      {options.map((opt) => {
                        const isSelected =
                          String(field.value) === String(opt.id);
                        return (
                          <CommandItem
                            key={opt.id}
                            // Include idToken in the search value so
                            // Command's built-in filter matches on it
                            // (default is the `value` prop text).
                            value={`${opt.idToken} ${opt.id}`}
                            onSelect={() => field.onChange(opt.id)}
                            className="cursor-pointer text-xs"
                          >
                            <Check
                              className={cn(
                                'mr-2 size-3.5',
                                isSelected
                                  ? 'opacity-100 text-[#05B084]'
                                  : 'opacity-0',
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate font-mono">
                              {opt.idToken}
                            </span>
                            {opt.idTokenType ? (
                              <span className="ml-2 text-[10px] uppercase tracking-widest text-foreground/50">
                                {opt.idTokenType}
                              </span>
                            ) : null}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          );
        }}
      />
    </Field>
  );
}

// ─── Wizard chrome (modal mode only) ────────────────────────────────

/// Clickable step indicator. Same expand-from-circle pattern the
/// main top-nav uses:
///   • Inactive steps render as a circle showing just the step
///     number.
///   • The active step expands to a pill showing number + title.
///   • Container has fixed height + overflow-hidden; `max-width`
///     transitions between the collapsed (28px) and expanded
///     (measured content width) states.
///   • Title fades in via AnimatePresence with a delay so it
///     lands as the pill nears full width; fades out first on
///     collapse so the pill isn't fighting the label.
///
/// Timing matches the top-nav's NavTab: 750ms expand/collapse for
/// the pill, 400ms label fade with 250ms delay on entry.
function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: string[];
  current: number;
  onSelect: (i: number) => void;
}) {
  return (
    // `shrink-0` protects the stepper from being vertically
    // compressed when the parent flex-col has to distribute a
    // constrained modal height between stepper + section + footer.
    // Without it, the stepper pills clip because Form's flex-1
    // grabs all available space and squeezes the un-protected
    // stepper sibling.
    <ol className="flex shrink-0 items-center justify-center gap-2 overflow-x-auto pb-1">
      {steps.map((title, i) => {
        const state: 'current' | 'done' | 'upcoming' =
          i === current ? 'current' : i < current ? 'done' : 'upcoming';
        const active = state === 'current';
        // Content-driven max-width when expanded (rough estimate:
        // 8 chars of gap + number + text at ~7px each = enough for
        // any of our six titles); collapses to a 28px circle when
        // inactive.
        const maxWidth = active ? title.length * 8 + 60 : 28;
        // Font + fill colors mirror the top-nav's NavTab palette:
        //   ACTIVE     → bg-foreground text-background        (main nav active)
        //   DONE       → bg-foreground/15 text-foreground     (main nav "collapsing" bridge)
        //   UPCOMING   → text-foreground/60 + hover:bg-foreground/5 hover:text-foreground
        //                (main nav idle)
        // Border is dropped for the active + done states so it doesn't
        // fight the filled backgrounds; kept subtle on upcoming so
        // empty circles still read as targets.
        const colorClasses = active
          ? 'bg-foreground text-background border-transparent'
          : state === 'done'
            ? 'bg-foreground/15 text-foreground border-transparent hover:bg-foreground/20'
            : 'bg-transparent text-foreground/60 border-foreground/25 hover:bg-foreground/5 hover:text-foreground hover:border-foreground/40';
        return (
          <li key={title} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={active ? 'step' : undefined}
              aria-label={active ? undefined : title}
              className={
                'flex shrink-0 cursor-pointer items-center overflow-hidden rounded-full border transition-colors duration-500 ease-in-out ' +
                colorClasses
              }
              style={{
                height: 28,
                width: active ? undefined : 28,
                maxWidth,
                justifyContent: active ? 'flex-start' : 'center',
                paddingLeft: active ? 10 : 0,
                paddingRight: active ? 12 : 0,
                transition: active
                  ? 'max-width 750ms ease-in-out, background-color 500ms, padding 500ms'
                  : 'max-width 750ms ease-out, background-color 500ms, padding 500ms',
              }}
            >
              <span className="flex size-5 shrink-0 items-center justify-center text-[10px] font-semibold tabular-nums">
                {i + 1}
              </span>
              <AnimatePresence initial={false}>
                {active ? (
                  <motion.span
                    key="label"
                    className="ml-2 whitespace-nowrap text-[10px] font-medium uppercase tracking-widest"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      opacity: {
                        duration: 0.4,
                        ease: [0.16, 1, 0.3, 1],
                        delay: 0.25,
                      },
                    }}
                  >
                    {title}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className="size-[3px] shrink-0 rounded-full bg-foreground/25"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/// Wizard footer — Prev on the left, Cancel + Next/Save on the right.
/// Next is `type="button"` (advances step without submitting the
/// form); Save on the last step is `type="submit"` (triggers the
/// react-hook-form submit handler). Both must sit inside the `<form>`
/// to keep the Save-as-submit wiring intact.
function WizardFooter({
  atFirst,
  atLast,
  reviewing,
  loading,
  onPrev,
  onNext,
  onReview,
  onEditFromReview,
  onCancel,
}: {
  atFirst: boolean;
  atLast: boolean;
  reviewing: boolean;
  loading?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReview: () => void;
  onEditFromReview: () => void;
  onCancel?: () => void;
}) {
  // Left button: "Previous" while editing; "Back to Edit" during
  // review so the operator can bail out without submitting.
  const leftButton = reviewing ? (
    <button
      type="button"
      onClick={onEditFromReview}
      disabled={loading}
      className="cursor-pointer rounded-md px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      Back to Edit
    </button>
  ) : (
    <button
      type="button"
      onClick={onPrev}
      disabled={atFirst || loading}
      className="cursor-pointer rounded-md px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      Previous
    </button>
  );

  // Right button: Next while stepping; "Review" on the last step
  // pre-review; "Confirm & Save" during review (the ONLY submit).
  const primary = reviewing ? (
    <button
      type="submit"
      disabled={loading}
      className="cursor-pointer rounded-md bg-foreground px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-widest text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? 'Saving…' : 'Confirm & Save'}
    </button>
  ) : atLast ? (
    <button
      type="button"
      onClick={onReview}
      disabled={loading}
      className="cursor-pointer rounded-md bg-foreground px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-widest text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Review
    </button>
  ) : (
    <button
      type="button"
      onClick={onNext}
      disabled={loading}
      className="cursor-pointer rounded-md bg-foreground px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-widest text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Next
    </button>
  );

  return (
    <div className="mt-2 flex shrink-0 items-center justify-between gap-3 border-t border-border/40 pt-4">
      {leftButton}
      <div className="flex items-center gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="cursor-pointer rounded-md px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
        ) : null}
        {primary}
      </div>
    </div>
  );
}
