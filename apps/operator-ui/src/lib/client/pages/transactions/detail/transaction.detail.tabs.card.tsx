// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import { Card, CardContent } from '@lib/client/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@lib/client/components/ui/tabs';
import { cardTabsStyle } from '@lib/client/styles/card';
import { CanAccess, useList, useTranslate } from '@refinedev/core';
import { ActionType, ResourceType, TransactionAccessType } from '@lib/utils/access.types';
import { AccessDeniedFallback } from '@lib/utils/AccessDeniedFallback';
import { Table } from '@lib/client/components/table';
import {
  type MeterValueDto,
  MeterValueProps,
  OCPP2_0_1,
  type TransactionDto,
} from '@citrineos/base';
import { GET_AUTHORIZATIONS_BY_TRANSACTION } from '@lib/queries/authorizations';
import { getPlainToInstanceOptions } from '@lib/utils/tables';
import { pageFlex } from '@lib/client/styles/page';
import { MultiSelect } from '@lib/client/components/multi-select';
import { ChartsWrapper } from '@lib/client/pages/transactions/chart/charts.wrapper';
import { TransactionEventsList } from '@lib/client/pages/transactions/detail/transaction-events/transaction.events.list';
import { OCPPMessages } from '@lib/client/pages/charging-stations/detail/ocpp.messages';
import { GET_METER_VALUES_FOR_TRANSACTION } from '@lib/queries/meter.values';
import { MeterValueClass } from '@lib/cls/meter.value.dto';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AuthorizationClass } from '@lib/cls/authorization.dto';
import { useColumnPreferences } from '@lib/client/hooks/useColumnPreferences';
import { getAuthorizationsColumns } from '@lib/client/pages/authorizations/columns';
import { useQueryState } from 'nuqs';
import { DETAIL_TAB_STATE } from '@lib/utils/consts';

enum TransactionDetailTabType {
  authorizations = 'authorizations',
  meterValues = 'meterValues',
  events = 'events',
  ocppMessages = 'ocppMessages',
}

const twoMinutesInMs = 2 * 60 * 1000;

