import { useCallback, useEffect, useState } from "react";
import type { Category } from "../../types";
import { supabase } from "../../lib/supabase";
import { confirmAsk, notify, promptAsk, explainError } from "../../lib/ui";
import { usePageMeta } from "../../lib/pageMeta";
import { Button, IconButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { PageHeader } from "../../ui/PageHeader";
import "./review.css";

type Row = Record<string, any>;
interface Member { user_id: string; email: string; role: "admin" | "contributor"; auto_approve: boolean }

const PLACE_FIELDS = ["name", "category_id", "district", "lat", "lng", "description", "phone", "website", "approx", "visited", "notes"];
const SONG_FIELDS = ["title", "artist", "language", "lyrics", "credit"];

// Admin only: approve or reject what contributors submitted, and manage who may contribute.
export function ReviewPage({ categories }: { categories: Category[] }) {
  usePageMeta("Review submissions", "Approve or reject places and songs submitted by contributors, and manage who can contribute.");
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
    if (error) void notify(explainError(error.message), "error");
    void load();
  };

  const review = async (table: "places" | "songs" | "revisions", id: string, approve: boolean) => {
    if (!supabase) return;
    if (table === "revisions" && approve) return run(() => supabase!.rpc("approve_revision", { rev: id }));
    const note = approve ? null : await promptAsk("Reason for rejecting (shown to the contributor, optional):");
    if (note === null && !approve) return; // cancelled
    return run(() => supabase!.from(table).update({ status: approve ? "approved" : "rejected", review_note: note || null }).eq("id", id));
  };

  const addMember = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => supabase!.rpc("add_member", { p_email: email, p_role: "contributor", p_auto: auto })).then(() => setEmail(""));
  };

  // One file with everything the app stores. The free database plan has no restore, so keep copies.
  const backup = async () => {
    if (!supabase) return;
    setBusy(true);
    const [p, s, i, v, m] = await Promise.all([
      supabase.from("places").select("*").limit(50000), supabase.from("songs").select("*").limit(50000),
      supabase.from("items").select("*").limit(50000), supabase.from("revisions").select("*").limit(50000), supabase.rpc("list_members")
    ]);
    setBusy(false);
    const failed = [p, s, i, v, m].find(x => x.error);
    if (failed?.error) return void notify(`Backup failed: ${explainError(failed.error.message)}`, "error");
    const file = { exportedAt: new Date().toISOString(), places: p.data, songs: s.data, checklistEdits: i.data, proposals: v.data, members: m.data };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: `explore-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const nothing = !places.length && !songs.length && !revs.length;
  const waiting = places.length + songs.length + revs.length;

  return (
    <div className="page review">
      <PageHeader title="Review" sub={waiting ? `${waiting} waiting for your decision` : "Nothing waiting for approval"} />
      {nothing && (
        <div className="card rv-empty">
          <span className="rv-empty-ic" aria-hidden="true">🎉</span>
          <strong>All caught up</strong>
          <p className="ph-sub">New places and songs from contributors will show up here.</p>
        </div>
      )}

      {places.length > 0 && (
        <section className="rv-section">
          <h2>New places <span className="rv-n">{places.length}</span></h2>
          {places.map(p => (
            <article className="card rv-card" key={p.id}>
              <h3 className="rv-title">{p.name}</h3>
              <div className="rv-tags">
                <span className="tag">{catLabel(p.category_id)}</span>
                {p.district && <span className="tag">{p.district}</span>}
                <span className="tag">{p.lat}, {p.lng}</span>
                <span className="tag">by {who(p.owner_id)}</span>
              </div>
              {p.description && <p className="rv-body">{p.description}</p>}
              <Actions busy={busy} onApprove={() => review("places", p.id, true)} onReject={() => review("places", p.id, false)} />
            </article>
          ))}
        </section>
      )}

      {songs.length > 0 && (
        <section className="rv-section">
          <h2>New songs <span className="rv-n">{songs.length}</span></h2>
          {songs.map(s => (
            <article className="card rv-card" key={s.id}>
              <h3 className="rv-title">{s.title}</h3>
              <div className="rv-tags">
                {s.artist && <span className="tag">{s.artist}</span>}
                {s.language && <span className="tag">{s.language}</span>}
                <span className="tag">by {who(s.owner_id)}</span>
              </div>
              {s.lyrics && <pre className="rv-pre">{s.lyrics}</pre>}
              <Actions busy={busy} onApprove={() => review("songs", s.id, true)} onReject={() => review("songs", s.id, false)} />
            </article>
          ))}
        </section>
      )}

      {revs.length > 0 && (
        <section className="rv-section">
          <h2>Proposed changes <span className="rv-n">{revs.length}</span></h2>
          {revs.map(r => {
            const current = targets[`${r.kind}:${r.target_id}`];
            const fields = r.kind === "place" ? PLACE_FIELDS : SONG_FIELDS;
            const changed = fields.filter(f => (current?.[f] ?? null) !== (r.data?.[f] ?? null));
            return (
              <article className="card rv-card" key={r.id}>
                <h3 className="rv-title">{current ? current.name ?? current.title : r.target_id}</h3>
                <div className="rv-tags"><span className="tag">{r.kind} edit</span><span className="tag">by {who(r.owner_id)}</span></div>
                {!current && <p className="rv-body">The original no longer exists.</p>}
                {changed.length === 0 && <p className="rv-body">No visible changes.</p>}
                {changed.map(f => (
                  <div className="diff" key={f}>
                    <b>{f}</b>
                    <del>{String(current?.[f] ?? "empty").slice(0, 200)}</del>
                    <ins>{String(r.data?.[f] ?? "empty").slice(0, 200)}</ins>
                  </div>
                ))}
                <Actions busy={busy || !current} onApprove={() => review("revisions", r.id, true)} onReject={() => review("revisions", r.id, false)} />
              </article>
            );
          })}
        </section>
      )}

      <section className="rv-section">
        <h2>People who can contribute</h2>
        <ul className="rv-members">
          {members.map(m => (
            <li key={m.user_id} className="card rv-member">
              <span className="rv-avatar" aria-hidden="true"><Icon name="user" size={20} /></span>
              <span className="rv-who">
                <strong>{m.email}</strong>
                <span className="tag">{m.role === "admin" ? "Admin · always approved" : "Contributor"}</span>
              </span>
              {m.role !== "admin" && (
                <>
                  <label className="switch" title="Trusted: their work goes live without review">
                    <input type="checkbox" checked={m.auto_approve} disabled={busy} aria-label={`Auto-approve ${m.email}`}
                      onChange={e => run(() => supabase!.rpc("set_member", { p_user: m.user_id, p_role: m.role, p_auto: e.target.checked }))} />
                    <span className="switch-label">Trusted</span>
                  </label>
                  <IconButton className="sm danger" icon="trash" label={`Remove ${m.email}`} disabled={busy}
                    onClick={async () => (await confirmAsk(`Remove ${m.email}?`, { yes: "Remove", danger: true })) && run(() => supabase!.rpc("remove_member", { p_user: m.user_id }))} />
                </>
              )}
            </li>
          ))}
        </ul>
        <form className="card rv-add" onSubmit={addMember}>
          <strong>Add a contributor</strong>
          <p className="ph-sub">Create their login in Supabase first, then enter the same email here.</p>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" required aria-label="Contributor email" />
          <label className="switch"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /><span className="switch-label">Trusted: auto-approve their work</span></label>
          <Button variant="primary" type="submit" icon="plus" disabled={busy || !email}>Add contributor</Button>
        </form>
      </section>

      <section className="rv-section">
        <h2>Backup</h2>
        <div className="card">
          <p className="rv-body">Downloads every place, song, checklist edit, proposal and member as one file. The free database plan has no restore, so keep a copy now and then.</p>
          <Button icon="download" onClick={backup} disabled={busy}>Download full backup</Button>
        </div>
      </section>
    </div>
  );
}

function Actions({ busy, onApprove, onReject }: { busy: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="rv-actions">
      <Button disabled={busy} onClick={onReject}>Reject</Button>
      <Button variant="primary" icon="check" disabled={busy} onClick={onApprove}>Approve</Button>
    </div>
  );
}
