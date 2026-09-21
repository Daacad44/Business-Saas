"use client";

import * as React from "react";
import { Button } from "./button";
import { Modal } from "./modal";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Uses the destructive button styling for irreversible actions (delete, archive, etc.). */
  destructive?: boolean;
  /** Externally controlled pending state; disables the confirm button and prevents closing. */
  pending?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      preventClose={pending}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {null}
    </Modal>
  );
}
