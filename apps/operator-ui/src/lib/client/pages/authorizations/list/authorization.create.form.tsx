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
import { AUTHORIZATIONS_CREATE_MUTATION } from '@lib/queries/authorizations';
import { ResourceType } from '@lib/utils/access.types';
import { OCPP2_0_1 } from '@citrineos/base';
import { useCreate } from '@refinedev/core';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTokenUniqueness } from '@lib/client/hooks/use.token.uniqueness';

/// Minimal create form for a new authorization. Mirrors the
/// Charger create modal in look + choreography — same header /
/// footer chrome, same uppercase-tracked button labels, same
/// autofill-defeat treatment. Fields:
///
///   - ID Token (required) — the string the physical charger sends
///     when a driver presents credentials.
///   - Type (required) — how the token was presented (RFID card,
///     remote start from CSMS, Plug&Charge contract, etc.). Enum
///     from OCPP 2.0.1.
///   - Status (default Accepted) — whether the token is authorized
///     to start sessions right now.
///   - Concurrent (default off) — whether this token can hold more
///     than one active session at a time.
///
/// Extended fields (cache expiry, allowed connector types,
/// disallowed EVSE prefixes, charging priority, group binding,
/// messages) still live on the full-page /authorizations/new
/// editor. This modal is the fast-path "get a driver on the
/// network, tune it later" flow.
export function AuthorizationCreateForm({
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

  // Live uniqueness check on the ID Token. Debounced; no query fires
  // while the field is empty. Result gates the submit button so the
  // operator can't try to save a collision.
  const uniqueness = useTokenUniqueness({
    token: values.idToken,
    enabled: values.idToken.trim().length > 0,
  });

  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = {
      idToken: values.idToken.trim(),
    };
    if (!trimmed.idToken) {
      setError('ID Token is required.');
      return;
    }
    if (trimmed.idToken.length > 36) {
      setError('ID Token must be 36 characters or fewer (OCPP 2.0.1 limit).');
      return;
    }
    // Defense-in-depth: match the character set the edit modal's
    // Zod schema enforces (`ID_TOKEN_ALLOWED` in authorization.upsert).
    // GraphQL parameterization already blocks injection, but this
    // stops garbage tokens (control chars, newlines, non-ASCII)
    // from landing in the DB and downstream systems.
    if (!/^[A-Za-z0-9._:@\-]+$/.test(trimmed.idToken)) {
      setError('Only letters, digits, and . _ : @ - are allowed in the ID Token.');
      return;
    }
    if (uniqueness.state === 'taken') {
      setError(
        `Token already exists${
          uniqueness.collidingType ? ` (${uniqueness.collidingType})` : ''
        }. Choose a different one.`,
      );
      return;
    }
    if (uniqueness.state === 'checking') {
      // Very fast typers can beat the debounce. Bail out quietly;
      // once the check settles the button re-enables.
      return;
    }

    const payload: Record<string, unknown> = {
      idToken: trimmed.idToken,
      idTokenType: values.idTokenType,
      status: values.status,
      concurrentTransaction: values.concurrent,
    };

    setIsSaving(true);
    mutateCreate(
      {
        resource: ResourceType.AUTHORIZATIONS,
        values: payload,
        meta: { gqlMutation: AUTHORIZATIONS_CREATE_MUTATION },
        successNotification: {
          message: 'Token added.',
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
            (e as { message?: string })?.message ?? 'Failed to create authorization.',
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
        <div className="text-lg font-semibold">New token</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <Section>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] font-medium text-foreground/70">
              ID Token
              <span className="ml-0.5 text-[#c94a3a]">*</span>
            </span>
            <input
              type="text"
              value={values.idToken}
              onChange={(e) => set('idToken', e.target.value)}
              placeholder="e.g. 04A1B2C3D4E5F6"
              maxLength={36}
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              name="auth-id-token"
              className="rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
            <span className="text-[10px] text-foreground/50">
              The string the charger sends to the CSMS when a driver
              presents this credential.
            </span>
            {/* Inline uniqueness feedback — appears once the operator
                has typed something. Debounced so it doesn't strobe on
                every keystroke. */}
            {values.idToken.trim() ? (
              <UniquenessIndicator uniqueness={uniqueness} />
            ) : null}
          </label>

          <SelectField
            label="Type"
            value={values.idTokenType}
            onChange={(v) =>
              set('idTokenType', v as OCPP2_0_1.IdTokenEnumType)
            }
            options={Object.values(OCPP2_0_1.IdTokenEnumType).map((v) => ({
              value: v,
              label: v,
            }))}
          />

          <SelectField
            label="Status"
            value={values.status}
            onChange={(v) =>
              set('status', v as OCPP2_0_1.AuthorizationStatusEnumType)
            }
            options={Object.values(OCPP2_0_1.AuthorizationStatusEnumType).map(
              (v) => ({ value: v, label: v }),
            )}
          />

          <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={values.concurrent}
              onChange={(e) => set('concurrent', e.target.checked)}
              className="size-3.5 cursor-pointer accent-foreground"
            />
            <span className="text-[11px] font-medium text-foreground/70">
              Allow concurrent transactions
            </span>
            <span className="text-[10px] text-foreground/50">
              (this token can hold more than one active session at a time)
            </span>
          </label>
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
          disabled={
            isSaving ||
            uniqueness.state === 'taken' ||
            uniqueness.state === 'checking'
          }
          className="cursor-pointer gap-1.5 bg-foreground text-[10px] font-medium uppercase tracking-widest text-background hover:bg-foreground/90"
        >
          {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Create token
        </Button>
      </div>
    </form>
  );
}

// ─── Form state ─────────────────────────────────────────────────────

type FormValues = {
  idToken: string;
  idTokenType: OCPP2_0_1.IdTokenEnumType;
  status: OCPP2_0_1.AuthorizationStatusEnumType;
  concurrent: boolean;
};

function emptyFormValues(): FormValues {
  return {
    idToken: '',
    idTokenType: OCPP2_0_1.IdTokenEnumType.Central,
    status: OCPP2_0_1.AuthorizationStatusEnumType.Accepted,
    concurrent: false,
  };
}

// ─── Section wrapper + select ───────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-foreground/70">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-auto w-full cursor-pointer rounded-md border-border bg-background px-2.5 py-1.5 text-xs shadow-none focus-visible:border-foreground/30 focus-visible:ring-foreground/10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
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

// ─── Inline uniqueness indicator ────────────────────────────────────

/// Small status line under the ID Token input. Three visible states:
///   - checking  — grey spinner + "Checking availability…"
///   - available — green check + "Available"
///   - taken     — red alert + "Already exists (…type…)"
/// The idle state (empty input) renders nothing; the caller gates on
/// the token being non-empty.
function UniquenessIndicator({
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
