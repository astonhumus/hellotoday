import { useMemo, useState } from "react";
import { store } from "../../lib/data";
import type { Category, Place, StateInfo } from "../../types";
import { FooterLinks } from "../../components/AboutPage";
import { useVisited } from "../../lib/visited";
import { useFavorites } from "../../lib/favorites";
import { Icon } from "../../ui/Icon";
import { usePageMeta } from "../../lib/pageMeta";
import { go } from "../../lib/nav";
import { plural, safeHttps } from "../../lib/format";
import "./home.css";

const TILE_LIMIT = 6; // more categories than this: the rest sit behind "See all"
const FEATURED = 6;

interface Props {
  state?: StateInfo;   // undefined while the first data loads: the page shows placeholders so nothing jumps
  categories: Category[];
  places: Place[];
  songCount: number;
  onChangeRegion?: () => void;
}

// The same few places all day, a different few tomorrow: places with a picture first, then those with a description.
function pickFeatured(places: Place[]): Place[] {
  const day = Math.floor(Date.now() / 86400000);
  const hash = (id: string) => { let h = day; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  return places
    .filter(p => !p.closure && (p.status ?? "approved") === "approved")
    .map(p => ({ p, rank: (safeHttps(p.photo) ? 0 : p.desc ? 1 : 2) * 1e10 + hash(p.id) % 1e9 }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, FEATURED)
    .map(x => x.p);
}

/** The front door: search, the categories as big tiles, shortcuts, and the other tools. Everything links into Places with a filter. */
export function HomePage({ state, categories, places, songCount, onChangeRegion }: Props) {
  const name = state?.name ?? "";
  usePageMeta(name ? `Explore ${name}: places to visit, eat and stay` : "Explore Hack: places to visit, eat and stay",
    `Tourist sites, picnic spots, snacks, hotels and resorts across ${name || "India"} on a map, plus song lyrics and a trip packing checklist. Works offline.`);
  const [q, setQ] = useState("");
  const [welcome, setWelcome] = useState(() => store.get("welcomed") !== "1");
  const closeWelcome = () => { store.set("welcomed", "1"); setWelcome(false); };
  const [allTiles, setAllTiles] = useState(false);
  const shownCats = allTiles || categories.length <= TILE_LIMIT + 1 ? categories : categories.slice(0, TILE_LIMIT);
  const mine = useVisited();
  const favs = useFavorites("place");
  const counts: Record<string, number> = {};
  places.forEach(p => { counts[p.category] = (counts[p.category] ?? 0) + 1; });
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  // Counted among THIS region's places, so the number matches the list it opens (favourites and ticks are kept for every region).
  const favHere = places.filter(p => favs.has(p.id)).length;
  const visitedHere = places.filter(p => mine.has(p.id)).length;
  const featured = useMemo(() => pickFeatured(places), [places]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    go(`#/places${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  };

  return (
    <div className="page home">
      {welcome && (
        <section className="welcome" aria-label="Welcome">
          <div>
            <strong>Welcome{name ? ` · ${name}` : ""}</strong>
            <p>Search or tap a category to find places. Tap the heart to keep your favourites. They stay on this device only.</p>
          </div>
          <div className="welcome-actions">
            {onChangeRegion && <button type="button" className="btn" onClick={onChangeRegion}>Change region</button>}
            <button type="button" className="btn primary" onClick={closeWelcome}>Got it</button>
          </div>
        </section>
      )}
      <section className="hero">
        <h1 className="hero-title">Explore {name || "Hack"}</h1>
        <p className="hero-sub">Places to visit, eat and stay, plus songs and a packing list. Works offline.</p>
        <form className="hero-search" onSubmit={search} role="search">
          <Icon name="search" size={18} />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search places" aria-label="Search places" enterKeyHint="search" />
          <button type="submit" className="btn primary">Search</button>
        </form>
      </section>

      <section aria-labelledby="h-cat">
        <h2 id="h-cat" className="home-h">Browse by category</h2>
        <div className="tiles">
          {categories.length === 0 && [0, 1, 2, 3, 4].map(i => <span key={i} className="tile skel" aria-hidden="true" />)}
          {shownCats.map(c => (
            <a key={c.id} className="tile" href={`#/places?cat=${c.id}`} style={{ "--cat": c.color } as React.CSSProperties}>
              <span className="tile-icon" aria-hidden="true"><Icon name={c.icon} size={22} /></span>
              <span className="tile-label">{c.label}</span>
              <span className="tile-count">{counts[c.id] ? plural(counts[c.id], "place") : " "}</span>
            </a>
          ))}
          {shownCats.length < categories.length && (
            <button type="button" className="tile tile-more" onClick={() => setAllTiles(true)}>
              <span className="tile-icon" aria-hidden="true"><Icon name="plus" size={22} /></span>
              <span className="tile-label">See all {categories.length}</span>
            </button>
          )}
        </div>
      </section>

      {featured.length > 0 && (
        <section aria-labelledby="h-feat">
          <h2 id="h-feat" className="home-h">Featured places</h2>
          <ul className="featured">
            {featured.map(p => {
              const c = catById[p.category], photo = safeHttps(p.photo);
              return (
                <li key={p.id}>
                  <a className="feat-card" href={`#/places/${encodeURIComponent(p.id)}`} style={{ "--cat": c?.color } as React.CSSProperties}>
                    <span className="feat-pic" aria-hidden="true">
                      {photo ? <img src={photo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={e => { e.currentTarget.remove(); }} /> : null}
                      <Icon name={c?.icon ?? "pin"} size={28} />
                    </span>
                    <span className="feat-name">{p.name}</span>
                    <span className="feat-meta">{[c?.label, p.district].filter(Boolean).join(" · ")}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="More ways to explore" className="stack">
        <a className="row-card" href="#/places?near=1">
          <span className="rc-icon"><Icon name="pin" size={22} /></span>
          <span className="rc-text"><strong>Near me</strong><span>Sort places by distance from where you are</span></span>
        </a>
        <a className="row-card" href="#/regions">
          <span className="rc-icon"><Icon name="map" size={22} /></span>
          <span className="rc-text"><strong>Browse all regions</strong><span>Other countries, states and districts, with how many places each has</span></span>
        </a>
        {/* Shown once there is something in them; until then the welcome note and the hearts on every place explain it */}
        {favHere > 0 && (
          <a className="row-card" href="#/places?fav=1">
            <span className="rc-icon fav"><Icon name="heart" size={22} /></span>
            <span className="rc-text"><strong>Favourites ({favHere})</strong><span>Your hearted places, grouped by category</span></span>
          </a>
        )}
        {visitedHere > 0 && (
          <a className="row-card" href="#/places?visited=1">
            <span className="rc-icon"><Icon name="check" size={22} /></span>
            <span className="rc-text"><strong>My visited ({visitedHere})</strong><span>The places you have ticked off</span></span>
          </a>
        )}
        <a className="row-card" href="#/places?trip=1">
          <span className="rc-icon"><Icon name="route" size={22} /></span>
          <span className="rc-text"><strong>My trip</strong><span>Plan a day: pick places and see them in a sensible order</span></span>
        </a>
        <a className="row-card" href="#/checklist">
          <span className="rc-icon"><Icon name="checklist" size={22} /></span>
          <span className="rc-text"><strong>Trip checklist</strong><span>Picnic, camping, trek or road trip: never forget an item</span></span>
        </a>
        <a className="row-card" href="#/music">
          <span className="rc-icon"><Icon name="music" size={22} /></span>
          <span className="rc-text"><strong>Songs</strong><span>{plural(songCount, "song")}: lyrics by language and artist</span></span>
        </a>
      </section>

      <FooterLinks />
    </div>
  );
}
