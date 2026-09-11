import './styles.css';
import { nhl, normalizeSchedule, teamLabel, fmtTime, fmtDate } from './api.js';

const app = document.querySelector('#app');
const OPENING_NIGHT = new Date('2026-09-29T21:00:00Z');
const PRESEASON = new Date('2026-09-19T16:00:00Z');

const state = {
  tab: location.hash.replace('#', '') || 'today',
  schedule: [],
  openingGames: [],
  scoreboard: [],
  sourceHealth: null,
  loading: false
};

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const localized = value => typeof value === 'string' ? value : value?.default || value?.en || '';

function countdown(target) {
  const ms = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    mins: Math.floor((ms % 3600000) / 60000),
    secs: Math.floor((ms % 60000) / 1000),
    done: ms <= 0
  };
}

function renderShell() {
  app.innerHTML = `
    <div class="ice-glow ice-glow-a"></div><div class="ice-glow ice-glow-b"></div>
    <header class="topbar">
      <a class="brand" href="#today" aria-label="PropBetEdge NHL home">
        <span class="brand-mark">PBE</span>
        <span><b>PropBet<span>Edge</span></b><small>NHL INTELLIGENCE</small></span>
      </a>
      <div class="top-status">
        <span class="status-dot"></span>
        <span id="api-status">Checking PropSports</span>
      </div>
      <a class="network-link" href="https://hub.propbetedge.ai/">All Sports ↗</a>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow">2026–27 · HOCKEY INTELLIGENCE</div>
        <h1>Read the ice.<br><em>Price the context.</em></h1>
        <p>Live NHL game state, goalie context, shot geography, possession signals and prop-ready research — built on PropSports infrastructure, not a generic picks feed.</p>
        <div class="hero-actions">
          <a href="#today" class="button button-primary">Open Game Board</a>
          <a href="#model" class="button button-ghost">Model Readiness</a>
        </div>
      </div>
      <div class="launch-panel">
        <div class="launch-kicker">REGULAR SEASON OPENER</div>
        <div class="launch-date">SEP 29</div>
        <div class="countdown" id="countdown"></div>
        <div class="preseason-line"><span></span> Preseason begins Sep 19</div>
      </div>
    </section>

    <section class="metrics" id="metrics">
      ${metricSkeleton('Games Today')}${metricSkeleton('Live Now')}${metricSkeleton('Opening Slate')}${metricSkeleton('Data Layer')}
    </section>

    <nav class="product-nav" aria-label="NHL product navigation">
      ${navItem('today','Game Board','◉')}
      ${navItem('goalies','Goalies','▰')}
      ${navItem('shots','Shot Lab','⌖')}
      ${navItem('standings','Standings','≡')}
      ${navItem('model','Model Lab','◇')}
    </nav>

    <main id="view" class="view"><div class="loading-card">Loading hockey intelligence…</div></main>
    <footer><span>PropBetEdge NHL</span><span>Powered by PropSports API · PropTechUSA.ai</span><span>Research tooling · Gamble responsibly</span></footer>
  `;
  tick();
}

function metricSkeleton(label) {
  return `<div class="metric"><span class="metric-label">${label}</span><strong class="skeleton-text">—</strong><small>loading</small></div>`;
}

function navItem(id, label, icon) {
  return `<a href="#${id}" data-tab="${id}" class="${state.tab === id ? 'active' : ''}"><i>${icon}</i>${label}</a>`;
}

function tick() {
  const node = document.querySelector('#countdown');
  if (!node) return;
  const c = countdown(OPENING_NIGHT);
  if (c.done) {
    node.innerHTML = `<b>SEASON LIVE</b>`;
    return;
  }
  node.innerHTML = [
    ['DAYS', c.days], ['HRS', c.hours], ['MIN', c.mins], ['SEC', c.secs]
  ].map(([label,value]) => `<div><strong>${String(value).padStart(2,'0')}</strong><span>${label}</span></div>`).join('');
}

async function loadFoundation() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [schedule, scoreboard, opening, health] = await Promise.allSettled([
    nhl('/nhl/schedule/today'),
    nhl('/nhl/scoreboard'),
    nhl('/nhl/schedule', { date: '2026-09-29' }),
    nhl('/health/nhl-sources')
  ]);

  if (schedule.status === 'fulfilled') state.schedule = normalizeSchedule(schedule.value);
  if (scoreboard.status === 'fulfilled') state.scoreboard = normalizeSchedule(scoreboard.value);
  if (opening.status === 'fulfilled') state.openingGames = normalizeSchedule(opening.value);
  if (health.status === 'fulfilled') state.sourceHealth = health.value;

  const live = state.scoreboard.filter(g => g.status?.semantics === 'LIVE').length;
  const advanced = Boolean(state.sourceHealth?.ok);
  document.querySelector('#metrics').innerHTML = `
    ${metric('Games Today', state.schedule.length, today)}
    ${metric('Live Now', live, live ? 'tracking live' : 'no puck in play')}
    ${metric('Opening Slate', state.openingGames.length || '—', 'Sep 29')}
    ${metric('Data Layer', advanced ? 'ONLINE' : 'CORE', advanced ? 'expanded NHL routes' : 'public routes live')}
  `;
  const status = document.querySelector('#api-status');
  status.textContent = advanced ? 'NHL data layer online' : 'Core NHL data online';
  status.closest('.top-status')?.classList.toggle('core-only', !advanced);
}

