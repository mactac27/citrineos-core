// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@lib/client/components/ui/card';
import { Button } from '@lib/client/components/ui/button';
import { Checkbox } from '@lib/client/components/ui/checkbox';
import { Input } from '@lib/client/components/ui/input';
import { Label } from '@lib/client/components/ui/label';
import { Switch } from '@lib/client/components/ui/switch';
import { Separator } from '@lib/client/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lib/client/components/ui/select';
import { Calendar } from '@lib/client/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@lib/client/components/ui/popover';
import { ConfirmDialog } from '@lib/client/components/ui/confirm';
import type {
  LocationHours,
  LocationRegularHours,
  LocationExceptionalPeriod,
} from '@citrineos/base';
import { Plus, Trash2, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { cn } from '@lib/utils/cn';
import { heading3Style } from '@lib/client/styles/page';
import { useTranslate } from '@refinedev/core';

interface OpeningHoursFormProps {
  value?: LocationHours;
  onChange?: (value: LocationHours) => void;
  /// Strip the outer Card + title so the form can sit inline in a
  /// parent surface (e.g. the constellation edit takeover). Inner
  /// section labels also shrink to match the parent's typography.
  bare?: boolean;
}

const WEEKDAYS = [
  { value: 1, labelKey: 'openingHours.weekdays.monday' },
  { value: 2, labelKey: 'openingHours.weekdays.tuesday' },
  { value: 3, labelKey: 'openingHours.weekdays.wednesday' },
  { value: 4, labelKey: 'openingHours.weekdays.thursday' },
  { value: 5, labelKey: 'openingHours.weekdays.friday' },
  { value: 6, labelKey: 'openingHours.weekdays.saturday' },
  { value: 7, labelKey: 'openingHours.weekdays.sunday' },
];

/// 96 time-of-day options at 15-min steps. Value is 24-hour "HH:MM"
/// (matches what LocationRegularHours stores on the wire); label is
/// 12-hour "H:MM AM/PM" for legibility. Used by the bare-mode
/// takeover to replace the native browser time picker with a
/// themed shadcn Select.
const TIME_OPTIONS_15MIN: Array<{ value: string; label: string }> = (() => {
  const items: Array<{ value: string; label: string }> = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh24 = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const ampm = h < 12 ? 'AM' : 'PM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      items.push({ value: `${hh24}:${mm}`, label: `${h12}:${mm} ${ampm}` });
    }
  }
  return items;
})();

