// shared.js
// Shared UI, data loading, dropdown, clue buttons and modals.

// Exports:
// - initShared(config)
// - filterItems(query)
// - incrementGuessCount()
// - updateClueState()
// - getGoalItem()
// - notifyGoalGuessed(item)

let DATA_URL = 'idleon_items_detailed.json';
let IMAGE_BASE = './';
let MAX_RESULTS = 50;
let CLUE_UNLOCKS = { world: 4, category: 5 };
// Streak constants
const STREAK_COOKIE = 'idleondle_streak';
const STREAK_LAST_COOKIE = 'idleondle_streak_last'; // stores ISO date of last increment
// Use local midnight (same logic as game rotation) for daily boundary


// State
let items = [];
let lastQuery = '';
let goalItem = null;
let loadingItems = true;
let guessCount = 0;
let _config = {};
let _streak = 0;
let _streakLast = null; // ISO string of last increment day (midnight reference)

function getLocalDayKey(d=new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseCookieInt(name, fallback=0){ const v = getCookie(name); if(!v) return fallback; const n=Number(v); return Number.isFinite(n)?n:fallback; }
function loadStreak(){
  try { _streak = parseCookieInt(STREAK_COOKIE,0); _streakLast = getCookie(STREAK_LAST_COOKIE) || null; } catch(e){ _streak=0; _streakLast=null; }
  // If last date missing but streak>0, assume today so it doesn't instantly reset
  if(_streak>0 && !_streakLast){ _streakLast = getLocalDayKey(); }
  evaluateStreakReset();
  renderStreak();
}
function saveStreak(){ try { setCookie(STREAK_COOKIE,String(_streak),400); setCookie(STREAK_LAST_COOKIE,getLocalDayKey(),400);} catch(e){} }
function evaluateStreakReset(){
  try {
    if(!_streakLast){ if(_streak!==0){ _streak=0; saveStreak(); } return; }
    const todayKey = getLocalDayKey();
    if(_streakLast === todayKey) return; // already updated today
    // Determine gap in days
    const lastParts = _streakLast.split('-').map(n=>Number(n));
    if(lastParts.length!==3) { _streak=0; saveStreak(); return; }
    const lastDate = new Date(lastParts[0], lastParts[1]-1, lastParts[2]);
    const today = new Date();
    const diffDays = Math.floor((today - lastDate)/86400000);
    if(diffDays > 1){ // missed at least one reset
      _streak = 0;
      saveStreak();
    }
  } catch(e){ /* non-fatal */ }
}
function incrementStreakIfFirstWinToday(){
  try {
    const todayKey = getLocalDayKey();
    if(_streakLast === todayKey) return; // already counted a win today
    _streak += 1;
    _streakLast = todayKey;
    saveStreak();
    animateStreakIncrement();
    renderStreak();
  } catch(e){ /* non-fatal */ }
}
function renderStreak(){
  try {
    const el = document.getElementById('flameStreak');
    const img = document.getElementById('flameIconImg');
    if(el) el.textContent = String(_streak||0);
    // Grey out flame when streak is 0
    if(img){
      if((_streak||0) === 0) img.classList.add('flame-zero'); else img.classList.remove('flame-zero');
    }
  } catch(e){ /* non-fatal */ }
}
function animateStreakIncrement(){
  try {
    // Target the main page flame image; also pulse results page image if present
    const candidates = [document.getElementById('flameIconImg'), document.getElementById('resultsFlameImg')].filter(Boolean);
    if(!candidates.length) return;
    candidates.forEach(img => {
      img.classList.remove('flame-bump');
      void img.offsetWidth; // reflow to restart
      img.classList.add('flame-bump');
    });
  } catch(e){ /* non-fatal */ }
}


// timers used by modals/timers
let goalTimerInterval = null;
let goalModalTimeout = null;

// Utilities
const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const placeholder = (label = '📦') =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">\n      <rect width="100%" height="100%" rx="10" ry="10" fill="#141830" stroke="#2a2f47"/>\n      <text x="50%" y="53%" font-family="Segoe UI, system-ui, sans-serif" font-size="28" fill="#7aa2ff" text-anchor="middle" dominant-baseline="middle">${label}</text>\n    </svg>`
  );

const toWebPath = p => String(p || '')
  .replace(/\\\\/g, '/')
  .replace(/\\/g, '/');

function encodePathSegments(p) {
  return p.split('/').map(seg => encodeURIComponent(seg)).join('/');
}

// ----------------- Toast helper -----------------
// Lightweight, dependency-free toast system. Call showToast(message, opts).
(function () {
  if (typeof window === 'undefined') return;
  if (window.__toastInstalled) return;
  window.__toastInstalled = true;

  function createContainer() {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.setAttribute('aria-live', 'polite');
    c.setAttribute('aria-atomic', 'false');
    // If a container already exists (from previous page module), reuse it
    const existing = document.getElementById('toast-container');
    if (existing) return existing;
    document.body.appendChild(c);
    return c;
  }

  let container = null;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { container = createContainer(); }); else container = createContainer();

  let idCounter = 0;
  window.showToast = function (message, opts = {}) {
    if (!container) container = createContainer();
    const id = ++idCounter;
    // default timeout 3000ms (user preference)
    const timeout = typeof opts.timeout === 'number' ? opts.timeout : 3000;

    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.toastId = id;

    // Simple centered text - remove action/close buttons as requested
    el.textContent = message;
    container.appendChild(el);

    // show
    requestAnimationFrame(() => el.classList.add('show'));

    let hideTimer = timeout > 0 ? setTimeout(remove, timeout) : null;

    el.tabIndex = -1; // not focusable by default

    function remove() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      el.classList.remove('show');
      el.addEventListener('transitionend', () => { if (el.parentNode) el.parentNode.removeChild(el); }, { once: true });
    }

    return { id, element: el, remove };
  };
})();

// Locale-safe lowercase helper: normalises and uses an explicit English locale
// to avoid Turkish dotted/dotless I issues when comparing identifiers/keys.
function safeLower(s) {
  if (s === null || s === undefined) return '';
  try {
    // Normalize then force an English locale lowercase mapping for stable comparisons
    return String(s).normalize('NFC').toLocaleLowerCase('en');
  } catch (e) {
    // Fallback to generic conversion if environment doesn't support locales
    try { return String(s).normalize('NFC').toLowerCase(); } catch (e2) { return String(s).toLowerCase(); }
  }
}

