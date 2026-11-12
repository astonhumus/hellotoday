import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CountryInfo, StateInfo } from "../types";
import { loadJson } from "../lib/data";
import { kindName } from "../lib/format";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface Props {
  countries: CountryInfo[];
  country: CountryInfo | undefined;
  state: StateInfo | undefined;
  onChoose: (countryId: string, regionId: string) => void;
  open?: boolean;          // controlled by the app, so Settings can open it too
  onOpen?: () => void;
  onClose?: () => void;
}

interface Region { id: string; name: string }

/** The header button that shows where you are exploring, and the setting to change country and state/province. */
export function RegionPicker({ countries, country, state, onChoose, open = false, onOpen, onClose }: Props) {
  return (
    <>
      <button type="button" className="region-btn" onClick={onOpen} aria-haspopup="dialog"
        aria-label={`Region: ${state?.name ?? "loading"}${country ? `, ${country.name}` : ""}. Change country or ${kindName(country?.kind).toLowerCase()}`}>
        <Icon name="pin" size={18} />
        <span className="region-name">{state?.name ?? "Choose region"}</span>
        {country && <span className="region-country">{country.name}</span>}
      </button>
      {open && createPortal(
        <RegionDialog countries={countries} country={country} state={state} onClose={() => onClose?.()}
          onChoose={(c, r) => { onClose?.(); onChoose(c, r); }} />, document.body)}
    </>
  );
}

function RegionDialog({ countries, country, state, onChoose, onClose }: Props & { onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [countryId, setCountryId] = useState(country?.id ?? "IND");
  const [regionId, setRegionId] = useState(state?.id ?? "");
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [findCountry, setFindCountry] = useState("");
  const [findRegion, setFindRegion] = useState("");
  useEffect(() => { dlg.current?.showModal(); }, []);

  // The list of states/provinces comes from the chosen country's own file, loaded when it is picked.
  useEffect(() => {
    let live = true;
    setRegions(null); setFailed(false);
    loadJson<{ features: { properties: Region }[] }>(`regions/${countryId}.json`)
      .then(g => {
        if (!live) return;
        const list = g.features.map(f => ({ id: f.properties.id, name: f.properties.name }));
        setRegions(list);
        setRegionId(cur => (list.some(r => r.id === cur) ? cur : list[0]?.id ?? ""));
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [countryId]);

  const chosen = countries.find(c => c.id === countryId);
  const kind = kindName(chosen?.kind);
  // 250 countries is a long list to scroll: type a few letters to narrow it. The chosen one always stays in the list.
  const has = (name: string, q: string) => name.toLowerCase().includes(q.trim().toLowerCase());
  const shownCountries = countries.filter(c => !findCountry.trim() || has(c.name, findCountry) || c.id === countryId);
  const shownRegions = regions?.filter(r => !findRegion.trim() || has(r.name, findRegion) || r.id === regionId);

  return (
    <dialog ref={dlg} className="region-dialog" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (regionId) onChoose(countryId, regionId); }}>
        <h2>Where do you want to explore?</h2>
        <label>Country
          <input type="search" className="rp-find" value={findCountry} onChange={e => setFindCountry(e.target.value)} placeholder="Type to find a country" autoComplete="off" aria-label="Find a country" />
          <select value={countryId} onChange={e => { setCountryId(e.target.value); setFindRegion(""); }}>
            {shownCountries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>{kind}
          {regions && regions.length > 12 && <input type="search" className="rp-find" value={findRegion} onChange={e => setFindRegion(e.target.value)} placeholder={`Type to find a ${kind.toLowerCase()}`} autoComplete="off" aria-label={`Find a ${kind.toLowerCase()}`} />}
          <select value={regionId} onChange={e => setRegionId(e.target.value)} disabled={!regions}>
            {!regions && <option>{failed ? "Couldn't load. Check your connection." : "Loading…"}</option>}
            {shownRegions?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <p className="hint">Your choice is remembered on this device.</p>
        <div className="actions">
          <Button onClick={() => dlg.current?.close()}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!regionId || !regions}>Show this region</Button>
        </div>
      </form>
    </dialog>
  );
}
