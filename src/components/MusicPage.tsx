import { useEffect, useMemo, useRef, useState } from "react";
import type { Song } from "../types";
import { store } from "../lib/data";
import { confirmAsk } from "../lib/ui";
import { LIMITS } from "../lib/limits";
import { useChipFilter } from "../ui/useChipFilter";
import { FooterLinks, reportLink } from "./AboutPage";
import { usePageMeta } from "../lib/pageMeta";

interface Props {
  songs: Song[];
  localIds: Set<string>;
  admin: boolean;
  canDelete: boolean;
  songId: string | null;
  open: (id: string | null) => void;
  onSave: (s: Omit<Song, "id">, id?: string) => void;
  onDelete: (id: string) => void;
}

const LANGUAGES = ["Manipuri (Meiteilon)", "English", "Hindi", "Bengali", "Tangkhul", "Thadou", "Mizo"];
const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();

export function MusicPage({ songs, localIds, admin, canDelete, songId, open, onSave, onDelete }: Props) {
  const song = songs.find(s => s.id === songId) ?? null;
  usePageMeta(song ? `${song.title}${song.lyrics.trim() ? " lyrics" : ""}` : "Song lyrics by language and artist",
    song ? `${song.lyrics.trim() ? "Lyrics of" : "Song:"} ${song.title}${song.artist ? ` by ${song.artist}` : ""}${song.language ? ` in ${song.language}` : ""}.` : "Read song lyrics, filtered by language (including Manipuri) and artist. Large text and auto-scroll for singing along.");
  const [dialog, setDialog] = useState<{ editing: Song | null } | null>(null);
  const languages = useMemo(() => uniq([...LANGUAGES, ...songs.map(s => s.language)]), [songs]);
  const artists = useMemo(() => uniq(songs.map(s => s.artist)), [songs]);
  const onEdit = (s: Song) => setDialog({ editing: s });
  const onRemove = async (s: Song) => { if (await confirmAsk(`Delete "${s.title}"?`, { yes: "Delete", danger: true })) { onDelete(s.id); open(null); } };
  return (
    <>
      {song
        ? <Lyrics song={song} admin={admin} canDelete={canDelete} onBack={() => open(null)} onEdit={onEdit} onDelete={onRemove} />
        : <SongList songs={songs} localIds={localIds} admin={admin} canDelete={canDelete} open={open} onAdd={() => setDialog({ editing: null })} onEdit={onEdit} onDelete={onRemove} />}
      {dialog && (
        <SongDialog editing={dialog.editing} languages={languages} artists={artists}
          onSave={(s, id) => { onSave(s, id); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

interface ListProps {
  songs: Song[]; localIds: Set<string>; admin: boolean; canDelete: boolean;
  open: (id: string) => void; onAdd: () => void; onEdit: (s: Song) => void; onDelete: (s: Song) => void;
}

function SongList({ songs, localIds, admin, canDelete, open, onAdd, onEdit, onDelete }: ListProps) {
  const [q, setQ] = useState("");
  const { picked, toggle, clear, multi, setMulti } = useChipFilter(); // languages: single-select unless "Select several" is on
  const [artist, setArtist] = useState("all");
  const langs = useMemo(() => uniq(songs.map(s => s.language)), [songs]);
  const artists = useMemo(() => uniq(songs.map(s => s.artist)), [songs]);
  const count = (key: "language" | "artist", v: string) => songs.filter(s => s[key] === v).length;
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return songs
      .filter(s => (!picked.size || (!!s.language && picked.has(s.language))) && (artist === "all" || s.artist === artist) &&
        (!n || [s.title, s.artist, s.language].join(" ").toLowerCase().includes(n)))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [songs, q, picked, artist]);
  return (
    <div className="page">
      <h1>Songs</h1>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search songs…" aria-label="Search songs" />
      <div className="chips" role="group" aria-label="Filter by language">
        <button className="chip" aria-pressed={picked.size === 0} onClick={clear}>All languages</button>
        {langs.map(l => (
          <button key={l} className="chip" aria-pressed={picked.has(l)} onClick={() => toggle(l)}>
            {l} <span className="chip-n">{count("language", l)}</span>
          </button>
        ))}
        {langs.length > 2 && <button className="chip multi" aria-pressed={multi} onClick={() => setMulti(!multi)} title="Pick more than one language at a time">☑ Select several</button>}
      </div>
      <div className="tools">
        <select value={artist} onChange={e => setArtist(e.target.value)} aria-label="Filter by artist">
          <option value="all">All artists</option>
          {artists.map(a => <option key={a} value={a}>{a} ({count("artist", a)})</option>)}
        </select>
        {admin && <button className="btn primary" onClick={onAdd}>+ Add song</button>}
      </div>
      <ul className="songs">
        {shown.length === 0 && <div className="empty">No songs found.</div>}
        {shown.map(s => (
          <li key={s.id} onClick={() => open(s.id)} tabIndex={0} onKeyDown={e => e.key === "Enter" && open(s.id)}>
            <span className="name">{s.title}</span>
            <span className="meta">{[s.artist, s.language].filter(Boolean).join(" · ")}{s.lyrics.trim() ? "" : " · lyrics coming soon"}{localIds.has(s.id) ? " · edited/added" : ""}</span>
            {s.status && s.status !== "approved" && <span className={"badge " + s.status}>{s.status === "pending" ? "⏳ Waiting for approval" : `✖ Rejected${s.reviewNote ? ": " + s.reviewNote : ""}`}</span>}
            {admin && (
              <span className="row-actions" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                <button className="link" onClick={() => onEdit(s)}>Edit</button>
                {canDelete && <button className="link danger" onClick={() => onDelete(s)}>Delete</button>}
              </span>
            )}
          </li>
        ))}
      </ul>
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
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
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

  useEffect(() => { store.set("lyrics-size", String(size)); }, [size]);

  useEffect(() => {
    if (!scrolling) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (t: number) => {
      const b = box.current;
      if (!b) return;
      acc += ((t - last) / 1000) * speed;
      last = t;
      if (acc >= 1) { b.scrollTop += Math.floor(acc); acc -= Math.floor(acc); }
      if (b.scrollTop + b.clientHeight >= b.scrollHeight - 1) return setScrolling(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrolling, speed]);

  return (
    <div className="lyrics-page">
      <div className="lyrics-bar">
        <button className="btn" onClick={onBack}>← Songs</button>
        <div className="lyrics-tools">
          <button className="btn" onClick={() => setSize(s => Math.max(14, s - 2))} aria-label="Smaller text">A−</button>
          <button className="btn" onClick={() => setSize(s => Math.min(48, s + 2))} aria-label="Larger text">A+</button>
          <button className="btn" onClick={() => setSpeed(s => Math.max(10, s - 10))} aria-label="Slower scroll">🐢</button>
          <button className="btn" onClick={() => setSpeed(s => Math.min(120, s + 10))} aria-label="Faster scroll">🐇</button>
          <button className={"btn" + (scrolling ? " primary" : "")} onClick={() => setScrolling(v => !v)}>{scrolling ? "Pause" : "Auto-scroll"}</button>
          {admin && <button className="btn" onClick={() => onEdit(song)}>Edit</button>}
          {canDelete && <button className="btn" onClick={() => onDelete(song)}>Delete</button>}
        </div>
      </div>
      <div className="lyrics" ref={box} style={{ fontSize: size }} onTouchStart={() => setScrolling(false)} onWheel={() => setScrolling(false)}>
        <h1>{song.title}</h1>
        <p className="meta">{[song.artist, song.language].filter(Boolean).join(" · ")}</p>
        {song.lyrics.trim() ? <pre>{song.lyrics}</pre> : <p className="meta soon">Lyrics for this song will be added soon.</p>}
        {song.credit && <p className="meta credit">{song.credit}</p>}
        {reportLink("x") && <p className="meta"><a href={reportLink(`Report song: ${song.title}`)}>Report this song</a></p>}
      </div>
    </div>
  );
}
