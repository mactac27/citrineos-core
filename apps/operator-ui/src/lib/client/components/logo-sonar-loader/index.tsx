// SPDX-License-Identifier: Apache-2.0
'use client';

import { motion, type Variants } from 'framer-motion';

/// Full-screen loading state — dark navy bg + concentric sonar
/// pulses + centered 108×108 Specula logo (breathing).
///
/// Exit sequence (when the shell drops `showLoader`, AnimatePresence
/// flips this element's variant from "loading" → "exit"):
///
///   1. (0–300ms)  Logo scales 1 → 0. Rings fade opacity 1 → 0.
///   2. (300–800ms) A page-bg-colored circle at center scales from 0
///                  to ~30× so it covers the viewport.
///   3. (800ms+)   AnimatePresence unmounts — the shell (already
///                  rendered underneath) becomes visible instantly.
///
/// Variants let framer-motion sequence the outer container and its
/// children coherently: parent's `exit` transition uses
/// `when: 'afterChildren'` so AnimatePresence waits for every
/// child's exit variant to complete before removing the parent.

const containerVariants: Variants = {
  loading: {},
  exit: {
    // Wait for all children to finish their exit animations before
    // reporting the parent as "exited" to AnimatePresence.
    transition: { when: 'afterChildren' },
  },
};

const logoVariants: Variants = {
  loading: { scale: 1, opacity: 1 },
  exit: {
    scale: 0,
    opacity: 0,
    transition: { duration: 0.6, ease: 'easeIn' },
  },
};

const ringVariants: Variants = {
  loading: { opacity: 1 },
  exit: {
    opacity: 0,
    transition: { duration: 0.4, ease: 'easeIn' },
  },
};

const circleVariants: Variants = {
  loading: { scale: 0 },
  exit: {
    scale: 30,
    transition: {
      duration: 0.5,
      delay: 0.6, // starts as the logo finishes shrinking
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

export function LogoSonarLoader() {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#0a0f1e' }}
      variants={containerVariants}
      initial="loading"
      animate="loading"
      exit="exit"
    >
      <div className="relative flex size-[156px] items-center justify-center">
        {/* Sonar rings — fade out on exit via `ringVariants`. */}
        <SonarRing delayMs={0} />
        <SonarRing delayMs={1100} />
        <SonarRing delayMs={2200} />

        {/* Logo — breathing during load, scales to 0 on exit. */}
        <motion.img
          src="/specula-logo.svg"
          alt="Specula"
          width={108}
          height={108}
          className="relative z-10 size-[108px]"
          variants={logoVariants}
          style={{ animation: 'logo-breathe 3300ms ease-in-out infinite' }}
        />
      </div>

      {/* Circle reveal — page-bg-colored, expands from center on
          exit to cover the viewport. `bg-background` matches the
          shell's page background so the reveal blends seamlessly. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[100px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background"
        variants={circleVariants}
      />
    </motion.div>
  );
}

function SonarRing({ delayMs }: { delayMs: number }) {
  return (
    <motion.span
      aria-hidden
      className="absolute rounded-full border border-[#f5b342]"
      style={{
        width: 108,
        height: 108,
        animation: 'sonar-ping 3300ms ease-out infinite',
        animationDelay: `${delayMs}ms`,
      }}
      variants={ringVariants}
    />
  );
}
