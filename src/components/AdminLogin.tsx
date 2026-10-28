import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// Not linked from anywhere: the admin opens the secret address (see VITE_ADMIN_ROUTE) to get the sign-in box.
// Once signed in, a small Sign out button appears in the header.
export function AdminLogin({ signedIn, show, onClose }: { signedIn: boolean; show: boolean; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const open = show && !signedIn;
  useEffect(() => { if (open && !dlg.current?.open) dlg.current?.showModal(); }, [open]);
  if (!supabase) return null;

  if (signedIn) return <button className="btn" onClick={() => supabase!.auth.signOut()}>Sign out</button>;
  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) return setError("Sign in failed.");
    setPassword(""); setError(""); dlg.current?.close();
  };

  return (
    <dialog ref={dlg} onClose={onClose}>
      <form onSubmit={submit}>
        <h2>Sign in</h2>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
        {error && <p className="hint bad">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
          <button type="submit" className="btn primary">Sign in</button>
        </div>
      </form>
    </dialog>
  );
}
