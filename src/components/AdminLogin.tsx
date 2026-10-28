import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// Optional bot protection: set VITE_TURNSTILE_SITE_KEY (and turn on CAPTCHA in Supabase > Authentication > Attack Protection).
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void } } }

// Not linked from anywhere: the admin opens the secret address (see VITE_ADMIN_ROUTE) to get the sign-in box.
// Anyone with a session can sign out; people who aren't approved members are told so.
export function AdminLogin({ hasSession, isMember, show, onClose }: { hasSession: boolean; isMember: boolean; show: boolean; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const captcha = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const open = show && !hasSession;

  useEffect(() => { if (open && !dlg.current?.open) dlg.current?.showModal(); }, [open]);

  // Load the Turnstile widget only when the sign-in box is open.
  useEffect(() => {
    if (!open || !SITE_KEY) return;
    const mount = () => captcha.current && window.turnstile?.render(captcha.current, { sitekey: SITE_KEY, callback: setToken, "expired-callback": () => setToken("") });
    if (window.turnstile) return void mount();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = mount;
    document.head.appendChild(s);
  }, [open]);

  if (!supabase) return null;

  if (hasSession) {
    return (
      <>
        {!isMember && <span className="meta" role="status">This account isn't approved.</span>}
        <button className="btn" onClick={() => supabase!.auth.signOut()}>Sign out</button>
      </>
    );
  }
  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase!.auth.signInWithPassword({ email, password, options: SITE_KEY ? { captchaToken: token } : undefined });
    if (error) { setError("Sign in failed."); setToken(""); window.turnstile?.reset(); return; }
    setPassword(""); setError(""); dlg.current?.close();
  };

  return (
    <dialog ref={dlg} onClose={onClose}>
      <form onSubmit={submit}>
        <h2>Sign in</h2>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
        {SITE_KEY && <div ref={captcha} />}
        {error && <p className="hint bad">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!!SITE_KEY && !token}>Sign in</button>
        </div>
      </form>
    </dialog>
  );
}
