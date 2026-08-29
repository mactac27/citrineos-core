// SPDX-License-Identifier: Apache-2.0
'use client';

import React, { createContext, useContext } from 'react';

/// Signals whether the shell's arrival loader has finished playing
/// (dark bg + sonar rings + circle reveal). Any component inside
/// SpeculaShell that runs its own mount animation should gate on
/// `arrived` so its animation only starts once the loader is gone —
/// otherwise the animation plays behind the loader and finishes
/// before the user can see it.
type ShellArrivalCtx = { arrived: boolean };

const Ctx = createContext<ShellArrivalCtx>({ arrived: true });

export function ShellArrivalProvider({
  arrived,
  children,
}: React.PropsWithChildren<{ arrived: boolean }>) {
  return <Ctx.Provider value={{ arrived }}>{children}</Ctx.Provider>;
}

/// True once the shell's initial loader has fully unmounted. Defaults
/// to true when used outside a provider so components rendered
/// without the shell (tests, storybook) don't hang forever waiting
/// for a signal that never comes.
export function useShellArrival(): boolean {
  return useContext(Ctx).arrived;
}
