import { useEffect, useState } from "react";
import type { Category, Place, Song, StateInfo } from "./types";
import { loadJson, store } from "./lib/data";
import { PlacesPage } from "./components/PlacesPage";
import { MusicPage } from "./components/MusicPage";
import { ChecklistPage, type Catalog } from "./components/ChecklistPage";
import { useOverlay } from "./lib/overlay";
import { useRows } from "./lib/rows";
import { supabase } from "./lib/supabase";
import { AdminLogin } from "./components/AdminLogin";
import { ReviewPage } from "./components/ReviewPage";
import { PwaBar } from "./components/PwaBar";
import { DialogHost } from "./components/DialogHost";
import { AboutPage } from "./components/AboutPage";
import { notify } from "./lib/ui";
import { LIMITS } from "./lib/limits";

interface Member { role: "admin" | "contributor"; auto_approve: boolean }

// Only used when Supabase is NOT configured (local development). Edits then stay in this browser only.
// On a deployed site the edit tools stay hidden unless this device opted in with ?admin=1 (?admin=0 turns it off).
const LOCAL_ADMIN = (() => {
  const v = new URLSearchParams(location.search).get("admin");
  if (v !== null) store.set("admin", v === "1" ? "on" : "off");
  const flag = store.get("admin");
  return import.meta.env.DEV ? flag !== "off" : flag === "on";
})();
if (LOCAL_ADMIN) navigator.storage?.persist?.(); // ask the browser not to clear the saved places