// Cookie helpers: record a win with game name and ISO timestamp.
function setCookie(name, value, days = 365) {
  try {
    if (typeof document === 'undefined') return;
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = 'expires=' + d.toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/`;
  } catch (e) { /* non-fatal */ }
}

// One-time normalization/migration of analytics consent cookie across pages.
// Re-sets 'new_umami_consent' with consistent attributes so it is visible on all routes
// after folder restructures, and loads Umami when consent is already granted.
(function normalizeConsentCookie(){
  try {
    if (typeof document === 'undefined') return;
    const get = (name) => {
      try {
        const pairs = document.cookie.split(';').map(s => s.trim());
        for (const p of pairs) {
          if (!p) continue;
          const idx = p.indexOf('=');
          const k = idx === -1 ? p : p.slice(0, idx);
          const v = idx === -1 ? '' : p.slice(idx + 1);
          if (k === name) return decodeURIComponent(v || '');
        }
      } catch (e) {}
      return undefined;
    };
    // Prefer new cookie; fall back to old if present
    let val = get('new_umami_consent');
    if (val !== 'yes' && val !== 'no') {
      const legacy = get('umami_consent');
      if (legacy === 'yes' || legacy === 'no') val = legacy;
    }
    if (val !== 'yes' && val !== 'no') return; // nothing to normalize

    // Build a cookie string with Path=/ and SameSite=Lax. On production HTTPS, also set Domain=.idleondle.com and Secure.
    const exp = new Date(Date.now() + 365 * 864e5).toUTCString();
    const parts = [
      `new_umami_consent=${encodeURIComponent(val)}`,
      `expires=${exp}`,
      'path=/',
      'SameSite=Lax'
    ];
    try {
      const host = String(location.hostname || '').toLowerCase();
      const isHttps = String(location.protocol || '').toLowerCase() === 'https:';
      if (isHttps && (host === 'idleondle.com' || host.endsWith('.idleondle.com'))) {
        parts.push('domain=.idleondle.com');
        parts.push('Secure');
      }
    } catch (e) { /* ignore env issues */ }
    try { document.cookie = parts.join('; '); } catch (e) { /* non-fatal */ }

    // Load Umami script if consent is yes and script not present yet.
    if (val === 'yes') {
      try {
        if (!document.querySelector('script[data-website-id]')) {
          const s = document.createElement('script');
          s.defer = true;
          s.src = 'https://cloud.umami.is/script.js';
          s.setAttribute('data-website-id', 'ad9a1bfc-29d8-4cab-843e-a7a2d9a142f3');
          document.head.appendChild(s);
        }
      } catch (e) { /* non-fatal */ }
    }
  } catch (e) { /* silent */ }
})();

function recordWin(game) {
  try {
    if (typeof document === 'undefined') return;
  const now = new Date().toISOString();
  const guesses = Number(arguments[1]) || Number(guessCount) || 0;
  const payload = { game: String(game || 'unknown'), time: now, guesses };
  // Store a general last-win cookie and a per-game payload cookie (JSON).
  setCookie('idleondle_last_win', JSON.stringify(payload), 365);
  const safeName = safeLower(String(game || 'unknown').replace(/[^a-z0-9_-]+/gi, '_'));
  setCookie(`idleondle_win_${safeName}`, JSON.stringify({ time: now, guesses }), 365);
  } catch (e) { /* non-fatal */ }
}

// Read cookie helper and check whether a game was won today (local date)
function getCookie(name) {
  try {
    if (typeof document === 'undefined') return null;
    const pairs = document.cookie.split(';').map(s => s.trim());
    for (const p of pairs) {
      if (!p) continue;
      const idx = p.indexOf('=');
      const k = idx === -1 ? p : p.slice(0, idx);
      const v = idx === -1 ? '' : p.slice(idx + 1);
      if (k === name) return decodeURIComponent(v || '');
    }
  } catch (e) { /* non-fatal */ }
  return null;
}
function hasWinToday(game) {
  try {
  const key = `idleondle_win_${safeLower(String(game || 'unknown').replace(/[^a-z0-9_-]+/gi, '_'))}`;
    const val = getCookie(key);
    if (!val) return false;
    // Support both legacy ISO string values and current JSON payloads
    try {
      const parsed = JSON.parse(val);
      if (parsed && parsed.time) {
        const then = new Date(parsed.time);
        if (isNaN(then.getTime())) return false;
        const now = new Date();
        return then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate();
      }
    } catch (e) {
      const then = new Date(val);
      if (isNaN(then.getTime())) return false;
      const now = new Date();
      return then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate();
    }
  } catch (e) { return false; }
}

function getWinPayload(game) {
  try {
  const key = `idleondle_win_${safeLower(String(game || 'unknown').replace(/[^a-z0-9_-]+/gi, '_'))}`;
    const v = getCookie(key);
    if (!v) return null;
    try { const parsed = JSON.parse(v); if (parsed && parsed.time) return parsed; } catch (e) { /* ignore */ }
    // legacy ISO-string value
    const then = new Date(v);
    if (isNaN(then.getTime())) return null;
    return { time: then.toISOString(), guesses: 0 };
  } catch (e) { return null; }
}

function detectGameFromPath() {
  try {
  // Allow pages to explicitly set the current game via <body data-game="pack">.
  try { const explicit = document?.body?.dataset?.game; if (explicit) return safeLower(String(explicit)); } catch (e) {}
  const path = (location.pathname || '') + (location.hash || '') + (location.search || '');
  const p = safeLower(path);
  // Detect hard-card pages explicitly so hard mode uses a separate cookie/identity
  if (p.includes('hardmonsterguesser') || p.includes('hardmonster') || p.includes('/hardmonster/')) return 'hard_monster';
  if (p.includes('hardcardguesser') || p.includes('hardcard')) return 'hard_card';
  if (p.includes('card')) return 'card';
  if (p.includes('monsterguesser') || p.includes('monster')) return 'monster';
  if (p.includes('harditemguesser') || p.includes('harditem')) return 'hard_item';
  // New: meal guesser page
  if (p.includes('mealguesser')) return 'meal';
  // New: pack guesser page
  if (p.includes('/pack/')) return 'pack';
    return 'item';
  } catch (e) { return 'item'; }
}

function resolveIcon(p) {
  const cleaned = toWebPath(p).replace(/^\.?\//, '');
  // Normalise IMAGE_BASE in a few useful forms.
  const rawBase = String(IMAGE_BASE || '').replace(/\/$/, ''); // keep any ../ prefix
  const base = rawBase === '.' ? '' : rawBase;
  // baseNorm is the base with any leading ../ or ./ removed; used to detect
  // when cleaned already contains the same folder name (eg 'images/...') so
  // we avoid producing '.../images/images/...'
  const baseNorm = rawBase.replace(/^(?:\.\.\/)+/, '').replace(/^\.?\//, '').replace(/\/$/, '');
  if (baseNorm && (cleaned === baseNorm || cleaned.startsWith(baseNorm + '/'))) {
    // Remove duplicate baseNorm from cleaned when joining with rawBase
    const tail = cleaned === baseNorm ? '' : cleaned.slice(baseNorm.length + 1);
    const joined = base ? (base + (tail ? '/' + tail : '')) : (tail || baseNorm);
    return encodePathSegments(joined).replace(/\/{2,}/g, '/');
  }

  // If no explicit base is provided, try to compute a relative prefix based on
  // the current document location so pages inside a subfolder (eg `html/`)
  // can still reference images placed at the project root.
  let relPrefix = '';
  try {
    if (!base && typeof document !== 'undefined' && document.location && document.location.pathname) {
      // Count path segments (ignore leading/trailing slashes). If the page
      // looks like a file (last segment contains a dot), we don't count it.
      const parts = document.location.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1] || '';
      const isFile = last.includes('.');
      const depth = Math.max(0, parts.length - (isFile ? 1 : 0));
      // We only need to go up one level per depth to reach project root.
      if (depth > 0) relPrefix = '../'.repeat(depth);
    }
  } catch (e) {
    relPrefix = '';
  }

  // Don't double-prefix if cleaned already climbs up or is absolute.
  if (cleaned.startsWith('..') || cleaned.startsWith('/')) {
    const joined = base ? `${base}/${cleaned}` : cleaned;
    return encodePathSegments(joined).replace(/\/{2,}/g, '/');
  }

  const joined = base ? `${base}/${cleaned}` : `${relPrefix}${cleaned}`;
  return encodePathSegments(joined).replace(/\/{2,}/g, '/');
}

function flattenFromJson(json) {
  const out = [];
  const pushItem = (name, obj) => {
    if (!obj || typeof obj !== 'object') return;
    const iconRaw = obj.icon || obj.Icon || obj.image || obj.Image;
    if (!name || !iconRaw) return;
    out.push({ name: String(name), icon: resolveIcon(iconRaw), raw: obj });
  };
  if (Array.isArray(json)) {
    for (const obj of json) pushItem(obj?.name || obj?.Name || obj?.item || obj?.title, obj);
    return out;
  }
  for (const [_, val] of Object.entries(json)) {
    if (Array.isArray(val)) {
      for (const obj of val) pushItem(obj?.name || obj?.Name || obj?.item || obj?.title, obj);
    } else if (val && typeof val === 'object') {
      for (const [itemName, obj] of Object.entries(val)) pushItem(itemName, obj);
    }
  }
  return out;
}

async function loadItems() {
  let text = '';
  loadingItems = true;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status} ${res.statusText}`);
    text = await res.text();
  } catch (err) {
    console.error(err);
    alert(`Could not fetch ${DATA_URL}. Run a local server (don’t open as file://).`);
    loadingItems = false;
    return;
  }

  try {
    const json = JSON.parse(text);
    const flat = flattenFromJson(json);
    if (flat.length) {
      items = flat;
      console.info(`Loaded ${items.length} items from JSON`);
      loadingItems = false;
      return;
    }
  } catch { /* fall back ignored: your file is JSON */ }

  // Loose text fallback
  const iconKey = ' icon ';
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const loose = [];
  for (const line of lines) {
    const i = line.indexOf(iconKey); if (i < 0) continue;
    const name = line.slice(0, i).trim();
    const rest = line.slice(i + iconKey.length);
    const markers = [' level', ' type ', ' source ', ' stats '];
    let j = rest.length; for (const m of markers) { const k = rest.indexOf(m); if (k !== -1 && k < j) j = k; }
    const icon = resolveIcon(rest.slice(0, j).trim());
    if (name && icon) loose.push({ name, icon, raw: line });
  }
  items = loose;
  console.info(`Loaded ${items.length} items from loose text`);
  loadingItems = false;
}

