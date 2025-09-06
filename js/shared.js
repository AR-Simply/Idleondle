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

// State
let items = [];
let lastQuery = '';
let goalItem = null;
let loadingItems = true;
let guessCount = 0;
let _config = {};

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
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return items.filter(it => it.name.toLowerCase().includes(s)).slice(0, MAX_RESULTS);
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
  for (const it of list) {
    const li = document.createElement('li');
    li.className = 'item';
    const img = document.createElement('img');
    img.alt = it.name;
    img.src = it.icon;
    img.addEventListener('error', () => { img.src = placeholder(); });
    const nameDiv = document.createElement('div');
    nameDiv.className = 'name';
    nameDiv.textContent = it.name;
    li.appendChild(img);
    li.appendChild(nameDiv);
    li.addEventListener('click', () => {
      // increment guess counter for any selection attempt
      incrementGuessCount();
  // If this selection is the goal item, trigger goal flow
  try { if (goalItem && it && it.name === goalItem.name) notifyGoalGuessed(it); } catch (e) {}
      // Remove item so it won't appear in future searches
      items = items.filter(item => item.name !== it.name);
      document.getElementById('dropdown').classList.remove('open');
      const inputEl = document.getElementById('search');
      if (inputEl) { inputEl.value = it.name; try { inputEl.focus(); } catch (e) {} }
      // call page-specific selection handler if provided
      if (typeof _config.onSelect === 'function') _config.onSelect(it);
      // Re-render dropdown in case user continues typing
      const q = document.getElementById('search')?.value || '';
      render(filterItems(q));
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
  let cycle = Math.floor(dayIndex / Math.max(1, items.length)) + 2;
  let shuffled = seededShuffle(items, cycle);
  let pos = items.length ? (dayIndex % items.length) : 0;
  goalItem = shuffled[pos];
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
  try { document.getElementById('goalGuesses').textContent = String(guessCount || 0); } catch (e) {}
  modal.setAttribute('aria-hidden', 'false');

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
  if (btnWorld) {
    if (remainingWorld > 0) { btnWorld.disabled = true; btnWorld.classList.add('locked'); if (note1) note1.textContent = `Unlocks in ${remainingWorld} guess${remainingWorld === 1 ? '' : 'es'}`; }
    else { btnWorld.disabled = false; btnWorld.classList.remove('locked'); if (note1) note1.textContent = ''; }
  } else if (note1) { note1.textContent = remainingWorld > 0 ? `Unlocks in ${remainingWorld} guess${remainingWorld === 1 ? '' : 'es'}` : ''; }
  if (btnCategory) {
    if (remainingCategory > 0) { btnCategory.disabled = true; btnCategory.classList.add('locked'); if (note2) note2.textContent = `Unlocks in ${remainingCategory} guess${remainingCategory === 1 ? '' : 'es'}`; }
    else { btnCategory.disabled = false; btnCategory.classList.remove('locked'); if (note2) note2.textContent = ''; }
  } else if (note2) { note2.textContent = remainingCategory > 0 ? `Unlocks in ${remainingCategory} guess${remainingCategory === 1 ? '' : 'es'}` : ''; }
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

  await loadItems();
  selectGoalItem();

  // Render page switch buttons (inserted after the site title). Use imageBase if present.
  function renderPageSwitch(imageBase) {
    try {
      const titleEl = document.querySelector('.site-title');
      if (!titleEl) return;
      // Remove existing if present
      const existing = document.querySelector('.page-switch'); if (existing) existing.remove();
      const wrap = document.createElement('div'); wrap.className = 'page-switch';
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
  // Left: item, middle: card, right: monster
  wrap.appendChild(makeBtn('index.html', 'btn-items', '../images/Helmets/Copper Helmet.png', 'Item Guesser'));
  wrap.appendChild(makeBtn('cardGuesser.html', 'btn-cards', '../images/card.png', 'Card Guesser'));
  wrap.appendChild(makeBtn('monsterGuesser.html', 'btn-monster', '../images/Enemies/carrotman-6_thumb.png', 'Monster Guesser'));
  titleEl.insertAdjacentElement('afterend', wrap);
  const isCard = location.pathname.endsWith('cardGuesser.html') || location.href.includes('cardGuesser.html');
  const isMonster = location.pathname.endsWith('monsterGuesser.html') || location.href.includes('monsterGuesser.html');
  const isItems = !isCard && !isMonster;
  document.getElementById('btn-items')?.classList.toggle('active', isItems);
  document.getElementById('btn-cards')?.classList.toggle('active', isCard);
  document.getElementById('btn-monster')?.classList.toggle('active', isMonster);
    } catch (e) { console.warn('Page switch render failed', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => renderPageSwitch(config.imageBase || IMAGE_BASE)); else renderPageSwitch(config.imageBase || IMAGE_BASE);

  // NOTE: daily icon rendering for card pages is now handled by the page-specific module
  // (cardGuesser.js). The shared code previously injected a small daily icon which
  // caused a duplicate when the page also inserted the prominent card. Leaving this
  // comment in place for historical context; no automatic daily icon is injected here.

  const input = document.getElementById('search');
  // Immediate input handler: render dropdown as user types without artificial debounce
  const onInput = () => {
    if (!input) return;
    const q = input.value;
    if (q === lastQuery) return;
    lastQuery = q;
    const results = filterItems(q);
    render(results);
    if (!loadingItems && results.length > 0) document.getElementById('dropdown')?.classList.add('open');
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

  if (input) input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('dropdown')?.classList.remove('open');
    if (e.key === 'Enter') {
      const first = filterItems(input.value)[0];
      if (first) {
  incrementGuessCount();
  // If this selection is the goal item, trigger goal flow
  try { if (goalItem && first && first.name === goalItem.name) notifyGoalGuessed(first); } catch (e) {}
        items = items.filter(item => item.name !== first.name);
        document.getElementById('dropdown')?.classList.remove('open');
        const inputEl = document.getElementById('search');
        if (inputEl) { inputEl.value = ""; lastQuery = ''; try { inputEl.focus(); } catch (e) {} }
        if (typeof _config.onSelect === 'function') _config.onSelect(first);
        render(filterItems(document.getElementById('search')?.value || ''));
      }
    }
  });

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
}

export { filterItems, incrementGuessCount, updateClueState, getGoalItem };

function getGoalItem() { return goalItem; }

export { notifyGoalGuessed };

// Default export is not used; consumers should call initShared then use other exports.
