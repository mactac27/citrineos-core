// SPDX-License-Identifier: Apache-2.0
'use client';

import { Dialog, DialogContent, DialogTitle } from '@lib/client/components/ui/dialog';
import { AuthorizationUpsert } from '@lib/client/pages/authorizations/upsert/authorization.upsert';
import { useEffect, useRef, useState } from 'react';

/// Timing knobs — mirror every other modal in the app.
const MODAL_OPEN_MS = 325;
const MODAL_CLOSE_MS = 250;
const CONTENT_FADE_MS = 180;

/// Edit-in-modal for an authorization. Mounts the shared
/// `AuthorizationUpsert` form in `mode="modal"`, which strips the
/// page Card + header, suppresses the auto-redirect to the list,
/// and calls `onSaved` when the mutation resolves.
///
/// Sized wider than the create modal because the full editor
/// includes many more fields (cache expiry, real-time auth,
/// additional-info arrays, etc.).
export function AuthorizationEditModal({
  authorizationId,
  open,
  onOpenChange,
}: {
  authorizationId: string | number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [contentVisible, setContentVisible] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const openTimer = useRef<number | null>(null);

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
      <DialogContent
        // Fixed height so the shell doesn't grow/shrink between
        // wizard steps. Height is set via inline style because
        // shadcn's DialogContent base className contains layout
        // rules that beat Tailwind height utilities on cascade
        // order — inline style has higher specificity and wins
        // reliably. Cap at 85vh via max-height for short screens.
        // Close button is rendered by AuthorizationUpsert inline
        // with the stepper (via `onClose` prop) so we suppress
        // the shadcn default here.
        showCloseButton={false}
        className="modal-anim flex w-[92vw] max-w-[1000px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1000px]"
        style={
          {
            // Height math (updated after the calendar was
            // constrained to 280px wide with 40px cells):
            // Section 2 is now ~400px tall (calendar + status +
            // labels + gaps). HelpPanel min-h-[400px] pins the
            // standard so every step matches. Add stepper (~40) +
            // top/bottom padding (~48) + wizard footer (~48)
            // → ~540px content, round to 580 for ~40px slack.
            // Still capped by 85vh on short viewports.
            height: 580,
            maxHeight: '85vh',
            ['--modal-anim-duration-open' as string]: `${MODAL_OPEN_MS}ms`,
            ['--modal-anim-duration-close' as string]: `${MODAL_CLOSE_MS}ms`,
          } as React.CSSProperties
        }
      >
        <DialogTitle className="sr-only">Edit authorization</DialogTitle>
        {/* Header block removed — the wizard stepper (rendered by
            AuthorizationUpsert at the top of its wrapper) reads as
            the top navigation, and shadcn's default DialogContent
            close button (absolute top-3 right-3) sits inline with
            it on the same row. */}
        <div
          // No overflow here — the AuthorizationUpsert flex chain
          // routes the scroll to the section-content region only,
          // keeping the wizard footer pinned at the bottom of the
          // modal even when Additional Info has many rows.
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{
            opacity: contentVisible ? 1 : 0,
            transition: `opacity ${CONTENT_FADE_MS}ms ease-out`,
          }}
        >
          {authorizationId != null ? (
            <AuthorizationUpsert
              params={{ id: String(authorizationId) }}
              mode="modal"
              onSaved={requestClose}
              onCancel={requestClose}
              onClose={requestClose}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
