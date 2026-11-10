// Component page: renders the shared components twice (light and dark) from the same tokens.
import "@fontsource-variable/inter/wght.css";
import "../styles/tokens.css";
import "../styles.css";
import "../ui/ui.css";
import "../features/places/places.css";
import "../features/home/home.css";
import "../features/music/music.css";
import "./preview.css";
import { iconSvg } from "../ui/icons";

const ic = (name: string, size = 20) => iconSvg(name, size);
const I = {
  search: ic("search"), plus: ic("plus"), trash: ic("trash"), check: ic("check"), chevron: ic("chevron"), music: ic("music"), x: ic("x")
};

const swatches: [string, string][] = [
  ["--bg", "Background"], ["--surface", "Surface"], ["--surface-2", "Surface 2"], ["--border", "Border"], ["--border-strong", "Border strong"],
  ["--text", "Text"], ["--text-2", "Text 2"], ["--accent", "Accent"], ["--accent-wash", "Accent wash"], ["--danger", "Danger"]
];

const panel = (theme: "light" | "dark") => `
<section data-theme="${theme}" class="pv-panel" aria-label="${theme} theme">
  <h2 class="pv-h">${theme === "light" ? "Light" : "Dark"}</h2>

  <div class="pv-block"><h3>Colour</h3>
    <div class="pv-swatches">${swatches.map(([v, n]) => `<div><span style="background:var(${v})"></span>${n}<code>${v}</code></div>`).join("")}</div>
  </div>

  <div class="pv-block"><h3>Type</h3>
    <p style="font-size:var(--text-display);line-height:var(--lh-display);font-weight:var(--w-semibold);margin:0">Display 40</p>
    <p style="font-size:var(--text-xl);line-height:var(--lh-xl);font-weight:var(--w-semibold);margin:0">Heading 28</p>
    <p style="font-size:var(--text-lg);font-weight:var(--w-semibold);margin:0">Title 20</p>
    <p style="margin:0">Body 16 regular. Loktak Lake, Keibul Lamjao and Kangla Fort.</p>
    <p style="font-size:var(--text-sm);font-weight:var(--w-medium);margin:0">Label 14 medium</p>
    <p style="font-size:var(--text-xs);color:var(--text-2);margin:0">Caption 12 · secondary</p>
  </div>

  <div class="pv-block"><h3>App bar and navigation</h3>
    <header class="pv-bar">
      <p class="site-name"><a href="#" class="brand">Explore Hack</a></p>
      <nav class="tabs" aria-label="Sample menu">
        <a href="#" aria-current="page">${ic("home", 22)} Home</a><a href="#">${ic("map", 22)} Places</a><a href="#">${ic("music", 22)} Music</a><a href="#">${ic("checklist", 22)} Checklist</a>
      </nav>
    </header>
  </div>

  <div class="pv-block"><h3>Buttons</h3>
    <div class="pv-row">
      <button class="btn primary">Primary</button>
      <button class="btn">Secondary</button>
      <button class="btn ghost">Ghost</button>
      <button class="btn primary danger">Delete</button>
      <button class="btn primary" disabled>Disabled</button>
      <button class="btn pv-focus">Focus</button>
    </div>
    <div class="pv-row">
      <button class="btn primary">${I.plus} With icon</button>
      <button class="icon-btn" aria-label="Search">${I.search}</button>
      <button class="icon-btn" aria-pressed="true" aria-label="Selected">${I.check}</button>
      <button class="icon-btn danger" aria-label="Delete">${I.trash}</button>
      <button class="icon-btn" disabled aria-label="Disabled">${I.x}</button>
      <button class="link">Text link</button>
      <button class="link danger">Remove</button>
    </div>
    <p class="hint">Hover and press any control to see those states. Focus shows with the keyboard (Tab).</p>
  </div>

  <div class="pv-block"><h3>Text inputs</h3>
    <div class="pv-col">
      <label class="pv-lab">Name<input value="Kangla Fort"></label>
      <label class="pv-lab">Empty<input placeholder="Search places"></label>
      <label class="pv-lab">Error<input value="abc" aria-invalid="true"></label>
      <label class="pv-lab">Disabled<input value="Locked" disabled></label>
      <label class="pv-lab">Select<select><option>Imphal West</option><option>Bishnupur</option></select></label>
      <label class="pv-lab">Notes<textarea rows="2">A short description.</textarea></label>
      <div class="search-field">${I.search}<input type="search" placeholder="Search places" aria-label="Search places"></div>
    </div>
  </div>

  <div class="pv-block"><h3>Chips, switch, checkbox</h3>
    <div class="chips"><button class="chip" aria-pressed="true">Tourist sites <span class="chip-n">14</span></button><button class="chip" aria-pressed="false">Picnic spots</button><button class="chip multi" aria-pressed="false">Select several</button><button class="chip" disabled>Disabled</button></div>
    <div class="seg-ctl" style="margin-top:var(--s-3)"><button class="seg-btn" aria-pressed="true">Map</button><button class="seg-btn" aria-pressed="false">List</button></div>
    <div class="pv-row" style="margin-top:var(--s-3)">
      <label class="switch"><input type="checkbox" checked> Offline maps</label>
      <label class="switch"><input type="checkbox"> Visited only</label>
      <label class="ck-check"><input type="checkbox" checked><span>Raincoat</span></label>
      <label class="ck-check"><input type="checkbox"><span>Charger</span></label>
    </div>
  </div>

  <div class="pv-block"><h3>Map pins and tags</h3>
    <div class="pv-row">
      <span class="pin-wrap" style="width:26px;height:26px"><span class="pin plain">${ic("landmark", 14)}</span></span>
      <span class="pin-wrap" style="width:26px;height:26px"><span class="pin visited">${ic("tree-pine", 14)}</span></span>
      <span class="pin-wrap" style="width:38px;height:38px"><span class="pin selected">${ic("bed-double", 20)}</span></span>
      <span class="pd-tag">${ic("landmark", 14)} Tourist sites</span>
      <span class="badge">${ic("clock", 14)} Waiting for approval</span>
      <span class="badge rejected">${ic("circle-x", 14)} Rejected</span>
    </div>
  </div>

  <div class="pv-block"><h3>Cards and list items</h3>
    <div class="card"><strong>Card</strong><span class="count">Surface, 1px border, 12px radius, no shadow.</span></div>
    <ul class="song-list" style="margin-top:var(--s-3)">
      <li class="song-card"><a class="sc-main" href="#"><span class="sc-icon">${I.music}</span><span class="sc-text"><span class="sc-title">Khongjom Parba</span><span class="sc-meta">Traditional</span><span class="sc-tags"><span class="tag">Manipuri</span></span></span>${I.chevron}</a></li>
    </ul>
    <a class="row-card" href="#" style="margin-top:var(--s-3)"><span class="rc-icon">${I.check}</span><span class="rc-text"><strong>Trip checklist</strong><span>Pack for the hills</span></span></a>
    <ul class="pl-list" style="margin-top:var(--s-3);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
      <li class="pc active"><button class="pc-main"><span class="pc-icon">${ic("landmark", 22)}</span><span class="pc-text"><span class="pc-name">Kangla Fort</span><span class="pc-meta">Tourist site · Imphal West</span></span></button><button class="pc-check on" aria-label="Visited">${ic("check", 18)}</button></li>
      <li class="pc"><button class="pc-main"><span class="pc-icon">${ic("tree-pine", 22)}</span><span class="pc-text"><span class="pc-name">Sendra Island</span><span class="pc-meta">Picnic spot · Bishnupur</span></span></button><button class="pc-check" aria-label="Not visited">${ic("check", 18)}</button></li>
    </ul>
    <p style="margin:var(--s-3) 0 0"><span class="badge">Pending review</span> <span class="badge rejected">Rejected</span></p>
  </div>

  <div class="pv-block"><h3>Notices</h3>
    <div class="pv-col">
      <div class="bar update"><span>A new version is ready.</span><button class="btn primary">Reload</button></div>
      <div class="bar offline">You're offline. Showing saved data.</div>
      <div class="error">Couldn't load data: Failed to fetch</div>
    </div>
  </div>

  <div class="pv-block"><h3>Dialogs</h3>
    <div class="pv-dialogs">
      <dialog open class="msg pv-dialog"><form method="dialog"><p class="msg-text">Delete Sendra Island? This can't be undone.</p><div class="actions"><button type="button" class="btn">Cancel</button><button class="btn primary danger">Delete</button></div></form></dialog>
      <dialog open class="msg error pv-dialog"><form method="dialog"><p class="msg-text">You seem to be offline. Try again when you're connected.</p><div class="actions"><button class="btn primary">OK</button></div></form></dialog>
    </div>
  </div>

  <div class="pv-block"><h3>Spacing, radius, shadow</h3>
    <div class="pv-space">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<span style="width:var(--s-${n})"></span>`).join("")}</div>
    <div class="pv-row" style="margin-top:var(--s-3)">
      <div class="pv-tile">Radius 12</div>
      <div class="pv-tile" style="box-shadow:var(--shadow-float)">Floating</div>
    </div>
  </div>
</section>`;

document.getElementById("preview")!.innerHTML = `<main class="pv-wrap">${panel("light")}${panel("dark")}</main>`;
