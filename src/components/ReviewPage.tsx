import { useCallback, useEffect, useState } from "react";
import type { Category } from "../types";
import { supabase } from "../lib/supabase";

type Row = Record<string, any>;
interface Member { user_id: string; email: string; role: "admin" | "contributor"; auto_approve: boolean }

const PLACE_FIELDS = ["name", "category_id", "district", "lat", "lng", "description", "phone", "website", "approx", "visited", "notes"];
const SONG_FIELDS = ["title", "artist", "language", "lyrics", "credit"];

// Admin only: approve or reject what contributors submitted, and manage who may contribute.
export function ReviewPage({ categories }: { categories: Category[] }) {
  const [places, setPlaces] = useState<Row[]>([]);
  const [songs, setSongs] = useState<Row[]>([]);
  const [revs, setRevs] = useState<Row[]>([]);
  const [targets, setTargets] = useState<Record<string, Row>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [auto, setAuto] = useState(false);

  const who = (id: string | null) => members.find(m => m.user_id === id)?.email ?? "unknown";
  const catLabel = (id: string) => categories.find(c => c.id === id)?.label ?? id;

  const load = useCallback(async () => {
    if (!supabase) return;
    const [p, s, r, m] = await Promise.all([
      supabase.from("places").select("*").eq("status", "pending").order("created_at"),
      supabase.from("songs").select("*").eq("status", "pending").order("created_at"),
      supabase.from("revisions").select("*").eq("status", "pending").order("created_at"),
      supabase.rpc("list_members")
    ]);
    setPlaces(p.data ?? []); setSongs(s.data ?? []); setRevs(r.data ?? []); setMembers((m.data as Member[]) ?? []);
    const t: Record<string, Row> = {};
    for (const [kind, table] of [["place", "places"], ["song", "songs"]] as const) {
      const ids = (r.data ?? []).filter((x: Row) => x.kind === kind).map((x: Row) => x.target_id);
      if (!ids.length) continue;
      const { data } = await supabase.from(table).select("*").in("id", ids);
      (data ?? []).forEach((row: Row) => { t[`${kind}:${row.id}`] = row; });
    }
    setTargets(t);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (job: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    const { error } = await job();
    setBusy(false);
    if (error) alert(error.message);
    void load();
  };

  const review = (table: "places" | "songs" | "revisions", id: string, approve: boolean) => {
    if (!supabase) return;
    if (table === "revisions" && approve) return run(() => supabase!.rpc("approve_revision", { rev: id }));
    const note = approve ? null : prompt("Reason (shown to the contributor, optional):") ?? "";
    return run(() => supabase!.from(table).update({ status: approve ? "approved" : "rejected", review_note: note || null }).eq("id", id));
  };

  const addMember = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => supabase!.rpc("add_member", { p_email: email, p_role: "contributor", p_auto: auto })).then(() => setEmail(""));
  };

  const nothing = !places.length && !songs.length && !revs.length;

  return (
    <div className="page review">
      <h2>Review</h2>
      {nothing && <div className="empty">Nothing waiting for approval. 🎉</div>}

      {places.length > 0 && <h3>New places ({places.length})</h3>}
      {places.map(p => (
        <div className="card" key={p.id}>
          <strong>{p.name}</strong>
          <span className="meta">{catLabel(p.category_id)}{p.district ? ` · ${p.district}` : ""} · {p.lat}, {p.lng} · by {who(p.owner_id)}</span>
          {p.description && <span>{p.description}</span>}
          <Actions busy={busy} onApprove={() => review("places", p.id, true)} onReject={() => review("places", p.id, false)} />
        </div>
      ))}

      {songs.length > 0 && <h3>New songs ({songs.length})</h3>}
      {songs.map(s => (
        <div className="card" key={s.id}>
          <strong>{s.title}</strong>
          <span className="meta">{[s.artist, s.language].filter(Boolean).join(" · ")} · by {who(s.owner_id)}</span>
          <pre>{s.lyrics}</pre>
          <Actions busy={busy} onApprove={() => review("songs", s.id, true)} onReject={() => review("songs", s.id, false)} />
        </div>
      ))}

      {revs.length > 0 && <h3>Proposed changes ({revs.length})</h3>}
      {revs.map(r => {
        const current = targets[`${r.kind}:${r.target_id}`];
        const fields = r.kind === "place" ? PLACE_FIELDS : SONG_FIELDS;
        const changed = fields.filter(f => (current?.[f] ?? null) !== (r.data?.[f] ?? null));
        return (
          <div className="card" key={r.id}>
            <strong>{current ? current.name ?? current.title : r.target_id}</strong>
            <span className="meta">{r.kind} edit · by {who(r.owner_id)}</span>
            {!current && <span className="meta">The original no longer exists.</span>}
            {changed.length === 0 && <span className="meta">No visible changes.</span>}
            {changed.map(f => (
              <div className="diff" key={f}>
                <b>{f}:</b> <del>{String(current?.[f] ?? "—").slice(0, 200)}</del> → <ins>{String(r.data?.[f] ?? "—").slice(0, 200)}</ins>
              </div>
            ))}
            <Actions busy={busy || !current} onApprove={() => review("revisions", r.id, true)} onReject={() => review("revisions", r.id, false)} />
          </div>
        );
      })}

      <h3>People who can contribute</h3>
      <table>
        <thead><tr><th>Email</th><th>Role</th><th>Auto-approve</th><th /></tr></thead>
        <tbody>
          {members.map(m => (
            <tr key={m.user_id}>
              <td>{m.email}</td>
              <td>{m.role}</td>
              <td>
                {m.role === "admin" ? "always" : (
                  <input type="checkbox" checked={m.auto_approve} disabled={busy} aria-label={`Auto-approve ${m.email}`}
                    onChange={e => run(() => supabase!.rpc("set_member", { p_user: m.user_id, p_role: m.role, p_auto: e.target.checked }))} />
                )}
              </td>
              <td>
                {m.role !== "admin" && (
                  <button className="link danger" disabled={busy}
                    onClick={() => confirm(`Remove ${m.email}?`) && run(() => supabase!.rpc("remove_member", { p_user: m.user_id }))}>Remove</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="ck-add" onSubmit={addMember}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Contributor's email (create their login in Supabase first)" required />
        <label className="check"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Trusted: auto-approve</label>
        <button className="btn primary" type="submit" disabled={busy || !email}>Add contributor</button>
      </form>
    </div>
  );
}

function Actions({ busy, onApprove, onReject }: { busy: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="tools">
      <button className="btn primary" disabled={busy} onClick={onApprove}>Approve</button>
      <button className="btn" disabled={busy} onClick={onReject}>Reject</button>
    </div>
  );
}
