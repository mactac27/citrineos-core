// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import { cn } from '@lib/utils/cn';
import type { BaseRecord } from '@refinedev/core';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type { TableFilterProps } from '..';
import { parseAsJson, useQueryState } from 'nuqs';
import { TableQueryStateSchema } from '@lib/client/components/table/fields/table-query-state';

/// Sortable column header — click the whole cell to cycle:
/// unsorted → ascending → descending → unsorted. A single
/// directional chevron indicator appears to the right of the
/// title only when the column is actively sorted; the header
/// reads as bare text when no sort is applied, avoiding chevron
/// noise on every column.
///
/// Assumes SERVER-side sorting (writes to URL query state via
/// nuqs, same pattern as the pagination footer). For client-only
/// tables, the underlying table wrapper should skip rendering
/// this and use the built-in tanstack sort primitives instead.
export const SortableHeader = <TData extends BaseRecord = BaseRecord>({
  column,
  tableStateKey,
  children,
}: Pick<TableFilterProps<TData>, 'column'> & {
  tableStateKey: string;
  children: React.ReactNode;
}) => {
  const [tableQueryState, setTableQueryState] = useQueryState(
    tableStateKey,
    parseAsJson(TableQueryStateSchema.parse),
  );

  const isSortingThis = tableQueryState?.sortBy === column.id;
  const direction = isSortingThis ? tableQueryState?.direction : undefined;

  const cycle = () => {
    const newParams = { ...(tableQueryState ?? {}) };
    if (!isSortingThis) {
      newParams.sortBy = column.id;
      newParams.direction = 'asc';
    } else if (direction === 'asc') {
      newParams.sortBy = column.id;
      newParams.direction = 'desc';
    } else {
      delete newParams.sortBy;
      delete newParams.direction;
    }
    setTableQueryState(Object.keys(newParams).length > 0 ? newParams : null).then();
  };

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 text-left transition-colors',
        // Re-declare typography explicitly: Tailwind's preflight
        // sets `text-transform: none` on <button>, which would
        // override the `uppercase tracking-widest` inherited from
        // the parent tableHeaderTextStyle div. Font-size / weight /
        // color inherit fine; only text-transform + letter-spacing
        // need re-asserting on the button itself.
        'uppercase tracking-widest hover:text-foreground',
      )}
    >
      {children}
      {direction === 'asc' ? (
        <ChevronUpIcon aria-hidden className="size-3 text-foreground" />
      ) : direction === 'desc' ? (
        <ChevronDownIcon aria-hidden className="size-3 text-foreground" />
      ) : null}
    </button>
  );
};

/// Backwards-compat alias — the shared Table wrapper still imports
/// SortAction by name. Keeping it exported prevents a churn edit
/// there while we're focused on sort behavior; the wrapper will
/// switch to `SortableHeader` in a follow-up if needed.
export { SortableHeader as SortAction };
