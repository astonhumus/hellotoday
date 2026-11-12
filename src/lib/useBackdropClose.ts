import { useEffect } from "react";

/**
 * Tapping the dimmed area outside a dialog closes it. Closing goes through the dialog's own "cancel" step first, so a form with
 * unsaved typing still asks "Discard your changes?". A press that starts inside the dialog (selecting text) and ends outside is ignored.
 */
export function useBackdropClose() {
  useEffect(() => {
    let pressed: HTMLDialogElement | null = null;
    const outside = (d: HTMLDialogElement, e: PointerEvent) => {
      const r = d.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const down = (e: PointerEvent) => {
      const d = e.target;
      pressed = d instanceof HTMLDialogElement && d.open && outside(d, e) ? d : null;
    };
    const up = (e: PointerEvent) => {
      const d = e.target;
      if (d instanceof HTMLDialogElement && d === pressed && d.open && outside(d, e)) {
        const cancel = new Event("cancel", { cancelable: true });
        d.dispatchEvent(cancel);
        if (!cancel.defaultPrevented) d.close();
      }
      pressed = null;
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("pointerup", up); };
  }, []);
}
