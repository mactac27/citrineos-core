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

export interface VoltageOverTimeProps {
  meterValues: MeterValueDto[];
  validContexts: OCPP2_0_1.ReadingContextEnumType[];
}

export const VoltageOverTime = ({ meterValues, validContexts }: VoltageOverTimeProps) => {
  const translate = useTranslate();
  const data = useMemo(
    () =>
      getTimestampToMeasurandArray(
        meterValues,
        OCPP2_0_1.MeasurandEnumType.Voltage,
        new Set(validContexts),
      ).map(([elapsedTime, v]) => ({ elapsedTime, v: Number(v) })),
    [meterValues, validContexts],
  );
  return (
    <MeterLineChart
      title={translate('Transactions.charts.voltageTitle')}
      data={data}
      dataKey="v"
      color="#6e87ff"
      unit="V"
      emptyMessage={translate('Transactions.charts.noVoltageData')}
    />
  );
};
