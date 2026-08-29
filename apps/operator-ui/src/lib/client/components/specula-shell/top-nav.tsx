// SPDX-License-Identifier: Apache-2.0
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useLogout } from '@refinedev/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  MapPin,
  Zap,
  ClipboardList,
  Activity,
  DollarSign,
  Users,
  Search,
  Bell,
  LogOut,
} from 'lucide-react';
import config from '@lib/utils/config';

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

/// Nav model reflects the Specula Figma dashboard: whichever tab matches
/// the current route renders as a pill (icon + label), everything else
/// renders as an icon-only circle with a hover tooltip. Hrefs map onto
/// Refine's authenticated resource routes so the existing pages still
/// work while we rebuild them one by one.
const NAV: NavItem[] = [
  { href: '/overview',          label: 'Dashboard',      Icon: LayoutDashboard },
  { href: '/locations',         label: 'Constellations', Icon: MapPin },
  { href: '/charging-stations', label: 'Charging',       Icon: Zap },
  { href: '/transactions',      label: 'Transactions',   Icon: ClipboardList },
  { href: '/authorizations',    label: 'Authorizations', Icon: Activity },
  { href: '/tariffs',           label: 'Tariffs',        Icon: DollarSign },
  { href: '/partners',          label: 'Partners',       Icon: Users },
];

/// Entrance timing constants — kept here so the nav-item + utility
/// slide-in stagger and the active-pill expansion stay in sync.
///   • `ITEM_BASE_DELAY` — waits for the logo slide-in to land
///     (SpeculaShell fires `logoReady` right when the loader ends
///     unmounting, and the logo animates in over ~550ms).
///   • `ITEM_STAGGER` — per-index delay for the left-to-right cascade.
///   • `PILL_EXPAND_DELAY` — active pill starts expanding after the
///     last icon has fully landed (0.6 + 9*0.08 + 0.4 = 1.72s), plus
///     a small breather.
const ITEM_BASE_DELAY = 0.6;
const ITEM_STAGGER = 0.08;
const ITEM_DURATION = 0.4;
const PILL_EXPAND_DELAY_MS = 1850;

/// Top nav bar — replaces the CitrineOS left sider. Logo left,
/// dashboard tab + icon shortcuts center, search + notifications
/// + avatar right.
///
/// `logoReady` — flipped true by SpeculaShell once the full-screen
/// loader has finished its exit sequence. Drives:
///   1. The brand logo's slide-in from the left.
///   2. The nav + utility icons cascading in from the top,
///      left-to-right, ease-in.
///   3. The active tab expanding from icon-only to full pill + text.
export function SpeculaTopNav({ logoReady = true }: { logoReady?: boolean }) {
  const pathname = usePathname() ?? '';
  const { mutate: logout } = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Active-pill expansion phase. Starts collapsed (icon-only look)
  // and expands after the icon stagger completes. Initializes based
  // on `logoReady` so a same-tab route change (no loader) doesn't
  // re-run the entrance animation on the pill.
  const [pillExpanded, setPillExpanded] = useState(() => logoReady);
  useEffect(() => {
    if (pillExpanded || !logoReady) return;
    const t = setTimeout(() => setPillExpanded(true), PILL_EXPAND_DELAY_MS);
    return () => clearTimeout(t);
  }, [logoReady, pillExpanded]);

  // Dismiss dropdown on click-outside / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Total item count for stagger indexing: 7 nav items + search +
  // bell + avatar = 10.
  const utilityStartIdx = NAV.length; // 7

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-8 px-6">
        {/* Brand */}
        <Link href="/overview" className="flex items-center gap-2 shrink-0">
          {/* Logo: fade-in with ease-in from the LEFT when
              `logoReady` flips true. */}
          <motion.img
            src="/specula-logo.svg"
            alt=""
            width={36}
            height={36}
            className="size-9"
            initial={{ x: -15, opacity: 0 }}
            animate={
              logoReady ? { x: 0, opacity: 1 } : { x: -15, opacity: 0 }
            }
            transition={{ duration: 0.55, ease: 'easeIn' }}
          />
          {/* Wordmark: fade-in with ease-in from the RIGHT — mirrors
              the logo's entrance from the opposite direction. */}
          <motion.span
            className="text-lg font-semibold uppercase tracking-wide text-foreground"
            initial={{ x: 15, opacity: 0 }}
            animate={
              logoReady ? { x: 0, opacity: 1 } : { x: 15, opacity: 0 }
            }
            transition={{ duration: 0.55, ease: 'easeIn' }}
          >
            {config.appName}
          </motion.span>
        </Link>

        {/* Nav items — shifted slightly right of visual center so the
            brand on the left doesn't feel crowded next to the tabs.
            Every tab uses the SAME NavTab component; the `active`
            prop drives the pill vs icon-only styling, and the CSS
            max-width transition + AnimatePresence text handle the
            on-click transitions between tabs. */}
        <nav className="flex flex-1 items-center gap-2 pl-32">
          {NAV.map(({ href, label, Icon }, idx) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            const itemDelay = ITEM_BASE_DELAY + idx * ITEM_STAGGER;
            return (
              <ItemMotion key={href} logoReady={logoReady} delay={itemDelay}>
                <NavTab
                  href={href}
                  label={label}
                  Icon={Icon}
                  active={active}
                  pillExpanded={pillExpanded}
                />
              </ItemMotion>
            );
          })}
        </nav>

        {/* Right-side utilities — continue the stagger index from the
            nav items so the full row cascades in as one wave. */}
        <div className="flex items-center gap-2">
          <ItemMotion
            logoReady={logoReady}
            delay={ITEM_BASE_DELAY + (utilityStartIdx + 0) * ITEM_STAGGER}
          >
            <button
              type="button"
              aria-label="Search"
              className="flex size-10 items-center justify-center rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
            >
              <Search className="size-5" />
            </button>
          </ItemMotion>

          <ItemMotion
            logoReady={logoReady}
            delay={ITEM_BASE_DELAY + (utilityStartIdx + 1) * ITEM_STAGGER}
          >
            <button
              type="button"
              aria-label="Notifications"
              className="flex size-10 items-center justify-center rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
            >
              <Bell className="size-5" />
            </button>
          </ItemMotion>

          <ItemMotion
            logoReady={logoReady}
            delay={ITEM_BASE_DELAY + (utilityStartIdx + 2) * ITEM_STAGGER}
          >
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-label="Account"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="size-10 rounded-full bg-foreground/10 ring-1 ring-border hover:bg-foreground/15"
              />
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 min-w-[180px] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      // Keycloak provider's logout implementation
                      // destructures `{ redirectTo }` and crashes on
                      // undefined. Refine's typed LogoutParams doesn't
                      // include `redirectTo` (only `redirectPath`), so
                      // cast to bypass — this is a provider API
                      // mismatch, not our bug to fix here.
                      logout({ redirectTo: '/login' } as never);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-foreground/5 hover:text-foreground"
                  >
                    <LogOut className="size-4" />
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </ItemMotion>
        </div>
      </div>
    </header>
  );
}

