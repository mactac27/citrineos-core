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

export interface CurrentOverTimeProps {
  meterValues: MeterValueDto[];
  validContexts: OCPP2_0_1.ReadingContextEnumType[];
}

export const CurrentOverTime = ({ meterValues, validContexts }: CurrentOverTimeProps) => {
  const translate = useTranslate();
  const data = useMemo(
    () =>
      getTimestampToMeasurandArray(
        meterValues,
        OCPP2_0_1.MeasurandEnumType.Current_Import,
        new Set(validContexts),
      ).map(([elapsedTime, a]) => ({ elapsedTime, a: Number(a) })),
    [meterValues, validContexts],
  );
  return (
    <MeterLineChart
      title={translate('Transactions.charts.currentTitle')}
      data={data}
      dataKey="a"
      color="#3faa6b"
      unit="A"
      emptyMessage={translate('Transactions.charts.noCurrentData')}
    />
  );
};