// Secret address for the sign-in box, e.g. https://yoursite/#/manage-k7q2. Change it in .env.
const ADMIN_ROUTE = import.meta.env.VITE_ADMIN_ROUTE || "admin";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function useHash() {
  const [hash, setHash] = useState(() => location.hash.replace(/^#\/?/, ""));
  useEffect(() => {
    const on = () => setHash(location.hash.replace(/^#\/?/, ""));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  // With Supabase configured, only people listed in public.members may edit (see supabase/contributors.sql);
  // otherwise the local ?admin flag decides.
  const [member, setMember] = useState<Member | null>(null);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const check = (signedIn: boolean) => {
      setHasSession(signedIn);
      if (!signedIn) return setMember(null);
      supabase!.rpc("my_role").then(({ data }) => setMember(data?.role ? (data as Member) : null));
    };
    supabase.auth.getSession().then(({ data }) => check(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => check(!!session));
    return () => data.subscription.unsubscribe();
  }, []);
  const signedIn = !!member;
  const ADMIN = supabase ? signedIn : LOCAL_ADMIN;                    // can add / edit
  const IS_ADMIN = supabase ? member?.role === "admin" : LOCAL_ADMIN; // can delete, review, manage the catalog
  const [route, arg] = hash.split("/");
  const page = route === "music" ? "music" : route === "checklist" ? "checklist" : route === "review" && IS_ADMIN && supabase ? "review" : route === "about" ? "about" : "places";

  const [states, setStates] = useState<StateInfo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [baseSongs, setBaseSongs] = useState<Song[]>([]);
  const [stateId, setStateId] = useState(() => store.get("state") ?? "manipur");
  const [base, setBase] = useState<Place[]>([]);
  const [checklist, setChecklist] = useState<Catalog | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      loadJson<StateInfo[]>("states.json"),
      loadJson<Category[]>("categories.json"),
      loadJson<Song[]>("songs.json").catch(() => [] as Song[]),
      loadJson<Catalog>("checklist.json").catch(() => null)
    ]).then(([s, c, m, k]) => { setStates(s); setCategories(c); setBaseSongs(m); setChecklist(k); })
      .catch(e => setError(e.message));
  }, []);

  const state = states.find(s => s.id === stateId) ?? states[0];

  useEffect(() => {
    if (!state) return;
    store.set("state", state.id);
    setBase([]);
    loadJson<Place[]>(`${state.id}/places.json`).then(setBase).catch(e => setError(e.message));
  }, [state?.id]);

  // With Supabase, places and songs are rows in their own tables; without it, edits are kept in this browser.
  const nul = <T,>(v: T | null | undefined) => v ?? undefined;
  const dbPlaces = useRows<Place>(supabase && state ? {
    table: "places", kind: "place", columns: "id,state_id,category_id,name,district,lat,lng,description,phone,website,approx,visited,notes,status,review_note,updated_at", propose: !!member && !member.auto_approve, scope: { column: "state_id", value: state.id },
    toRow: (p, id) => ({ id, name: p.name, category_id: p.category, district: p.district ?? null, lat: p.lat, lng: p.lng,
      description: p.desc ?? null, phone: p.phone ?? null, website: p.website ?? null, approx: !!p.approx,
      visited: p.visited ?? null, notes: p.notes ?? null }),
    fromRow: r => ({ id: r.id as string, name: r.name as string, category: r.category_id as string, district: nul(r.district as string),
      lat: r.lat as number, lng: r.lng as number, desc: nul(r.description as string), phone: nul(r.phone as string),
      website: nul(r.website as string), approx: r.approx ? true : undefined, visited: nul(r.visited as string), notes: nul(r.notes as string),
      status: r.status as Place["status"], reviewNote: nul(r.review_note as string), updatedAt: nul(r.updated_at as string) })
  } : null, base);
  const dbSongs = useRows<Song>(supabase ? {
    table: "songs", kind: "song", columns: "id,title,artist,language,lyrics,credit,status,review_note,updated_at", propose: !!member && !member.auto_approve,
    toRow: (x, id) => ({ id, title: x.title, artist: x.artist ?? null, language: x.language ?? null, lyrics: x.lyrics, credit: x.credit ?? null }),
    fromRow: r => ({ id: r.id as string, title: r.title as string, artist: nul(r.artist as string), language: nul(r.language as string),
      lyrics: r.lyrics as string, credit: nul(r.credit as string),
      status: r.status as Song["status"], reviewNote: nul(r.review_note as string), updatedAt: nul(r.updated_at as string) })
  } : null, baseSongs);
  const localPlaces = useOverlay<Place>(!supabase && state ? `places:${state.id}` : null, base);
  const localSongs = useOverlay<Song>(!supabase ? "songs" : null, baseSongs);
  const placeStore = supabase ? dbPlaces : localPlaces;
  const songStore = supabase ? dbSongs : localSongs;
  // Refresh when switching tabs or signing in/out, so approvals and pending items show up.
  useEffect(() => { void dbPlaces.reload(); void dbSongs.reload(); }, [page, member?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Admin: how many submissions wait for review.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!supabase || !IS_ADMIN) return setPending(0);
    Promise.all(["places", "songs", "revisions"].map(t =>
      supabase!.from(t).select("id", { count: "exact", head: true }).eq("status", "pending")))
      .then(rs => setPending(rs.reduce((n, r) => n + (r.count ?? 0), 0)));
  }, [IS_ADMIN, hash]);

  const exportRows = supabase ? placeStore.items : localPlaces.local;

  const exportPlaces = () => {
    const rows = exportRows.map(({ id, ...p }) => ({ id: id.startsWith("local-") || id.startsWith("u-") ? slug(p.name) : id, ...p }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: `${state?.id}-${supabase ? "places" : "new-places"}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importPlaces = async (file: File) => {
    let rows: unknown;
    try { rows = JSON.parse(await file.text()); } catch { return void notify("That file isn't valid JSON.", "error"); }
    if (!Array.isArray(rows)) return void notify("Expected a list of places.", "error");
    const key = (n: string, lat: number, lng: number) => `${n.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    const seen = new Set(placeStore.items.map(p => key(p.name, p.lat, p.lng)));
    const added: Place[] = [];
    const skipped = { duplicate: 0, invalid: 0 };
    const str = (v: unknown, max: number) => (v == null || v === "" ? undefined : String(v).trim().slice(0, max));
    rows.forEach((r: any, i) => {
      const lat = +r?.lat, lng = +r?.lng, name = String(r?.name ?? "").trim();
      if (!name || name.length > LIMITS.name || !categories.some(c => c.id === r.category) || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { skipped.invalid++; return; }
      if (seen.has(key(name, lat, lng))) { skipped.duplicate++; return; }
      seen.add(key(name, lat, lng));
      added.push({
        id: `local-${Date.now().toString(36)}${i}`, name, category: r.category, lat, lng,
        district: str(r.district, LIMITS.district), desc: str(r.desc, LIMITS.desc), phone: str(r.phone, LIMITS.phone), notes: str(r.notes, LIMITS.notes),
        visited: /^\d{4}-\d{2}-\d{2}$/.test(r.visited) ? r.visited : undefined,
        website: /^https?:\/\//i.test(r.website ?? "") ? String(r.website).slice(0, LIMITS.website) : undefined, approx: r.approx || undefined
      });
    });
    const ok = await placeStore.addMany(added);
    if (!ok) return; // the error was already shown
    const extra = [skipped.duplicate && `${skipped.duplicate} duplicate`, skipped.invalid && `${skipped.invalid} missing or invalid details`].filter(Boolean).join(", ");
    void notify(`Imported ${added.length} of ${rows.length} places${extra ? ` (skipped: ${extra})` : ""}.`);
  };

  return (
    <div className="app">
      <header>
        <h1>Explore India</h1>
        {states.length > 1 ? (
          <select value={state?.id} onChange={e => setStateId(e.target.value)} aria-label="State">
            {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : state && <span className="state-name">{state.name}</span>}
        <nav className="tabs" aria-label="Main menu">
          <a href="#/places" aria-current={page === "places" ? "page" : undefined}><span aria-hidden>🗺️</span> Places</a>
          <a href="#/music" aria-current={page === "music" ? "page" : undefined}><span aria-hidden>🎵</span> Music</a>
          <a href="#/checklist" aria-current={page === "checklist" ? "page" : undefined}><span aria-hidden>🎒</span> Checklist</a>
        </nav>
        {supabase && IS_ADMIN && <a className="btn" href="#/review">Review{pending ? ` (${pending})` : ""}</a>}
        <AdminLogin hasSession={hasSession} isMember={signedIn} show={route === ADMIN_ROUTE} onClose={() => { if (route === ADMIN_ROUTE) location.hash = "#/places"; }} />
      </header>
      <PwaBar />
      <main>
        {error && <div className="error">Couldn't load data: {error}</div>}
        {page === "places" && state && (
          <PlacesPage key={state.id} state={state} categories={categories} places={placeStore.items} localIds={placeStore.localIds} admin={ADMIN} canDelete={IS_ADMIN} loading={supabase ? dbPlaces.loading : false}
            onSavePlace={placeStore.save} onDeletePlace={placeStore.remove} exportCount={exportRows.length} onExport={exportPlaces} onImport={importPlaces} />
        )}
        {page === "checklist" && <ChecklistPage catalog={checklist} admin={IS_ADMIN} />}
        {page === "review" && <ReviewPage categories={categories} />}
        {page === "about" && <AboutPage />}
        {page === "music" && (
          <MusicPage songs={songStore.items} localIds={songStore.localIds} admin={ADMIN} canDelete={IS_ADMIN} onSave={songStore.save} onDelete={songStore.remove} songId={arg ?? null} open={id => { location.hash = id ? `#/music/${id}` : "#/music"; }} />
        )}
      </main>
      <DialogHost />
    </div>
  );
}