/// One nav tab. Shape is constant across active/inactive; the
/// active state drives max-width (CSS transition), bg color, text
/// color, and whether the label mounts.
///
/// Sequential exit for the previously-active tab: label fades out
/// first (150ms via AnimatePresence exit), then the pill collapses
/// (max-width 220 → 40 via CSS, delayed by 150ms so it lets the
/// fade finish first).
///
/// Entry for the newly-active tab: pill expands immediately via
/// CSS (750ms), and the label mounts + fades in with a 250ms delay
/// so it lands as the pill nears full width.
function NavTab({
  href,
  label,
  Icon,
  active,
  pillExpanded,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  pillExpanded: boolean;
}) {
  const shouldExpand = active && pillExpanded;

  // Tracks the "just-collapsed" transitional state. Set to true the
  // moment `shouldExpand` flips false; held for ~900ms (roughly the
  // label fade-out + pill shrink) so the pill visibly sits in a grey
  // intermediate state before fading out to full idle.
  const [collapsing, setCollapsing] = useState(false);
  const prevExpanded = useRef(shouldExpand);
  useEffect(() => {
    if (prevExpanded.current && !shouldExpand) {
      // was expanded → now collapsing
      setCollapsing(true);
      const t = setTimeout(() => setCollapsing(false), 900);
      prevExpanded.current = shouldExpand;
      return () => clearTimeout(t);
    }
    prevExpanded.current = shouldExpand;
    return;
  }, [shouldExpand]);

  // Three visual states, driven by active + collapsing:
  //   ACTIVE      → black pill, white text
  //   COLLAPSING  → grey pill, dark icon (bridge state)
  //   IDLE        → transparent, muted icon, hover bg
  const colorClasses = active
    ? 'bg-foreground text-background'
    : collapsing
    ? 'bg-foreground/15 text-foreground'
    : 'text-foreground/60 hover:bg-foreground/5 hover:text-foreground';

  return (
    <div className="group relative">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        aria-label={active ? undefined : label}
        className="inline-flex"
      >
        <div
          className={
            'flex items-center overflow-hidden pl-3 pr-3 transition-colors duration-500 ease-in-out ' +
            colorClasses
          }
          style={{
            height: 40,
            borderRadius: 20,
            maxWidth: shouldExpand ? 220 : 40,
            // Expansion: standard ease-in-out, immediate.
            // Collapse: ease-IN (slow start, fast end) + 150ms delay
            // so the label's fade-out (AnimatePresence exit below)
            // finishes before the pill shrinks around it.
            transition: shouldExpand
              ? 'max-width 750ms ease-in-out, background-color 500ms'
              : 'max-width 750ms ease-out, background-color 500ms',
          }}
        >
          <Icon className="size-4 shrink-0" />
          <AnimatePresence initial={false}>
            {shouldExpand ? (
              <motion.span
                key="label"
                className="ml-3 mr-2 whitespace-nowrap text-sm font-medium leading-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  opacity: {
                    duration: 0.4,
                    ease: [0.16, 1, 0.3, 1],
                    delay: 0.25,
                  },
                }}
                // Exit fades faster than entry so the pill can start
                // collapsing sooner.
                {...({} as object)}
              >
                {label}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </Link>

      {/* Hover tooltip — inactive tabs only. The active tab already
          shows its label inside the pill. */}
      {!active ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 origin-top -translate-x-1/2 scale-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-all duration-[250ms] ease-out group-hover:scale-100 group-hover:opacity-100"
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

/// Wraps a nav / utility item in a motion.div that slides down
/// from -12px + fades in when `logoReady` is true. `delay` is the
/// per-index stagger delay (already baked in from the caller so this
/// component doesn't need to know its position).
function ItemMotion({
  children,
  logoReady,
  delay,
}: {
  children: React.ReactNode;
  logoReady: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={logoReady ? false : { y: -12, opacity: 0 }}
      animate={
        logoReady ? { y: 0, opacity: 1 } : { y: -12, opacity: 0 }
      }
      transition={{ duration: ITEM_DURATION, ease: 'easeIn', delay }}
    >
      {children}
    </motion.div>
  );
}
