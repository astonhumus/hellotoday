import { useEffect, useRef, useState } from "react";
import type { CountryInfo, StateInfo } from "../types";
import { loadJson } from "../lib/data";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface Props {
  countries: CountryInfo[];
  country: CountryInfo | undefined;
  state: StateInfo | undefined;
  onChoose: (countryId: string, regionId: string) => void;
}

interface Region { id: string; name: string }

/** The header button that shows where you are exploring, and the setting to change country and state/province. */
export function RegionPicker({ countries, country, state, onChoose }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="region-btn" onClick={() => setOpen(true)} aria-haspopup="dialog"
        aria-label={`Region: ${state?.name ?? "loading"}${country ? `, ${country.name}` : ""}. Change country or ${country?.kind.toLowerCase() ?? "state"}`}>
        <Icon name="pin" size={18} />
        <span className="region-name">{state?.name ?? "Choose region"}</span>
        {country && <span className="region-country">{country.name}</span>}
      </button>
      {open && <RegionDialog countries={countries} country={country} state={state} onClose={() => setOpen(false)}
        onChoose={(c, r) => { setOpen(false); onChoose(c, r); }} />}
    </>
  );
}

function RegionDialog({ countries, country, state, onChoose, onClose }: Props & { onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [countryId, setCountryId] = useState(country?.id ?? "IND");
  const [regionId, setRegionId] = useState(state?.id ?? "");
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [failed, setFailed] = useState(false);
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
  const kind = chosen?.kind ?? "State";

  return (
    <dialog ref={dlg} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (regionId) onChoose(countryId, regionId); }}>
        <h2>Where do you want to explore?</h2>
        <label>Country
          <select value={countryId} onChange={e => setCountryId(e.target.value)}>
            {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>{kind}
          <select value={regionId} onChange={e => setRegionId(e.target.value)} disabled={!regions}>
            {!regions && <option>{failed ? "Couldn't load. Check your connection." : "Loading…"}</option>}
            {regions?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
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
