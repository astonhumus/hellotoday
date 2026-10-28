import { useState } from "react";
import type { Category, Place, StateInfo } from "../../types";
import { FooterLinks } from "../../components/AboutPage";
import { useVisited } from "../../lib/visited";
import { Icon } from "../../ui/Icon";
import { usePageMeta } from "../../lib/pageMeta";
import "./home.css";

interface Props {
  state?: StateInfo;   // undefined while the first data loads: the page shows placeholders so nothing jumps
  categories: Category[];
  places: Place[];
  songCount: number;
}

/** The front door: search, the categories as big tiles, shortcuts, and the other tools. Everything links into Places with a filter. */
export function HomePage({ state, categories, places, songCount }: Props) {
  const name = state?.name ?? "";
  usePageMeta(name ? `Explore ${name}: places to visit, eat and stay` : "Explore India: places to visit, eat and stay",
    `Tourist sites, picnic spots, snacks, hotels and resorts across ${name || "India"} on a map, plus song lyrics and a trip packing checklist. Works offline.`);
  const [q, setQ] = useState("");
  const mine = useVisited();
  const counts: Record<string, number> = {};
  places.forEach(p => { counts[p.category] = (counts[p.category] ?? 0) + 1; });

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    location.hash = `#/places${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;
  };

  return (
    <div className="page home">
      <section className="hero">
        <p className="hero-eyebrow">Tourist guide</p>
        <h1 className="hero-title">Explore {name || "India"}</h1>
        <p className="hero-sub">Places to visit, eat and stay. A song library and a packing list for the trip. Works offline once opened.</p>
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
          {categories.map(c => (
            <a key={c.id} className="tile" href={`#/places?cat=${c.id}`} style={{ "--tile": c.color } as React.CSSProperties}>
              <span className="tile-icon" aria-hidden="true">{c.icon}</span>
              <span className="tile-label">{c.label}</span>
              <span className="tile-count">{counts[c.id] ? `${counts[c.id]} places` : "\u00a0"}</span>
            </a>
          ))}
        </div>
      </section>

      <section aria-labelledby="h-quick" className="stack">
        <h2 id="h-quick" className="home-h">Quick links</h2>
        <a className="row-card" href="#/places?near=1">
          <span className="rc-icon"><Icon name="pin" size={22} /></span>
          <span className="rc-text"><strong>Near me</strong><span>Sort places by distance from where you are</span></span>
        </a>
        <a className="row-card" href="#/places?visited=1">
          <span className="rc-icon"><Icon name="check" size={22} /></span>
          <span className="rc-text"><strong>My visited{mine.count ? ` (${mine.count})` : ""}</strong>
            <span>{mine.count ? "The places you have ticked off" : "Tick places you've been to and they will collect here"}</span></span>
        </a>
      </section>

      <section aria-labelledby="h-more" className="stack">
        <h2 id="h-more" className="home-h">Plan and enjoy</h2>
        <a className="row-card" href="#/checklist">
          <span className="rc-icon emoji" aria-hidden="true">🎒</span>
          <span className="rc-text"><strong>Trip checklist</strong><span>Picnic, camping, trek or road trip: never forget an item</span></span>
        </a>
        <a className="row-card" href="#/music">
          <span className="rc-icon emoji" aria-hidden="true">🎵</span>
          <span className="rc-text"><strong>Songs</strong><span>{songCount} song{songCount === 1 ? "" : "s"}: lyrics by language and artist</span></span>
        </a>
      </section>

      <FooterLinks />
    </div>
  );
}
