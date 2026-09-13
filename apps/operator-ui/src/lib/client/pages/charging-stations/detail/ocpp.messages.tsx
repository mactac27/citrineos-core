// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import type { OCPPMessageDto } from '@citrineos/base';
import { MessageOrigin, OCPP_CallAction, OCPPMessageProps } from '@citrineos/base';
import { Button } from '@lib/client/components/ui/button';
import { Label } from '@lib/client/components/ui/label';
import { Switch } from '@lib/client/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lib/client/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@lib/client/components/ui/tooltip';
import { OCPPMessageClass } from '@lib/cls/ocpp.message.dto';
import { GET_OCPP_MESSAGES_LIST_FOR_STATION } from '@lib/queries/ocpp.messages';
import { ResourceType } from '@lib/utils/access.types';
import { getPlainToInstanceOptions } from '@lib/utils/tables';
import { type LogicalFilter, useInvalidate, useList, useTranslate } from '@refinedev/core';
import { Check, Copy, Download, Filter, Link, RefreshCw, Search, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import debounce from 'lodash.debounce';
import { Popover, PopoverContent, PopoverTrigger } from '@lib/client/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@lib/client/components/ui/command';
import { cn } from '@lib/utils/cn';
import { CollapsibleOCPPMessageViewer } from './collapsible.ocpp.message.viewer';
import { buttonIconSize } from '@lib/client/styles/icon';
import { TimestampDisplay } from '@lib/client/components/timestamp-display';
import { Table } from '@lib/client/components/table';
import type { CellContext } from '@tanstack/react-table';
import { copy } from '@lib/utils/copy';
import { OCPPMessagesExportDialog } from '@lib/client/pages/charging-stations/detail/ocpp.messages.export.dialog';
import { DateTimePicker } from '@lib/client/components/ui/date-time-picker';
import { parseAsJson, useQueryState } from 'nuqs';
import { TableQueryStateSchema } from '@lib/client/components/table/fields/table-query-state';
import { useSelector } from 'react-redux';
import { getPageSizePreference } from '@lib/utils/store/table.preferences.slice';
import { toast } from 'sonner';

export interface OCPPMessagesProps {
  stationId: number;
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;
}

const actionOptions = [
  ...Array.from(new Set([...Object.values(OCPP_CallAction), ...Object.values(OCPP_CallAction)])),
];

const allOption = 'all';

export const OCPPMessages: React.FC<OCPPMessagesProps> = ({
  stationId,
  initialStartDate = null,
  initialEndDate = null,
}) => {
  const [startDate, setStartDate] = useState<Date | null>(initialStartDate);
  const [endDate, setEndDate] = useState<Date | null>(initialEndDate);
  const [searchCid, setSearchCid] = useState<string>('');
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [selectedOrigin, setSelectedOrigin] = useState<string>(allOption);
  const [filters, setFilters] = useState<LogicalFilter[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [liveLogEnabled, setLiveLogEnabled] = useState(false);
  const [sinceTimestamp, setSinceTimestamp] = useState<string | null>(null);

  const translate = useTranslate();
  const liveMode = liveLogEnabled ? 'auto' : 'off';
  const invalidate = useInvalidate();

  const originOptions = useMemo(
    () => [
      { label: translate('ChargingStations.ocppMessages.allOrigins'), value: allOption },
      ...Object.values(MessageOrigin).map((o) => ({
        label: o.toUpperCase(),
        value: o,
      })),
    ],
    [translate],
  );

  const [tableQueryState, _] = useQueryState(
    ResourceType.OCPP_MESSAGES,
    parseAsJson(TableQueryStateSchema.parse),
  );

  const pageSizePreference = useSelector((state) =>
    getPageSizePreference(state, ResourceType.OCPP_MESSAGES),
  );

  const effectiveFilters = useMemo<LogicalFilter[]>(() => {
    if (!sinceTimestamp) return filters;
    return [
      ...filters,
      {
        field: OCPPMessageProps.timestamp,
        operator: 'gt',
        value: sinceTimestamp,
      },
    ];
  }, [filters, sinceTimestamp]);

  const {
    query: { data },
  } = useList<OCPPMessageDto>({
    resource: ResourceType.OCPP_MESSAGES,
    liveMode: 'off',
    pagination: {
      currentPage: tableQueryState?.page ?? 1,
      pageSize: tableQueryState?.size ?? pageSizePreference,
    },
    sorters: [
      {
        field: tableQueryState?.sortBy ?? OCPPMessageProps.timestamp,
        order: tableQueryState?.direction ?? 'desc',
      },
    ],
    meta: {
      gqlQuery: GET_OCPP_MESSAGES_LIST_FOR_STATION,
      gqlVariables: { stationId: stationId },
    },
    filters: effectiveFilters,
    queryOptions: getPlainToInstanceOptions(OCPPMessageClass),
  });

  const messages = useMemo(() => data?.data ?? [], [data?.data]);

  const handleRefresh = () => {
    const latest = messages[0]?.timestamp;
    if (latest) {
      setSinceTimestamp(latest);
    } else {
      invalidate({
        resource: ResourceType.OCPP_MESSAGES,
        invalidates: ['list'],
      });
    }
  };

  useEffect(() => {
    if (!liveLogEnabled) return;

    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          setLiveLogEnabled(false);
          toast.info(
            translate(
              'ChargingStations.liveLogDisabledInactivity',
              'Live log disabled due to inactivity',
            ),
            { duration: Infinity, position: 'top-right' },
          );
        },
        10 * 60 * 1000,
      );
    };

    const events = ['mousedown', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer));
    window.addEventListener('scroll', resetTimer, true);
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      window.removeEventListener('scroll', resetTimer, true);
    };
  }, [liveLogEnabled, translate]);

  useEffect(() => {
    const newFilters: LogicalFilter[] = [];
    if (searchCid.trim()) {
      newFilters.push({
        field: OCPPMessageProps.correlationId,
        operator: 'contains',
        value: searchCid,
      });
    }
    if (startDate) {
      newFilters.push({
        field: OCPPMessageProps.timestamp,
        operator: 'gte',
        value: startDate.toISOString(),
      });
    }
    if (endDate) {
      newFilters.push({
        field: OCPPMessageProps.timestamp,
        operator: 'lte',
        value: endDate.toISOString(),
      });
    }
    if (selectedActions.length > 0) {
      newFilters.push({
        field: OCPPMessageProps.action,
        operator: 'in',
        value: selectedActions,
      });
    }
    if (selectedOrigin && selectedOrigin !== allOption) {
      newFilters.push({
        field: OCPPMessageProps.origin,
        operator: 'eq',
        value: selectedOrigin,
      });
    }

    setFilters(newFilters);
    setSinceTimestamp(null);
  }, [startDate, endDate, searchCid, selectedActions, selectedOrigin]);

  const findRelatedMessages = useCallback(
    (record: OCPPMessageDto) => {
      // Find and select the row with the same correlationId but different origin
      const relatedMessageIndex = messages.findIndex(
        (msg) => msg.correlationId === record.correlationId && msg.origin !== record.origin,
      );
      if (relatedMessageIndex !== -1) {
        // Scroll to the related message
        const element = document.getElementById(`table-row-${relatedMessageIndex}`);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [messages],
  );

  const getRowClassName = (record: OCPPMessageDto) =>
    record.origin === MessageOrigin.ChargingStation ? 'bg-secondary/25' : 'bg-success/25';

  return (
    <>
      <div className="flex flex-col gap-4 w-full">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setExportDialogOpen(true)}
            className="cursor-pointer gap-1.5 bg-foreground text-[10px] font-medium uppercase tracking-widest text-background hover:bg-foreground/90"
          >
            <Download className="size-3.5" />
            {translate('buttons.exportToCsv')}
          </Button>
          <div className="flex items-center gap-3">
            {!liveLogEnabled && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                title={translate('ChargingStations.refreshMessages', 'Refresh Messages')}
              >
                <RefreshCw className={buttonIconSize} />
              </Button>
            )}
            <Switch checked={liveLogEnabled} onCheckedChange={setLiveLogEnabled} />
            <Label className="font-medium">{translate('ChargingStations.liveLog')}</Label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full">
          <PillSearchInput
            onSearch={setSearchCid}
            placeholder={translate('ChargingStations.ocppMessages.searchCorrelationId')}
          />
          <ActionFilterPopover
            options={actionOptions}
            selected={selectedActions}
            onChange={setSelectedActions}
            searchPlaceholder={translate('ChargingStations.ocppMessages.searchActions')}
            tooltipLabel={translate('ChargingStations.ocppMessages.selectActions', 'Filter actions')}
          />
          <Select value={selectedOrigin ?? ''} onValueChange={setSelectedOrigin}>
            <SelectTrigger className="h-auto w-auto cursor-pointer rounded-full border-border bg-background px-3 py-1.5 text-xs shadow-none focus-visible:border-foreground/30 focus-visible:ring-foreground/10">
              <SelectValue placeholder={translate('ChargingStations.ocppMessages.filterOrigins')} />
            </SelectTrigger>
            <SelectContent>
              {originOptions.map((opt) => (
                <SelectItem key={opt.label} value={opt.value} className="cursor-pointer text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateTimePicker
            date={startDate ?? undefined}
            onSelectDateAction={(date) => setStartDate(date ?? null)}
            placeholder={translate('ChargingStations.ocppMessages.pickStartDate', 'Start')}
            triggerClassName="cursor-pointer data-[empty=true]:text-foreground/40 flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs shadow-none hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
          />
          <DateTimePicker
            date={endDate ?? undefined}
            onSelectDateAction={(date) => setEndDate(date ?? null)}
            placeholder={translate('ChargingStations.ocppMessages.pickEndDate', 'End')}
            triggerClassName="cursor-pointer data-[empty=true]:text-foreground/40 flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs shadow-none hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
          />
        </div>

        <Table<OCPPMessageDto>
          key={liveLogEnabled ? 'ocpp-messages-live' : 'ocpp-messages-static'}
          refineCoreProps={{
            resource: ResourceType.OCPP_MESSAGES,
            liveMode,
            sorters: {
              initial: [{ field: OCPPMessageProps.timestamp, order: 'desc' }],
            },
            filters: {
              permanent: effectiveFilters,
            },
            meta: {
              gqlQuery: GET_OCPP_MESSAGES_LIST_FOR_STATION,
              gqlVariables: { stationId: stationId },
            },
            queryOptions: getPlainToInstanceOptions(OCPPMessageClass),
          }}
          rowClassName={(record) => getRowClassName(record)}
          enableSorting
          enableFilters
          showHeader
          tableStateKey={ResourceType.OCPP_MESSAGES}
        >
          {[
            <Table.Column
              id="correlationId"
              key="correlationId"
              accessorKey="correlationId"
              header={translate('ChargingStations.ocppMessages.correlationId')}
              cell={({ row }: CellContext<OCPPMessageDto, unknown>) => {
                return (
                  <TooltipProvider>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {row.original.correlationId ?? '-'}
                      </code>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              findRelatedMessages(row.original);
                            }}
                          >
                            <Link className={buttonIconSize} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {translate('ChargingStations.ocppMessages.findRelatedMessage')}
                        </TooltipContent>
                      </Tooltip>
                      {row.original.correlationId && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={async (e) => {
                                e.stopPropagation();
                                await copy(row.original.correlationId, true, translate);
                              }}
                            >
                              <Copy className={buttonIconSize} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {translate('ChargingStations.ocppMessages.copyCorrelationId')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TooltipProvider>
                );
              }}
            />,
            <Table.Column
              id="action"
              key="action"
              accessorKey="action"
              header={translate('ChargingStations.ocppMessages.actionOrigin')}
              cell={({ row }: CellContext<OCPPMessageDto, unknown>) => {
                return (
                  <span>
                    {row.original.action ??
                      translate('ChargingStations.ocppMessages.unknownAction')}{' '}
                    - {row.original.origin}
                  </span>
                );
              }}
            />,
            <Table.Column
              id="timestamp"
              key="timestamp"
              accessorKey="timestamp"
              header={translate('ChargingStations.ocppMessages.timestamp')}
              enableSorting
              cell={({ row }: CellContext<OCPPMessageDto, unknown>) => {
                return (
                  <TimestampDisplay
                    isoTimestamp={row.original.timestamp}
                    format="yyyy-MM-dd HH:mm:ss.SSS"
                  />
                );
              }}
            />,
            <Table.Column
              id="message"
              key="message"
              accessorKey="message"
              header={translate('ChargingStations.ocppMessages.content')}
              cell={({ row }: CellContext<OCPPMessageDto, unknown>) => {
                return (
                  <CollapsibleOCPPMessageViewer
                    ocppMessageDto={row.original}
                    unparsed={typeof row.original.message === 'string'}
                  />
                );
              }}
            />,
          ]}
        </Table>
      </div>

      <OCPPMessagesExportDialog
        open={exportDialogOpen}
        onOpenChangeAction={setExportDialogOpen}
        stationId={stationId}
        filters={filters}
      />
    </>
  );
};

// ─── Pill search input ─────────────────────────────────────────────
//
// Debounced search box shaped as a pill. Matches the search input
// on the Chargers / Constellations list pages. Inline here rather
// than reusing `DebounceSearch` because that shared component
// wraps a rectangular shadcn `<Input>` and doesn't expose the
// inner-input className.
function PillSearchInput({
  onSearch,
  placeholder,
  debounceInMillis = 300,
}: {
  onSearch: (value: string) => void;
  placeholder: string;
  debounceInMillis?: number;
}) {
  const [value, setValue] = useState('');
  const debounced = useMemo(
    () => debounce((next: string) => onSearch(next), debounceInMillis),
    [onSearch, debounceInMillis],
  );
  useEffect(() => () => debounced.cancel(), [debounced]);
  return (
    <div className="relative w-64">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-foreground/40"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          debounced(e.target.value);
        }}
        placeholder={placeholder}
        maxLength={100}
        className="w-full rounded-full border border-border bg-background pl-9 pr-9 py-1.5 text-xs text-foreground placeholder:text-foreground/40 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue('');
            onSearch('');
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-foreground/40 hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

// ─── Action filter popover ─────────────────────────────────────────
//
// Icon-only trigger (Filter icon in a circle) that opens a
// searchable checklist of OCPP call actions. Turns brand-green
// when one or more actions are selected, with a circular count
// badge in the top-right corner. Popover contents reuse the same
// Command primitives shadcn's `MultiSelect` uses so keyboard
// navigation + search behavior are identical.
function ActionFilterPopover({
  options,
  selected,
  onChange,
  searchPlaceholder,
  tooltipLabel,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchPlaceholder: string;
  tooltipLabel: string;
}) {
  const active = selected.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={tooltipLabel}
          className={cn(
            'relative flex size-9 cursor-pointer items-center justify-center rounded-full border transition-colors',
            active
              ? 'border-[#05B084] bg-[#05B084]/10 text-[#05B084] hover:bg-[#05B084]/15'
              : 'border-border bg-background text-foreground/60 hover:text-foreground',
          )}
        >
          <Filter className="size-4" />
          {active ? (
            <span className="absolute -right-1 -top-1 flex size-4 min-w-4 items-center justify-center rounded-full bg-[#05B084] px-1 text-[9px] font-semibold leading-none text-white">
              {selected.length}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No actions found.</CommandEmpty>
            <CommandGroup>
              {options.map((action) => {
                const isSelected = selected.includes(action);
                return (
                  <CommandItem
                    key={action}
                    onSelect={() => {
                      onChange(
                        isSelected
                          ? selected.filter((a) => a !== action)
                          : [...selected, action],
                      );
                    }}
                    className="cursor-pointer text-xs"
                  >
                    <Check
                      className={cn(
                        'mr-2 size-3.5',
                        isSelected ? 'opacity-100 text-[#05B084]' : 'opacity-0',
                      )}
                    />
                    {action}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {active ? (
              <div className="border-t border-border/40 p-1">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="w-full cursor-pointer rounded px-2 py-1 text-left text-[11px] font-medium uppercase tracking-widest text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
