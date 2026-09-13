// SPDX-License-Identifier: Apache-2.0
'use client';

import { Dialog, DialogContent, DialogTitle } from '@lib/client/components/ui/dialog';
import { AuthorizationCreateForm } from '@lib/client/pages/authorizations/list/authorization.create.form';
import { useEffect, useRef, useState } from 'react';

/// Timing knobs — mirror the Constellation / Charger create modals
/// so all three feel like siblings.
const MODAL_OPEN_MS = 325;
const MODAL_CLOSE_MS = 250;
const CONTENT_FADE_MS = 180;

/// Two-phase create modal for authorizations. Behaves exactly like
/// `ConstellationCreateModal` / `ChargerCreateModal`: shell slides
/// + fades in, then the content fades in; on close, content fades
/// out first, then the shell exits.
///
/// All close paths (Cancel, Save success, backdrop click, ESC)
/// funnel through `requestClose` so the phasing is uniform.
export function AuthorizationCreateModal({
  open,
  onOpenChange,
}: {
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
        className="modal-anim flex max-h-[85vh] w-[92vw] max-w-[560px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
        style={
          {
            ['--modal-anim-duration-open' as string]: `${MODAL_OPEN_MS}ms`,
            ['--modal-anim-duration-close' as string]: `${MODAL_CLOSE_MS}ms`,
          } as React.CSSProperties
        }
      >
        <DialogTitle className="sr-only">New authorization token</DialogTitle>
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{
            opacity: contentVisible ? 1 : 0,
            transition: `opacity ${CONTENT_FADE_MS}ms ease-out`,
          }}
        >
          <AuthorizationCreateForm
            onCancel={requestClose}
            onSaved={requestClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