/// Best-effort re-format of a stored time string ("09:00", "9:0",
/// "23:07") into the 12-hour display used by TIME_OPTIONS_15MIN.
/// Legacy/off-grid values (e.g. 9:07) that don't match any option
/// still render as a readable label rather than blanking the field.
function labelForTime(raw: string): string {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(raw.trim());
  if (!m) return raw;
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = String(Math.max(0, Math.min(59, parseInt(m[2], 10)))).padStart(2, '0');
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${ampm}`;
}

export const OpeningHoursForm: React.FC<OpeningHoursFormProps> = ({ value, onChange, bare = false }) => {
  const translate = useTranslate();
  const defaultValue: LocationHours = { twentyfourSeven: false };
  const [localValue, setLocalValue] = useState<LocationHours>(value || defaultValue);

  useEffect(() => {
    setLocalValue(value || defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (newValue: LocationHours) => {
    setLocalValue(newValue);
    onChange?.(newValue);
  };

  const addRegularHours = () => addRegularHoursForDays([1]);

  /// Bulk add: append one row per weekday in `days` at 09:00-17:00.
  /// Skips days that already have any row so re-picking "Weekdays"
  /// after adjusting Wednesday doesn't wipe or duplicate it.
  const addRegularHoursForDays = (days: number[]) => {
    const existing = new Set((localValue.regularHours || []).map((h) => h.weekday));
    const added: LocationRegularHours[] = days
      .filter((d) => !existing.has(d))
      .map((weekday) => ({ weekday, periodBegin: '09:00', periodEnd: '17:00' }));
    if (added.length === 0) return;
    handleChange({
      ...localValue,
      regularHours: [...(localValue.regularHours || []), ...added],
    });
  };

  const updateRegularHours = (
    index: number,
    field: keyof LocationRegularHours,
    fieldValue: number | string,
  ) => {
    const regularHours = [...(localValue.regularHours || [])];
    regularHours[index] = { ...regularHours[index], [field]: fieldValue };

    const updatedValue = {
      ...localValue,
      regularHours,
    };
    handleChange(updatedValue);
  };

  const removeRegularHours = (index: number) => {
    const regularHours = [...(localValue.regularHours || [])];
    regularHours.splice(index, 1);

    const updatedValue = {
      ...localValue,
      regularHours,
    };
    handleChange(updatedValue);
  };

  const addExceptionalPeriod = (type: 'exceptionalOpenings' | 'exceptionalClosings') => {
    const newPeriod: LocationExceptionalPeriod = {
      periodBegin: new Date(),
      periodEnd: new Date(),
    };

    const updatedValue = {
      ...localValue,
      [type]: [...(localValue[type] || []), newPeriod],
    };
    handleChange(updatedValue);
  };

  const updateExceptionalPeriod = (
    type: 'exceptionalOpenings' | 'exceptionalClosings',
    index: number,
    dateRange: DateRange | undefined,
  ) => {
    if (!dateRange?.from || !dateRange?.to) return;

    const periods = [...(localValue[type] || [])];
    periods[index] = {
      periodBegin: dateRange.from,
      periodEnd: dateRange.to,
    };

    const updatedValue = {
      ...localValue,
      [type]: periods,
    };
    handleChange(updatedValue);
  };

  /// Bare-mode helper — the takeover uses two independent native
  /// `<input type="date">` fields (start + end) instead of a
  /// range-picker calendar, so each side commits on its own.
  const updateExceptionalPeriodSide = (
    type: 'exceptionalOpenings' | 'exceptionalClosings',
    index: number,
    side: 'periodBegin' | 'periodEnd',
    ymd: string,
  ) => {
    const periods = [...(localValue[type] || [])];
    const existing = periods[index] ?? { periodBegin: new Date(), periodEnd: new Date() };
    const nextDate = ymd ? new Date(`${ymd}T00:00:00`) : existing[side];
    periods[index] = { ...existing, [side]: nextDate };
    handleChange({ ...localValue, [type]: periods });
  };

  const removeExceptionalPeriod = (
    type: 'exceptionalOpenings' | 'exceptionalClosings',
    index: number,
  ) => {
    const periods = [...(localValue[type] || [])];
    periods.splice(index, 1);

    const updatedValue = {
      ...localValue,
      [type]: periods,
    };
    handleChange(updatedValue);
  };

  const toggle24Seven = (checked: boolean) => {
    const updatedValue = {
      ...localValue,
      twentyfourSeven: checked,
      // Clear regular hours if 24/7 is enabled
      regularHours: checked ? [] : localValue.regularHours,
    };
    handleChange(updatedValue);
  };

  // In `bare` mode we skip the outer Card + title so the form can
  // slot directly into a parent surface (the constellation edit
  // takeover on the RHS). Inner section labels also shrink to the
  // parent's compact typography, per-row wrappers become plain
  // bordered divs (no nested Card shadow-boxes), and the add-row
  // buttons pick up the same subtle icon-first style used by the
  // "Add Charger" affordance on the detail panel.
  const sectionLabelClass = bare
    ? 'text-[11px] font-medium uppercase tracking-widest text-foreground/60'
    : 'font-medium';
  const bodyClass = bare ? 'space-y-5' : 'space-y-6';
  // Non-bare rows mimic the previous Card wrapper — same border /
  // background / shadow so the full-page editor's look is unchanged.
  // Bare rows drop the enclosing chrome (no border, no shadow, no
  // fill) so each row reads as a compact record instead of a nested
  // tile-within-a-tile.
  const rowShellClass = bare
    ? 'py-1'
    : 'rounded-md border border-border bg-card p-4 text-card-foreground shadow-sm';
  const compactCtrlClass = bare
    ? '[&_button]:h-8 [&_button]:text-xs [&_input]:h-8 [&_input]:text-xs'
    : '';

  /// Renders either a compact icon-first button (bare mode) or the
  /// default outlined pill (full-page mode). Kept inline so it can
  /// close over `bare` without threading the flag through props.
  const AddRowButton = ({
    onClick,
    label,
  }: {
    onClick: () => void;
    label: string;
  }) =>
    bare ? (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <Plus className="size-3" />
        {label}
      </button>
    ) : (
      <Button type="button" variant="outline" size="sm" onClick={onClick}>
        <Plus className="h-4 w-4 mr-1" />
        {label}
      </Button>
    );
  const body = (
    <div className={bodyClass}>
        {/* 24/7 Toggle */}
        <div className="flex items-center gap-3">
          <Switch checked={localValue.twentyfourSeven} onCheckedChange={toggle24Seven} />
          <Label className={bare ? 'text-xs font-medium' : 'font-medium'}>
            {translate('openingHours.twentyFourSeven')}
          </Label>
        </div>

        {/* Regular Hours */}
        {!localValue.twentyfourSeven && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className={sectionLabelClass}>{translate('openingHours.regularHours')}</h4>
              {bare ? (
                <AddHoursMenu
                  existingDays={(localValue.regularHours || []).map((h) => h.weekday)}
                  onAdd={addRegularHoursForDays}
                  label={translate('openingHours.form.addHours')}
                  weekdayLabels={WEEKDAYS.map((d) => translate(d.labelKey))}
                />
              ) : (
                <AddRowButton
                  onClick={addRegularHours}
                  label={translate('openingHours.form.addHours')}
                />
              )}
            </div>

            {(localValue.regularHours || []).map((hours, index) => (
              <div key={index} className={`${rowShellClass} ${compactCtrlClass}`}>
                {/* Bare mode uses a flex row so the day select stays
                    a fixed narrow width, the two time inputs grow to
                    show their full "HH:MM AM/PM" + native picker
                    glyph, and the trash button snaps to the far
                    right. Full-page mode keeps the 4-equal-column
                    grid so its wider container has room to breathe. */}
                <div
                  className={
                    bare
                      ? 'flex items-center gap-2'
                      : 'grid grid-cols-4 gap-4 items-center'
                  }
                >
                  <div className={bare ? 'w-28 shrink-0' : ''}>
                    <Select
                      value={String(hours.weekday)}
                      onValueChange={(val) =>
                        updateRegularHours(index, 'weekday', parseInt(val, 10))
                      }
                    >
                      <SelectTrigger className={bare ? 'w-full' : undefined}>
                        <SelectValue placeholder={translate('openingHours.form.selectDay')} />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((day) => (
                          <SelectItem key={day.value} value={String(day.value)}>
                            {translate(day.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className={bare ? 'min-w-0 flex-1' : ''}>
                    {bare ? (
                      <TimeSelect
                        value={hours.periodBegin || '09:00'}
                        onChange={(v) => updateRegularHours(index, 'periodBegin', v)}
                      />
                    ) : (
                      <Input
                        type="time"
                        value={hours.periodBegin || '09:00'}
                        onChange={(e) => updateRegularHours(index, 'periodBegin', e.target.value)}
                      />
                    )}
                  </div>

                  <div className={bare ? 'min-w-0 flex-1' : ''}>
                    {bare ? (
                      <TimeSelect
                        value={hours.periodEnd || '17:00'}
                        onChange={(v) => updateRegularHours(index, 'periodEnd', v)}
                      />
                    ) : (
                      <Input
                        type="time"
                        value={hours.periodEnd || '17:00'}
                        onChange={(e) => updateRegularHours(index, 'periodEnd', e.target.value)}
                      />
                    )}
                  </div>

                  <ConfirmDialog
                    title={translate('openingHours.form.removeTimeSlot')}
                    description={translate('openingHours.form.removeTimeSlotConfirm')}
                    onConfirm={() => removeRegularHours(index)}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={bare ? 'ml-auto shrink-0' : ''}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </ConfirmDialog>
                </div>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Exceptional Openings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className={sectionLabelClass}>{translate('openingHours.exceptionalOpenings')}</h4>
              <p className={bare ? 'mt-0.5 text-xs text-foreground/60' : 'text-sm text-muted-foreground'}>
                {translate('openingHours.form.exceptionalOpeningsDescription')}
              </p>
            </div>
            <AddRowButton
              onClick={() => addExceptionalPeriod('exceptionalOpenings')}
              label={translate('openingHours.form.addOpening')}
            />
          </div>

          {(localValue.exceptionalOpenings || []).map((period, index) => (
            <div key={index} className={`${rowShellClass} ${compactCtrlClass}`}>
              <div className={bare ? 'flex items-center gap-2' : 'flex items-center gap-4'}>
                {bare ? (
                  <DateRangeInputs
                    begin={period.periodBegin}
                    end={period.periodEnd}
                    onChange={(side, ymd) =>
                      updateExceptionalPeriodSide('exceptionalOpenings', index, side, ymd)
                    }
                  />
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'justify-start text-left font-normal flex-1',
                          !period.periodBegin && 'text-muted-foreground',
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {period.periodBegin && period.periodEnd ? (
                          <>
                            {format(new Date(period.periodBegin), 'LLL dd, y')} -{' '}
                            {format(new Date(period.periodEnd), 'LLL dd, y')}
                          </>
                        ) : (
                          translate('Common.pickDateRange')
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{
                          from: period.periodBegin ? new Date(period.periodBegin) : undefined,
                          to: period.periodEnd ? new Date(period.periodEnd) : undefined,
                        }}
                        onSelect={(range) =>
                          updateExceptionalPeriod('exceptionalOpenings', index, range)
                        }
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                )}

                <ConfirmDialog
                  title={translate('openingHours.form.removeOpening')}
                  description={translate('openingHours.form.removeOpeningConfirm')}
                  onConfirm={() => removeExceptionalPeriod('exceptionalOpenings', index)}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={bare ? 'ml-auto shrink-0' : ''}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </ConfirmDialog>
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Exceptional Closings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className={sectionLabelClass}>{translate('openingHours.exceptionalClosings')}</h4>
              <p className={bare ? 'mt-0.5 text-xs text-foreground/60' : 'text-sm text-muted-foreground'}>
                {translate('openingHours.form.exceptionalClosingsDescription')}
              </p>
            </div>
            <AddRowButton
              onClick={() => addExceptionalPeriod('exceptionalClosings')}
              label={translate('openingHours.form.addClosing')}
            />
          </div>

          {(localValue.exceptionalClosings || []).map((period, index) => (
            <div key={index} className={`${rowShellClass} ${compactCtrlClass}`}>
              <div className={bare ? 'flex items-center gap-2' : 'flex items-center gap-4'}>
                {bare ? (
                  <DateRangeInputs
                    begin={period.periodBegin}
                    end={period.periodEnd}
                    onChange={(side, ymd) =>
                      updateExceptionalPeriodSide('exceptionalClosings', index, side, ymd)
                    }
                  />
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'justify-start text-left font-normal flex-1',
                          !period.periodBegin && 'text-muted-foreground',
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {period.periodBegin && period.periodEnd ? (
                          <>
                            {format(new Date(period.periodBegin), 'LLL dd, y')} -{' '}
                            {format(new Date(period.periodEnd), 'LLL dd, y')}
                          </>
                        ) : (
                          translate('Common.pickDateRange')
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{
                          from: period.periodBegin ? new Date(period.periodBegin) : undefined,
                          to: period.periodEnd ? new Date(period.periodEnd) : undefined,
                        }}
                        onSelect={(range) =>
                          updateExceptionalPeriod('exceptionalClosings', index, range)
                        }
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                )}

                <ConfirmDialog
                  title={translate('openingHours.form.removeClosing')}
                  description={translate('openingHours.form.removeClosingConfirm')}
                  onConfirm={() => removeExceptionalPeriod('exceptionalClosings', index)}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={bare ? 'ml-auto shrink-0' : ''}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </ConfirmDialog>
              </div>
            </div>
          ))}
        </div>
    </div>
  );

  if (bare) return body;
  return (
    <Card>
      <CardHeader>
        <h3 className={heading3Style}>{translate('openingHours.title')}</h3>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
};

/// Bulk-add popover for regular hours (bare mode). Presents each
/// weekday as a checkbox — days that already have a row are
/// pre-checked AND disabled so the user can see what's covered
/// without accidentally duplicating them. Quick-select shortcuts
/// (Weekdays, Weekends, All, None) prefill the checkboxes without
/// closing the popover, so the user can e.g. "Weekdays" then also
/// tick Saturday for a Mon-Sat schedule.
function AddHoursMenu({
  existingDays,
  onAdd,
  label,
  weekdayLabels,
}: {
  existingDays: number[];
  onAdd: (days: number[]) => void;
  label: string;
  weekdayLabels: string[];
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const existingSet = new Set(existingDays);

  // Reset the pending selection every time the popover opens so a
  // previous session's ticks don't linger.
  useEffect(() => {
    if (open) setPicked(new Set());
  }, [open]);

  const toggle = (d: number, checked: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(d);
      else next.delete(d);
      return next;
    });
  };
  const setTo = (days: number[]) => setPicked(new Set(days));

  const newDays = [...picked].filter((d) => !existingSet.has(d)).sort((a, b) => a - b);
  const canAdd = newDays.length > 0;
  const commit = () => {
    if (!canAdd) return;
    onAdd(newDays);
    setOpen(false);
  };

  const chipClass =
    'inline-flex cursor-pointer items-center rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <Plus className="size-3" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          <button
            type="button"
            className={chipClass}
            onClick={() => setTo([1, 2, 3, 4, 5])}
          >
            Weekdays
          </button>
          <button
            type="button"
            className={chipClass}
            onClick={() => setTo([6, 7])}
          >
            Weekends
          </button>
          <button
            type="button"
            className={chipClass}
            onClick={() => setTo([1, 2, 3, 4, 5, 6, 7])}
          >
            All
          </button>
          <button type="button" className={chipClass} onClick={() => setTo([])}>
            None
          </button>
        </div>
        <ul className="space-y-1">
          {WEEKDAYS.map((d, i) => {
            const alreadyThere = existingSet.has(d.value);
            const checked = alreadyThere || picked.has(d.value);
            return (
              <li key={d.value}>
                <label
                  className={
                    'flex items-center gap-2 rounded-sm px-1 py-1 text-xs ' +
                    (alreadyThere
                      ? 'text-foreground/40'
                      : 'cursor-pointer text-foreground hover:bg-foreground/5')
                  }
                  title={alreadyThere ? 'Already scheduled' : undefined}
                >
                  <Checkbox
                    checked={checked}
                    disabled={alreadyThere}
                    onCheckedChange={(v) => toggle(d.value, v === true)}
                  />
                  <span className="truncate">{weekdayLabels[i]}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-md px-2 py-1 text-xs text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canAdd}
            onClick={commit}
            className="cursor-pointer rounded-md bg-foreground px-3 py-1 text-xs text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add {newDays.length > 0 ? `${newDays.length} day${newDays.length === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/// Start + end native `<input type="date">` pair for bare mode.
/// Matches the compact aesthetic of the sibling time selects
/// (both are one-tap native pickers) and side-steps the ugly
/// react-day-picker calendar popover. Values are Date-in / YMD-out
/// with local-time conversion so the picker's YYYY-MM-DD string
/// never drifts by a day when the browser is in a non-UTC zone.
function DateRangeInputs({
  begin,
  end,
  onChange,
}: {
  begin: Date | string | undefined;
  end: Date | string | undefined;
  onChange: (side: 'periodBegin' | 'periodEnd', ymd: string) => void;
}) {
  const toYmd = (d: Date | string | undefined): string => {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const inputClass =
    'h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground shadow-none transition-colors focus-visible:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10';
  return (
    <>
      <input
        type="date"
        aria-label="Start date"
        value={toYmd(begin)}
        onChange={(e) => onChange('periodBegin', e.target.value)}
        className={inputClass}
      />
      <span aria-hidden className="text-xs text-foreground/40">→</span>
      <input
        type="date"
        aria-label="End date"
        value={toYmd(end)}
        onChange={(e) => onChange('periodEnd', e.target.value)}
        className={inputClass}
      />
    </>
  );
}

/// Themed time picker used in bare mode. shadcn Select with 15-min
/// step options, replaces the browser's native `<input type="time">`
/// UI (which can't be styled). Legacy values off the 15-min grid
/// are still displayed via `labelForTime` on the trigger, and slot
/// in as a one-off SelectItem so they aren't silently reset.
function TimeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const onGrid = TIME_OPTIONS_15MIN.some((o) => o.value === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-full text-xs">
        <SelectValue>{labelForTime(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {!onGrid && value ? (
          <SelectItem value={value} className="text-xs">
            {labelForTime(value)}
          </SelectItem>
        ) : null}
        {TIME_OPTIONS_15MIN.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
