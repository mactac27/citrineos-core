// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lib/client/components/ui/select';
import { type BaseRecord, useTranslate } from '@refinedev/core';
import { type UseTableReturnType } from '@refinedev/react-table';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { parseAsJson, useQueryState } from 'nuqs';
import { TableQueryStateSchema } from '@lib/client/components/table/fields/table-query-state';
import { useDispatch, useSelector } from 'react-redux';
import {
  getPageSizePreference,
  setPageSizePreference,
} from '@lib/utils/store/table.preferences.slice';

interface DataTablePaginationProps<TData extends BaseRecord = BaseRecord> {
  table: UseTableReturnType<TData>['reactTable'];
  showSelectedText?: boolean;
  tableStateKey: string;
}

const MAX_PAGE_SIZE = 50;

/// Table pagination footer — platform style. Matches the Chargers /
/// Constellations pages: small-caps "Rows" label with a compact
/// selector on the left; a tabular-nums range + prev/next icon
/// buttons + "N / M" indicator on the right. Optional
/// selected-count sits inline between the two clusters when
/// `showSelectedText` is on.
///
/// Wraps tanstack-react-table's built-in pagination state and
/// syncs page + size to URL params via `nuqs` so the URL is the
/// source of truth for deep-linking.
export const Pagination = <TData extends BaseRecord = BaseRecord>({
  table,
  showSelectedText,
  tableStateKey,
}: DataTablePaginationProps<TData>) => {
  const dispatch = useDispatch();
  const translate = useTranslate();
  const [tableQueryState, setTableQueryState] = useQueryState(
    tableStateKey,
    parseAsJson(TableQueryStateSchema.parse),
  );
  const pageSizePreference = useSelector((state) => getPageSizePreference(state, tableStateKey));

  const setPage = (pageIndex: number) => {
    setTableQueryState({
      ...(tableQueryState ?? {}),
      page: pageIndex + 1,
      size: tableQueryState?.size ?? pageSizePreference,
    }).then();
  };

  const setPageSize = (pageSizeString: string) => {
    const pageSize = Number(pageSizeString);
    dispatch(
      setPageSizePreference({
        resource: tableStateKey,
        pageSize,
      }),
    );
    const newParams = { ...(tableQueryState ?? {}) };
    delete newParams.page;
    delete newParams.size;
    setTableQueryState(Object.keys(newParams).length > 0 ? newParams : null).then();
  };

  const pageSize = Math.min(
    tableQueryState?.size ?? pageSizePreference,
    MAX_PAGE_SIZE,
  );
  const currentPage = table.getState().pagination.pageIndex + 1;
  const pageCount = Math.max(1, table.getPageCount());
  const totalRows = table.getFilteredRowModel().rows.length;
  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalRows);
  const atFirst = !table.getCanPreviousPage();
  const atLast = !table.getCanNextPage();

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/40 px-4 py-2 text-xs">
      <div className="flex items-center gap-2 text-foreground/60">
        <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
          {translate('pagination.rowsPerPage', 'Rows')}
        </span>
        <Select value={String(pageSize)} onValueChange={setPageSize}>
          <SelectTrigger
            aria-label={translate('pagination.rowsPerPage', 'Rows per page')}
            className="h-auto w-auto cursor-pointer rounded-md border-border bg-background px-2 py-1 text-xs shadow-none focus-visible:border-foreground/30 focus-visible:ring-foreground/10"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 30, 40, MAX_PAGE_SIZE].map((size) => (
              <SelectItem key={size} value={String(size)} className="cursor-pointer text-xs">
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showSelectedText ? (
        <div className="hidden text-xs tabular-nums text-foreground/50 sm:block">
          {translate('Common.rowsSelected', {
            selected: table.getFilteredSelectedRowModel().rows.length,
            total: totalRows,
          })}
        </div>
      ) : null}
      <div className="flex items-center gap-3 text-foreground/60">
        <span className="tabular-nums">
          {totalRows === 0
            ? translate('Common.noResults', '0 results')
            : `${rangeStart}–${rangeEnd} of ${totalRows}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={translate('pagination.buttons.goToPreviousPage', 'Previous page')}
            disabled={atFirst}
            onClick={() => setPage(table.getState().pagination.pageIndex - 1)}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeftIcon className="size-3.5" />
          </button>
          <span className="tabular-nums text-foreground/70">
            {currentPage} / {pageCount}
          </span>
          <button
            type="button"
            aria-label={translate('pagination.buttons.goToNextPage', 'Next page')}
            disabled={atLast}
            onClick={() => setPage(table.getState().pagination.pageIndex + 1)}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRightIcon className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

Pagination.displayName = 'Pagination';
