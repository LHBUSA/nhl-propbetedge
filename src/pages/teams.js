// Teams index: the 32 clubs by conference and division, each linking to its
// team page. Identity facts only (the static league directory).
import { esc } from '../lib/dom.js';
import { TEAMS } from '../lib/teams.js';
import { teamMark } from '../components/game.js';

export function mount(root) {
  const byDiv = new Map();
  for (const t of TEAMS) {
    const k = `${t.conference}|${t.division}`;
    if (!byDiv.has(k)) byDiv.set(k, []);
    byDiv.get(k).push(t);
  }
  const groups = [...byDiv.entries()].sort(([a], [b]) => a.localeCompare(b));
  root.innerHTML = `<section class="wrap section">
    <div class="section-head section-head--editorial"><div><span class="eyebrow">Research</span><h2>Teams</h2></div>
      <p>Every club, by conference and division. Each team page carries its roster, schedule, derived line deployment and season stats.</p></div>
    <div class="iq-grid">${groups.map(([k, list]) => {
      const [conf, div] = k.split('|');
      return `<section class="tm-div" aria-label="${esc(div)} division"><h3 class="micro">${esc(conf)} · ${esc(div)}</h3>
        <div class="tm-grid">${list.sort((a, b) => a.full.localeCompare(b.full)).map(t => `<a class="tm-card" href="#/team/${esc(t.abbrev)}" style="--c:${esc(t.accent)}">${teamMark({ abbrev: t.abbrev }, 30).replace(/ alt="[^"]*"/, ' alt=""')}<span>${esc(t.full)}</span></a>`).join('')}</div></section>`;
    }).join('')}</div>
  </section>`;
  return () => {};
}
