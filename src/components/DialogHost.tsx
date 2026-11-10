import { useEffect, useRef, useState } from "react";
import { dismiss, subscribe, type UiRequest } from "../lib/ui";

type Notice = Extract<UiRequest, { kind: "notice" }>;

// Confirmations and prompts are modal. Plain notices ("Saved", "Copied", errors) are toasts that fade on their own,
// so they never block what the person is doing.
export function DialogHost() {
  const [queue, setQueue] = useState<UiRequest[]>([]);
  useEffect(() => subscribe(setQueue), []);
  const modal = queue.find((r): r is Exclude<UiRequest, Notice> => r.kind !== "notice");
  const toasts = queue.filter((r): r is Notice => r.kind === "notice");
  return (
    <>
      {modal && <Modal key={modal.kind + modal.message} req={modal} />}
      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map(t => <Toast key={toastKey(t)} req={t} />)}
        </div>
      )}
    </>
  );
}

// A stable key per toast, so dismissing one doesn't remount (and restart the timers of) the others.
const toastIds = new WeakMap<object, number>();
let nextToastId = 0;
const toastKey = (r: object) => { let k = toastIds.get(r); if (k === undefined) { k = ++nextToastId; toastIds.set(r, k); } return k; };

function Toast({ req }: { req: Notice }) {
  const done = useRef(false);
  const close = () => { if (done.current) return; done.current = true; req.resolve(); dismiss(req); };
  useEffect(() => {
    const t = window.setTimeout(close, req.tone === "error" ? 7000 : req.action ? 6000 : 3500);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={"toast" + (req.tone === "error" ? " error" : "")} role={req.tone === "error" ? "alert" : "status"}>
      <span>{req.message}</span>
      {req.action && <button type="button" className="link toast-act" onClick={() => { req.action!.run(); close(); }}>{req.action.label}</button>}
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={close}>×</button>
    </div>
  );
}

function Modal({ req }: { req: Exclude<UiRequest, Notice> }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const done = useRef(false);

  useEffect(() => { dlg.current?.showModal(); }, []);

  const finish = (answer: boolean | string | null) => {
    if (done.current) return;
    done.current = true;
    if (req.kind === "confirm") req.resolve(answer === true);
    else req.resolve(typeof answer === "string" ? answer : null);
    dismiss(req);
  };

  return (
    <dialog ref={dlg} className="msg" onClose={() => finish(req.kind === "confirm" ? false : null)}>
      <form method="dialog" onSubmit={e => { e.preventDefault(); finish(req.kind === "prompt" ? text : true); dlg.current?.close(); }}>
        <p className="msg-text">{req.message}</p>
        {req.kind === "prompt" && <input value={text} onChange={e => setText(e.target.value)} autoFocus maxLength={300} />}
        <div className="actions">
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
          <button type="submit" className={"btn primary" + (req.kind === "confirm" && req.danger ? " danger" : "")} autoFocus={req.kind !== "prompt"}>
            {req.kind === "confirm" ? req.yes : "OK"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
