import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { store } from "../lib/data";
import { notify } from "../lib/ui";
import { closeSuggest, contactEmail, useSuggest, type SuggestRequest } from "../lib/suggest";
import { useDirtyClose } from "../lib/useDirtyClose";
import { Button } from "../ui/Button";

const KINDS: { id: SuggestRequest["kind"]; label: string }[] = [
  { id: "place", label: "Suggest a new place" },
  { id: "problem", label: "Report a problem" },
  { id: "other", label: "Something else" }
];

/** A public form: anyone can suggest a place or report a mistake, no account needed. Opened with openSuggest() from anywhere. */
export function SuggestDialog({ regionName }: { regionName?: string }) {
  const req = useSuggest();
  return req ? <Form key={`${req.kind}|${req.about ?? ""}`} req={req} regionName={regionName} /> : null;
}

function Form({ req, regionName }: { req: SuggestRequest; regionName?: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState(req.kind);
  const [about, setAbout] = useState(req.about ?? "");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [trap, setTrap] = useState(""); // a field people never see: bots fill it in
  const [busy, setBusy] = useState(false);
  useEffect(() => { dlg.current?.showModal(); }, []);
  const cancel = useDirtyClose(dlg, message.trim().length > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (text.length < 5) return;
    if (trap) { dlg.current?.close(); return; } // pretend it worked
    const last = Number(store.get("suggest-at") ?? 0);
    if (Date.now() - last < 30000) return void notify("Please wait a moment before sending another one.", "error");
    const link = req.link ?? location.href;
    if (supabase) {
      setBusy(true);
      const { error } = await supabase.from("suggestions").insert({
        kind, about: about.trim().slice(0, 200) || null, message: text.slice(0, 1000), contact: contact.trim().slice(0, 120) || null,
        region: regionName?.slice(0, 80) ?? null, page: link.slice(0, 300)
      });
      setBusy(false);
      if (error) return void notify(/suggestions|relation|schema/i.test(error.message) ? "Suggestions aren't switched on for this site yet." : "Couldn't send that. Check your connection and try again.", "error");
    } else if (contactEmail) {
      const subject = `${KINDS.find(k => k.id === kind)?.label}${about.trim() ? `: ${about.trim()}` : ""}`;
      location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n\n${contact.trim() ? `Contact: ${contact.trim()}\n` : ""}${link}`)}`;
    }
    store.set("suggest-at", String(Date.now()));
    void notify("Thank you! Your message was sent.");
    dlg.current?.close();
  };

  return (
    <dialog ref={dlg} onClose={closeSuggest}>
      <form onSubmit={submit}>
        <h2>Suggest a place or report a problem</h2>
        <label>What is this about?
          <select value={kind} onChange={e => setKind(e.target.value as SuggestRequest["kind"])}>
            {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
        <label>{kind === "place" ? "Name of the place" : "Which place or page? (optional)"}
          <input value={about} onChange={e => setAbout(e.target.value)} maxLength={200} autoComplete="off" />
        </label>
        <label>Details *
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={1000} required
            placeholder={kind === "place" ? "Where is it, what is there, and anything useful to know (a phone number, a Google Maps link…)" : "What is wrong, and what should it say?"} />
        </label>
        <label>Your email or phone (optional, only if you want a reply)
          <input value={contact} onChange={e => setContact(e.target.value)} maxLength={120} autoComplete="off" />
        </label>
        <label className="sr-only" aria-hidden="true">Leave this empty<input tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} /></label>
        <p className="hint">An admin reads every message. Nothing else is collected beyond what you type.</p>
        <div className="actions">
          <Button onClick={cancel}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy || message.trim().length < 5}>{busy ? "Sending…" : "Send"}</Button>
        </div>
      </form>
    </dialog>
  );
}
