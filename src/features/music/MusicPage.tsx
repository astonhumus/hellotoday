import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Song } from "../../types";
import { store } from "../../lib/data";
import { confirmAsk } from "../../lib/ui";
import { useDirtyClose } from "../../lib/useDirtyClose";
import { LIMITS } from "../../lib/limits";
import { useChipFilter } from "../../ui/useChipFilter";
import { useFavorites } from "../../lib/favorites";
import { FooterLinks, reportLink } from "../../components/AboutPage";
import { usePageMeta } from "../../lib/pageMeta";
import { plural } from "../../lib/format";
import { Button, IconButton } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Icon } from "../../ui/Icon";
import { PageHeader } from "../../ui/PageHeader";
import { SearchField } from "../../ui/SearchField";
import { EmptyState, Skeleton } from "../../ui/States";
import "./music.css";

interface Props {
  songs: Song[];
  localIds: Set<string>;
  admin: boolean;
  canDelete: boolean;
  ready?: boolean; // the song list has arrived (or failed)
  songId: string | null;
  open: (id: string | null) => void;
  onSave: (s: Omit<Song, "id">, id?: string) => void;
  onDelete: (id: string) => void;
}

const LANGUAGES = ["Manipuri (Meiteilon)", "English", "Hindi", "Bengali", "Tangkhul", "Thadou", "Mizo"];
const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();

/** A web search for the song's lyrics, opened in a new tab. */
const lyricsSearchUrl = (s: Song) => `https://www.google.com/search?q=${encodeURIComponent([s.title, s.artist, "lyrics"].filter(Boolean).join(" "))}`;

/** "Find online": says what it does in words, and that it leaves the app. */
function FindOnline({ song, className = "" }: { song: Song; className?: string }) {
  return (
    <a className={`find-online ${className}`} href={lyricsSearchUrl(song)} target="_blank" rel="noopener noreferrer" aria-label={`Find the lyrics of ${song.title} on the web (opens a new tab)`}>
      <Icon name="globe" size={16} /> Find online
    </a>
  );
}

