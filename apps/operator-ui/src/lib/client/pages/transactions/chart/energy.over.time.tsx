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

export interface EnergyOverTimeProps {
  meterValues: MeterValueDto[];
  validContexts: OCPP2_0_1.ReadingContextEnumType[];
}

export const EnergyOverTime = ({ meterValues, validContexts }: EnergyOverTimeProps) => {
  const translate = useTranslate();
  const data = useMemo(
    () =>
      getTimestampToMeasurandArray(
        meterValues,
        OCPP2_0_1.MeasurandEnumType.Energy_Active_Import_Register,
        new Set(validContexts),
      ).map(([elapsedTime, kWh]) => ({ elapsedTime, kWh: Number(kWh) })),
    [meterValues, validContexts],
  );
  return (
    <MeterLineChart
      title={translate('Transactions.charts.energyTitle')}
      data={data}
      dataKey="kWh"
      unit="kWh"
      emptyMessage={translate('Transactions.charts.noEnergyData')}
    />
  );
};