function metric(label, value, detail) {
  return `<div class="metric"><span class="metric-label">${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`;
}

function setTab(tab) {
  state.tab = ['today','goalies','shots','standings','model'].includes(tab) ? tab : 'today';
  document.querySelectorAll('[data-tab]').forEach(node => node.classList.toggle('active', node.dataset.tab === state.tab));
  renderView();
}

function sectionHeader(kicker, title, copy = '') {
  return `<div class="section-head"><div><span>${esc(kicker)}</span><h2>${title}</h2></div>${copy ? `<p>${esc(copy)}</p>` : ''}</div>`;
}

function gameCard(game, opening = false) {
  const away = game.teams?.away || {};
  const home = game.teams?.home || {};
  const status = game.status?.semantics || 'SCHEDULED';
  const finalish = status === 'FINAL' || status === 'LIVE';
  const broadcasts = (game.broadcasts || []).map(x => x.network).filter(Boolean).slice(0,2).join(' · ');
  return `
    <article class="game-card" data-game-id="${esc(game.id)}">
      <div class="game-meta"><span class="tag ${status === 'LIVE' ? 'tag-live' : ''}">${opening ? 'OPENING NIGHT' : esc(status)}</span><span>${esc(fmtDate(game.start_time_utc || game.date))} · ${esc(fmtTime(game.start_time_utc || game.date))}</span></div>
      <div class="matchup">
        ${teamRow(away, finalish)}
        <div class="at">@</div>
        ${teamRow(home, finalish)}
      </div>
      <div class="game-foot"><span>${esc(game.venue || 'Venue TBD')}</span><span>${esc(broadcasts || 'Broadcast TBD')}</span></div>
      <button class="text-button" data-shot-game="${esc(game.id)}">Open intelligence →</button>
    </article>`;
}

function teamRow(team, showScore) {
  const label = teamLabel(team);
  return `<div class="team-row">
    <div class="team-logo">${team.logo ? `<img src="${esc(team.logo)}" alt="">` : `<span>${esc(label.slice(0,3))}</span>`}</div>
    <div><strong>${esc(label)}</strong><small>${esc(team.name && team.name !== label ? team.name : '')}</small></div>
    ${showScore && team.score !== null && team.score !== undefined ? `<b class="score">${esc(team.score)}</b>` : ''}
  </div>`;
}

async function renderToday() {
  const view = document.querySelector('#view');
  const games = state.schedule.length ? state.schedule : state.openingGames;
  const isOpening = !state.schedule.length;
  view.innerHTML = `
    ${sectionHeader(isOpening ? 'NEXT UP' : 'TODAY', isOpening ? 'Opening night is already on the board.' : 'Today’s NHL board.', isOpening ? 'No NHL games today, so the product is showing the Sep 29 regular-season opener.' : 'Schedule and game state are coming through PropSports.')}
    <div class="game-grid">${games.length ? games.map(g => gameCard(g, isOpening)).join('') : emptyState('No games returned', 'The NHL schedule endpoint is online, but no matching games were returned for this slate.')}</div>
    <div class="intel-strip">
      <div><span>01</span><b>Game state</b><small>Schedule · live status · score · venue</small></div>
      <div><span>02</span><b>Goalie context</b><small>Starts · form · EDGE metrics</small></div>
      <div><span>03</span><b>Shot geography</b><small>Attempts · SOG · location · danger inputs</small></div>
      <div><span>04</span><b>Prop layer</b><small>Model outputs after calibration</small></div>
    </div>`;
  bindGameButtons();
}

function bindGameButtons() {
  document.querySelectorAll('[data-shot-game]').forEach(button => button.addEventListener('click', () => {
    location.hash = `shots?game=${button.dataset.shotGame}`;
  }));
}

