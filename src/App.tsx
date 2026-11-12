import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Category, CountryInfo, Place, Song, StateInfo } from "./types";
import { RegionPicker } from "./components/RegionPicker";
import { SettingsDialog } from "./components/SettingsDialog";
import { loadJson, store } from "./lib/data";
import type { Catalog } from "./features/checklist/ChecklistPage";
import { useOverlay } from "./lib/overlay";
import { useRows } from "./lib/rows";
import { supabase } from "./lib/supabase";
import { AdminLogin } from "./components/AdminLogin";
import { PwaBar } from "./components/PwaBar";
import { HomePage } from "./features/home/HomePage";
import { DialogHost } from "./components/DialogHost";
import { AboutPage } from "./components/AboutPage";
import { notify } from "./lib/ui";
import { LIMITS } from "./lib/limits";
import { SkeletonPage } from "./ui/States";
import { Icon } from "./ui/Icon";
import { go, goBack, trackHistory } from "./lib/nav";
import { SuggestDialog } from "./components/SuggestDialog";
import { useBackdropClose } from "./lib/useBackdropClose";
import { safeDecode } from "./lib/fetchAll";

// Heavy screens load only when opened, so the home page stays fast. (The map library lives in the Places chunk.)
const PlacesPage = lazy(() => import("./features/places/PlacesPage").then(m => ({ default: m.PlacesPage })));
const MusicPage = lazy(() => import("./features/music/MusicPage").then(m => ({ default: m.MusicPage })));
const ChecklistPage = lazy(() => import("./features/checklist/ChecklistPage").then(m => ({ default: m.ChecklistPage })));
const RegionsPage = lazy(() => import("./features/regions/RegionsPage").then(m => ({ default: m.RegionsPage })));
const ReviewPage = lazy(() => import("./features/review/ReviewPage").then(m => ({ default: m.ReviewPage })));

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

// The sign-in box opens at https://yoursite/#/admin (and at #/<VITE_ADMIN_ROUTE> if you set one). There is also a quiet footer link.
const ADMIN_ROUTE = import.meta.env.VITE_ADMIN_ROUTE || "admin";
const isAdminRoute = (route: string) => route === "admin" || route === ADMIN_ROUTE; // #/admin always works; the old secret word too

