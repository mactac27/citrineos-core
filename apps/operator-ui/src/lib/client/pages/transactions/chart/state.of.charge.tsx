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

export interface StateOfChargeProps {
  meterValues: MeterValueDto[];
  validContexts: OCPP2_0_1.ReadingContextEnumType[];
}

export const StateOfCharge = ({ meterValues, validContexts }: StateOfChargeProps) => {
  const translate = useTranslate();
  const data = useMemo(
    () =>
      getTimestampToMeasurandArray(
        meterValues,
        OCPP2_0_1.MeasurandEnumType.SoC,
        new Set(validContexts),
      ).map(([elapsedTime, value]) => ({ elapsedTime, soc: Number(value) })),
    [meterValues, validContexts],
  );
  return (
    <MeterLineChart
      title={translate('Transactions.charts.stateOfChargeTitle')}
      data={data}
      dataKey="soc"
      color="#e07c1f"
      unit="%"
      yDomain={[0, 100]}
      emptyMessage={translate('Transactions.charts.noStateOfChargeData')}
    />
  );
};