async function renderGoalies() {
  const view = document.querySelector('#view');
  view.innerHTML = `${sectionHeader('GOALIE INTELLIGENCE','The position that can break the entire market.','Save percentage is only the surface. This view is wired for goalie EDGE data as the expanded worker comes online.')}<div class="loading-card">Loading goalie data…</div>`;
  try {
    const data = await nhl('/nhl/goalies/leaders', { category: 'savePct', limit: 18 });
    const leaders = Array.isArray(data.leaders) ? data.leaders : [];
    view.innerHTML = `${sectionHeader('GOALIE INTELLIGENCE','Goalie form, without the vibes.','Current league leaders from the NHL data layer. Individual EDGE cards will add start context and deeper goalie features.')}
      <div class="leader-grid">${leaders.map((g,i) => goalieCard(g,i)).join('') || emptyState('No goalie rows yet','The route is responding but has not returned current-season goalie values yet.')}</div>`;
  } catch (error) {
    view.innerHTML = `${sectionHeader('GOALIE INTELLIGENCE','Goalie model plumbing is staged.','The public NHL core is live. The expanded goalie route is still on the worker feature branch, so this screen refuses to manufacture values.')}${backendPending('Goalie EDGE route','/nhl/goalies/leaders + /nhl/goalie/:id/edge')}`;
  }
}

function goalieCard(g, index) {
  const name = localized(g.firstName) || localized(g.lastName) ? `${localized(g.firstName)} ${localized(g.lastName)}`.trim() : g.name || 'Goalie';
  const value = g.value ?? g.savePct ?? g.statValue ?? '—';
  return `<article class="leader-card"><span class="rank">${String(index+1).padStart(2,'0')}</span><div><strong>${esc(name)}</strong><small>${esc(g.teamAbbrev || g.team || '')}</small></div><b>${esc(value)}</b></article>`;
}

async function renderShots() {
  const view = document.querySelector('#view');
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const gameId = params.get('game') || '';
  view.innerHTML = `${sectionHeader('SHOT LAB','Turn every attempt into usable context.','Coordinates are normalized for model input. The geometric danger bucket is explicitly not presented as xG until the probability model is calibrated.')}
    <div class="shot-search"><input id="game-id" inputmode="numeric" placeholder="NHL game ID" value="${esc(gameId)}"><button id="load-shots" class="button button-primary">Load shot map</button></div>
    <div id="shot-output">${gameId ? '<div class="loading-card">Loading shot events…</div>' : shotIntro()}</div>`;
  document.querySelector('#load-shots').addEventListener('click', () => loadShots(document.querySelector('#game-id').value.trim()));
  if (gameId) loadShots(gameId);
}

function shotIntro() {
  const pre = countdown(PRESEASON);
  return `<div class="empty-large"><div class="rink-mini"><span></span><i></i><b></b></div><h3>Shot events arrive with live hockey.</h3><p>Preseason starts in ${pre.done ? 'the current window' : `${pre.days} days`}. Pick a game from the board or paste a game ID once games are live/completed.</p></div>`;
}

async function loadShots(gameId) {
  const out = document.querySelector('#shot-output');
  if (!/^\d{10}$/.test(gameId)) { out.innerHTML = emptyState('Enter a valid game ID','NHL game IDs are 10 digits.'); return; }
  out.innerHTML = '<div class="loading-card">Reading play-by-play and extracting shot attempts…</div>';
  try {
    const data = await nhl(`/nhl/game/${gameId}/shots`);
    const shots = Array.isArray(data.shots) ? data.shots : [];
    out.innerHTML = `<div class="shot-layout">
      <div class="rink" id="rink">${shots.map(shotDot).join('')}</div>
      <div class="shot-summary">
        ${shotStat('Attempts',data.summary?.attempts)}${shotStat('Unblocked',data.summary?.unblocked_attempts)}${shotStat('On goal',data.summary?.on_goal)}${shotStat('Goals',data.summary?.goals)}${shotStat('Geo high danger',data.summary?.geometric_high_danger)}${shotStat('Blocked',data.summary?.blocked)}
        <div class="model-warning"><b>RAW FEATURES ONLY</b><p>${esc(data.note || 'These features are not calibrated xG probabilities.')}</p></div>
      </div>
    </div>`;
  } catch (error) {
    out.innerHTML = backendPending('Shot extraction route','/nhl/game/:id/shots is on the NHL worker branch and will light up when that branch is promoted.');
  }
}

