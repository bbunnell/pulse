"use client";

import { useEffect, useRef } from "react";

/**
 * Focus management for a modal dialog.
 *
 * The dialogs in this app already declared `role="dialog"` and
 * `aria-modal="true"`, which tells a screen reader the rest of the page is
 * inert — but focus was never moved into the dialog, never confined to it, and
 * never returned to the control that opened it. A keyboard user opening a modal
 * kept focus on the board behind the overlay and tabbed through elements they
 * could not see, while the ARIA said the opposite. Declaring the contract
 * without implementing it is worse than not declaring it.
 *
 * Attach the returned ref to the dialog element and give that element
 * `tabIndex={-1}` so it can hold focus when it contains no focusable child.
 *
 * Escape is handled by the caller, which owns what "close" means.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDialogFocus<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    // Remember where focus came from so it can go back on close. Restoring to
    // the trigger is what makes a modal feel like a detour rather than a jump.
    const previous = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);

    // Prefer the first real control; fall back to the dialog itself.
    (focusable()[0] ?? node).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const list = focusable();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      // The trigger may have unmounted (e.g. the row it lived on was removed);
      // isConnected guards against focusing a detached node, which silently
      // sends focus to <body> and loses the user's place.
      if (previous && previous.isConnected) previous.focus();
    };
  }, [open]);

  return ref;
}
