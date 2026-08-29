// SPDX-License-Identifier: Apache-2.0
'use client';

import { useGetIdentity } from '@refinedev/core';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useShellArrival } from '@lib/client/hooks/use.shell.arrival';
import config from '@lib/utils/config';

/// Personalized greeting + date row + secondary nav for the operator
/// overview page. Matches the Specula Figma "CSMS - Overview" frame
/// (node 4262:3365).
///
/// Entrance choreography (mirrors the shell's arrival cadence):
///   1. Left block (date + greeting) — fade-in with ease-in from
///      the left (15px), matches the SPECULA logo/wordmark motion.
///   2. Right block (stats) — fade-in with slide-down from -12px.
///   3. After the stats block lands, each stat's number counts up
///      from 0 to its target value (units preserved — we animate
///      the numeric part only, e.g. 0 → 4.2 MWh, not 0 → 4200000 Wh).
export function OverviewHeader() {
  const { data: identity } = useGetIdentity<{ name?: string; email?: string }>();
  const [now, setNow] = useState<Date | null>(null);
  // Flips true when the stats block finishes its slide-down animation;
  // triggers the numeric count-up in each HeaderStat below.
  const [statsSettled, setStatsSettled] = useState(false);
  // Only start the entrance animations after the shell's loader has
  // finished — otherwise they play behind the loader and finish
  // before the user sees them.
  const arrived = useShellArrival();

  // Hydration-safe date — server render produces no date, client
  // fills it in after mount so the "Good Morning" greeting stays
  // consistent between SSR and client.
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const firstName =
    identity?.name?.split(' ')[0] ??
    identity?.email?.split('@')[0] ??
    'there';

  const greeting = (() => {
    if (!now) return 'Welcome';
    const h = now.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  })();

  const dateLabel = now
    ? now
        .toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        .replace(',', ' •')
        .toUpperCase()
    : ' '; // nbsp to preserve height during SSR

  return (
    <div className="flex items-end justify-between gap-6 pb-2">
      {/* Left block — fade-in + slide from the left (mirrors the
          brand logo's ease-in entrance in the top nav). */}
      <motion.div
        initial={{ x: -15, opacity: 0 }}
        animate={arrived ? { x: 0, opacity: 1 } : { x: -15, opacity: 0 }}
        transition={{ duration: 0.55, ease: 'easeIn' }}
      >
        <div className="text-xs font-medium tracking-widest text-foreground/50">
          {dateLabel}
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
          {greeting}, {firstName}
        </h1>
        <OperatorBadge />
      </motion.div>

      {/* Right block — fade-in + slide DOWN (matches the nav-icon
          entrance). Count-up on numbers fires when this settles. */}
      <motion.div
        initial={{ y: -12, opacity: 0 }}
        animate={arrived ? { y: 0, opacity: 1 } : { y: -12, opacity: 0 }}
        transition={{ duration: 0.55, ease: 'easeIn', delay: 0.15 }}
        onAnimationComplete={() => arrived && setStatsSettled(true)}
        className="flex items-end gap-8"
      >
        <HeaderStat
          label="Revenue"
          target={12.3}
          format={(n) => `$${n.toFixed(1)}K`}
          start={statsSettled}
        />
        <span className="mb-1 h-10 w-px bg-foreground/15" aria-hidden />
        <HeaderStat
          label="Sites"
          target={80}
          format={(n) => Math.round(n).toString()}
          start={statsSettled}
        />
        <span className="mb-1 h-10 w-px bg-foreground/15" aria-hidden />
        <HeaderStat
          label="Energy"
          target={4.2}
          format={(n) => `${n.toFixed(1)} MWh`}
          start={statsSettled}
        />
      </motion.div>
    </div>
  );
}

/// Company name + country flag derived from env-var config
/// (see `NEXT_PUBLIC_OPERATOR_COMPANY` / `NEXT_PUBLIC_OPERATOR_COUNTRY`).
/// Sits just under the greeting; participates in the same left-block
/// entrance animation via its parent motion.div.
///
/// Layout: [COMPANY NAME] · [Flag] at 10px, uppercase + letter-spaced
/// to match the date label above the greeting.
function OperatorBadge() {
  const { operatorCompany, operatorCountry } = config;
  if (!operatorCompany && !operatorCountry) return null;

  const flag = countryCodeToFlagEmoji(operatorCountry);

  return (
    <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-foreground/60">
      {operatorCompany ? <span>{operatorCompany}</span> : null}
      {operatorCompany && flag ? (
        <span aria-hidden className="text-foreground/30">
          ·
        </span>
      ) : null}
      {flag ? (
        <span aria-hidden className="text-sm leading-none">
          {flag}
        </span>
      ) : null}
    </div>
  );
}

/// Converts an ISO 3166-1 alpha-2 country code into its Unicode
/// regional-indicator flag emoji. Case-insensitive; returns an
/// empty string on anything that isn't exactly two ASCII letters.
function countryCodeToFlagEmoji(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  // Regional-indicator symbols occupy U+1F1E6..U+1F1FF, offset from 'A'.
  const A = 0x1f1e6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(
    A + cc.charCodeAt(0),
    A + cc.charCodeAt(1),
  );
}

/// One label/value pair for the header stat strip. Label sits above
/// the value; both left-aligned. Value counts up from 0 to `target`
/// (1500ms ease-out) once `start` flips true, formatted via `format`
/// so units stay put ("4.2 MWh") while only the numeric portion
/// animates.
function HeaderStat({
  label,
  target,
  format,
  start,
}: {
  label: string;
  target: number;
  format: (n: number) => string;
  start: boolean;
}) {
  const value = useCountUp(target, 1500, start);
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
        {label}
      </span>
      <span className="mt-1 text-2xl font-light tabular-nums tracking-tight text-foreground">
        {format(value)}
      </span>
    </div>
  );
}

/// requestAnimationFrame-driven count-up. Interpolates from 0 to
/// `target` over `durationMs` with an ease-out cubic. Restarts only
/// when `start` transitions false → true; safe to no-op if the
/// component wants to defer the animation to a later trigger.
function useCountUp(target: number, durationMs: number, start: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    const startedAt = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const t = Math.min(elapsed / durationMs, 1);
      // ease-out cubic: fast start, slow settle — feels like the
      // number is "landing" on its final value.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, start]);
  return value;
}
