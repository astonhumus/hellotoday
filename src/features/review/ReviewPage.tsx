import { useCallback, useEffect, useState } from "react";
import type { Category } from "../../types";
import { supabase } from "../../lib/supabase";
import { confirmAsk, notify, promptAsk, explainError } from "../../lib/ui";
import { usePageMeta } from "../../lib/pageMeta";
import { Button, IconButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { PageHeader } from "../../ui/PageHeader";
import { goBack } from "../../lib/nav";
import { fetchAll } from "../../lib/fetchAll";
import { Segmented } from "../../ui/Segmented";
import { Skeleton } from "../../ui/States";
import "./review.css";

type Row = Record<string, any>;
interface Member { user_id: string; email: string; role: "admin" | "contributor"; auto_approve: boolean }

const PLACE_FIELDS = ["name", "category_id", "district", "lat", "lng", "description", "phone", "website", "approx", "visited", "notes", "photo", "hours", "fee", "season", "closure", "closure_note"];
// What the reviewer reads instead of the database column names
const FIELD_LABELS: Record<string, string> = {
  name: "Name", category_id: "Category", district: "District", lat: "Latitude", lng: "Longitude", description: "Description", phone: "Phone", website: "Website",
  approx: "Location is approximate", visited: "Date last checked", notes: "Tips", photo: "Picture", hours: "Opening hours", fee: "Entry fee or price", season: "Best time to visit",
  closure: "Closed", closure_note: "Reason for closing", title: "Title", artist: "Artist", language: "Language", lyrics: "Lyrics", credit: "Credit / source"
};
const osmLink = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
const SONG_FIELDS = ["title", "artist", "language", "lyrics", "credit"];
const same = (v: unknown) => (v === false || v === "" || v === undefined ? null : v); // "no value" is the same however it is stored

// A backup covers a window of recent changes, at most six months back (keeps each file small and the database queries cheap).
type Window = "3" | "6";
const WINDOW_OPTIONS: { id: Window; label: string }[] = [{ id: "3", label: "Last 3 months" }, { id: "6", label: "Last 6 months" }];
const since = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() - months); return d.toISOString(); };

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
  const [window3or6, setWindow] = useState<Window>("3");
  const [sugs, setSugs] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false); // until the first answer arrives the page says so, instead of claiming nothing is waiting

  const who = (id: string | null) => members.find(m => m.user_id === id)?.email ?? "unknown";
  const catLabel = (id: string) => categories.find(c => c.id === id)?.label ?? id;

  const load = useCallback(async () => {
    if (!supabase) return;
    const [p, s, r, m, g] = await Promise.all([
      supabase.from("places").select("*").eq("status", "pending").order("created_at"),
      supabase.from("songs").select("*").eq("status", "pending").order("created_at"),
      supabase.from("revisions").select("*").eq("status", "pending").order("created_at"),
      supabase.rpc("list_members"),
      supabase.from("suggestions").select("*").eq("status", "new").order("created_at") // absent until supabase/suggestions.sql has been run: then simply empty
    ]);
    setSugs(g.data ?? []);
    setLoaded(true);
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

  // One file with what was added or changed in the chosen window (3 or 6 months). The free database plan has no restore, so keep copies.
  // Read page by page: the server returns at most 1000 rows per request, which would silently cut a bigger table short.
  const backup = async () => {
    if (!supabase) return;
    const months = window3or6 === "6" ? 6 : 3;
    const from = since(months);
    setBusy(true);
    const db = supabase;
    const [p, s, i, v, m] = await Promise.all([
      fetchAll<Row>((a, b) => db.from("places").select("*").gte("updated_at", from).order("id").range(a, b)),
      fetchAll<Row>((a, b) => db.from("songs").select("*").gte("updated_at", from).order("id").range(a, b)),
      fetchAll<Row>((a, b) => db.from("items").select("*").gte("updated_at", from).order("kind").order("id").range(a, b)),
      fetchAll<Row>((a, b) => db.from("revisions").select("*").gte("created_at", from).order("id").range(a, b)),
      db.rpc("list_members")
    ]);
    setBusy(false);
    const failed = [p, s, i, v, m].find(x => x.error);
    if (failed?.error) return void notify(`Backup failed: ${explainError(failed.error.message)}`, "error");
    const file = { exportedAt: new Date().toISOString(), window: { months, changedSince: from }, places: p.data, songs: s.data, checklistEdits: i.data, proposals: v.data, members: m.data };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: `explore-backup-${months}m-${new Date().toISOString().slice(0, 10)}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    void notify(`Backup saved: ${p.data.length} places, ${s.data.length} songs, ${i.data.length} checklist edits changed in the last ${months} months.`);
  };

  const nothing = loaded && !places.length && !songs.length && !revs.length;
  const showValue = (f: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "empty";
    if (f === "category_id") return catLabel(String(v));
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  };
  const markDone = (id: string) => run(() => supabase!.from("suggestions").update({ status: "done" }).eq("id", id));
  const dropSuggestion = async (id: string) => { if (await confirmAsk("Delete this message?", { yes: "Delete", danger: true })) await run(() => supabase!.from("suggestions").delete().eq("id", id)); };
  const waiting = places.length + songs.length + revs.length;

  return (
    <div className="page review">
      <PageHeader title="Review" onBack={() => goBack("#/places")} sub={!loaded ? "Loading…" : waiting ? `${waiting} waiting for your decision` : "Nothing waiting for approval"} />
      {!loaded && <Skeleton rows={3} kind="card" label="Loading submissions" />}
      {nothing && (
        <div className="card rv-empty">
          <span className="rv-empty-ic" aria-hidden="true"><Icon name="party-popper" size={40} /></span>
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
              {[["Opening hours", p.hours], ["Entry fee or price", p.fee], ["Best time to visit", p.season], ["Tips", p.notes], ["Picture", p.photo]].filter(([, v]) => v).map(([k, v]) => (
                <p className="rv-body rv-line" key={String(k)}><b>{k}:</b> {String(v)}</p>
              ))}
              <a className="rv-map" href={osmLink(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">Check the position on OpenStreetMap (opens a new tab)</a>
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
            const changed = fields.filter(f => same(current?.[f]) !== same(r.data?.[f]));
            return (
              <article className="card rv-card" key={r.id}>
                <h3 className="rv-title">{current ? current.name ?? current.title : r.target_id}</h3>
                <div className="rv-tags"><span className="tag">{r.kind} edit</span><span className="tag">by {who(r.owner_id)}</span></div>
                {!current && <p className="rv-body">The original no longer exists.</p>}
                {changed.length === 0 && <p className="rv-body">No visible changes.</p>}
                {changed.map(f => (
                  <div className="diff" key={f}>
                    <b>{FIELD_LABELS[f] ?? f}</b>
                    <del>{showValue(f, current?.[f])}</del>
                    <ins>{showValue(f, r.data?.[f])}</ins>
                  </div>
                ))}
                {r.kind === "place" && (changed.includes("lat") || changed.includes("lng")) && r.data?.lat != null && r.data?.lng != null && (
                  <a className="rv-map" href={osmLink(r.data.lat, r.data.lng)} target="_blank" rel="noopener noreferrer">Check the new position on OpenStreetMap (opens a new tab)</a>
                )}
                <Actions busy={busy || !current} onApprove={() => review("revisions", r.id, true)} onReject={() => review("revisions", r.id, false)} />
              </article>
            );
          })}
        </section>
      )}

      {sugs.length > 0 && (
        <section className="rv-section">
          <h2>Messages from visitors <span className="rv-n">{sugs.length}</span></h2>
          {sugs.map(g => (
            <article className="card rv-card" key={g.id}>
              <h3 className="rv-title">{g.kind === "place" ? "Suggested place" : g.kind === "problem" ? "Reported problem" : "Message"}{g.about ? `: ${g.about}` : ""}</h3>
              <div className="rv-tags">
                {g.region && <span className="tag">{g.region}</span>}
                <span className="tag">{new Date(g.created_at).toLocaleDateString()}</span>
                {g.contact && <span className="tag">Reply to: {g.contact}</span>}
              </div>
              <p className="rv-body rv-line">{g.message}</p>
              {g.page && /^https?:\/\//i.test(g.page) && <a className="rv-map" href={g.page} target="_blank" rel="noopener noreferrer">Open the page it was sent from</a>}
              <div className="rv-actions">
                <Button disabled={busy} onClick={() => dropSuggestion(g.id)}>Delete</Button>
                <Button variant="primary" icon="check" disabled={busy} onClick={() => markDone(g.id)}>Mark as done</Button>
              </div>
            </article>
          ))}
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
          <p className="rv-body">Downloads the places, songs, checklist edits and proposals added or changed in the chosen period, plus the member list. The free database plan has no restore, so keep a copy now and then. Items not touched in that period are not included, so make a backup at least every few months.</p>
          <Segmented<Window> label="Backup period" value={window3or6} onChange={setWindow} options={WINDOW_OPTIONS} />
          <Button icon="download" onClick={backup} disabled={busy}>Download backup</Button>
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
