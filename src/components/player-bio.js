// "About [Player]" + "Career at a glance" + "Career journey" for the player
// profile. Pure render over the fact packet from lib/player-bio.js; nothing
// here adds a fact the packet does not hold.
import { esc } from '../lib/dom.js';
import { TEAM_BY_ABBREV, teamAccent } from '../lib/teams.js';
import { bioParagraphs, bioSources, careerGlance, seasonText } from '../lib/player-bio.js';

const VISIBLE_SEASONS = 5;

export function renderPlayerBio(f) {
  if (!f) return '';
  const paras = bioParagraphs(f);
  const glance = careerGlance(f);
  if (!paras.length && !glance.length) return '';
  const nhl = paras.filter(p => p.kind === 'nhl');
  const pbe = paras.filter(p => p.kind === 'pbe');
  const sentence = s => esc(s.text);
  const sources = bioSources(f);
  return `<section class="pbio" style="--accent:${esc(teamAccent(f.identity.current_team?.abbrev))}" aria-labelledby="pbio-h" data-bio-schema="${esc(f.schema)}" data-bio-hash="${esc(f.evidence_hash)}">
    <div class="pbio__main">
      <span class="eyebrow">Player profile</span>
      <h2 class="pbio__h" id="pbio-h">About ${esc(f.identity.name)}</h2>
      <div class="pbio__prose" data-bio-source="NHL">${nhl.map(p => `<p>${p.sentences.map(sentence).join(' ')}</p>`).join('')}</div>
      ${pbe.length ? `<div class="pbio__style" data-bio-source="PBE">
        <span class="pbio__label">Statistical profile · PropBetEdge analysis</span>
        ${pbe.map(p => `<p>${p.sentences.map(sentence).join(' ')}</p>`).join('')}
      </div>` : ''}
      <p class="pbio__src">${sources.map(esc).join('<br>')}</p>
    </div>
    ${glance.length ? `<aside class="pbio__rail" aria-labelledby="pbio-glance">
      <h3 class="pbio__rail-h" id="pbio-glance">Career at a glance</h3>
      <dl class="pbio__glance">${glance.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    </aside>` : ''}
  </section>`;
}

const clubLink = club => (club.abbrev && TEAM_BY_ABBREV.has(club.abbrev)
  ? `<a href="#/team/${esc(club.abbrev)}">${esc(club.name)}</a>`
  : `<span>${esc(club.name)}</span>`);

// Season-by-season NHL clubs, newest first. A traded season lists every club
// in source order with its own GP; no transaction date is implied.
export function renderCareerJourney(f) {
  if (!f || f.journey.length < 2) return '';
  const goalie = f.identity.goalie;
  const rows = f.journey.slice().reverse().map(j => {
    const split = j.clubs.length > 1;
    const clubs = split
      ? j.clubs.map(c => `${clubLink(c)} <small>${esc(c.gp)} GP</small>`).join('<i class="pbio-j__sep" aria-hidden="true">·</i>')
      : clubLink(j.clubs[0] || { name: '—' });
    const line = goalie
      ? `${esc(j.gp)} GP${j.wins !== null ? ` · ${esc(j.wins)} W` : ''}`
      : `${esc(j.gp)} GP${j.points !== null ? ` · ${esc(j.points)} P` : ''}`;
    return `<li class="pbio-j__row${split ? ' is-split' : ''}" data-season="${esc(j.season)}">
      <span class="pbio-j__season">${esc(seasonText(j.season))}</span>
      <span class="pbio-j__clubs">${clubs}${split ? ' <span class="pbio-j__tag">split season</span>' : ''}</span>
      <span class="pbio-j__line">${line}</span>
    </li>`;
  });
  const head = rows.slice(0, VISIBLE_SEASONS).join('');
  const rest = rows.slice(VISIBLE_SEASONS);
  return `<div class="pbio-j">
    <h3 class="rs-h4">Career journey <small class="micro">NHL regular seasons</small></h3>
    <ol class="pbio-j__list">${head}</ol>
    ${rest.length ? `<details class="pbio-j__more"><summary>Full NHL history · ${rest.length} earlier season${rest.length === 1 ? '' : 's'}</summary><ol class="pbio-j__list">${rest.join('')}</ol></details>` : ''}
  </div>`;
}
