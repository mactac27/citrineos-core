// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import { Badge } from '@lib/client/components/ui/badge';
import { Button } from '@lib/client/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@lib/client/components/ui/dialog';
import { AuthorizationDetail } from '@lib/client/pages/authorizations/detail/authorization.detail';
import { AuthorizationEditModal } from '@lib/client/pages/authorizations/upsert/authorization.edit.modal';
import { AUTHORIZATIONS_SHOW_QUERY } from '@lib/queries/authorizations';
import { ActionType, ResourceType } from '@lib/utils/access.types';
import type { AuthorizationDto } from '@citrineos/base';
import { CanAccess, useOne, useTranslate } from '@refinedev/core';
import { Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/// Timing knobs — identical to the sibling create/detail modals.
const MODAL_OPEN_MS = 325;
const MODAL_CLOSE_MS = 250;
const CONTENT_FADE_MS = 180;

/// Local-state modal for the authorization detail view. Reuses
/// `AuthorizationDetail` in `mode="modal"` so the deep-dive UI is
/// still one implementation between page and modal contexts.
///
/// Fixed h-[85vh] so the shell doesn't pop between loading and
/// loaded states; body scrolls internally. Custom top bar renders
/// the ID Token + status badge on the left, Edit + Close icon
/// buttons on the right (Edit routes to the full-page editor,
/// close funnels through the two-phase exit).
export function AuthorizationDetailModal({
  authorizationId,
  open,
  onOpenChange,
}: {
  /// DB id of the authorization to load. When null the modal
  /// renders nothing — safe to mount unconditionally.
  authorizationId: string | number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [contentVisible, setContentVisible] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

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
      if (openTimer.current != null) window.clearTimeout(openTimer.current);
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
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
        showCloseButton={false}
        className="modal-anim flex h-[85vh] w-[92vw] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]"
        style={
          {
            ['--modal-anim-duration-open' as string]: `${MODAL_OPEN_MS}ms`,
            ['--modal-anim-duration-close' as string]: `${MODAL_CLOSE_MS}ms`,
          } as React.CSSProperties
        }
      >
        <DialogTitle className="sr-only">Authorization detail</DialogTitle>
        {authorizationId != null ? (
          <>
            <ModalHeader
              authorizationId={authorizationId}
              onEdit={() => setEditOpen(true)}
              onClose={requestClose}
            />
            <div
              className="min-h-0 flex-1 overflow-y-auto"
              style={{
                opacity: contentVisible ? 1 : 0,
                transition: `opacity ${CONTENT_FADE_MS}ms ease-out`,
              }}
            >
              <AuthorizationDetail
                params={{ id: String(authorizationId) }}
                mode="modal"
              />
            </div>
          </>
        ) : null}
      </DialogContent>
      {/* Edit modal — opens on top of the detail modal. Nested
          Radix dialogs handle focus and backdrop stacking correctly.
          On save it closes itself; the detail modal below picks up
          the fresh data via Refine's live query cache. `authorizationId`
          is passed unconditionally (not gated on editOpen) so the
          inner useForm's id doesn't briefly flip to null during
          close, which would fire an empty-variables Hasura query. */}
      <AuthorizationEditModal
        authorizationId={authorizationId}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </Dialog>
  );
}

// ─── Modal header ───────────────────────────────────────────────────

/// Top bar for the detail modal — token + status badge on the left,
/// Edit + Close icon buttons on the right. Fetches its own copy of
/// the authorization data via `useOne`; Refine's query cache
/// dedupes it with the fetch inside `AuthorizationDetail` so there
/// is exactly one network call for the deep-dive.
function ModalHeader({
  authorizationId,
  onEdit,
  onClose,
}: {
  authorizationId: string | number;
  onEdit: () => void;
  onClose: () => void;
}) {
  const translate = useTranslate();
  const { query: { data } } = useOne<AuthorizationDto>({
    resource: ResourceType.AUTHORIZATIONS,
    id: authorizationId,
    meta: { gqlQuery: AUTHORIZATIONS_SHOW_QUERY },
    // Gate the query so a brief null id (during modal close / prop
    // transitions) doesn't submit AuthorizationsShow with empty
    // variables and trigger the Hasura non-nullable-variable error.
    queryOptions: { enabled: authorizationId != null },
  });
  const a = data?.data;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
            Authorization
          </div>
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm text-foreground">
              {a?.idToken ?? '…'}
            </span>
            {a?.status ? (
              <Badge
                variant={
                  String(a.status).toLowerCase() === 'accepted'
                    ? 'success'
                    : 'destructive'
                }
                className="uppercase"
              >
                {a.status}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {a ? (
          <CanAccess
            resource={ResourceType.AUTHORIZATIONS}
            action={ActionType.EDIT}
            params={{ id: a.id }}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              title={translate('buttons.edit', {}, 'Edit')}
              className="size-8 cursor-pointer rounded-md text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
            >
              <Pencil className="size-4" />
            </Button>
          </CanAccess>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="size-8 cursor-pointer rounded-md text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
