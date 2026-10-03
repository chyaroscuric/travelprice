// Travel price checker. Everything personal stays in this browser's cookies:
//   tp_cfg  – trip dates, passengers and routes
//   tp_hist – price history per route (one entry per day the price changed)

const DAY_MS = 864e5;
const MAX_ROUTES = 8;
const PROVIDERS = { flixbus: 'FlixBus', ryanair: 'Ryanair' };
// Ryanair add-ons bought without a fare bundle. Ryanair only prices them inside its booking flow
// (behind bot protection), so the user enters the per-person, per-flight price they last saw.
const BAGS = { priority: 'Priority & 2 cabin bags', check10: '10 kg check-in bag', check20: '20 kg check-in bag' };
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let cfg = readCookie('tp_cfg');
let hist = readCookie('tp_hist') || { last: 0, r: {} };
let checking = false;
const places = new Map(); // "provider:label" -> { id, name }

// ---------- cookies ----------

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  try {
    return m ? JSON.parse(decodeURIComponent(m[1])) : null;
  } catch {
    return null;
  }
}

function writeCookie(name, value) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))}; Max-Age=34560000; Path=/; SameSite=Strict${secure}`;
}

function saveHistory() {
  // A cookie holds about 4 KB, so drop the oldest entries of the longest history until it fits.
  while (encodeURIComponent(JSON.stringify(hist)).length > 3800) {
    const longest = Object.values(hist.r).sort((a, b) => b.length - a.length)[0];
    if (!longest || longest.length < 2) break;
    longest.shift();
  }
  writeCookie('tp_hist', hist);
}

// ---------- checking prices ----------

function today() {
  return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY_MS);
}

function routeKey(r) {
  const s = [r.p, r.from.id, r.to.id, cfg.out, cfg.ret, cfg.adults].join('|') + (r.direct ? '|direct' : '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function legsOf(r) {
  const legs = [{ label: 'Out', date: cfg.out, from: r.from, to: r.to }];
  if (cfg.ret) legs.push({ label: 'Back', date: cfg.ret, from: r.to, to: r.from });
  return legs;
}

// Per-leg cost of the bags picked for a route. Bags are counted per flight, not per passenger,
// so two people can share one check-in bag.
function bagCost(route) {
  const total = Object.values(route.bags || {}).reduce((sum, b) => sum + b.n * b.price, 0);
  return Math.round(total * 100) / 100;
}

function addBags(fare, route) {
  return fare == null ? null : Math.round((fare + bagCost(route)) * 100) / 100;
}

async function fetchLeg(route, leg) {
  const qs = new URLSearchParams({ from: leg.from.id, to: leg.to.id, date: leg.date, adults: cfg.adults });
  if (route.direct) qs.set('direct', '1');
  try {
    const res = await fetch(`/api/${route.p}?${qs}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    return { ...leg, ...data, price: addBags(data.price, route) };
  } catch (err) {
    return { ...leg, price: null, error: `Couldn't load prices (${err.message})` };
  }
}

async function check() {
  if (checking || !cfg) return;
  checking = true;
  $('#check').disabled = true;
  $('#status').textContent = 'Checking…';
  try {
    const results = await Promise.all(cfg.routes.map(async (route) => ({
      route,
      key: routeKey(route),
      legs: await Promise.all(legsOf(route).map((leg) => fetchLeg(route, leg))),
    })));

    const ups = [];
    const day = today();
    for (const { route, key, legs } of results) {
      if (legs.some((l) => l.error)) continue; // only record complete, successful lookups
      const prices = legs.map((l) => l.price);
      const list = (hist.r[key] ||= []);
      const last = list.at(-1);
      prices.forEach((p, i) => {
        const before = last?.[i + 1];
        if (p != null && before != null && p > before) {
          ups.push(`${routeName(route)}, ${legs[i].label.toLowerCase()} +${money.format(p - before)}`);
        }
      });
      if (last?.[0] === day) list.pop(); // keep one entry per day
      const prev = list.at(-1);
      if (!prev || prev.slice(1).some((p, i) => p !== prices[i])) list.push([day, ...prices]);
      hist.last = Date.now();
    }
    const keys = new Set(results.map((r) => r.key));
    for (const k of Object.keys(hist.r)) if (!keys.has(k)) delete hist.r[k];
    saveHistory();

    render(results);
    $('#alert').hidden = !ups.length;
    $('#alert').textContent = `Price went up since the last check: ${ups.join('; ')}.`;
    if (ups.length && cfg.notify && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Travel prices went up', { body: ups.join('\n') });
    }
  } finally {
    checking = false;
    $('#check').disabled = false;
    renderStatus();
  }
}

