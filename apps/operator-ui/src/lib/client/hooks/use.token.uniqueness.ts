// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import { AUTHORIZATIONS_PICKER_QUERY } from '@lib/queries/authorizations';
import { ResourceType } from '@lib/utils/access.types';
import { useList } from '@refinedev/core';
import { useEffect, useState } from 'react';

/// Debounced uniqueness check for an Authorization idToken.
///
/// Fires a lightweight `useList` query filtered by the current
/// token value (case-insensitive). Returns `available` | `taken`
/// | `checking` | `idle` so the caller can render inline
/// feedback + gate submit. Debounces at 400ms so keystrokes
/// don't spam the server.
///
/// `excludeId` skips the currently-editing record — otherwise the
/// edit modal would always report "taken" because the record
/// being edited is itself in the result set.
export type TokenUniquenessState = 'idle' | 'checking' | 'available' | 'taken';

export function useTokenUniqueness({
  token,
  excludeId,
  enabled = true,
  debounceMs = 400,
}: {
  token: string;
  excludeId?: string | number;
  enabled?: boolean;
  debounceMs?: number;
}): { state: TokenUniquenessState; collidingType?: string } {
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const trimmed = token.trim();
    if (!trimmed) {
      setDebounced('');
      return;
    }
    const t = window.setTimeout(() => setDebounced(trimmed), debounceMs);
    return () => window.clearTimeout(t);
  }, [token, debounceMs]);

  const isChecking = enabled && !!token.trim() && debounced !== token.trim();

  const { query } = useList<{
    id: number;
    idToken?: string;
    idTokenType?: string;
  }>({
    resource: ResourceType.AUTHORIZATIONS,
    filters: [{ field: 'idToken', operator: 'eq', value: debounced }],
    pagination: { currentPage: 1, pageSize: 2 },
    meta: { gqlQuery: AUTHORIZATIONS_PICKER_QUERY },
    queryOptions: {
      enabled: enabled && debounced.length > 0,
    },
  });

  if (!enabled || !token.trim()) {
    return { state: 'idle' };
  }
  if (isChecking || query.isLoading) {
    return { state: 'checking' };
  }
  const excludeNum = excludeId != null ? Number(excludeId) : null;
  const collision = (query.data?.data ?? []).find(
    (r) => excludeNum == null || r.id !== excludeNum,
  );
  if (collision) {
    return { state: 'taken', collidingType: collision.idTokenType };
  }
  return { state: 'available' };
}