function filterItems(q) {
  const s = (q || '').trim();
  if (!s) return [];
  const isCardPage = (location.pathname || '').endsWith('cardGuesser.html') || (location.href || '').includes('card');
  const normalizeForCard = (str) => safeLower(String(str || '').replace(/\bcard\b/ig, '').replace(/\s{2,}/g, ' ').trim());
  if (isCardPage) {
    const qs = normalizeForCard(s);
    // If stripping 'card' from the query leaves nothing, don't return everything
    if (!qs) return [];
    return items.filter(it => normalizeForCard(it.name).includes(qs)).slice(0, MAX_RESULTS);
  }
  const sl = safeLower(s);
  return items.filter(it => safeLower(it.name).includes(sl)).slice(0, MAX_RESULTS);
}

// Render dropdown results; calls onSelect(item) when an item is chosen.
function render(list) {
  const ul = document.getElementById('results');
  const dd = document.getElementById('dropdown');
  if (!ul || !dd) return;
  ul.innerHTML = '';
  if (!list.length) {
    if (loadingItems) { dd.classList.remove('open'); return; }
    ul.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'item';
    li.style.cursor = 'default';
    const txt = document.createElement('div');
    txt.className = 'name';
    if (!items || items.length === 0) {
      txt.textContent = 'No items loaded (run a local server to load JSON).';
      li.appendChild(txt);
      ul.appendChild(li);
      dd.classList.add('open');
      return;
    }
    dd.classList.remove('open');
    return;
  }

  const frag = document.createDocumentFragment();
  // Detect whether we're rendering dropdown on the cardGuesser page so we
  // can alter the visible label (remove the word "card"). Do not mutate
  // the original item object - only change the displayed text.
  const isCardPage = (location.pathname || '').endsWith('cardGuesser.html') || (location.href || '').includes('card');
  for (const it of list) {
    const li = document.createElement('li');
    li.className = 'item';
    const img = document.createElement('img');
    img.alt = it.name;
    img.src = it.icon;
    img.addEventListener('error', () => { img.src = placeholder(); });
    const nameDiv = document.createElement('div');
    nameDiv.className = 'name';
    // When on the card guessaer page, remove the standalone word "card"
    // (case-insensitive) from the display label and collapse extra spaces.
    let displayName = it.name || '';
    if (isCardPage) {
      displayName = displayName.replace(/\bcard\b/ig, '').replace(/\s{2,}/g, ' ').trim();
    }
    nameDiv.textContent = displayName;
    li.appendChild(img);
    li.appendChild(nameDiv);
    li.addEventListener('click', () => {
      // Increment guess counter for any selection attempt
      incrementGuessCount();
      // Remove item so it won't appear in future searches
      items = items.filter(item => item.name !== it.name);
      const dd = document.getElementById('dropdown');
      if (dd) dd.classList.remove('open');
      const inputEl = document.getElementById('search');
      if (inputEl) {
        // Put the chosen value into the box then immediately clear it so user can type again
        // (and dropdown logic won't think query is unchanged).
        inputEl.value = '';
        lastQuery = '';
        try { inputEl.focus(); } catch (e) { /* non-fatal */ }
      }
      // Page-specific selection logic / modal trigger
      if (typeof _config.onSelect === 'function') {
        try { _config.onSelect(it); } catch (e) { console.warn('onSelect handler failed', e); }
      } else {
        try { if (goalItem && it && it.name === goalItem.name) notifyGoalGuessed(it); } catch (e) { /* non-fatal */ }
      }
      // Force a render pass with empty list so next keystroke triggers fresh open immediately
      render([]);
    });
    frag.appendChild(li);
  }
  ul.appendChild(frag);
  dd.classList.add('open');
}