// Auto-check once a day: on page load, and while the tab stays open.
function checkIfDue() {
  if (cfg && Date.now() - hist.last >= DAY_MS) check();
}
setInterval(checkIfDue, 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => !document.hidden && checkIfDue());

// ---------- rendering ----------

function placeLabel(p, place) {
  return p === 'ryanair' ? `${place.name} (${place.id})` : place.name;
}

function routeName(r) {
  return `${PROVIDERS[r.p]} ${placeLabel(r.p, r.from)} → ${placeLabel(r.p, r.to)}${r.direct ? ', direct only' : ''}`;
}

function fmtMoney(n) {
  return n == null ? '—' : money.format(n);
}

function sum(prices) {
  return prices.some((p) => p == null) ? null : Math.round(prices.reduce((a, b) => a + b, 0) * 100) / 100;
}

function fmtDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function fmtDay(day) {
  return new Date(day * DAY_MS).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function renderSummary() {
  if (!cfg) return;
  const dates = cfg.ret ? `${fmtDate(cfg.out)} – ${fmtDate(cfg.ret)}` : `${fmtDate(cfg.out)}, one-way`;
  $('#summary').textContent = `${dates} · ${cfg.adults} adult${cfg.adults > 1 ? 's' : ''}`;
}

function renderStatus() {
  if (!hist.last) return ($('#status').textContent = '');
  const d = new Date(hist.last);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const date = d.toDateString() === new Date().toDateString() ? 'today' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  $('#status').textContent = `Checked ${date} ${time}`;
}

function render(results) {
  $('#results').innerHTML = cheapestHtml(results) + results.map(routeHtml).join('');
}

// Cheapest way to do the trip across all routes: the cheapest leg in each direction,
// which can mix providers (e.g. bus out, fly back).
function cheapestHtml(results) {
  if (results.length < 2) return '';
  const picks = results[0].legs.map((_, i) => results
    .map(({ route, legs }) => ({ route, leg: legs[i] }))
    .filter(({ leg }) => leg.price != null)
    .sort((a, b) => a.leg.price - b.leg.price)[0]);
  const total = picks.every(Boolean) ? sum(picks.map(({ leg }) => leg.price)) : null;
  return `
    <section class="route">
      <div class="split">
        <h2>Cheapest option</h2>
        <div class="price">${fmtMoney(total)}</div>
      </div>
      ${picks.map((pick, i) => (pick ? `
        <div class="split leg">
          <div>
            <div>${pick.leg.label} · ${fmtDate(pick.leg.date)} · ${PROVIDERS[pick.route.p]}</div>
            <div class="muted">${esc(`${placeLabel(pick.route.p, pick.leg.from)} → ${placeLabel(pick.route.p, pick.leg.to)} · ${legDetail(pick.leg, pick.route)}`)}${bookLink(pick.leg)}</div>
          </div>
          <div class="price">${fmtMoney(pick.leg.price)}</div>
        </div>` : `
        <div class="leg muted">${results[0].legs[i].label}: no prices found</div>`)).join('')}
    </section>`;
}

function routeHtml({ route, key, legs }) {
  const list = hist.r[key] || [];
  return `
    <section class="route">
      <div class="split">
        <h2>${esc(routeName(route))}</h2>
        <div class="price">${fmtMoney(sum(legs.map((l) => l.price)))}</div>
      </div>
      ${legs.map((leg, i) => legHtml(leg, list, i + 1, route)).join('')}
      ${historyHtml(list, legs)}
    </section>`;
}

function legDetail(leg, route) {
  if (leg.error || leg.note) return leg.error || leg.note;
  const days = (Date.parse(leg.arr.slice(0, 10)) - Date.parse(leg.dep.slice(0, 10))) / DAY_MS;
  let detail = `${leg.dep.slice(11)} → ${leg.arr.slice(11)}${days > 0 ? ` +${days}` : ''} · ${leg.info}`;
  const bags = Object.entries(route.bags || {});
  if (bags.length) detail += ` · incl. ${bags.map(([k, b]) => `${b.n}× ${BAGS[k]}`).join(' + ')} (${money.format(bagCost(route))})`;
  return detail;
}

function bookLink(leg) {
  return leg.url ? ` · <a href="${esc(leg.url)}" target="_blank" rel="noopener">Book</a>` : '';
}

function legHtml(leg, list, col, route) {
  return `
    <div class="split leg">
      <div>
        <div>${leg.label} · ${fmtDate(leg.date)}</div>
        <div class="muted">${esc(legDetail(leg, route))}${bookLink(leg)}</div>
      </div>
      <div class="leg-price">
        <div class="price">${fmtMoney(leg.price)}</div>
        ${changeHtml(list, col)}
      </div>
    </div>`;
}

// How the price in column `col` last changed, e.g. "+€3.00 on 1 Oct".
function changeHtml(list, col) {
  if (!list.length) return '';
  const cur = list.at(-1)[col];
  let i = list.length - 1;
  while (i > 0 && list[i - 1][col] === cur) i--;
  if (i === 0) return `<div class="muted">no change since ${fmtDay(list[0][0])}</div>`;
  const prev = list[i - 1][col];
  if (cur == null || prev == null) return `<div class="muted">changed on ${fmtDay(list[i][0])}</div>`;
  const diff = cur - prev;
  const sign = diff > 0 ? '+' : '−';
  return `<div class="muted ${diff > 0 ? 'up' : 'down'}">${sign}${money.format(Math.abs(diff))} on ${fmtDay(list[i][0])}</div>`;
}

function historyHtml(list, legs) {
  if (list.length < 2) return '';
  const showTotal = legs.length > 1;
  const totals = list.map((e) => sum(e.slice(1))).filter((t) => t != null);
  const lowest = totals.length ? ` · lowest ${money.format(Math.min(...totals))}` : '';
  const rows = list.slice().reverse().map((e) => `
    <tr>
      <td>${fmtDay(e[0])}</td>
      ${e.slice(1).map((p) => `<td>${fmtMoney(p)}</td>`).join('')}
      ${showTotal ? `<td>${fmtMoney(sum(e.slice(1)))}</td>` : ''}
    </tr>`).join('');
  return `
    <details>
      <summary>Price history${lowest}</summary>
      <table>
        <tr><th>Date</th>${legs.map((l) => `<th>${l.label}</th>`).join('')}${showTotal ? '<th>Total</th>' : ''}</tr>
        ${rows}
      </table>
    </details>`;
}

// ---------- views ----------

function showPrices() {
  $('#settings-view').hidden = true;
  $('#prices-view').hidden = false;
  renderSummary();
  renderStatus();
}

function showSettings() {
  const f = $('#settings-view').elements;
  const c = cfg || { out: '', ret: '', adults: 1, notify: false, routes: [{ p: 'flixbus' }, { p: 'ryanair' }] };
  f.out.value = c.out;
  f.ret.value = c.ret;
  f.adults.value = c.adults;
  f.notify.checked = c.notify;
  $('#routes').innerHTML = '';
  c.routes.forEach(addRouteRow);
  $('#cancel').hidden = !cfg;
  $('#error').hidden = true;
  $('#prices-view').hidden = true;
  $('#settings-view').hidden = false;
  loadAirports();
}

// ---------- settings: place pickers ----------

function remember(p, place) {
  const label = placeLabel(p, place);
  places.set(`${p}:${label}`, { id: place.id, name: place.name });
  return label;
}

// Accepts a picked suggestion, or a typed name or airport code, e.g. "Zagreb" or "zag".
function resolve(p, text) {
  text = text.trim().toLowerCase();
  for (const [k, v] of places) {
    if (!k.startsWith(`${p}:`)) continue;
    if ([k.slice(p.length + 1), v.name, v.id].some((s) => s.toLowerCase() === text)) return v;
  }
  // Ryanair airport list unavailable: accept a plain IATA code.
  if (p === 'ryanair' && /^[a-z]{3}$/.test(text)) return { id: text.toUpperCase(), name: text.toUpperCase() };
  return null;
}

// Fetches a suggestion list. On failure it says why instead of leaving the dropdown silently empty.
async function fetchList(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`server returned ${res.status}`);
    return await res.json();
  } catch (err) {
    $('#error').hidden = false;
    $('#error').textContent = `Couldn't load suggestions (${err.message}).`;
    return [];
  }
}