export const TransactionDetailTabsCard = ({ transaction }: { transaction: TransactionDto }) => {
  const translate = useTranslate();

  const [validContexts, setValidContexts] = useState<OCPP2_0_1.ReadingContextEnumType[]>([
    OCPP2_0_1.ReadingContextEnumType.Transaction_Begin,
    OCPP2_0_1.ReadingContextEnumType.Sample_Periodic,
    OCPP2_0_1.ReadingContextEnumType.Transaction_End,
  ]);

  const {
    query: { data: meterValuesData },
  } = useList<MeterValueDto>({
    resource: ResourceType.METER_VALUES,
    meta: {
      gqlQuery: GET_METER_VALUES_FOR_TRANSACTION,
      gqlVariables: {
        limit: 10000,
        transactionDatabaseId: Number(transaction.id),
      },
    },
    sorters: [{ field: MeterValueProps.timestamp, order: 'asc' }],
    queryOptions: getPlainToInstanceOptions(MeterValueClass),
  });
  const meterValues = meterValuesData?.data ?? [];

  const authorization = transaction?.authorization;

  const { renderedVisibleColumns } = useColumnPreferences(
    getAuthorizationsColumns(translate),
    ResourceType.AUTHORIZATIONS,
  );

  const [tab, setTab] = useQueryState(DETAIL_TAB_STATE);

  // Sequential tab transition: current tab plays exit (260ms), holds
  // during a short wait (100ms), then Radix's active value swaps and
  // the new tab plays enter (360ms). Two staged timers coordinate the
  // handoff. `outgoingTab` marks the currently-visible tab that's on
  // its way out so CSS can pick it out from long-inactive siblings.
  const [outgoingTab, setOutgoingTab] = useState<string | null>(null);
  const swapTimer = useRef<number | null>(null);
  const cleanupTimer = useRef<number | null>(null);

  // `underlineTab` drives the sliding underline indicator. Flips
  // IMMEDIATELY on click (before the content transition even
  // starts) so the underline slide feels responsive; the content
  // itself follows on the 720ms sequential schedule above.
  const defaultTab: string = TransactionDetailTabType.authorizations;
  const [underlineTab, setUnderlineTab] = useState<string>(
    tab && tab in TransactionDetailTabType ? tab : defaultTab,
  );
  // Keep the underline in sync with external Radix value changes
  // (e.g., a URL param arriving with a different tab) — but only
  // when we're not mid-swap, so the two timers here always win.
  useEffect(() => {
    if (!swapTimer.current && !cleanupTimer.current) {
      const next = tab && tab in TransactionDetailTabType ? tab : defaultTab;
      setUnderlineTab(next);
    }
  }, [tab, defaultTab]);

  const TAB_ORDER = useMemo(
    () => [
      TransactionDetailTabType.authorizations,
      TransactionDetailTabType.meterValues,
      TransactionDetailTabType.events,
      TransactionDetailTabType.ocppMessages,
    ],
    [],
  );

  // Measure the active trigger and compute the indicator's transform
  // + width. Runs synchronously after DOM update via useLayoutEffect
  // so the first paint after a tab change already has the indicator
  // in flight (no flash at old position).
  const tabsListRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{
    x: number;
    width: number;
    ready: boolean;
  }>({ x: 0, width: 0, ready: false });
  useLayoutEffect(() => {
    const list = tabsListRef.current;
    if (!list) return;
    const triggers = list.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]');
    const idx = TAB_ORDER.indexOf(underlineTab as TransactionDetailTabType);
    const trigger = triggers[idx];
    if (!trigger) return;
    const listRect = list.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    setIndicator({
      x: triggerRect.left - listRect.left,
      width: triggerRect.width,
      ready: true,
    });
  }, [underlineTab, TAB_ORDER]);
  const handleTabChange = useCallback(
    (nextTab: string) => {
      const currentTab = tab ?? TransactionDetailTabType.authorizations;
      if (currentTab === nextTab) return;

      // Phase 1 — mark current as outgoing so CSS plays the exit.
      // Radix value stays put during this phase, so Radix still
      // renders the current tab as active while we animate it out.
      setOutgoingTab(currentTab);
      // Slide the underline right away — it's a UI affordance,
      // decoupled from the content transition.
      setUnderlineTab(nextTab);

      if (swapTimer.current != null) window.clearTimeout(swapTimer.current);
      if (cleanupTimer.current != null) window.clearTimeout(cleanupTimer.current);

      // Phase 2 (after 260ms exit + 100ms wait) — swap the Radix
      // value. Old tab flips to data-state='inactive' but keeps its
      // data-outgoing='true'; CSS overlays it invisibly so the new
      // active tab can take normal flow and play its enter animation.
      swapTimer.current = window.setTimeout(() => {
        setTab(nextTab);
        swapTimer.current = null;

        // Phase 3 (after the enter animation lands) — clear the
        // outgoing marker so the old tab drops to display:none.
        cleanupTimer.current = window.setTimeout(() => {
          setOutgoingTab(null);
          cleanupTimer.current = null;
        }, 360);
      }, 360);
    },
    [tab, setTab],
  );

  return (
    <Card>
      <CardContent>
        <Tabs
          value={
            tab && tab in TransactionDetailTabType ? tab : TransactionDetailTabType.authorizations
          }
          onValueChange={handleTabChange}
        >
          {/* Tabs list + sliding underline indicator. The indicator
              is an absolute-positioned span at the bottom of the
              relative wrapper, sized and translated to match the
              currently-underlined trigger. Transform + width are
              transitioned so tab switches slide instead of snap. */}
          <div className="relative" ref={tabsListRef}>
            <TabsList>
              <TabsTrigger value={TransactionDetailTabType.authorizations}>
                {translate('Authorizations.Authorizations')}
              </TabsTrigger>
              <TabsTrigger value={TransactionDetailTabType.meterValues}>
                {translate('Transactions.tabs.meterValueData')}
              </TabsTrigger>
              <TabsTrigger value={TransactionDetailTabType.events}>
                {translate('Transactions.tabs.events')}
              </TabsTrigger>
              <TabsTrigger value={TransactionDetailTabType.ocppMessages}>
                {translate('Transactions.tabs.ocppMessages')}
              </TabsTrigger>
            </TabsList>
            <span
              aria-hidden
              // `left-0` is critical: TabsList is inline-flex and
              // doesn't span the wrapper's full width, so without
              // an explicit left anchor the span's `left: auto`
              // stacks it at TabsList's right edge, and the
              // translateX then adds to that offset instead of
              // measuring from the wrapper's left.
              className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-foreground"
              style={{
                transform: `translateX(${indicator.x}px)`,
                width: `${indicator.width}px`,
                opacity: indicator.ready ? 1 : 0,
                transition:
                  'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease-out',
              }}
            />
          </div>

          {/* Relative wrapper so the outgoing tab (position: absolute,
              overlay) can slide out without pushing the incoming tab's
              layout. The active tab stays in normal flow so the
              container height follows its content — outgoing tabs are
              overlays only. */}
          <div className="relative">
          <TabsContent
            value={TransactionDetailTabType.authorizations}
            className={`${cardTabsStyle} tab-panel`}
            forceMount
            data-outgoing={outgoingTab === TransactionDetailTabType.authorizations}
          >
            <CanAccess
              resource={ResourceType.AUTHORIZATIONS}
              action={ActionType.LIST}
              fallback={<AccessDeniedFallback />}
            >
              <Table
                refineCoreProps={{
                  resource: ResourceType.AUTHORIZATIONS,
                  meta: {
                    gqlQuery: GET_AUTHORIZATIONS_BY_TRANSACTION,
                    gqlVariables: {
                      id: authorization?.id,
                      offset: 0,
                      limit: 10,
                      order_by: [],
                    },
                  },
                  queryOptions: {
                    ...getPlainToInstanceOptions(AuthorizationClass),
                    select: (data: any) => {
                      return data;
                    },
                  },
                }}
                enableSorting
                enableFilters
                showHeader
                tableStateKey={ResourceType.AUTHORIZATIONS}
              >
                {renderedVisibleColumns}
              </Table>
            </CanAccess>
          </TabsContent>

          <TabsContent
            value={TransactionDetailTabType.meterValues}
            className={`${cardTabsStyle} tab-panel`}
            forceMount
            data-outgoing={outgoingTab === TransactionDetailTabType.meterValues}
          >
            <CanAccess
              resource={ResourceType.TRANSACTIONS}
              action={ActionType.ACCESS}
              fallback={<AccessDeniedFallback />}
              params={{
                id: transaction.id,
                accessType: TransactionAccessType.EVENTS,
              }}
            >
              <div className={pageFlex}>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold">
                    {translate('Transactions.tabs.contexts')}
                  </label>
                  <MultiSelect<OCPP2_0_1.ReadingContextEnumType>
                    options={Object.values(OCPP2_0_1.ReadingContextEnumType)}
                    selectedValues={validContexts}
                    setSelectedValues={setValidContexts}
                    placeholder={translate('Transactions.tabs.selectReadingContexts')}
                    searchPlaceholder={translate('Transactions.tabs.searchReadingContexts')}
                  />
                </div>

                <ChartsWrapper meterValues={meterValues} validContexts={validContexts} />
              </div>
            </CanAccess>
          </TabsContent>

          <TabsContent
            value={TransactionDetailTabType.events}
            className={`${cardTabsStyle} tab-panel`}
            forceMount
            data-outgoing={outgoingTab === TransactionDetailTabType.events}
          >
            <CanAccess
              resource={ResourceType.TRANSACTIONS}
              action={ActionType.ACCESS}
              fallback={<AccessDeniedFallback />}
              params={{
                id: transaction.id,
                accessType: TransactionAccessType.EVENTS,
              }}
            >
              <TransactionEventsList
                transactionDatabaseId={transaction.id}
                ocppTransactionId={
                  transaction.transactionId ? Number(transaction.transactionId) : undefined
                }
                ocppConnectionName={transaction.ocppConnectionName}
              />
            </CanAccess>
          </TabsContent>

          <TabsContent
            value={TransactionDetailTabType.ocppMessages}
            className={`${cardTabsStyle} tab-panel`}
            forceMount
            data-outgoing={outgoingTab === TransactionDetailTabType.ocppMessages}
          >
            <CanAccess
              resource={ResourceType.TRANSACTIONS}
              action={ActionType.ACCESS}
              fallback={<AccessDeniedFallback />}
              params={{
                id: transaction.id,
                accessType: TransactionAccessType.EVENTS,
              }}
            >
              <OCPPMessages
                stationId={transaction.stationId}
                initialStartDate={
                  transaction.startTime
                    ? new Date(new Date(transaction.startTime).getTime() - twoMinutesInMs)
                    : null
                }
                initialEndDate={
                  transaction.endTime
                    ? new Date(new Date(transaction.endTime).getTime() + twoMinutesInMs)
                    : new Date()
                }
              />
            </CanAccess>
          </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};
