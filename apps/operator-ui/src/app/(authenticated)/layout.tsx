// SPDX-License-Identifier: Apache-2.0
//
// Was: CitrineOS's `AuthenticatedLayout` (left sider + gradient bg).
// Now: `SpeculaShell` — top-nav shell matching the vSparQ Figma.
// Original AuthenticatedLayout kept in-tree for reference / fallback.

import { SpeculaShell } from '@lib/client/components/specula-shell';
import React from 'react';

export default async function Layout({ children }: React.PropsWithChildren) {
  return <SpeculaShell>{children}</SpeculaShell>;
}
