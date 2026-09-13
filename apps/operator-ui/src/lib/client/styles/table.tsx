// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

/// Platform header typography — small-caps tracked micro-label,
/// muted foreground. Replaces the old text-base + accent-blue +
/// semibold treatment (CitrineOS default) with the same vocabulary
/// the Chargers / Constellations pages use for column headers.
export const tableHeaderTextStyle =
  'text-[11px] font-medium uppercase tracking-widest text-foreground/60 inline-flex flex-row items-center gap-x-1.5';

/// Left in place (`bg-secondary`) for the CitrineOS-legacy pages
/// that still expect the lavender header. Scoped overrides in
/// globals.css (`[data-detail-mode='modal'] [data-slot='table-header']`)
/// strip it inside the transaction detail modal. Remove entirely
/// once every table page is redesigned to the new vocabulary.
export const tableHeaderRowStyle = 'bg-secondary';

export const tableWrapperStyle =
  'p-6 border border-border rounded-md bg-card shadow-sm flex flex-col gap-4';

export const tableHeaderWrapperFlex = 'flex justify-between items-center';

export const tableSearchFlex = 'flex gap-2';
