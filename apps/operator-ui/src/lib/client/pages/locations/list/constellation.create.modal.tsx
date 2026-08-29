// SPDX-License-Identifier: Apache-2.0
'use client';

import { Dialog, DialogContent } from '@lib/client/components/ui/dialog';
import { ConstellationEditForm } from '@lib/client/pages/locations/list/constellation.edit.form';

/// Modal that hosts the constellation create form. Triggered by
/// the "+ New constellation" button in the list header. Wraps
/// `ConstellationEditForm` in create mode — same field set as the
/// inline edit takeover, no Delete button, hits `useCreate`.
///
/// On save the form's `onSaved` closes the modal; the underlying
/// Refine `useList` picks up the new row through its usual
/// cache-invalidation path (no manual refetch needed).
export function ConstellationCreateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider + taller than the default DialogContent — the form
          has a two-column address+map layout that gets cramped in
          a narrow modal. Zero padding so the form's own header /
          footer own the spacing.

          Animation notes: shadcn ships a fade + zoom-95 over 200ms
          by default. Adding a `slide-in-from-bottom-4` on open and
          `slide-out-to-bottom-2` on close for a light "lift-in
          from below" motion, plus longer entrance (350ms) so it
          reads without feeling slow. Ease-out on both sides so
          the modal decelerates into place rather than punching in. */}
      <DialogContent
        className={[
          'flex max-h-[85vh] w-[80vw] max-w-[1000px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1000px]',
          'data-[state=open]:slide-in-from-bottom-4',
          'data-[state=closed]:slide-out-to-bottom-2',
          'data-[state=open]:duration-[350ms]',
          'data-[state=closed]:duration-[200ms]',
          'data-[state=open]:ease-out',
          'data-[state=closed]:ease-in',
        ].join(' ')}
      >
        <ConstellationEditForm
          mode="create"
          onCancel={() => onOpenChange(false)}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