function shotDot(play) {
  const x = Number(play.shot?.x); const y = Number(play.shot?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
  const left = Math.max(2, Math.min(98, ((x + 100) / 200) * 100));
  const top = Math.max(2, Math.min(98, ((42.5 - y) / 85) * 100));
  const cls = play.shot.goal ? 'goal' : play.shot.danger_bucket === 'high' ? 'high' : play.shot.on_goal ? 'sog' : 'attempt';
  return `<i class="shot-dot ${cls}" style="left:${left}%;top:${top}%" title="${esc(play.type)} · ${esc(play.shot.distance_ft ?? '—')} ft"></i>`;
}

function shotStat(label, value) { return `<div class="shot-stat"><span>${esc(label)}</span><strong>${esc(value ?? '—')}</strong></div>`; }

async function renderStandings() {
  const view = document.querySelector('#view');
  view.innerHTML = `${sectionHeader('LEAGUE STATE','Standings, clean enough to use.','Conference, division, games played and point context from the NHL source layer.')}<div class="loading-card">Loading standings…</div>`;
  try {
    const data = await nhl('/nhl/standings');
    const rows = Array.isArray(data.standings) ? data.standings : [];
    const groups = Object.groupBy ? Object.groupBy(rows, r => r.conferenceName || 'League') : rows.reduce((a,r) => ((a[r.conferenceName || 'League'] ||= []).push(r),a),{});
    view.innerHTML = `${sectionHeader('LEAGUE STATE','Standings, clean enough to use.','Live NHL standings through the PropSports data layer.')}${Object.entries(groups).map(([name,items]) => standingsTable(name,items)).join('')}`;
  } catch (error) {
    view.innerHTML = `${sectionHeader('LEAGUE STATE','Standings unavailable.','The app could not reach the current NHL standings route.')}${emptyState('Could not load standings', error.message)}`;
  }
}

function standingsTable(name, rows) {
  return `<section class="standings-block"><div class="table-title">${esc(name)}</div><div class="table-wrap"><table><thead><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>OT</th><th>PTS</th><th>DIFF</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(localized(r.teamAbbrev) || localized(r.teamName) || '')}</b><small>${esc(localized(r.teamName) || '')}</small></td><td>${esc(r.gamesPlayed ?? '—')}</td><td>${esc(r.wins ?? '—')}</td><td>${esc(r.losses ?? '—')}</td><td>${esc(r.otLosses ?? '—')}</td><td><strong>${esc(r.points ?? '—')}</strong></td><td>${esc(r.goalDifferential ?? '—')}</td></tr>`).join('')}</tbody></table></div></section>`;
}

async function renderModel() {
  const view = document.querySelector('#view');
  const healthy = Boolean(state.sourceHealth?.ok);
  view.innerHTML = `${sectionHeader('MODEL LAB','Build the edge in layers.','The important distinction: data features can be live before a predictive model is calibrated. This page shows that readiness instead of blurring the two.')}
    <div class="readiness-grid">
      ${readyCard('Game state','LIVE','Official schedule, score and standings routes are already available.','live')}
      ${readyCard('Shot event layer', healthy ? 'STAGED' : 'BRANCH','Shot coordinates, Corsi/Fenwick event flags and geometry normalization.','staged')}
      ${readyCard('Goalie EDGE', healthy ? 'STAGED' : 'BRANCH','Goalie leader + NHL EDGE detail routes for model features.','staged')}
      ${readyCard('Line combinations','NEXT','Forward line, D-pair and TOI-change ingestion still needs its dedicated pipeline.','next')}
      ${readyCard('Sportsbook props','NEXT','Game odds exist today; player SOG/saves/goals/assists markets need normalized ingestion.','next')}
      ${readyCard('Calibrated xG','TRAIN','Distance and angle are inputs, not probabilities. Historical shot outcomes are required before we call anything xG.','train')}
    </div>
    <div class="architecture">
      <span>LEAGUE SOURCES</span><i>→</i><span>CLOUDFLARE WORKERS</span><i>→</i><span>SUPABASE HISTORY</span><i>→</i><span>MODEL FEATURES</span><i>→</i><span>PROPBETEDGE</span>
    </div>
    <div class="method-card"><span class="eyebrow">FIRST REAL MODEL TARGET</span><h3>Shots on goal before “picks.”</h3><p>SOG gives us the cleanest first product loop: player shot-attempt rate × expected TOI × line/PP deployment × opponent shot suppression × game state. Once that is backtested and graded, goals/assists and goalie saves can layer on top.</p></div>`;
}

function readyCard(title,status,copy,cls) { return `<article class="ready-card ${cls}"><div><span>${esc(status)}</span><h3>${esc(title)}</h3></div><p>${esc(copy)}</p></article>`; }

function backendPending(title, detail) {
  return `<div class="backend-pending"><span>WORKER BRANCH</span><h3>${esc(title)} is staged, not faked.</h3><p>${esc(detail)}</p><small>The frontend will use it automatically after the NHL data branch is deployed with server-side credentials.</small></div>`;
}

function emptyState(title, copy) { return `<div class="empty-state"><strong>${esc(title)}</strong><span>${esc(copy)}</span></div>`; }

function renderView() {
  const renderers = { today: renderToday, goalies: renderGoalies, shots: renderShots, standings: renderStandings, model: renderModel };
  renderers[state.tab]?.();
}

window.addEventListener('hashchange', () => setTab(location.hash.replace('#','').split('?')[0] || 'today'));
renderShell();
setInterval(tick, 1000);
loadFoundation().finally(renderView);