let airportsLoaded = false;
async function loadAirports() {
  if (airportsLoaded) return;
  const list = await fetchList('/api/ryanair/airports');
  airportsLoaded = list.length > 0;
  list.sort((a, b) => a.name.localeCompare(b.name));
  $('#ryanair-airports').innerHTML = list.map((a) => `<option value="${esc(remember('ryanair', a))}"></option>`).join('');
}

let rowSeq = 0;
function addRouteRow(r = { p: 'flixbus' }) {
  if ($('#routes').children.length >= MAX_ROUTES) return;
  const n = rowSeq++;
  const row = document.createElement('div');
  row.className = 'route-edit';
  row.innerHTML = `
    <select aria-label="Provider">
      ${Object.entries(PROVIDERS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}
    </select>
    <input name="from" aria-label="From" autocomplete="off">
    <input name="to" aria-label="To" autocomplete="off">
    <button type="button" class="icon-btn" aria-label="Remove route" title="Remove route">×</button>
    <label class="check direct"><input type="checkbox" name="direct"${r.direct ? ' checked' : ''}> Direct only</label>
    <div class="bags">
      <p class="muted">Bags without a fare bundle: how many per flight, and the price of each. Ryanair only shows bag prices while booking, so enter what you last saw and update it when it changes.</p>
      ${Object.entries(BAGS).map(([k, t]) => `
        <fieldset data-bag="${k}">
          <legend class="muted">${t}</legend>
          <div class="pair">
            <input type="number" name="n" min="0" max="9" step="1" placeholder="Qty" aria-label="${t}, how many" value="${r.bags?.[k]?.n ?? ''}">
            <input type="number" name="price" min="0" max="500" step="0.01" placeholder="€ each" aria-label="${t}, price each" value="${r.bags?.[k]?.price ?? ''}">
          </div>
        </fieldset>`).join('')}
    </div>
    <datalist id="dl-${n}-from"></datalist>
    <datalist id="dl-${n}-to"></datalist>`;
  const provider = row.querySelector('select');
  const inputs = [row.querySelector('[name=from]'), row.querySelector('[name=to]')];
  const update = () => {
    const ryanair = provider.value === 'ryanair';
    inputs.forEach((input) => {
      input.setAttribute('list', ryanair ? 'ryanair-airports' : `dl-${n}-${input.name}`);
      input.placeholder = `${input.name === 'from' ? 'From' : 'To'} ${ryanair ? 'airport or code' : 'city'}`;
    });
    row.querySelector('.bags').hidden = !ryanair;
    row.querySelector('.direct').hidden = ryanair;
  };

  provider.value = r.p;
  update();
  for (const input of inputs) {
    if (r[input.name]) input.value = remember(r.p, r[input.name]);
    input.addEventListener('input', () => suggestCities(provider.value, input, `dl-${n}-${input.name}`));
  }
  provider.addEventListener('change', () => {
    inputs.forEach((input) => (input.value = ''));
    update();
  });
  row.querySelector('.icon-btn').addEventListener('click', () => row.remove());
  $('#routes').append(row);
}