export function MusicPage({ songs, localIds, admin, canDelete, ready = true, songId, open, onSave, onDelete }: Props) {
  const song = songs.find(s => s.id === songId) ?? null;
  usePageMeta(song ? `${song.title}${song.lyrics.trim() ? " lyrics" : ""}` : "Song lyrics by language and artist",
    song ? `${song.lyrics.trim() ? "Lyrics of" : "Song:"} ${song.title}${song.artist ? ` by ${song.artist}` : ""}${song.language ? ` in ${song.language}` : ""}.` : "Read song lyrics, filtered by language (including Manipuri) and artist. Large text and auto-scroll for singing along.");
  const [dialog, setDialog] = useState<{ editing: Song | null } | null>(null);
  const languages = useMemo(() => uniq([...LANGUAGES, ...songs.map(s => s.language)]), [songs]);
  const artists = useMemo(() => uniq(songs.map(s => s.artist)), [songs]);
  const onEdit = (s: Song) => setDialog({ editing: s });
  const onRemove = async (s: Song) => { if (await confirmAsk(`Delete "${s.title}"?`, { yes: "Delete", danger: true })) { onDelete(s.id); open(null); } };
  const missing = !!songId && !song && ready;
  return (
    <>
      {/* The list stays mounted while a song is open, so Back finds your search, filters and place in the list as you left them */}
      <SongList hidden={!!songId} ready={ready} songs={songs} localIds={localIds} admin={admin} canDelete={canDelete} onAdd={() => setDialog({ editing: null })} onEdit={onEdit} onDelete={onRemove} />
      {song && <Lyrics song={song} admin={admin} canDelete={canDelete} onBack={() => open(null)} onEdit={onEdit} onDelete={onRemove} />}
      {missing && (
        <div className="page">
          <EmptyState title="We couldn't find that song" hint="It may have been removed, or the link is incomplete." action={{ label: "See all songs", onClick: () => open(null) }} />
        </div>
      )}
      {dialog && (
        <SongDialog editing={dialog.editing} languages={languages} artists={artists}
          onSave={(s, id) => { onSave(s, id); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

interface ListProps {
  hidden: boolean;
  ready: boolean;
  songs: Song[]; localIds: Set<string>; admin: boolean; canDelete: boolean;
  onAdd: () => void; onEdit: (s: Song) => void; onDelete: (s: Song) => void;
}

function SongList({ hidden, ready, songs, localIds, admin, canDelete, onAdd, onEdit, onDelete }: ListProps) {
  const [q, setQ] = useState("");
  const { picked, toggle, clear } = useChipFilter(); // languages: tap several to combine
  const [artist, setArtist] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const favs = useFavorites("song");
  const root = useRef<HTMLDivElement>(null);
  const top = useRef(0);
  // A hidden page loses its scroll position, so it is saved while visible and put back when the list returns.
  useLayoutEffect(() => { if (!hidden && root.current) root.current.scrollTop = top.current; }, [hidden]);
  const langs = useMemo(() => uniq(songs.map(s => s.language)), [songs]);
  const artists = useMemo(() => uniq(songs.map(s => s.artist)), [songs]);
  const count = (key: "language" | "artist", v: string) => songs.filter(s => s[key] === v).length;
  const withLyrics = songs.filter(s => s.lyrics.trim()).length;
  const filtering = !!q.trim() || picked.size > 0 || artist !== "all" || favOnly;
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return songs
      .filter(s => (!picked.size || (!!s.language && picked.has(s.language))) && (artist === "all" || s.artist === artist) && (!favOnly || favs.has(s.id)) &&
        (!n || [s.title, s.artist, s.language, s.lyrics].join(" ").toLowerCase().includes(n))) // the words of the lyrics are searched too
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [songs, q, picked, artist, favOnly, favs.ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const readable = shown.filter(s => s.lyrics.trim());
  const soon = shown.filter(s => !s.lyrics.trim());
  const clearFilters = () => { setQ(""); clear(); setArtist("all"); setFavOnly(false); };

  const card = (s: Song) => (
    <li key={s.id} className="song-card">
      <a className="sc-main" href={`#/music/${encodeURIComponent(s.id)}`}>
        <span className="sc-icon" aria-hidden="true"><Icon name="music" size={22} /></span>
        <span className="sc-text">
          <span className="sc-title">{s.title}</span>
          <span className="sc-meta">{[s.artist, s.language].filter(Boolean).join(" · ")}{localIds.has(s.id) ? " · edited/added" : ""}</span>
          {s.status && s.status !== "approved" && (
            <span className="sc-tags">
              {s.status === "pending" && <span className="badge pending"><Icon name="clock" size={14} /> Waiting for approval</span>}
              {s.status === "rejected" && <span className="badge rejected"><Icon name="circle-x" size={14} /> Rejected{s.reviewNote ? `: ${s.reviewNote}` : ""}</span>}
            </span>
          )}
        </span>
        <Icon name="chevron" size={18} />
      </a>
      <IconButton className={"sm sc-fav" + (favs.has(s.id) ? " on" : "")} icon="heart" pressed={favs.has(s.id)}
        label={favs.has(s.id) ? `Remove ${s.title} from favourites` : `Add ${s.title} to favourites`} onClick={() => favs.toggle(s.id)} />
      {!s.lyrics.trim() && <FindOnline song={s} />}
      {admin && (
        <span className="sc-admin">
          <IconButton className="sm" icon="edit" label={`Edit ${s.title}`} onClick={() => onEdit(s)} />
          {canDelete && <IconButton className="sm danger" icon="trash" label={`Delete ${s.title}`} onClick={() => onDelete(s)} />}
        </span>
      )}
    </li>
  );

  return (
    <div className="page music" hidden={hidden} ref={root} onScroll={e => { if (!hidden) top.current = e.currentTarget.scrollTop; }}>
      <PageHeader title="Songs" sub={ready ? `${plural(songs.length, "song")} · ${withLyrics} with lyrics` : undefined}
        actions={admin && <Button variant="primary" icon="plus" onClick={onAdd}>Add song</Button>} />
      <SearchField value={q} onChange={setQ} placeholder={`Search songs or lyrics`} recentKey="songs" />
      <div className="chip-row" role="group" aria-label="Filter by language">
        <Chip pressed={favOnly} icon="heart" className="fav-chip" count={favs.count || undefined} onClick={() => setFavOnly(v => !v)} aria-label="Favourite songs only" title="Show only your favourite songs"><span className="sr-only">Favourites</span></Chip>
        <Chip pressed={picked.size === 0} onClick={clear}>All languages</Chip>
        {langs.map(l => <Chip key={l} pressed={picked.has(l)} count={count("language", l)} onClick={() => toggle(l)}>{l}</Chip>)}
        {artists.length > 1 && (
          <select className="pill-select" value={artist} onChange={e => setArtist(e.target.value)} aria-label="Filter by artist" data-active={artist !== "all"}>
            <option value="all">All artists</option>
            {artists.map(a => <option key={a} value={a}>{a} ({count("artist", a)})</option>)}
          </select>
        )}
      </div>

      {!ready && <Skeleton rows={5} label="Loading songs" />}
      {ready && shown.length === 0 && (
        songs.length === 0
          ? <EmptyState title="No songs yet" />
          : <EmptyState title="No songs match" hint="Try a different search or remove a filter." action={{ label: "Clear filters", onClick: clearFilters }} />
      )}
      {readable.length > 0 && <ul className="song-list" aria-label="Songs with lyrics">{readable.map(card)}</ul>}
      {soon.length > 0 && (
        <details className="soon-group" open={filtering || readable.length === 0}>
          <summary>Lyrics coming soon <span className="rv-n">{soon.length}</span></summary>
          <p className="ph-sub">These songs are listed but their lyrics haven't been added yet. You can look them up online.</p>
          <ul className="song-list">{soon.map(card)}</ul>
        </details>
      )}
      <FooterLinks />
    </div>
  );
}

interface DialogProps {
  editing: Song | null; languages: string[]; artists: string[];
  onSave: (s: Omit<Song, "id">, id?: string) => void; onClose: () => void;
}

function SongDialog({ editing, languages, artists, onSave, onClose }: DialogProps) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [artist, setArtist] = useState(editing?.artist ?? "");
  const [language, setLanguage] = useState(editing?.language ?? "");
  const [lyrics, setLyrics] = useState(editing?.lyrics ?? "");
  const [credit, setCredit] = useState(editing?.credit ?? "");
  const [rights, setRights] = useState(!!editing); // new songs need the tick
  useEffect(() => { dlg.current?.showModal(); }, []);
  const dirty = title !== (editing?.title ?? "") || artist !== (editing?.artist ?? "") || language !== (editing?.language ?? "") || lyrics !== (editing?.lyrics ?? "") || credit !== (editing?.credit ?? "");
  const cancel = useDirtyClose(dlg, dirty);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rights) return;
    onSave({
      title: title.trim(), artist: artist.trim() || undefined, language: language.trim() || undefined,
      lyrics, credit: credit.trim() || undefined
    }, editing?.id);
  };

  return (
    <dialog ref={dlg} onClose={onClose}>
      <form onSubmit={submit}>
        <h2>{editing ? "Edit song" : "Add a song"}</h2>
        <label>Title *<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={120} autoComplete="off" /></label>
        <div className="row">
          <label>Artist<input value={artist} onChange={e => setArtist(e.target.value)} list="artist-list" maxLength={80} autoComplete="off" /></label>
          <label>Language<input value={language} onChange={e => setLanguage(e.target.value)} list="language-list" maxLength={40} autoComplete="off" /></label>
        </div>
        <datalist id="artist-list">{artists.map(a => <option key={a} value={a} />)}</datalist>
        <datalist id="language-list">{languages.map(l => <option key={l} value={l} />)}</datalist>
        <label>Lyrics (can be added later)<textarea value={lyrics} onChange={e => setLyrics(e.target.value)} rows={10} maxLength={LIMITS.lyrics} /></label>
        <label>Credit / source<input value={credit} onChange={e => setCredit(e.target.value)} maxLength={300} placeholder="e.g. Written by me, or public domain" /></label>
        {!editing && (
          <label className="check"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} />
            I wrote these lyrics, they are public domain, or I have permission to share them.</label>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={cancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!title.trim() || !rights}>Save song</button>
        </div>
      </form>
    </dialog>
  );
}

interface LyricsProps { song: Song; admin: boolean; canDelete: boolean; onBack: () => void; onEdit: (s: Song) => void; onDelete: (s: Song) => void }

function Lyrics({ song, admin, canDelete, onBack, onEdit, onDelete }: LyricsProps) {
  const [size, setSize] = useState(() => { const n = parseInt(store.get("lyrics-size") ?? "", 10); return Number.isFinite(n) ? Math.min(48, Math.max(14, n)) : 22; });
  const [scrolling, setScrolling] = useState(false);
  const [speed, setSpeed] = useState(30); // px per second
  const box = useRef<HTMLDivElement>(null);
  const favs = useFavorites("song");
  const fav = favs.has(song.id);

  useEffect(() => { store.set("lyrics-size", String(size)); }, [size]);

  useEffect(() => {
    if (!scrolling) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      const b = box.current;
      if (!b) return;
      acc += ((now - last) / 1000) * speed;
      last = now;
      if (acc >= 1) { b.scrollTop += Math.floor(acc); acc -= Math.floor(acc); }
      if (b.scrollTop + b.clientHeight >= b.scrollHeight - 1) return setScrolling(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrolling, speed]);

  // Keep the screen awake while the lyrics scroll by themselves (a phone would otherwise lock in the middle of a song).
  useEffect(() => {
    if (!scrolling || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null, gone = false;
    navigator.wakeLock.request("screen").then(l => { if (gone) void l.release(); else lock = l; }).catch(() => { /* not allowed (low battery, background tab): fine */ });
    return () => { gone = true; void lock?.release(); };
  }, [scrolling]);

  return (
    <div className="lyrics-page">
      <div className="lyr-bar">
        <IconButton icon="back" label="Back to songs" onClick={onBack} />
        <div className="lyr-act" role="group" aria-label="Song actions">
          <IconButton className={"sm sc-fav" + (fav ? " on" : "")} icon="heart" pressed={fav} label={fav ? "Remove from favourites" : "Add to favourites"} onClick={() => favs.toggle(song.id)} />
          {admin && <IconButton className="sm" icon="edit" label="Edit this song" onClick={() => onEdit(song)} />}
          {canDelete && <IconButton className="sm danger" icon="trash" label="Delete this song" onClick={() => onDelete(song)} />}
        </div>
        {/* These controls never come and go, so nothing shifts when auto-scroll starts */}
        <div className="lyr-read" role="group" aria-label="Reading tools">
          <button type="button" className="tool-btn" onClick={() => setSize(s => Math.max(14, s - 2))} aria-label="Smaller text">A<small>−</small></button>
          <button type="button" className="tool-btn" onClick={() => setSize(s => Math.min(48, s + 2))} aria-label="Larger text">A<small>+</small></button>
          <Button variant={scrolling ? "primary" : "secondary"} icon={scrolling ? "pause" : "play"} onClick={() => setScrolling(v => !v)}>{scrolling ? "Pause" : "Auto-scroll"}</Button>
          <span className="lyr-speed" role="group" aria-label="Scroll speed">
            <IconButton className="sm" icon="minus" label="Scroll slower" disabled={!scrolling || speed <= 10} onClick={() => setSpeed(s => Math.max(10, s - 10))} />
            <span className="lyr-speed-n" aria-live="polite">Speed {speed / 10}</span>
            <IconButton className="sm" icon="plus" label="Scroll faster" disabled={!scrolling || speed >= 120} onClick={() => setSpeed(s => Math.min(120, s + 10))} />
          </span>
        </div>
      </div>
      <div className="lyrics" ref={box} style={{ fontSize: size }} onTouchStart={() => setScrolling(false)} onWheel={() => setScrolling(false)}>
        <h1>{song.title}</h1>
        <p className="meta">{[song.artist, song.language].filter(Boolean).join(" · ")}</p>
        {song.lyrics.trim() ? <pre>{song.lyrics}</pre> : <p className="meta soon">Lyrics for this song will be added soon.</p>}
        <p className="meta"><FindOnline song={song} /></p>
        {song.credit && <p className="meta credit">{song.credit}</p>}
        {reportLink("x") && <p className="meta"><a href={reportLink(`Report song: ${song.title}`)}>Report this song</a></p>}
      </div>
    </div>
  );
}
