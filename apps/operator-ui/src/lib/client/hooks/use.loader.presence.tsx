// SPDX-License-Identifier: Apache-2.0
'use client';

import { LogoSonarLoader } from '@lib/client/components/logo-sonar-loader';
import { AnimatePresence } from 'framer-motion';
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

/// A single `<LogoSonarLoader />` hoisted above the app router so it
/// stays mounted across page navigations. The old setup mounted the
/// loader in TWO places (the /login page's alreadyAuthed catcher AND
/// the SpeculaShell) which produced a visible flash-in / disappear /
/// re-appear cycle every time the user signed in. With a single
/// persistent instance, the loader just fades in on demand and stays
/// through the login → overview navigation.
///
/// Usage:
///   const { setLoaderVisible, onLoaderExited } = useLoaderPresence();
///   setLoaderVisible(true);   // shows the loader
///   setLoaderVisible(false);  // triggers the exit animation
///   onLoaderExited(() => ...) // one-shot callback fired when the
///                             // exit animation finishes; used by
///                             // SpeculaShell to gate the nav-logo
///                             // entrance on the loader unmounting.

type Ctx = {
  setLoaderVisible: (visible: boolean) => void;
  /// Register a one-shot callback fired when the loader's exit
  /// animation completes. Callback is cleared after firing so a
  /// repeat show/hide cycle won't accidentally reuse a stale
  /// listener from a prior mount.
  onLoaderExited: (cb: () => void) => void;
};

const LoaderPresenceContext = createContext<Ctx | null>(null);

export function LoaderPresenceProvider({
  children,
}: React.PropsWithChildren) {
  const [visible, setVisible] = useState(false);
  const exitedCbRef = useRef<(() => void) | null>(null);

  const setLoaderVisible = useCallback((v: boolean) => {
    setVisible(v);
  }, []);

  const onLoaderExited = useCallback((cb: () => void) => {
    exitedCbRef.current = cb;
  }, []);

  return (
    <LoaderPresenceContext.Provider
      value={{ setLoaderVisible, onLoaderExited }}
    >
      {children}
      <AnimatePresence
        onExitComplete={() => {
          const cb = exitedCbRef.current;
          exitedCbRef.current = null;
          cb?.();
        }}
      >
        {visible ? <LogoSonarLoader key="global-loader" /> : null}
      </AnimatePresence>
    </LoaderPresenceContext.Provider>
  );
}

export function useLoaderPresence(): Ctx {
  const ctx = useContext(LoaderPresenceContext);
  if (!ctx) {
    // Guard against consumers rendered outside the provider — better
    // to no-op than to throw and blank the whole page mid-nav.
    return {
      setLoaderVisible: () => undefined,
      onLoaderExited: () => undefined,
    };
  }
  return ctx;
}
