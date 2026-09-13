// SPDX-License-Identifier: Apache-2.0
'use client';

import { Dialog, DialogContent, DialogTitle } from '@lib/client/components/ui/dialog';
import { ConstellationEditForm } from '@lib/client/pages/locations/list/constellation.edit.form';
import { useEffect, useRef, useState } from 'react';

/// Timing knobs for the modal choreography. Tuned so the two
/// phases (shell + content) stitch together as one gesture —
/// content fades in AFTER the shell slides in, and fades out
/// BEFORE the shell exits.
const MODAL_OPEN_MS = 325;
const MODAL_CLOSE_MS = 250;
const CONTENT_FADE_MS = 180;

/// Modal that hosts the constellation create form. Triggered by
/// the "+ New constellation" button in the list header. Wraps
/// `ConstellationEditForm` in create mode — same field set as the
/// inline edit takeover, no Delete button, hits `useCreate`.
///
/// Two-phase animation:
///   • Open  — shell slides in (fade + zoom + rise) → content
///             wrapper fades in once the shell has landed.
///   • Close — content wrapper fades out first → then the shell
///             exits with the reverse motion. All close paths
///             (backdrop click, ESC, Cancel button, save) funnel
///             through `requestClose` so the phasing is uniform.
export function ConstellationCreateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [contentVisible, setContentVisible] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const openTimer = useRef<number | null>(null);

  // On open: schedule the content fade-in for after the shell has
  // finished sliding in. On close (external, e.g. parent toggles
  // `open=false`): snap content invisible so we don't leave a
  // frame of visible content over an empty stage.
  useEffect(() => {
    if (open) {
      if (openTimer.current != null) window.clearTimeout(openTimer.current);
      openTimer.current = window.setTimeout(
        () => setContentVisible(true),
        MODAL_OPEN_MS,
      );
      return () => {
        if (openTimer.current != null) window.clearTimeout(openTimer.current);
      };
    }
    setContentVisible(false);
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
      if (openTimer.current != null) window.clearTimeout(openTimer.current);
    },
    [],
  );

  /// Unified close path — fade content out, wait CONTENT_FADE_MS,
  /// then propagate the close to the parent. Idempotent so double
  /// clicks / rapid dismisses don't stack timers.
  const requestClose = () => {
    if (closeTimer.current != null) return;
    setContentVisible(false);
    closeTimer.current = window.setTimeout(() => {
      onOpenChange(false);
      closeTimer.current = null;
    }, CONTENT_FADE_MS);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else requestClose();
      }}
    >
      {/* Wider + taller than the default DialogContent — the form
          has a two-column address+map layout that gets cramped in
          a narrow modal. Zero padding so the form's own header /
          footer own the spacing.

          Shell animation: `.modal-anim` (globals.css) drives
          fade + zoom + slide-from-below via real @keyframes. This
          project doesn't have tailwindcss-animate installed, so
          shadcn's `animate-in` / `fade-in-0` / etc. classes are
          dead — hence the custom keyframe route. Duration per
          instance via the two `--modal-anim-duration-*` vars. */}
      <DialogContent
        className="modal-anim flex max-h-[85vh] w-[80vw] max-w-[1000px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1000px]"
        style={
          {
            ['--modal-anim-duration-open' as string]: `${MODAL_OPEN_MS}ms`,
            ['--modal-anim-duration-close' as string]: `${MODAL_CLOSE_MS}ms`,
          } as React.CSSProperties
        }
      >
        {/* Radix requires a DialogTitle for screen-reader
            announcements. The form has its own visible "New
            constellation" heading, so we mark this one `sr-only` —
            invisible to sighted users, still in the a11y tree. */}
        <DialogTitle className="sr-only">New constellation</DialogTitle>
        {/* Content phase — fades in AFTER the shell lands (open)
            and fades out BEFORE the shell exits (close). `min-h-0
            flex-1` so the form's own scroll container still gets
            its height. */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{
            opacity: contentVisible ? 1 : 0,
            transition: `opacity ${CONTENT_FADE_MS}ms ease-out`,
          }}
        >
          <ConstellationEditForm
            mode="create"
            onCancel={requestClose}
            onSaved={requestClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
