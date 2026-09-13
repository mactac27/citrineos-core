// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import React from 'react';
import type { AuthorizationDto } from '@citrineos/base';
import { AuthorizationDetailCard } from '@lib/client/pages/authorizations/detail/authorization.detail.card';
import { AuthorizationClass } from '@lib/cls/authorization.dto';
import { AUTHORIZATIONS_SHOW_QUERY } from '@lib/queries/authorizations';
import { ActionType, ResourceType } from '@lib/utils/access.types';
import { AccessDeniedFallback } from '@lib/utils/AccessDeniedFallback';
import { getPlainToInstanceOptions } from '@lib/utils/tables';
import { CanAccess, useOne, useTranslate } from '@refinedev/core';
import { pageFlex, pageMargin } from '@lib/client/styles/page';
import { AuthorizationDetailTabsCard } from '@lib/client/pages/authorizations/detail/authorization.detail.tabs.card';
import { Skeleton } from '@lib/client/components/ui/skeleton';
import { NoDataFoundCard } from '@lib/client/components/no-data-found-card';
import { AccessDeniedFallbackCard } from '@lib/client/components/access-denied-fallback-card';

type AuthorizationDetailProps = {
  params: { id: string };
  /// 'page' (default) renders inside a full page shell with margins
  /// and each section wrapped in a `<Card>`. 'modal' strips those:
  /// no page margins, transparent card backgrounds (see the CSS
  /// scoped by `data-detail-mode="modal"` in globals.css), and the
  /// underlying `AuthorizationDetailCard` skips its own header row
  /// (which the modal chrome supplies instead).
  mode?: 'page' | 'modal';
};

export const AuthorizationDetail: React.FC<AuthorizationDetailProps> = ({
  params,
  mode = 'page',
}) => {
  const { id } = params;
  const translate = useTranslate();
  const wrapperClass =
    mode === 'modal' ? 'flex flex-col gap-4 px-6 py-4' : `${pageMargin} ${pageFlex}`;

  const {
    query: { data: authData, isLoading: authLoading },
  } = useOne<AuthorizationDto>({
    resource: ResourceType.AUTHORIZATIONS,
    id,
    meta: { gqlQuery: AUTHORIZATIONS_SHOW_QUERY },
    queryOptions: {
      // Gate the query so a brief undefined id (during modal
      // teardown or prop transition) doesn't submit
      // AuthorizationsShow with empty variables and trip Hasura's
      // non-nullable-variable error.
      enabled: id != null && id !== '',
      ...getPlainToInstanceOptions(AuthorizationClass, true),
    },
  });
  const authorization = authData?.data;

  if (authLoading) {
    return (
      <div className={wrapperClass} data-detail-mode={mode}>
        <Skeleton className="h-50 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  } else if (!authorization) {
    return (
      <div className={wrapperClass} data-detail-mode={mode}>
        <NoDataFoundCard message={translate('Authorizations.noDataFound', { id })} />
      </div>
    );
  }

  return (
    <CanAccess
      resource={ResourceType.AUTHORIZATIONS}
      action={ActionType.SHOW}
      params={{ id: authorization.id }}
      fallback={
        <div className={wrapperClass} data-detail-mode={mode}>
          <AccessDeniedFallbackCard />
        </div>
      }
    >
      <div className={wrapperClass} data-detail-mode={mode}>
        <AuthorizationDetailCard authorization={authorization} mode={mode} />
        <AuthorizationDetailTabsCard authorization={authorization} />
      </div>
    </CanAccess>
  );
};
