// In-app replacements for alert / confirm / prompt. Call from anywhere; <DialogHost /> (mounted once in App) renders them.
export type UiRequest =
  | { kind: "notice"; message: string; tone: "info" | "error"; action?: { label: string; run: () => void }; resolve: () => void }
  | { kind: "confirm"; message: string; yes: string; danger: boolean; resolve: (ok: boolean) => void }
  | { kind: "prompt"; message: string; resolve: (value: string | null) => void };

type Listener = (queue: UiRequest[]) => void;
let queue: UiRequest[] = [];
const listeners = new Set<Listener>();

const MAX_TOASTS = 2; // a burst of notices never piles up over the page: the oldest one gives way
const push = (r: UiRequest) => {
  queue = [...queue, r];
  if (r.kind === "notice") {
    const notices = queue.filter(x => x.kind === "notice");
    notices.slice(0, Math.max(0, notices.length - MAX_TOASTS)).forEach(old => { old.resolve(); queue = queue.filter(x => x !== old); });
  }
  listeners.forEach(l => l(queue));
};
export const dismiss = (r: UiRequest) => { queue = queue.filter(x => x !== r); listeners.forEach(l => l(queue)); };
export const subscribe = (l: Listener) => { listeners.add(l); l(queue); return () => { listeners.delete(l); }; };

/** Shows a message. Resolves when the person closes it. */
export const notify = (message: string, tone: "info" | "error" = "info") =>
  new Promise<void>(resolve => push({ kind: "notice", message, tone, resolve }));

export const confirmAsk = (message: string, opts: { yes?: string; danger?: boolean } = {}) =>
  new Promise<boolean>(resolve => push({ kind: "confirm", message, yes: opts.yes ?? "OK", danger: !!opts.danger, resolve }));

/** Resolves with the text, or null when cancelled. */
export const promptAsk = (message: string) =>
  new Promise<string | null>(resolve => push({ kind: "prompt", message, resolve }));

/** Turns raw database or network errors into something a person can act on. */
export function explainError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("jwt") || m.includes("expired") || /(^|[^0-9])401([^0-9]|$)/.test(m)) return "Your session has expired. Sign in again.";
  if (m.includes("row-level") || m.includes("permission denied")) return "You don't have permission to do that. Sign in with an approved account.";
  if (m.includes("failed to fetch") || m.includes("network")) return "You seem to be offline. Try again when you're connected.";
  if (m.includes("violates check constraint")) return "One of the values is too long or not allowed. Shorten it and try again.";
  if (m.includes("duplicate key")) return "That item already exists.";
  return message;
}

/** A toast with one button, e.g. "Removed from favourites  [Undo]". Does not block. */
export const toastAction = (message: string, label: string, run: () => void) =>
  void new Promise<void>(resolve => push({ kind: "notice", message, tone: "info", action: { label, run }, resolve }));
