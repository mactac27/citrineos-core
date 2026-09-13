// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import { Badge } from '@lib/client/components/ui/badge';
import { Button } from '@lib/client/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@lib/client/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@lib/client/components/ui/tooltip';
import { ModalComponentType } from '@lib/client/components/modals/modal.types';
import { TransactionDetail } from '@lib/client/pages/transactions/detail/transaction.detail';
import { TRANSACTION_GET_QUERY } from '@lib/queries/transactions';
import { ActionType, ResourceType } from '@lib/utils/access.types';
import { openModal } from '@lib/utils/store/modal.slice';
import type { TransactionDto } from '@citrineos/base';
import { CanAccess, useOne, useTranslate } from '@refinedev/core';
import { RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

/// Timing knobs — identical to ConstellationCreateModal and
/// ChargerCreateModal so all three modals feel like siblings.
const MODAL_OPEN_MS = 325;
const MODAL_CLOSE_MS = 250;
const CONTENT_FADE_MS = 180;

/// Local-state modal for the transaction detail view. Reuses the
/// existing `TransactionDetail` component (also mounted at
/// `/transactions/[id]` as a full page) so the deep-dive UI has
/// exactly one implementation.
///
/// Was originally wired as a Next 15 intercepted route so the URL
/// deep-linked into the modal, but that combination (route group +
/// parallel slot + intercept) hits an unresolved framework bug
/// (`initialTree is not iterable`, GH #74891). Local state ships
/// today and matches the ChargerCreateModal / ConstellationCreateModal
/// pattern the rest of the app already uses.
///
/// Layout:
///   • Fixed-height shell (85vh) so the modal doesn't pop when
///     content loads or when tabs swap between shorter/taller
///     content. Body scrolls internally.
///   • Custom header bar: title + active badge on the left,
///     refresh + close on the right. Suppresses the underlying
///     `TransactionDetailCard`'s own header via `mode="modal"`.
///
/// Two-phase choreography:
///   • Open: shell slides + fades in (MODAL_OPEN_MS), then content
///     fades in (CONTENT_FADE_MS).
///   • Close: content fades out first, then shell exits.
///
/// All close paths (backdrop, ESC, close button) funnel through
/// `requestClose`.
export function TransactionDetailModal({
  transactionId,
  open,
  onOpenChange,
}: {
  /// DB id (integer PK) of the transaction to load. When null the
  /// modal renders nothing — safe to mount unconditionally.
  transactionId: string | number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [contentVisible, setContentVisible] = useState(false);
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
        // Radix's default close (X) is hidden here because the
        // custom header renders its own, positioned deliberately
        // next to the refresh button.
        showCloseButton={false}
        className="modal-anim flex h-[85vh] w-[92vw] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]"
        style={
          {
            ['--modal-anim-duration-open' as string]: `${MODAL_OPEN_MS}ms`,
            ['--modal-anim-duration-close' as string]: `${MODAL_CLOSE_MS}ms`,
          } as React.CSSProperties
        }
      >
        <DialogTitle className="sr-only">Transaction detail</DialogTitle>
        {transactionId != null ? (
          <>
            <ModalHeader transactionId={transactionId} onClose={requestClose} />
            <div
              className="min-h-0 flex-1 overflow-y-auto"
              style={{
                opacity: contentVisible ? 1 : 0,
                transition: `opacity ${CONTENT_FADE_MS}ms ease-out`,
              }}
            >
              <TransactionDetail
                params={{ id: String(transactionId) }}
                mode="modal"
              />
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal header ───────────────────────────────────────────────────

/// Top bar for the detail modal — transaction title + status badge
/// on the left; refresh + close icon buttons on the right. Fetches
/// its own lightweight copy of the transaction data (via `useOne`)
/// so the title/badge can render before the body content lands;
/// same query the underlying `TransactionDetail` uses, so Refine's
/// cache dedupes it into a single network call.
function ModalHeader({
  transactionId,
  onClose,
}: {
  transactionId: string | number;
  onClose: () => void;
}) {
  const translate = useTranslate();
  const dispatch = useDispatch();

  const { query: { data } } = useOne<TransactionDto>({
    resource: ResourceType.TRANSACTIONS,
    id: transactionId,
    meta: { gqlQuery: TRANSACTION_GET_QUERY },
  });
  const t = data?.data;

  const showToggleActiveModal = () => {
    if (!t) return;
    dispatch(
      openModal({
        title: translate('Transactions.toggleActiveStatus'),
        modalComponentType: ModalComponentType.toggleTransactionActiveStatus,
        modalComponentProps: {
          transactionId: t.id,
          currentStatus: t.isActive,
        },
      }),
    );
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/50">
            Transaction
          </div>
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm text-foreground">
              {t?.transactionId ?? '…'}
            </span>
            {t ? (
              <Badge
                variant={t.isActive ? 'success' : 'destructive'}
                className="uppercase"
              >
                {t.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {t ? (
          <CanAccess
            resource={ResourceType.TRANSACTIONS}
            action={ActionType.EDIT}
            params={{ id: t.id }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={showToggleActiveModal}
                  className="size-8 cursor-pointer rounded-md text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
                >
                  <RefreshCw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {translate('Transactions.toggleActiveStatus', 'Toggle active status')}
              </TooltipContent>
            </Tooltip>
          </CanAccess>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="size-8 cursor-pointer rounded-md text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
