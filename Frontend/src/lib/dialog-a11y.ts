import { useEffect, useRef } from "react";

/**
 * Shared accessibility behaviour for modal dialogs: Escape closes, focus moves
 * into the dialog and is trapped (Tab / Shift+Tab cycle), and focus is restored
 * to the element that opened it when it closes. Attach the returned ref to the
 * dialog's outer element (the one with role="dialog").
 *
 * Also marks the page inert while open (behind-the-dialog content becomes
 * unreachable to screen readers and keyboard), which is removed on close.
 */
export function useModalDialog(
  open: boolean,
  onClose: () => void,
  options: { initialFocusRef?: React.RefObject<HTMLElement | null> } = {},
) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  // Keep callbacks / refs stable so typing in dialog inputs (setState -> re-render)
  // doesn't re-run the focus effect and steal focus after each keystroke.
  const onCloseRef = useRef(onClose);
  const initialFocusRefRef = useRef(options.initialFocusRef);
  onCloseRef.current = onClose;
  initialFocusRefRef.current = options.initialFocusRef;

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    previousFocus.current = document.activeElement as HTMLElement | null;

    // Move focus inside (initial focus target first, else the dialog itself).
    const target = initialFocusRefRef.current?.current ?? dialog;
    target.focus({ preventScroll: true });

    // Trap focus inside the dialog while it's open.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };

    // Hide the rest of the page from assistive tech + keyboard while open.
    const inert = (el: Element) => {
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("inert", "");
    };
    const restoreInert = (el: Element) => {
      el.removeAttribute("aria-hidden");
      el.removeAttribute("inert");
    };
    const hidden: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === dialog || el.contains(dialog)) continue;
      hidden.push(el);
      inert(el);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      hidden.forEach(restoreInert);
      // Return focus to whatever opened the dialog.
      previousFocus.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return dialogRef;
}