const timers = new WeakMap();
function suggestCities(p, input, listId) {
  if (p !== 'flixbus') return;
  clearTimeout(timers.get(input));
  timers.set(input, setTimeout(async () => {
    const q = input.value.trim();
    if (q.length < 2 || places.has(`flixbus:${q}`)) return;
    const cities = await fetchList(`/api/flixbus/cities?q=${encodeURIComponent(q)}`);
    document.getElementById(listId).innerHTML = cities
      .map((c) => `<option value="${esc(remember('flixbus', c))}"></option>`)
      .join('');
  }, 250));
}

// ---------- events ----------

$('#check').addEventListener('click', check);
$('#open-settings').addEventListener('click', showSettings);
$('#cancel').addEventListener('click', showPrices);
$('#add-route').addEventListener('click', () => addRouteRow());

$('#settings-view').elements.notify.addEventListener('change', (e) => {
  if (e.target.checked && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
});

$('#settings-view').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.elements;
  let bagsIncomplete = false;
  const routes = [...document.querySelectorAll('.route-edit')].map((row) => {
    const p = row.querySelector('select').value;
    const route = { p, from: resolve(p, row.querySelector('[name=from]').value), to: resolve(p, row.querySelector('[name=to]').value) };
    if (p === 'flixbus' && row.querySelector('[name=direct]').checked) route.direct = true;
    if (p === 'ryanair') {
      const bags = {};
      for (const set of row.querySelectorAll('.bags fieldset')) {
        const { n, price } = set.elements;
        if (Number(n.value) > 0 && price.value !== '') bags[set.dataset.bag] = { n: Number(n.value), price: Number(price.value) };
        else if (Number(n.value) > 0 || (price.value !== '' && n.value === '')) bagsIncomplete = true;
      }
      if (Object.keys(bags).length) route.bags = bags;
    }
    return route;
  });
  const error =
    f.ret.value && f.ret.value < f.out.value ? 'The return date is before the outbound date.'
    : !routes.length ? 'Add at least one route.'
    : routes.some((r) => !r.from || !r.to) ? 'Pick every place from the suggestions.'
    : routes.some((r) => r.from.id === r.to.id) ? 'A route can’t start and end in the same place.'
    : bagsIncomplete ? 'Give each bag both a quantity and a price.'
    : '';
  $('#error').hidden = !error;
  $('#error').textContent = error;
  if (error) return;

  cfg = { out: f.out.value, ret: f.ret.value, adults: Number(f.adults.value), notify: f.notify.checked, routes };
  writeCookie('tp_cfg', cfg);
  $('#results').innerHTML = '';
  $('#alert').hidden = true;
  showPrices();
  check();
});

// ---------- start ----------

if (cfg) {
  showPrices();
  check();
} else {
  showSettings();
}