const MAX_IMPORT = 2000;
// Not countries people travel to: military bases, uninhabited islands and disputed zones in the border dataset.
const HIDDEN_COUNTRIES = new Set(["ATC", "CSI", "CLP", "KAB", "KAS", "PGA", "USG", "ESB", "WSB", "HMD", "ATA", "ATF", "SGS", "UMI"]);
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
  // Addresses look like #/places?cat=picnic&q=garden: path first, then optional filters
  const [path, query = ""] = hash.split("?");
  const [route, arg] = path.split("/");
  const params = new URLSearchParams(query);
  const page = route === "places" ? "places" : route === "music" ? "music" : route === "checklist" ? "checklist"
    : route === "review" && IS_ADMIN && supabase ? "review" : route === "about" ? "about" : route === "regions" ? "regions" : "home";

  useEffect(trackHistory, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void import("./features/places/PlacesPage"); }, 2500);
    return () => window.clearTimeout(t);
  }, []);

  const [states, setStates] = useState<StateInfo[]>([]);
  const [countries, setCountries] = useState<CountryInfo[]>([]);
  const [baseCategories, setBaseCategories] = useState<Category[]>([]);
  const [baseSongs, setBaseSongs] = useState<Song[]>([]);
  const [stateId, setStateId] = useState(() => store.get("state") ?? "manipur");
  const [base, setBase] = useState<Place[]>([]);
  const [checklist, setChecklist] = useState<Catalog | null>(null);
  // Load problems are tracked by source, so one that later succeeds clears its own message.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const failed = (key: string, message: string) => setErrors(e => (e[key] === message ? e : { ...e, [key]: message }));
  const loaded = (key: string) => setErrors(e => { if (!(key in e)) return e; const { [key]: _gone, ...rest } = e; return rest; });
  const error = Object.values(errors)[0] ?? "";
  const [dataReady, setDataReady] = useState(false);    // the shared lists (states, categories, songs, checklist) have arrived or failed
  const [placesReady, setPlacesReady] = useState(false); // this state's places have arrived or failed

  useEffect(() => {
    Promise.all([
      loadJson<CountryInfo[]>("countries.json"),
      loadJson<Category[]>("categories.json"),
      loadJson<Song[]>("songs.json").catch(() => [] as Song[]),
      loadJson<Catalog>("checklist.json").catch(() => null)
    ]).then(([s, c, m, k]) => { setCountries(s.filter(x => !HIDDEN_COUNTRIES.has(x.id))); setBaseCategories(c); setBaseSongs(m); setChecklist(k); loaded("data"); })
      .catch(e => failed("data", e.message))
      .finally(() => setDataReady(true));
  }, []);

  // The country and state/province are a setting: remembered in this browser, India > Manipur until changed.
  const [countryId, setCountryId] = useState(() => store.get("country") ?? "IND");
  useEffect(() => {
    let live = true;
    setStates([]); // until this country's list arrives, don't show (or save) a region from the previous country
    loadJson<{ features: { properties: StateInfo }[] }>(`regions/${countryId}.json`)
      .then(g => { if (live) { setStates(g.features.map(f => ({ ...f.properties, country: countryId }))); loaded("regions"); } })
      .catch(e => { if (live) failed("regions", e.message); });
    return () => { live = false; };
  }, [countryId]);
  const country = countries.find(c => c.id === countryId);
  const chooseRegion = (cId: string, rId: string) => {
    store.set("country", cId);
    store.set("state", rId);
    setStateId(rId);
    setCountryId(cId);
    go("#/");
  };
  // Links like #/places/kangla-fort?region=manipur&country=IND (the search-engine pages, the region browser) switch the region first,
  // then the extra parameters are removed from the address.
  // The choice is only saved once the region turns out to exist (see below), so a mistyped link can't replace the saved region.
  const linkRegion = params.get("region"), linkCountry = params.get("country");
  const fromLink = useRef(false);
  useEffect(() => {
    if (!linkRegion) return;
    fromLink.current = true;
    setStateId(linkRegion);
    if (linkCountry) setCountryId(linkCountry);
    const rest = new URLSearchParams(query);
    rest.delete("region"); rest.delete("country");
    history.replaceState(history.state, "", `#/${path}${rest.size ? "?" + rest : ""}`);
    dispatchEvent(new HashChangeEvent("hashchange")); // the address changed without an event: let the app re-read it
  }, [linkRegion, linkCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  // "All regions": places from every country and state at once (only with a database). Off by default.
  const [allRegions, setAllRegions] = useState(false);
  useEffect(() => { if (page !== "places") setAllRegions(false); }, [page]); // Home and the other pages always speak about the chosen region
  const [regionOpen, setRegionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const state = states.find(s => s.id === stateId) ?? states[0];
  // The chosen region isn't in this country's list (an old or mistyped link): go back to the saved one and say so.
  useEffect(() => {
    if (!states.length || states.some(s => s.id === stateId)) return;
    if (fromLink.current) {
      fromLink.current = false;
      void notify("That region wasn't found, so the previous one is still shown.", "error");
      const c = store.get("country") ?? "IND", r = store.get("state") ?? "manipur";
      setCountryId(c); setStateId(r);
    }
  }, [states, stateId]);
  const regionNames = useMemo(() => Object.fromEntries(states.map(s => [s.id, s.name])), [states]);

  useEffect(() => {
    if (!state) return;
    if (state.id === stateId) { store.set("state", state.id); store.set("country", countryId); fromLink.current = false; } // remembered only once it is known to exist
    setBase([]);
    setPlacesReady(false);
    // Only the original region (Manipur) ships places in the app; every other region starts empty and fills from the database.
    loadJson<Place[]>(`${state.id}/places.json`).then(setBase).then(() => loaded("places")).catch(e => { setBase([]); if (state.id === "manipur") failed("places", e.message); }).finally(() => setPlacesReady(true));
  }, [state?.id]);

  // With Supabase, places and songs are rows in their own tables; without it, edits are kept in this browser.
  const nul = <T,>(v: T | null | undefined) => v ?? undefined;
  const dbPlaces = useRows<Place>(supabase && state ? {
    table: "places", kind: "place", columns: "id,state_id,category_id,name,district,lat,lng,description,phone,website,approx,visited,notes,closure,closure_note,closed_on,photo,hours,fee,season,status,review_note,updated_at",
    // Older databases miss the newest columns until supabase/extras.sql (then archive.sql) has been run: try the shorter lists in turn.
    fallbackColumns: [
      "id,state_id,category_id,name,district,lat,lng,description,phone,website,approx,visited,notes,closure,closure_note,closed_on,status,review_note,updated_at",
      "id,state_id,category_id,name,district,lat,lng,description,phone,website,approx,visited,notes,status,review_note,updated_at"
    ], propose: !!member && !member.auto_approve, scope: allRegions ? undefined : { column: "state_id", value: state.id }, fixed: { column: "state_id", value: state.id },
    toRow: (p, id) => ({ id, name: p.name, category_id: p.category, district: p.district ?? null, lat: p.lat, lng: p.lng,
      description: p.desc ?? null, phone: p.phone ?? null, website: p.website ?? null, approx: !!p.approx,
      visited: p.visited ?? null, notes: p.notes ?? null,
      // The picture and the practical details are sent only when set, so a database that hasn't got the columns yet still saves places.
      ...(p.photo ? { photo: p.photo } : {}), ...(p.hours ? { hours: p.hours } : {}), ...(p.fee ? { fee: p.fee } : {}), ...(p.season ? { season: p.season } : {}),
      // Only when the change is about closing/reopening (the key is present, null = reopen): an ordinary edit must not touch it.
      ...("closure" in p ? { closure: p.closure ?? null, closure_note: p.closure ? p.closureNote ?? null : null, closed_on: p.closure ? p.closedOn ?? null : null } : {}) }),
    fromRow: r => ({ id: r.id as string, name: r.name as string, category: r.category_id as string, district: nul(r.district as string),
      regionId: r.state_id as string, lat: r.lat as number, lng: r.lng as number, desc: nul(r.description as string), phone: nul(r.phone as string),
      website: nul(r.website as string), approx: r.approx ? true : undefined, visited: nul(r.visited as string), notes: nul(r.notes as string),
      photo: nul(r.photo as string), hours: nul(r.hours as string), fee: nul(r.fee as string), season: nul(r.season as string),
      closure: (r.closure as Place["closure"]) ?? undefined, closureNote: nul(r.closure_note as string), closedOn: nul(r.closed_on as string),
      status: r.status as Place["status"], reviewNote: nul(r.review_note as string), updatedAt: nul(r.updated_at as string) })
  } : null, base);
  const dbSongs = useRows<Song>(supabase ? {
    table: "songs", kind: "song", columns: "id,title,artist,language,lyrics,credit,status,review_note,updated_at", propose: !!member && !member.auto_approve,
    toRow: (x, id) => ({ id, title: x.title, artist: x.artist ?? null, language: x.language ?? null, lyrics: x.lyrics, credit: x.credit ?? null }),
    fromRow: r => ({ id: r.id as string, title: r.title as string, artist: nul(r.artist as string), language: nul(r.language as string),
      lyrics: r.lyrics as string, credit: nul(r.credit as string),
      status: r.status as Song["status"], reviewNote: nul(r.review_note as string), updatedAt: nul(r.updated_at as string) })
  } : null, baseSongs);
  const dbCategories = useRows<Category>(supabase ? {
    table: "categories", kind: "category", columns: "id,label,color,icon,sort",
    toRow: (c, id) => ({ id, label: c.label, color: c.color, icon: c.icon, sort: c.sort ?? 0 }),
    fromRow: r => ({ id: r.id as string, label: r.label as string, color: r.color as string, icon: r.icon as string, sort: r.sort as number })
  } : null, baseCategories);
  const localCategories = useOverlay<Category>(!supabase ? "categories" : null, baseCategories);
  const categoryStore = supabase ? dbCategories : localCategories;
  const categories = useMemo(() => categoryStore.items.map((c, i) => ({ ...c, sort: c.sort ?? i })).sort((a, b) => a.sort - b.sort), [categoryStore.items]);
  const localPlaces = useOverlay<Place>(!supabase && state ? `places:${state.id}` : null, base);
  const localSongs = useOverlay<Song>(!supabase ? "songs" : null, baseSongs);
  const placeStore = supabase ? dbPlaces : localPlaces;
  const songStore = supabase ? dbSongs : localSongs;
  // Refresh after signing in/out, when leaving the Review page (approvals), and when coming back to the tab after a while.
  // Not on every tab switch: that re-downloaded everything each time.
  const refresh = () => { void dbPlaces.reload(); void dbSongs.reload(); void dbCategories.reload(); };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const firstRole = useRef(true); // the data hooks already load once on start
  useEffect(() => { if (firstRole.current) { firstRole.current = false; return; } refreshRef.current(); }, [member?.role]);
  const prevPage = useRef(page);
  useEffect(() => { if (prevPage.current === "review" && page !== "review") refreshRef.current(); prevPage.current = page; }, [page]);
  useEffect(() => {
    let hiddenAt = 0;
    const on = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 120000) refreshRef.current();
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // Admin: how many submissions wait for review.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!supabase || !IS_ADMIN) return setPending(0);
    Promise.all([...["places", "songs", "revisions"].map(tbl =>
      supabase!.from(tbl).select("id", { count: "exact", head: true }).eq("status", "pending")),
      supabase!.from("suggestions").select("id", { count: "exact", head: true }).eq("status", "new")]) // visitor messages (the table may not exist yet: counts as 0)
      .then(rs => setPending(rs.reduce((n, r) => n + (r.count ?? 0), 0)));
  }, [IS_ADMIN, page]); // when moving between pages, not on every address change (each run is 3 database queries)

  // Contributors: tell them once when an edit they proposed was rejected, with the admin's reason.
  useEffect(() => {
    if (!supabase || !member || member.role === "admin") return;
    supabase.from("revisions").select("id,target_id,review_note").eq("status", "rejected").then(({ data }) => {
      let seen: string[] = [];
      try { seen = JSON.parse(store.get("seen-rejected") ?? "[]"); } catch { /* start fresh */ }
      const fresh = (data ?? []).filter(r => !seen.includes(r.id));
      if (!fresh.length) return;
      store.set("seen-rejected", JSON.stringify([...seen, ...fresh.map(r => r.id)].slice(-200)));
      void notify(`${fresh.length} of your proposed edits ${fresh.length === 1 ? "was" : "were"} not approved.${fresh[0].review_note ? ` Reason: ${fresh[0].review_note}` : ""}`);
    });
  }, [member?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // A place's details have their own address (#/places/<id>), so Back closes them and the link can be shared.
  const openPlace = (id: string | null) => { go(`#/places${id ? "/" + encodeURIComponent(id) : ""}${query ? "?" + query : ""}`); };

  // Places using a category in any state, so a category in use cannot be deleted from another state screen.
  const categoryUsage = async (id: string) => {
    if (!supabase) return 0;
    const { count } = await supabase.from("places").select("id", { count: "exact", head: true }).eq("category_id", id);
    return count ?? 0;
  };

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
    if (rows.length > MAX_IMPORT) return void notify(`That file has ${rows.length} places. Import at most ${MAX_IMPORT} at a time.`, "error");
    const key = (n: string, lat: number, lng: number) => `${n.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    const seen = new Set(placeStore.items.map(p => key(p.name, p.lat, p.lng)));
    const added: Place[] = [];
    const skipped = { duplicate: 0, invalid: 0 };
    const str = (v: unknown, max: number) => (v == null || v === "" ? undefined : String(v).trim().slice(0, max));
    rows.forEach((r: any, i) => {
      const blank = (v: unknown) => v == null || String(v).trim() === ""; // +null and +"" are 0: a missing coordinate must not become 0,0
      const lat = blank(r?.lat) ? NaN : +r.lat, lng = blank(r?.lng) ? NaN : +r.lng, name = String(r?.name ?? "").trim();
      if (!name || name.length > LIMITS.name || !categories.some(c => c.id === r.category) || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { skipped.invalid++; return; }
      if (seen.has(key(name, lat, lng))) { skipped.duplicate++; return; }
      seen.add(key(name, lat, lng));
      added.push({
        id: `local-${Date.now().toString(36)}${i}`, name, category: r.category, lat, lng,
        district: str(r.district, LIMITS.district), desc: str(r.desc, LIMITS.desc), phone: str(r.phone, LIMITS.phone), notes: str(r.notes, LIMITS.notes),
        visited: /^\d{4}-\d{2}-\d{2}$/.test(r.visited) ? r.visited : undefined,
        website: /^https?:\/\//i.test(r.website ?? "") ? String(r.website).slice(0, LIMITS.website) : undefined, approx: r.approx === true || r.approx === "true" ? true : undefined,
        photo: /^https:\/\//i.test(r.photo ?? "") ? String(r.photo).slice(0, LIMITS.photo) : undefined,
        hours: str(r.hours, LIMITS.hours), fee: str(r.fee, LIMITS.fee), season: str(r.season, LIMITS.season)
      });
    });
    const ok = await placeStore.addMany(added);
    if (!ok) return; // the error was already shown
    const extra = [skipped.duplicate && `${skipped.duplicate} duplicate`, skipped.invalid && `${skipped.invalid} missing or invalid details`].filter(Boolean).join(", ");
    void notify(`Imported ${added.length} of ${rows.length} places${extra ? ` (skipped: ${extra})` : ""}.`);
  };

  useBackdropClose(); // tapping outside a dialog closes it (asking first when something typed would be lost)
  const canEdit = supabase ? signedIn : false;

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header>
        <p className="site-name"><a href="#/" className="brand">Explore Hack</a></p>
        <RegionPicker countries={countries} country={country} state={state} onChoose={chooseRegion}
          open={regionOpen} onOpen={() => setRegionOpen(true)} onClose={() => setRegionOpen(false)} />
        <nav className="tabs" aria-label="Main menu">
          <a href="#/" aria-current={page === "home" ? "page" : undefined}><Icon name="home" size={22} /> Home</a>
          <a href="#/places" aria-current={page === "places" ? "page" : undefined}><Icon name="map" size={22} /> Places</a>
          <a href="#/music" aria-current={page === "music" ? "page" : undefined}><Icon name="music" size={22} /> Songs</a>
          <a href="#/checklist" aria-current={page === "checklist" ? "page" : undefined}><Icon name="checklist" size={22} /> Checklist</a>
        </nav>
        {/* After the menu in the markup so it sits at the far right on wide screens; on phones the menu is a bottom bar and this stays at the right edge */}
        <button type="button" className="icon-btn header-settings" aria-label={pending ? `Settings (${pending} to review)` : "Settings"} title="Settings" onClick={() => setSettingsOpen(true)}><Icon name="settings" size={22} /></button>
        <AdminLogin hasSession={hasSession} isMember={signedIn} show={isAdminRoute(route)} onClose={() => { if (isAdminRoute(route)) goBack("#/"); }} />
      </header>
      <PwaBar showInstall={page === "home"} canEdit={canEdit} />
      {settingsOpen && <SettingsDialog review={supabase && IS_ADMIN ? { pending } : undefined}
        account={supabase && hasSession ? { approved: signedIn, onSignOut: () => { void supabase!.auth.signOut(); } } : undefined} country={country} state={state} onClose={() => setSettingsOpen(false)} onChangeRegion={() => setRegionOpen(true)} />}
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<SkeletonPage />}>
        {error && (
          <div className="error" role="alert">
            <span>Can't load the data. Check your connection and try again.</span>
            <button className="btn" onClick={() => location.reload()}>Reload</button>
          </div>
        )}
        {page === "places" && !state && !error && <SkeletonPage />}
        {page === "places" && state && (
          <PlacesPage key={state.id} placeId={arg ? safeDecode(arg) : null} onOpenPlace={openPlace} queryKey={query} initial={{ cat: params.get("cat"), q: params.get("q") ?? "", visited: params.get("visited") === "1", near: params.get("near") === "1", fav: params.get("fav") === "1", trip: params.get("trip") === "1", district: params.get("district") }} state={state} categories={categories} places={placeStore.items} localIds={placeStore.localIds} admin={ADMIN} canDelete={IS_ADMIN} onSaveCategory={IS_ADMIN ? categoryStore.save : undefined} onDeleteCategory={categoryStore.remove} categoryUsage={categoryUsage} allRegions={allRegions} onAllRegions={supabase ? () => setAllRegions(v => !v) : undefined} regionNames={regionNames} loading={supabase ? dbPlaces.loading : false} ready={placesReady}
            onSavePlace={placeStore.save} onDeletePlace={placeStore.remove} exportCount={exportRows.length} onExport={exportPlaces} onImport={importPlaces} />
        )}
        {page === "home" && <HomePage onChangeRegion={() => setRegionOpen(true)} state={state} categories={categories} places={placeStore.items} songCount={songStore.items.length} />}
        {page === "checklist" && <ChecklistPage catalog={checklist} ready={dataReady} admin={IS_ADMIN} />}
        {page === "review" && <ReviewPage categories={categories} />}
        {page === "about" && <AboutPage />}
        {page === "regions" && <RegionsPage countries={countries} countryId={countryId} stateId={state?.id} />}
        {page === "music" && (
          <MusicPage ready={dataReady} songs={songStore.items} localIds={songStore.localIds} admin={ADMIN} canDelete={IS_ADMIN} onSave={songStore.save} onDelete={songStore.remove} songId={arg ? safeDecode(arg) : null} open={id => go(id ? `#/music/${encodeURIComponent(id)}` : "#/music")} />
        )}
        </Suspense>
      </main>
      <SuggestDialog regionName={state?.name} />
      <DialogHost />
    </div>
  );
}
