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

export interface TemperatureOverTimeProps {
  meterValues: MeterValueDto[];
  validContexts: OCPP2_0_1.ReadingContextEnumType[];
}

/// Charger + battery temperature sample. Safety-relevant: sustained
/// high readings usually precede thermal derating (charger reduces
/// power output to keep components in a safe range). An empty chart
/// is itself signal — it means the charger isn't reporting thermal
/// telemetry, which is worth knowing.
export const TemperatureOverTime = ({
  meterValues,
  validContexts,
}: TemperatureOverTimeProps) => {
  const translate = useTranslate();
  const data = useMemo(
    () =>
      getTimestampToMeasurandArray(
        meterValues,
        OCPP2_0_1.MeasurandEnumType.Temperature,
        new Set(validContexts),
      ).map(([elapsedTime, temp]) => ({ elapsedTime, temp: Number(temp) })),
    [meterValues, validContexts],
  );
  return (
    <MeterLineChart
      // Refine's translate signature is `(key, options, defaultMessage)`
      // — passing a string as the 2nd arg silently becomes `options` and
      // is ignored, so fallbacks must go in the 3rd position.
      title={translate('Transactions.charts.temperatureTitle', {}, 'Temperature Over Time')}
      data={data}
      dataKey="temp"
      color="#c94a3a"
      unit="°C"
      emptyMessage={translate(
        'Transactions.charts.noTemperatureData',
        {},
        'No Temperature data available',
      )}
    />
  );
};
