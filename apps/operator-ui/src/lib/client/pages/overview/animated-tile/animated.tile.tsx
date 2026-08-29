// SPDX-License-Identifier: Apache-2.0
'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';

/// Fade + slide-up wrapper for a single overview tile. Stagger is
/// driven by the `index` prop rather than a parent orchestrator so
/// each tile stays independently wrappable — we don't have to force
/// every card into a single motion container.
///
/// Kept minimal on purpose: no exit animation, no scroll trigger,
/// no interactive states. Load-in only.
export function AnimatedTile({
  index = 0,
  className,
  children,
  ...rest
}: {
  index?: number;
  className?: string;
  children: React.ReactNode;
} & Omit<HTMLMotionProps<'div'>, 'children'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        // Small per-tile delay so tiles cascade in visually rather
        // than snap in as a block. 60ms is subtle enough to feel
        // premium without dragging perceived load time.
        delay: index * 0.06,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