function selectGoalItem() {
  function mulberry32(a) { return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
  function seededShuffle(array, seed) { let rng = mulberry32(seed); let a = array.slice(); for (let i = a.length - 1; i > 0; i--) { let j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function getLocalDayIndex() { let now = new Date(); let startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return Math.floor(startOfDay.getTime() / 86400000); }
  let dayIndex = getLocalDayIndex();
  let cycle = Math.floor(dayIndex / Math.max(1, items.length)) + 11;
  // Allow pages to specify a deterministic seed offset via initShared({ seedOffset })
  // so variants (like hard mode) can use a different daily sequence.
  try {
    const offset = Number(_config?.seedOffset || 0) || 0;
    if (offset) cycle = cycle + offset;
  } catch (e) { /* ignore */ }
  let shuffled = seededShuffle(items, cycle);
  let pos = items.length ? (dayIndex % items.length) : 0;
  goalItem = shuffled[pos];
  //console.log(`Selected goal item: ${goalItem?.name || 'none'}`);
}

// Public helper: given an array length and optional seedOffset, return today's deterministic index
// matching the internal selectGoalItem logic (cycle + shuffle + modulo).
export function getDailyDeterministicIndex(length, seedOffset = 0) {
  try {
    if (!length || length <= 0) return 0;
    function getLocalDayIndex() { let now = new Date(); let startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return Math.floor(startOfDay.getTime() / 86400000); }
    const dayIndex = getLocalDayIndex();
    let cycle = Math.floor(dayIndex / Math.max(1, length)) + 10 + (Number(seedOffset)||0);
    // Use the same mulberry32 + Fisher-Yates shuffle just to derive ordering, then take position.
    function mulberry32(a) { return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
    function seededShuffle(length, seed) { let rng = mulberry32(seed); const arr = Array.from({length}, (_,i)=>i); for (let i = arr.length - 1; i > 0; i--) { let j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
    const order = seededShuffle(length, cycle);
    const pos = dayIndex % length;
    return order[pos] || 0;
  } catch(e) { return 0; }
}

// Show/hide goal modal and timer
function showGoalModal(item) {
  const modal = document.getElementById('goalModal');
  const icon = document.getElementById('goalIcon');
  const name = document.getElementById('goalName');
  const timer = document.getElementById('goalTimer');
  if (!modal || !icon || !name || !timer) return;
  icon.src = item.icon || placeholder();
  icon.alt = item.name || 'item';
  name.textContent = item.name || '';
  // goalGuesses parameter optional: if provided, use it; otherwise use current guessCount
  const argGuesses = (arguments.length > 1 && typeof arguments[1] === 'number') ? arguments[1] : null;
  try { document.getElementById('goalGuesses').textContent = String(argGuesses !== null ? argGuesses : (guessCount || 0)); } catch (e) {}
  modal.setAttribute('aria-hidden', 'false');

  // Insert a small title image under the guesses count so all pages show the
  // project's title inside the goal modal. Reuse the element if already present.
  try {
    const guessesEl = document.getElementById('goalGuesses');
    let container = guessesEl && guessesEl.parentNode ? guessesEl.parentNode : null;
    // Fallback: insert before the footer inside the modal panel
    if (!container) container = modal.querySelector('.goal-panel') || modal;
    if (container) {
      let titleImg = document.getElementById('goalTitleImg');
      if (!titleImg) {
        titleImg = document.createElement('img');
        titleImg.id = 'goalTitleImg';
        titleImg.className = 'goal-title-img';
        // keep image small and centered
        titleImg.style.width = '180px';
        titleImg.style.display = 'block';
        titleImg.style.margin = '8px auto 0';
      }
      // Resolve the path relative to IMAGE_BASE so it works from any page
      try { titleImg.src = resolveIcon('images/title.png'); } catch (e) { titleImg.src = '../images/title.png'; }
      titleImg.alt = 'Idleondle';
      // Insert if not already a direct sibling after the guesses container
      if (titleImg.parentNode !== container) container.insertBefore(titleImg, guessesEl ? guessesEl.nextSibling : null);
    }
  } catch (e) { /* non-fatal */ }

  function update() {
    const now = new Date();
    const midnight = new Date(now); midnight.setHours(24,0,0,0);
    const diff = midnight - now;
    if (diff <= 0) { timer.textContent = '00:00:00'; clearInterval(goalTimerInterval); goalTimerInterval = null; return; }
    const hrs = String(Math.floor(diff / (1000*60*60))).padStart(2,'0');
    const mins = String(Math.floor((diff % (1000*60*60)) / (1000*60))).padStart(2,'0');
    const secs = String(Math.floor((diff % (1000*60)) / 1000)).padStart(2,'0');
    timer.textContent = `${hrs}:${mins}:${secs}`;
  }
  update();
  if (goalTimerInterval) clearInterval(goalTimerInterval);
  goalTimerInterval = setInterval(update, 1000);

  const close = document.getElementById('goalClose');
  if (close) close.onclick = () => hideGoalModal();
  modal.onclick = (e) => { if (e.target === modal) hideGoalModal(); };

  // (Meal-specific spice injection removed; now handled solely by mealGuesser.js)
}

function hideGoalModal() {
  const modal = document.getElementById('goalModal');
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  if (goalTimerInterval) { clearInterval(goalTimerInterval); goalTimerInterval = null; }
}

function incrementGuessCount() {
  guessCount = (guessCount || 0) + 1;
  try { document.getElementById('goalGuesses').textContent = String(guessCount); } catch (e) {}
  // Expose current guess count globally for modules that need to react (e.g., overlays on resize)
  try { if (typeof window !== 'undefined') window.guessCount = guessCount; } catch (e) { /* non-fatal */ }
  updateClueState();
  // Emit an event so any page-specific module (e.g. cardGuesser) can react to guesses.
  try {
    if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent('guess:updated', { detail: { guessCount } }));
    }
  } catch (e) { /* non-fatal */ }
}

function updateClueState() {
  const btnWorld = document.getElementById('guessBtn1');
  const btnCategory = document.getElementById('guessBtn2');
  const note1 = document.getElementById('note1');
  const note2 = document.getElementById('note2');
  const remainingWorld = Math.max(0, (CLUE_UNLOCKS.world || 0) - guessCount);
  const remainingCategory = Math.max(0, (CLUE_UNLOCKS.category || 0) - guessCount);
  // Track previous locked state so we only show a toast when the button
  // transitions from locked -> unlocked.
  try {
    if (btnWorld) btnWorld.__prevLocked = btnWorld.__prevLocked === undefined ? !!(btnWorld.disabled || btnWorld.classList.contains('locked')) : btnWorld.__prevLocked;
    if (btnCategory) btnCategory.__prevLocked = btnCategory.__prevLocked === undefined ? !!(btnCategory.disabled || btnCategory.classList.contains('locked')) : btnCategory.__prevLocked;
  } catch (e) { /* ignore */ }

  if (btnWorld) {
    if (remainingWorld > 0) {
      btnWorld.disabled = true;
      btnWorld.classList.add('locked');
      if (note1) note1.textContent = `${remainingWorld} ${remainingWorld === 1 ? 'guess' : 'guesses'} left`;
    } else {
      const wasLocked = !!(btnWorld.disabled || btnWorld.classList.contains('locked'));
      btnWorld.disabled = false;
      btnWorld.classList.remove('locked');
      if (note1) note1.textContent = '';
      if (wasLocked) {
        try {
          if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
            // visually indicate the button has just been unlocked
            try { btnWorld.classList.add('unlocked-outline'); } catch (e) {}
            // remove the outline when the user interacts with the button
            try { btnWorld.addEventListener('click', function _rm() { btnWorld.classList.remove('unlocked-outline'); btnWorld.removeEventListener('click', _rm); }); } catch (e) {}
            showToast('Clue unlocked: World', { timeout: 3000 });
          }
        } catch (e) { /* ignore */ }
      }
    }
  } else if (note1) {
    note1.textContent = remainingWorld > 0 ? `${remainingWorld} ${remainingWorld === 1 ? 'guess' : 'guesses'} left` : '';
  }

  if (btnCategory) {
    if (remainingCategory > 0) {
      btnCategory.disabled = true;
      btnCategory.classList.add('locked');
      if (note2) note2.textContent = `${remainingCategory} ${remainingCategory === 1 ? 'guess' : 'guesses'} left`;
    } else {
      const wasLocked = !!(btnCategory.disabled || btnCategory.classList.contains('locked'));
      btnCategory.disabled = false;
      btnCategory.classList.remove('locked');
      if (note2) note2.textContent = '';
      if (wasLocked) {
        try {
          if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
            try { btnCategory.classList.add('unlocked-outline'); } catch (e) {}
            try { btnCategory.addEventListener('click', function _rm2() { btnCategory.classList.remove('unlocked-outline'); btnCategory.removeEventListener('click', _rm2); }); } catch (e) {}
            // Determine contextual label for the second clue (category/effect/etc.)
            let catLabel = 'Category';
            try {
              const g = typeof detectGameFromPath === 'function' ? detectGameFromPath() : '';
              if (g === 'meal') catLabel = 'Meal effect';
            } catch (e) { /* fallback keeps default */ }
            // Improve accessibility hint when unlocking on meal page
            try {
              if (btnCategory && catLabel === 'Meal effect') {
                btnCategory.setAttribute('aria-label', 'Meal effect clue unlocked');
              }
            } catch (e) { /* non-fatal */ }
            showToast(`Clue unlocked: ${catLabel}`, { timeout: 3000 });
          }
        } catch (e) { /* ignore */ }
      }
    }
  } else if (note2) {
    note2.textContent = remainingCategory > 0 ? `${remainingCategory} ${remainingCategory === 1 ? 'guess' : 'guesses'} left` : '';
  }
}

// Called by page-specific code when the selected item matched the goal.
function notifyGoalGuessed(it) {
  try {
    const dropdownEl = document.getElementById('dropdown'); if (dropdownEl) { dropdownEl.classList.remove('open'); dropdownEl.style.display = 'none'; dropdownEl.setAttribute('aria-hidden', 'true'); }
  } catch (e) {}
  try {
    const inputEl = document.getElementById('search'); const comboWrap = document.getElementById('combo'); if (inputEl) { inputEl.style.display = 'none'; inputEl.disabled = true; inputEl.setAttribute('aria-hidden', 'true'); } if (comboWrap) { comboWrap.style.display = 'none'; comboWrap.setAttribute('aria-hidden', 'true'); comboWrap.classList.add('goal-guessed'); }
  } catch (e) {}
  if (typeof goalModalTimeout !== 'undefined' && goalModalTimeout) { clearTimeout(goalModalTimeout); }
  // Notify listeners that the correct item was guessed so page modules can react (e.g. unblur image)
  try { if (typeof document !== 'undefined' && typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('guess:correct', { detail: { item: it } })); } catch (e) {}
  // Fallback: directly call cardGuesser API if present (covers timing issues)
  try { if (typeof window !== 'undefined' && window.cardGuesser && typeof window.cardGuesser.setCardBlur === 'function') window.cardGuesser.setCardBlur(0); } catch (e) {}
  // Show the modal after a short delay (1s) to allow UI to settle
  // Record the win in cookies for analytics/local tracking across pages.
  try {
    // Detect game type from pathname or href. Default to 'item'.
  // Use unified detection helper so hard-card pages are distinguished correctly
  let game = 'item';
  try { game = detectGameFromPath(); } catch (e) { /* fallback keeps item */ }
    // Allow page modules to specify a friendly game name on the item object (optional)
  if (it && it._gameName) game = it._gameName;
  recordWin(game, Number(guessCount) || 0);
  } catch (e) { /* non-fatal */ }

  // Increment streak only for the first completed game of the day across all pages
  try { incrementStreakIfFirstWinToday(); } catch (e) { /* non-fatal */ }

  goalModalTimeout = setTimeout(() => { showGoalModal(it); goalModalTimeout = null; }, 1000);
}

// Initialize shared UI and behavior. Accepts config:
// { dataUrl, imageBase, maxResults, clueUnlocks, onSelect(item), guessButtonHandlers: { guessBtn1: fn, guessBtn2: fn } }
export async function initShared(config = {}) {
  _config = config || {};
  DATA_URL = config.dataUrl || DATA_URL;
  IMAGE_BASE = config.imageBase || IMAGE_BASE;
  MAX_RESULTS = config.maxResults || MAX_RESULTS;
  CLUE_UNLOCKS = Object.assign({}, CLUE_UNLOCKS, config.clueUnlocks || {});

  // If this is the monster guesser page, set clue unlock thresholds very high
  // so the clue buttons reflect the requested "999 guesses" behavior.
  try {
    const game = detectGameFromPath();
    if (game === 'monster') {
      CLUE_UNLOCKS = { world: 999, category: 999 };
    } else if (game === 'pack') {
      // Pack guesser only uses the category clue button (guessBtn2), but set both for safety
      CLUE_UNLOCKS = { world: 999, category: 999 };
    }
  } catch (e) { /* non-fatal */ }

  await loadItems();
  // If requested, exclude entries flagged in source JSON
  try {
    if (config && config.exclude && Array.isArray(items) && items.length) {
      const before = items.length;
      const isYes = (v) => {
        if (v === true || v === 1) return true;
        const s = (v == null ? '' : String(v)).trim().toLowerCase();
        return s === 'yes' || s === 'true' || s === '1';
      };
      items = items.filter(it => {
        const flag = it?.raw?.exclude ?? it?.raw?.Excluded ?? it?.raw?.EXCLUDE;
        return !isYes(flag);
      });
      const removed = before - items.length;
      console.log(`[shared] exclude filter active: removed ${removed} of ${before}; remaining ${items.length}`);
      if (items.length === 0) {
        console.warn('[shared] exclude filter removed all items; game will have no candidates until data changes.');
      }
    }
  } catch (e) { console.warn('Exclude filtering failed', e); }
  selectGoalItem();

  // Render page switch buttons (inserted after the site title). Use imageBase if present.
  function renderPageSwitch(imageBase) {
    try {
      const titleEl = document.querySelector('.site-title');
      if (!titleEl) return;
  // Use an existing .page-switch if present in the HTML; otherwise create one.
  let wrap = document.querySelector('.page-switch');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'page-switch'; }
      const makeBtn = (href, id, imgSrc, alt) => {
        const a = document.createElement('a'); a.href = href; a.className = 'page-btn'; a.id = id; a.title = alt;
        const img = document.createElement('img');
        // If imageBase is set, use it as prefix unless imgSrc already contains it
        const prefix = String(imageBase || '').replace(/\/$/, '');
        const cleaned = imgSrc.replace(/^\.?\//, '');
        img.src = prefix ? `${prefix}/${cleaned}` : cleaned;
        img.alt = alt;
        a.appendChild(img);
        return a;
      };
  // Left: item, card, monster, meal (new)
  // Detect whether the current document is inside the `html/` folder so
  // generated hrefs point to the right location when pages are opened from
  // the repo root or from the `html/` subfolder.
  const parts = (location.pathname || '').split('/').filter(Boolean);

  const indexHref = '../item/';
  const cardHref = '../card/';
  const monsterHref = '../monster/';
  const mealHref = '../meal/';
  const packHref = '../pack/';

      // Ensure the switch has the three expected buttons. If static HTML provided
      // them, update their href/img; otherwise append new buttons.
      const ensureBtn = (href, id, imgSrc, alt) => {
        const existingBtn = wrap.querySelector('#' + id);
        if (existingBtn) {
          existingBtn.href = href;
          const imgEl = existingBtn.querySelector('img');
          if (imgEl) {
            const prefix = String(imageBase || '').replace(/\/$/, '');
            const cleaned = imgSrc.replace(/^\.?\//, '');
            imgEl.src = prefix ? `${prefix}/${cleaned}` : cleaned;
            imgEl.alt = alt;
          }
          return existingBtn;
        }
        const btn = makeBtn(href, id, imgSrc, alt);
        wrap.appendChild(btn);
        return btn;
      };

  // Only ensure the original three buttons (items, cards, monster). The Meal button
  // is now required to be present statically in each HTML file so we no longer
  // inject or auto-create it here. This avoids path duplication issues and keeps
  // navigation fully author-controlled per user request.
  ensureBtn(indexHref, 'btn-items', '../images/Helmets/Copper Helmet.png', 'Item Guesser');
  ensureBtn(cardHref, 'btn-cards', '../images/card.png', 'Card Guesser');
  ensureBtn(monsterHref, 'btn-monster', '../images/Enemies/carrotman-6_thumb.png', 'Monster Guesser');
  ensureBtn(mealHref, 'btn-meal', '../images/Spice/36px-Jungle_Spice.png', 'Meal Guesser');
  ensureBtn(packHref, 'btn-pack', '../images/Gem.png', 'Pack Guesser');
  // NOTE: meal button intentionally not auto-created anymore.
  // If this is a hard-mode page, change the appropriate page button to a red "hard" button
    try {
  // Determine hard type: 'item' for HardItemGuesser, 'card' for HardCardGuesser,
  // 'monster' for HardMonster, or allow pages to explicitly set document.body.dataset.hard.
      let hardType = null;
      if ((location.pathname || '').endsWith('HardItemGuesser.html') || (location.href || '').includes('harditem')) hardType = 'item';
      if ((location.pathname || '').endsWith('HardCardGuesser.html') || (location.href || '').includes('hardcard')) hardType = 'card';
  if ((location.pathname || '').includes('/hardmonster/') || (location.href || '').includes('hardmonster') || (function(){ try { return detectGameFromPath() === 'hard_monster'; } catch(e){ return false; } })()) hardType = 'monster';
      if (typeof document !== 'undefined' && document.body?.dataset?.hard) hardType = document.body.dataset.hard;

      if (hardType) {
        const prefix = String(imageBase || '').replace(/\/$/, '');
        if (hardType === 'item') {
          const btnItemsEl = wrap.querySelector('#btn-items');
          if (btnItemsEl) {
            const imgEl = btnItemsEl.querySelector('img');
            if (imgEl) {
              const cleaned = 'Premium Helmets/Diamon Horns.png';
              imgEl.src = prefix ? `${prefix}/${cleaned}` : cleaned;
              imgEl.alt = 'Diamon Horns';
            }
            btnItemsEl.classList.add('hard');
          }
        }
        if (hardType === 'card') {
          const btnCardsEl = wrap.querySelector('#btn-cards');
          if (btnCardsEl) {
            const imgEl = btnCardsEl.querySelector('img');
            if (imgEl) {
              const cleaned = 'hardcard.png';
              imgEl.src = prefix ? `${prefix}/${cleaned}` : cleaned;
              imgEl.alt = 'Hard Card';
            }
            btnCardsEl.classList.add('hard');
          }
        }
        if (hardType === 'monster') {
          const btnMonsterEl = wrap.querySelector('#btn-monster');
          if (btnMonsterEl) {
            const imgEl = btnMonsterEl.querySelector('img');
            if (imgEl) {
              const cleaned = 'Enemies/kattlekruk-88_thumb.png';
              imgEl.src = prefix ? `${prefix}/${cleaned}` : cleaned;
              imgEl.alt = 'Hard Monster';
            }
            btnMonsterEl.classList.add('hard');
          }
        }
      }
    } catch (e) { /* non-fatal */ }
  // If we created the element, insert it after the title. If it already
  // existed in the HTML, it should already be in place.
  if (!document.querySelector('.page-switch')) titleEl.insertAdjacentElement('afterend', wrap);
  else if (!wrap.parentNode) titleEl.insertAdjacentElement('afterend', wrap);
  // Determine current page and set visual states on switcher buttons.
  const _pathname = (location.pathname || '').toLowerCase();
  const _href = (location.href || '').toLowerCase();
  const isCard = _pathname.endsWith('cardguesser.html') || _href.includes('cardguesser.html') || _href.includes('card'); // Do something about hard card
  const isMonster = _pathname.endsWith('monsterguesser.html') || _href.includes('monsterguesser.html') || _href.includes('monster');
  const isMeal = _pathname.endsWith('mealguesser.html') || _href.includes('mealguesser.html') || _href.includes('meal');
  const isPack = _pathname.endsWith('/pack/index.html') || _href.includes('/pack/') || _href.includes('packguesser.html') || /(^|\/)pack(\/$|$)/.test(_pathname);
  // Recompute hardType for later decisions (keep consistent with earlier detection)
  const hardType = (typeof document !== 'undefined' && document.body?.dataset?.hard) ? document.body.dataset.hard :
    ((location.pathname || '').endsWith('HardItemGuesser.html') || (location.href || '').includes('harditem')) ? 'item' :
    ((location.pathname || '').endsWith('HardCardGuesser.html') || (location.href || '').includes('hardcard')) ? 'card' :
    (((location.pathname || '').includes('/hardmonster/') || (location.href || '').includes('hardmonster') || (function(){ try { return detectGameFromPath() === 'hard_monster'; } catch(e){ return false; } })()) ? 'monster' : null);
  const isHardAny = !!hardType;
  const isItems = !isCard && !isMonster && !isMeal && !isPack;

  const btnItems = document.getElementById('btn-items');
  const btnCards = document.getElementById('btn-cards');
  const btnMonster = document.getElementById('btn-monster');
  const btnMeal = document.getElementById('btn-meal');
  const btnPack = document.getElementById('btn-pack');

  // reset classes/styles
  [btnItems, btnCards, btnMonster, btnMeal, btnPack].forEach(b => { if (!b) return; b.classList.remove('active','complete','hard'); b.style.background = ''; });

  // Mark hard page button red depending on hard type
  if (hardType === 'item' && btnItems) { btnItems.classList.add('hard'); btnItems.style.background = '#c0392b'; }
  if (hardType === 'card' && btnCards) { btnCards.classList.add('hard'); btnCards.style.background = '#c0392b'; }

  // Mark completed (green) if the per-game cookie shows a win today
  try {
  // Do not mark the hard-mode page button as complete when we're on hard-mode;
  // hard mode must remain visibly red. Only mark item/card as complete on non-hard pages.
  if (hardType !== 'item' && btnItems && hasWinToday('item')) { btnItems.classList.add('complete'); btnItems.style.background = '#2ecc71'; }
    if (hardType !== 'card' && btnCards && hasWinToday('card')) { btnCards.classList.add('complete'); btnCards.style.background = '#2ecc71'; }
  if (hardType !== 'monster' && btnMonster && hasWinToday('monster')) { btnMonster.classList.add('complete'); btnMonster.style.background = '#2ecc71'; }
  if (btnMeal && hasWinToday('meal')) { btnMeal.classList.add('complete'); btnMeal.style.background = '#2ecc71'; }
  if (btnPack && hasWinToday('pack')) { btnPack.classList.add('complete'); btnPack.style.background = '#2ecc71'; }
    // Hard-item completed may be tracked under 'hard_item'
  if (hardType !== 'item' && btnItems && hasWinToday('hard_item')) { btnItems.classList.add('complete'); btnItems.style.background = '#2ecc71'; }
    // Hard-card completed may be tracked under 'hard_card'
  if (hardType !== 'card' && btnCards && hasWinToday('hard_card')) { btnCards.classList.add('complete'); btnCards.style.background = '#2ecc71'; }
  // Hard-monster completed may be tracked under 'hard_monster'
  if (hardType !== 'monster' && btnMonster && hasWinToday('hard_monster')) { btnMonster.classList.add('complete'); btnMonster.style.background = '#2ecc71'; }
  } catch (e) { /* non-fatal */ }

  // Mark active (yellow) -- higher priority than complete so we override background
  // If this is the hard-mode page, keep the left button red instead of marking it active
  if (isItems && btnItems && hardType !== 'item') { btnItems.classList.add('active'); btnItems.style.background = '#f1c40f'; }
  if (isCard && btnCards && hardType !== 'card') { btnCards.classList.add('active'); btnCards.style.background = '#f1c40f'; }
  if (isMonster && btnMonster && hardType !== 'monster') { btnMonster.classList.add('active'); btnMonster.style.background = '#f1c40f'; }
  if (isMeal && btnMeal) { btnMeal.classList.add('active'); btnMeal.style.background = '#f1c40f'; }
  if (isPack && btnPack) { btnPack.classList.add('active'); btnPack.style.background = '#f1c40f'; }
  // Ensure hard-mode buttons remain red (override) when detected
  if (hardType === 'item' && btnItems) { btnItems.classList.add('hard'); btnItems.style.background = '#c0392b'; }
  if (hardType === 'card' && btnCards) { btnCards.classList.add('hard'); btnCards.style.background = '#c0392b'; }
  if (hardType === 'monster' && btnMonster) { btnMonster.classList.add('hard'); btnMonster.style.background = '#c0392b'; }
    } catch (e) { console.warn('Page switch render failed', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => renderPageSwitch(config.imageBase || IMAGE_BASE)); else renderPageSwitch(config.imageBase || IMAGE_BASE);

  // Inject flame icon + streak (now on all pages)
  try {
    const sideBox = document.getElementById('sideBox') || document.querySelector('.side-box');
    const switcher = document.querySelector('.page-switch');
    const isResultsPage = /results\.html$/i.test(location.pathname);
    // Only reposition next to page switcher when switcher exists and not results page
    if (!document.getElementById('flameIconImg')) {
      // Create flame structure once
      const flameWrap = document.createElement('div');
      flameWrap.className = 'flame-wrap';
      flameWrap.id = 'flameWrapRoot';
      const img = document.createElement('img');
      img.id = 'flameIconImg';
      img.className = 'flame-icon';
      img.alt = 'Flame';
      img.title = 'Daily Streak';
      img.setAttribute('aria-label','Daily Streak');
      try { img.src = resolveIcon('images/flame.png'); } catch (e) { img.src = 'images/flame.png'; }
      const streak = document.createElement('span');
      streak.className = 'flame-streak';
      streak.id = 'flameStreak';
      streak.textContent = '0';
      flameWrap.appendChild(img);
      flameWrap.appendChild(streak);

      if (switcher && !isResultsPage) {
        // Place flame inside the page switcher flex container so it aligns horizontally
        try { switcher.classList.remove('offset-left'); } catch(e) { /* non-fatal */ }
        flameWrap.classList.add('inline-flame');
        switcher.appendChild(flameWrap);
        // Mark switcher so CSS can shorten decorative bar, and set a CSS var for dynamic width subtraction
        try {
          switcher.classList.add('has-flame');
          const updateSwitcherBar = () => {
            try {
              const ml = parseFloat(getComputedStyle(flameWrap).marginLeft) || 0;
              const total = flameWrap.offsetWidth + ml; // total horizontal space consumed
              switcher.style.setProperty('--flame-total-width', total + 'px');
            } catch(e) { /* non-fatal */ }
          };
          updateSwitcherBar();
          window.addEventListener('resize', debounce(updateSwitcherBar, 160));
        } catch(e) { /* non-fatal */ }
      } else if (sideBox) {
        // Fallback: keep previous behavior next to side box
        let wrapper = document.getElementById('sideFlameWrap');
        if (!wrapper) {
          wrapper = document.createElement('div');
          wrapper.id = 'sideFlameWrap';
          wrapper.className = 'side-with-flame';
          if (sideBox.parentNode) sideBox.parentNode.insertBefore(wrapper, sideBox);
          wrapper.appendChild(sideBox);
        }
        wrapper.appendChild(flameWrap);
      }
      loadStreak();
    } else {
      // Flame exists: just re-render number
      try {
        const img = document.getElementById('flameIconImg');
        if (img) { img.title = 'Daily Streak'; img.setAttribute('aria-label','Daily Streak'); }
      } catch(e) { /* non-fatal */ }
      renderStreak();
    }
  } catch (e) { /* non-fatal */ }

  // After rendering the page switcher, if the user has already completed today's
  // game for the current page, show the goal modal so they can see the answer.
  try {
    const currentGame = detectGameFromPath();
    if (hasWinToday(currentGame)) {
      // Wait until UI elements settle, then show the modal using the current goal and stored guesses.
      setTimeout(() => {
        try {
          const gi = getGoalItem();
          const payload = getWinPayload(currentGame) || {};
          const payloadGuesses = Number(payload.guesses) || 0;
          // Hide the search input and combo wrapper so the modal is prominent
          try {
            const inputEl = document.getElementById('search');
            const comboWrap = document.getElementById('combo');
            const dropdownEl = document.getElementById('dropdown');
            if (inputEl) { inputEl.style.display = 'none'; inputEl.disabled = true; inputEl.setAttribute('aria-hidden', 'true'); }
            if (comboWrap) { comboWrap.style.display = 'none'; comboWrap.setAttribute('aria-hidden', 'true'); comboWrap.classList.add('goal-guessed'); }
            if (dropdownEl) { dropdownEl.classList.remove('open'); dropdownEl.style.display = 'none'; dropdownEl.setAttribute('aria-hidden', 'true'); }
          } catch (e) { /* non-fatal */ }
          if (gi) showGoalModal(gi, payloadGuesses);
          // Let page-specific modules react as if the guess was correct (unblur card, reveal emojis)
          try {
            if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
              document.dispatchEvent(new CustomEvent('guess:correct', { detail: { item: gi } }));
            }
            // Fallback: directly call cardGuesser API if present
            if (typeof window !== 'undefined' && window.cardGuesser && typeof window.cardGuesser.setCardBlur === 'function') {
              try { window.cardGuesser.setCardBlur(0); } catch (e) { /* non-fatal */ }
            }
          } catch (e) { /* non-fatal */ }
        } catch (e) { /* non-fatal */ }
      }, 600);
    }
  } catch (e) { /* non-fatal */ }

  // NOTE: daily icon rendering for card pages is now handled by the page-specific module
  // (cardGuesser.js). The shared code previously injected a small daily icon which
  // caused a duplicate when the page also inserted the prominent card. Leaving this
  // comment in place for historical context; no automatic daily icon is injected here.

  const input = document.getElementById('search');
  // Immediate input handler: render dropdown as user types without artificial debounce
  const onInput = () => {
    if (!input) return;
    const q = input.value;
    // Always allow re-render after a selection (lastQuery deliberately cleared on click)
    if (q === lastQuery && q.length > 0) return; // still avoid redundant work for continuous same value
    lastQuery = q;
    const results = filterItems(q);
    render(results);
    const dd = document.getElementById('dropdown');
    if (dd) {
      if (!loadingItems && results.length > 0) dd.classList.add('open'); else dd.classList.remove('open');
    }
  };
  if (input) input.addEventListener('input', onInput);

  // Default clue handlers
  const defaultHandlers = {
    guessBtn1: () => {
      const upgrades = goalItem?.raw?.stats?.['Upgrade Slots'] ?? goalItem?.raw?.['Upgrade Slots'] ?? goalItem?.raw?.upgradeslots ?? 'Unknown';
      const gb1 = document.getElementById('guessBtn1'); if (!gb1 || gb1.disabled) return; gb1.textContent = upgrades; gb1.setAttribute('aria-label', `Upgradeslots: ${upgrades}`);
    },
    guessBtn2: () => {
      const gb2 = document.getElementById('guessBtn2'); if (!gb2 || gb2.disabled) return; const category = goalItem?.raw?.category || goalItem?.raw?.type || goalItem?.raw?.class || 'Unknown'; gb2.textContent = category; gb2.setAttribute('aria-label', `Category: ${category}`);
    }
  };

  const handlers = Object.assign({}, defaultHandlers, config.guessButtonHandlers || {});

  const gb1 = document.getElementById('guessBtn1');
  const gb2 = document.getElementById('guessBtn2');
  if (gb1) gb1.addEventListener('click', handlers.guessBtn1);
  if (gb2) gb2.addEventListener('click', handlers.guessBtn2);

  updateClueState();

  // Initialize global guess count value for consumers
  try { if (typeof window !== 'undefined' && typeof window.guessCount !== 'number') window.guessCount = guessCount || 0; } catch (e) { /* non-fatal */ }

  if (input) input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('dropdown')?.classList.remove('open');
    if (e.key === 'Enter') {
      const first = filterItems(input.value)[0];
      if (first) {
        incrementGuessCount();
        items = items.filter(item => item.name !== first.name);
        document.getElementById('dropdown')?.classList.remove('open');
        const inputEl = document.getElementById('search');
        if (inputEl) { inputEl.value = ""; lastQuery = ''; try { inputEl.focus(); } catch (e) {} }
        if (typeof _config.onSelect === 'function') {
          try { _config.onSelect(first); } catch (e) { console.warn('onSelect handler failed', e); }
        } else {
          try { if (goalItem && first && first.name === goalItem.name) notifyGoalGuessed(first); } catch (e) {}
        }
        render(filterItems(document.getElementById('search')?.value || ''));
      }
    }
  });

  // Some mobile browsers (including Vivaldi) can emit Enter on keyup/keypress or
  // submit instead of keydown. Add extra listeners and debounce to avoid double-handling.
  try {
    let _lastEnterHandled = 0;
    const handleEnterEvent = (evt) => {
      const now = Date.now();
      if (now - _lastEnterHandled < 600) return; // debounce repeated events
      _lastEnterHandled = now;
      try {
        const first = filterItems(input.value)[0];
        if (!first) return;
        incrementGuessCount();
        items = items.filter(item => item.name !== first.name);
        document.getElementById('dropdown')?.classList.remove('open');
        const inputEl = document.getElementById('search');
        if (inputEl) { inputEl.value = ""; lastQuery = ''; try { inputEl.focus(); } catch (e) {} }
        if (typeof _config.onSelect === 'function') {
          try { _config.onSelect(first); } catch (e) { console.warn('onSelect handler failed', e); }
        } else {
          try { if (goalItem && first && first.name === goalItem.name) notifyGoalGuessed(first); } catch (e) {}
        }
        render(filterItems(document.getElementById('search')?.value || ''));
      } catch (e) { /* non-fatal */ }
    };
    if (input) {
      input.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleEnterEvent(e); });
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleEnterEvent(e); });
      // If the input is inside a form, catch submit as well
      const form = input.closest ? input.closest('form') : null;
      if (form) form.addEventListener('submit', (e) => { e.preventDefault(); handleEnterEvent(e); });
    }
  } catch (e) { /* non-fatal */ }

  document.addEventListener('click', (e) => {
    const combo = document.getElementById('combo');
    if (!combo?.contains(e.target)) {
      document.getElementById('dropdown')?.classList.remove('open');
      const inputEl = document.getElementById('search'); if (inputEl) inputEl.value = "";
    }
  });

  // Modals wiring (help, about, privacy)
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.getElementById('helpClose');
  if (helpBtn && helpModal) helpBtn.addEventListener('click', () => { helpModal.setAttribute('aria-hidden', 'false'); });
  if (helpClose && helpModal) helpClose.addEventListener('click', () => { helpModal.setAttribute('aria-hidden', 'true'); });
  if (helpModal) helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.setAttribute('aria-hidden', 'true'); });

  const aboutBtn = document.getElementById('aboutBtn');
  const aboutModal = document.getElementById('aboutModal');
  const aboutClose = document.getElementById('aboutClose');
  if (aboutBtn && aboutModal) aboutBtn.addEventListener('click', () => { aboutModal.setAttribute('aria-hidden', 'false'); });
  if (aboutClose && aboutModal) aboutClose.addEventListener('click', () => { aboutModal.setAttribute('aria-hidden', 'true'); });
  if (aboutModal) aboutModal.addEventListener('click', (e) => { if (e.target === aboutModal) aboutModal.setAttribute('aria-hidden', 'true'); });

  const privacyLink = document.getElementById('privacyLink');
  const privacyModal = document.getElementById('privacyModal');
  const privacyClose = document.getElementById('privacyClose');
  if (privacyLink && privacyModal) privacyLink.addEventListener('click', (e) => { e.preventDefault(); privacyModal.setAttribute('aria-hidden', 'false'); });
  if (privacyClose && privacyModal) privacyClose.addEventListener('click', () => { privacyModal.setAttribute('aria-hidden', 'true'); });
  if (privacyModal) privacyModal.addEventListener('click', (e) => { if (e.target === privacyModal) privacyModal.setAttribute('aria-hidden', 'true'); });

  // Terms of Use modal wiring (optional; only activates if elements exist on page)
  try {
    const termsLink = document.getElementById('termsLink');
    const termsModal = document.getElementById('termsModal');
    const termsClose = document.getElementById('termsClose');
    if (termsLink && termsModal) termsLink.addEventListener('click', (e) => { e.preventDefault(); termsModal.setAttribute('aria-hidden', 'false'); });
    if (termsClose && termsModal) termsClose.addEventListener('click', () => { termsModal.setAttribute('aria-hidden', 'true'); });
    if (termsModal) termsModal.addEventListener('click', (e) => { if (e.target === termsModal) termsModal.setAttribute('aria-hidden', 'true'); });
  } catch (e) { /* non-fatal */ }
}

export { filterItems, incrementGuessCount, updateClueState, getGoalItem };

function getGoalItem() { return goalItem; }

export { notifyGoalGuessed };
// Export locale helper for other modules
export { safeLower };

// Allow external modules (e.g., mealGuesser) to override the selected goal after init.
// This mirrors internal structure and lets new game variants reuse goal handling + cookies.
export function setGoalItem(it) {
  try { goalItem = it || goalItem; } catch (e) { /* non-fatal */ }
}

// Default export is not used; consumers should call initShared then use other exports.

// Expose some helpers on the global `window` object for non-module pages that
// include `js/website.js` without importing this module. This lets page-specific
// scripts delegate to the canonical shared implementations (toast, clue handling)
// while still working if the shared module isn't present.
try {
  if (typeof window !== 'undefined') {
    window.incrementGuessCount = window.incrementGuessCount || incrementGuessCount;
    window.updateClueState = window.updateClueState || updateClueState;
    window.filterItems = window.filterItems || filterItems;
    window.getGoalItem = window.getGoalItem || getGoalItem;
  }
} catch (e) { /* non-fatal */ }
