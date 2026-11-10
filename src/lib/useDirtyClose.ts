import { useEffect, type RefObject } from "react";
import { confirmAsk } from "./ui";

/**
 * For a form in a <dialog>: Escape or Cancel asks before throwing away what was typed.
 * Returns the function the Cancel button should call.
 */
export function useDirtyClose(dlg: RefObject<HTMLDialogElement | null>, dirty: boolean) {
  const ask = async () => {
    if (!dirty || await confirmAsk("Discard your changes?", { yes: "Discard", danger: true })) dlg.current?.close();
  };
  useEffect(() => {
    const el = dlg.current;
    if (!el) return;
    const onCancel = (e: Event) => { if (dirty) { e.preventDefault(); void ask(); } };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  });
  return ask;
}
