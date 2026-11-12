import { useEffect, useMemo, useState } from "react";
import type { CountryInfo } from "../../types";
import { loadJson } from "../../lib/data";
import { supabase } from "../../lib/supabase";
import { fetchAll } from "../../lib/fetchAll";
import { goBack } from "../../lib/nav";
import { kindName, kindPlural, plural } from "../../lib/format";
import { usePageMeta } from "../../lib/pageMeta";
import { FooterLinks } from "../../components/AboutPage";
import { Icon } from "../../ui/Icon";
import { PageHeader } from "../../ui/PageHeader";
import { SearchField } from "../../ui/SearchField";
import { EmptyState, Skeleton } from "../../ui/States";
import "./regions.css";

interface Props { countries: CountryInfo[]; countryId: string; stateId?: string }
interface Region { id: string; name: string }
interface Counts { total: number; districts: Record<string, number> }

// How many places each state has, and in which districts. One light query on the public place_districts view
// (a row per state and district), shared by every visit to this page.
let countsCache: Promise<Record<string, Counts>> | null = null;
const loadCounts = (): Promise<Record<string, Counts>> => {
  if (!supabase) return Promise.resolve({});
  const db = supabase;
  countsCache ??= fetchAll<{ state_id: string; district: string | null; places: number }>((a, b) => db.from("place_districts").select("state_id,district,places").order("state_id").range(a, b))
    .then(({ data, error }) => {
      if (error) { countsCache = null; return {}; }
      const out: Record<string, Counts> = {};
      for (const r of data) {
        const c = (out[r.state_id] ??= { total: 0, districts: {} });
        c.total += r.places;
        if (r.district) c.districts[r.district] = (c.districts[r.district] ?? 0) + r.places;
      }
      return out;
    });
  return countsCache;
};

/** Browse by country, then state or province, then district. Every row opens Places for exactly that area. */
export function RegionsPage({ countries, countryId: initialCountry, stateId }: Props) {
  usePageMeta("Browse all regions", "Pick any country, state or province and district to see its places, with how many places each has.");
  const [countryId, setCountryId] = useState(initialCountry);
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [counts, setCounts] = useState<Record<string, Counts> | null>(null);
  const [q, setQ] = useState("");
  const [onlyWithPlaces, setOnlyWithPlaces] = useState(false);

  useEffect(() => { let live = true; void loadCounts().then(c => { if (live) setCounts(c); }); return () => { live = false; }; }, []);
  useEffect(() => {
    let live = true;
    setRegions(null); setFailed(false);
    loadJson<{ features: { properties: Region }[] }>(`regions/${countryId}.json`)
      .then(g => { if (live) setRegions(g.features.map(f => ({ id: f.properties.id, name: f.properties.name }))); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [countryId]);

  const country = countries.find(c => c.id === countryId);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (regions ?? [])
      .map(r => ({ ...r, c: counts?.[r.id] }))
      .filter(r => (!n || r.name.toLowerCase().includes(n)) && (!onlyWithPlaces || (r.c?.total ?? 0) > 0))
      .sort((a, b) => (b.c?.total ?? 0) - (a.c?.total ?? 0) || a.name.localeCompare(b.name)); // regions that have places come first
  }, [regions, counts, q, onlyWithPlaces]);

  const link = (regionId: string, district?: string) =>
    `#/places?region=${encodeURIComponent(regionId)}&country=${encodeURIComponent(countryId)}${district ? `&district=${encodeURIComponent(district)}` : ""}`;

  return (
    <div className="page regions">
      <PageHeader title="Browse all regions" onBack={() => goBack("#/")} sub={country ? `${country.name} · ${regions?.length ?? country.regions} ${(regions?.length ?? country.regions) === 1 ? kindName(country.kind).toLowerCase() : kindPlural(country.kind).toLowerCase()}` : undefined} />
      <label className="rg-country">Country
        <select value={countryId} onChange={e => { setCountryId(e.target.value); setQ(""); }}>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <SearchField value={q} onChange={setQ} placeholder={`Search ${kindPlural(country?.kind).toLowerCase()}`} />
      {supabase && (
        <label className="rg-only check"><input type="checkbox" checked={onlyWithPlaces} onChange={e => setOnlyWithPlaces(e.target.checked)} /> Only those with places</label>
      )}

      {!regions && !failed && <Skeleton rows={6} label="Loading regions" />}
      {failed && <EmptyState title="Couldn't load this country" hint="Check your connection and try again." action={{ label: "Reload", onClick: () => location.reload() }} />}
      {regions && rows.length === 0 && <EmptyState title="Nothing found" hint={onlyWithPlaces ? "No place has been added in this country yet." : "Try a different spelling."} />}

      <ul className="rg-list">
        {rows.map(r => {
          const districts = Object.entries(r.c?.districts ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
          return (
            <li key={r.id} className={"rg-item" + (r.id === stateId ? " current" : "")}>
              <a className="rg-main" href={link(r.id)}>
                <span className="rg-name">{r.name}</span>
                <span className="rg-n">{counts ? (r.c?.total ? plural(r.c.total, "place") : "No places yet") : ""}</span>
                <Icon name="chevron" size={18} />
              </a>
              {districts.length > 0 && (
                <details className="rg-districts">
                  <summary>{plural(districts.length, "district")}</summary>
                  <ul>
                    {districts.map(([d, n]) => <li key={d}><a href={link(r.id, d)}>{d} <span className="rg-n">{n}</span></a></li>)}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      <FooterLinks />
    </div>
  );
}
