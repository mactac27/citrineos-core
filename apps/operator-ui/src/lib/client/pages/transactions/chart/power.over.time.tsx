// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import type { MeterValueDto } from '@citrineos/base';
import { OCPP2_0_1 } from '@citrineos/base';
import { MeterLineChart } from '@lib/client/pages/transactions/chart/meter.line.chart';
import { getTimestampToMeasurandArray } from '@lib/cls/meter.value.dto';
import { useTranslate } from '@refinedev/core';
import { useMemo } from 'react';

export interface PowerOverTimeProps {
  meterValues: MeterValueDto[];
  validContexts: OCPP2_0_1.ReadingContextEnumType[];
}

export const PowerOverTime = ({ meterValues, validContexts }: PowerOverTimeProps) => {
  const translate = useTranslate();
  const data = useMemo(
    () =>
      getTimestampToMeasurandArray(
        meterValues,
        OCPP2_0_1.MeasurandEnumType.Power_Active_Import,
        new Set(validContexts),
      ).map(([elapsedTime, kw]) => ({ elapsedTime, kw: Number(kw) })),
    [meterValues, validContexts],
  );
  return (
    <MeterLineChart
      title={translate('Transactions.charts.powerTitle')}
      data={data}
      dataKey="kw"
      unit="kW"
      emptyMessage={translate('Transactions.charts.noPowerData')}
    />
  );
};
