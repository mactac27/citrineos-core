// SPDX-License-Identifier: Apache-2.0
'use client';

import { AlertCircle } from 'lucide-react';

/// Compact error state that slots into a tile in place of the
/// value + subtext. Small alert icon, short label, muted red tone —
/// enough to signal the failure without making the whole tile
/// scream. Caller keeps the refresh button visible so retry is
/// one click away.
export function TileErrorInline({ message }: { message?: string }) {
  return (
    <div className="flex flex-col gap-1 text-[#c94a3a]">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        Couldn&rsquo;t load
      </div>
      {message ? (
        <div className="line-clamp-2 text-[11px] text-[#c94a3a]/75">
          {message}
        </div>
      ) : null}
    </div>
  );
}
