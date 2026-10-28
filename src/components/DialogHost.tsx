import { useEffect, useRef, useState } from "react";
import { dismiss, subscribe, type UiRequest } from "../lib/ui";

// Renders the oldest pending notice / confirmation / prompt from lib/ui.ts as a modal.
export function DialogHost() {
  const [queue, setQueue] = useState<UiRequest[]>([]);
  useEffect(() => subscribe(setQueue), []);
  const current = queue[0];
  return current ? <Modal key={queue.length + current.kind + current.message} req={current} /> : null;
}

function Modal({ req }: { req: UiRequest }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const done = useRef(false);

  useEffect(() => { dlg.current?.showModal(); }, []);

  const finish = (answer: boolean | string | null) => {
    if (done.current) return;
    done.current = true;
    if (req.kind === "notice") req.resolve();
    else if (req.kind === "confirm") req.resolve(answer === true);
    else req.resolve(typeof answer === "string" ? answer : null);
    dismiss(req);
  };

  return (
    <dialog ref={dlg} className={"msg" + (req.kind === "notice" && req.tone === "error" ? " error" : "")}
      onClose={() => finish(req.kind === "confirm" ? false : null)} aria-live="assertive">
      <form method="dialog" onSubmit={e => { e.preventDefault(); finish(req.kind === "prompt" ? text : true); dlg.current?.close(); }}>
        <p className="msg-text">{req.message}</p>
        {req.kind === "prompt" && <input value={text} onChange={e => setText(e.target.value)} autoFocus maxLength={300} />}
        <div className="actions">
          {req.kind !== "notice" && <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancel</button>}
          <button type="submit" className={"btn primary" + (req.kind === "confirm" && req.danger ? " danger" : "")} autoFocus={req.kind !== "prompt"}>
            {req.kind === "confirm" ? req.yes : "OK"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
