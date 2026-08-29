// SPDX-License-Identifier: Apache-2.0
'use client';

import React, { useEffect, useState } from 'react';
import { useIsAuthenticated } from '@refinedev/core';
import { useRouter } from 'next/navigation';
import { useLoaderPresence } from '@lib/client/hooks/use.loader.presence';
import { useMinLoading } from '@lib/client/hooks/use.min.loading';
import { ShellArrivalProvider } from '@lib/client/hooks/use.shell.arrival';
import { SpeculaTopNav } from './top-nav';

/// Replacement for CitrineOS's `AuthenticatedLayout`. Same responsibilities
/// (auth guard, redirect on unauth, loading state), different chrome:
/// top nav instead of left sider, no first-login modal or app modal
/// stack (those can be re-added if we need them; punting for the shell
/// rebuild pass).
///
/// Loading experience:
///   - `LogoSonarLoader` covers the screen with dark navy + sonar
///     pulses + centered logo while auth resolves. Held for a
///     minimum of 1000ms so the branded moment always plays.
///   - When it exits it runs an internal sequence (logo shrinks →
///     circle in page-bg color expands to cover screen → unmount).
///     The shell is already rendered underneath, so the reveal is
///     instant once the loader unmounts.
export function SpeculaShell({ children }: React.PropsWithChildren) {
  const router = useRouter();
  const { data, isLoading } = useIsAuthenticated();
  const { setLoaderVisible, onLoaderExited } = useLoaderPresence();

  useEffect(() => {
    if (!isLoading && data?.authenticated === false) {
      router.push('/login');
    }
  }, [isLoading, data, router]);

  const authPending = isLoading;
  const showLoader = useMinLoading(authPending, 1000);

  // Nav-logo entrance gate. Starts true when no loader is up (so
  // the nav animates in immediately on the common return-visit
  // path); starts false when a loader IS up (so the nav waits for
  // the loader's exit before appearing).
  const [logoReady, setLogoReady] = useState(() => !showLoader);

  // Shell owns the HIDE side of the loader ownership contract
  // (login owns SHOW). While auth is pending, keep the loader up;
  // once settled, give the dashboard a beat to hydrate, then drop
  // the loader with the exit-complete callback flipping logoReady.
  useEffect(() => {
    if (showLoader) {
      setLoaderVisible(true);
      return;
    }
    const t = window.setTimeout(() => {
      onLoaderExited(() => setLogoReady(true));
      setLoaderVisible(false);
    }, 600);
    return () => window.clearTimeout(t);
  }, [showLoader, setLoaderVisible, onLoaderExited]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SpeculaTopNav logoReady={logoReady} />
      <main className="mx-auto max-w-[1600px] px-6 py-8">
        {/* Broadcast the loader-done signal so page-level content
            (OverviewHeader, AnimatedTile, etc.) can gate its own
            mount animations on the loader unmounting — otherwise
            those animations play behind the loader and finish
            invisibly before the user sees them. */}
        <ShellArrivalProvider arrived={logoReady}>
          {children}
        </ShellArrivalProvider>
      </main>
    </div>
  );
}
