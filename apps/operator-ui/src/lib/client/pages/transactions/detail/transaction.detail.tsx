// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import type { TransactionDto } from '@citrineos/base';
import { TransactionDetailCard } from '@lib/client/pages/transactions/detail/transaction.detail.card';
import { TransactionClass } from '@lib/cls/transaction.dto';
import { TRANSACTION_GET_QUERY } from '@lib/queries/transactions';
import { ActionType, ResourceType } from '@lib/utils/access.types';
import { getPlainToInstanceOptions } from '@lib/utils/tables';
import { CanAccess, useOne, useTranslate } from '@refinedev/core';
import { pageFlex, pageMargin } from '@lib/client/styles/page';
import { TransactionDetailTabsCard } from '@lib/client/pages/transactions/detail/transaction.detail.tabs.card';
import { Skeleton } from '@lib/client/components/ui/skeleton';
import { NoDataFoundCard } from '@lib/client/components/no-data-found-card';
import { AccessDeniedFallbackCard } from '@lib/client/components/access-denied-fallback-card';
import React from 'react';

type TransactionDetailProps = {
  params: { id: string };
  /// 'page' (default) renders inside a full page shell with margins
  /// and each section wrapped in a `<Card>`. 'modal' strips those:
  /// no page margins, transparent card backgrounds (see the CSS
  /// scoped by `data-detail-mode="modal"` in globals.css), and the
  /// underlying `TransactionDetailCard` skips its own header row
  /// (which the modal chrome supplies instead).
  mode?: 'page' | 'modal';
};

export const TransactionDetail = ({ params, mode = 'page' }: TransactionDetailProps) => {
  const { id } = params;
  const translate = useTranslate();

  const {
    query: { data: transactionData, isLoading },
  } = useOne<TransactionDto>({
    resource: ResourceType.TRANSACTIONS,
    id,
    meta: { gqlQuery: TRANSACTION_GET_QUERY },
    queryOptions: getPlainToInstanceOptions(TransactionClass, true),
  });
  const transaction = transactionData?.data;

  // Modal mode drops the page-level margin/flex utilities and adds
  // a `data-detail-mode` attribute so scoped CSS in globals.css can
  // strip the white Card chrome (background, border, shadow) that
  // reads as nested tiles inside the modal.
  const wrapperClass =
    mode === 'modal' ? 'flex flex-col gap-4 px-6 py-4' : `${pageMargin} ${pageFlex}`;

  if (isLoading) {
    return (
      <div className={wrapperClass} data-detail-mode={mode}>
        <Skeleton className="h-50 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  } else if (!transaction) {
    return (
      <div className={wrapperClass} data-detail-mode={mode}>
        <NoDataFoundCard message={translate('Transactions.noDataFound', { id })} />
      </div>
    );
  }

  return (
    <CanAccess
      resource={ResourceType.TRANSACTIONS}
      action={ActionType.SHOW}
      params={{ id: transaction.id }}
      fallback={
        <div className={wrapperClass} data-detail-mode={mode}>
          <AccessDeniedFallbackCard />
        </div>
      }
    >
      <div className={wrapperClass} data-detail-mode={mode}>
        <TransactionDetailCard transaction={transaction} mode={mode} />
        <TransactionDetailTabsCard transaction={transaction} />
      </div>
    </CanAccess>
  );
};
