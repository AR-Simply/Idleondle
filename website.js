// website.js
// All JavaScript logic extracted from website.html

// ---------- Config ----------
const DATA_URL  = 'idleon_items_detailed.json';
const MAX_RESULTS = 50;

// If your images are elsewhere, set the base here, e.g. '/assets/' or './images/'
const IMAGE_BASE = './';

// ---------- State ----------
let items = []; // Array<{ name, icon, raw }>
let lastQuery = '';
let goalItem = '';
let loadingItems = true;
let guessCount = 0;
// Clue unlock thresholds (number of guesses required to unlock)
const CLUE_UNLOCKS = {
  world: 4,      // world clue unlocks after 2 guesses
  category: 5    // category clue unlocks after 4 guesses
};

// ---------- Utils ----------
const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const placeholder = (label = '📦') =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
      <rect width="100%" height="100%" rx="10" ry="10" fill="#141830" stroke="#2a2f47"/>
      <text x="50%" y="53%" font-family="Segoe UI, system-ui, sans-serif" font-size="28" fill="#7aa2ff" text-anchor="middle" dominant-baseline="middle">${label}</text>
    </svg>`
  );

const toWebPath = p => String(p || '')
  .replace(/\\\\/g, '/')  // double backslashes
  .replace(/\\/g, '/');   // single backslashes

// Encode only segments; keep slashes
function encodePathSegments(p) {
  return p.split('/').map(seg => encodeURIComponent(seg)).join('/');
}
function resolveIcon(p) {
  const cleaned = toWebPath(p).replace(/^\.?\//, '');        // strip leading ./ or /
  const base = IMAGE_BASE.replace(/\/$/, '');                 // no trailing slash on base
  const joined = base ? `${base}/${cleaned}` : cleaned;
  return encodePathSegments(joined).replace(/\/{2,}/g, '/');  // avoid // in the middle
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

  // Fallback (unlikely needed for your file)
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

function render(list) {
  const ul = document.getElementById('results');
  const dd = document.getElementById('dropdown');
  ul.innerHTML = '';
  // If items are still loading, show a loading hint. If there are no results,
  // show an empty message so the user knows the search ran.
  if (!list.length) {
    // While items are still loading, keep the dropdown closed and do not show a message.
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
    // If we have items but no matches, hide the dropdown instead of showing 'No results'
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
    img.addEventListener('error', () => {
      console.warn('Icon not found:', it.icon);
      img.src = placeholder();
    });

    const nameDiv = document.createElement('div');
    nameDiv.className = 'name';
    nameDiv.textContent = it.name;

    li.appendChild(img);
    li.appendChild(nameDiv);

    li.addEventListener('click', () => {
      console.log('Clicked item:', it);
  // increment guess counter for any selection attempt
  incrementGuessCount();
      // Remove item from the items array so it won't appear in future searches
      items = items.filter(item => item.name !== it.name);
     
      document.getElementById('dropdown').classList.remove('open');
  const inputEl = document.getElementById('search');
  inputEl.value = it.name;
  // reset lastQuery so subsequent typing always triggers a new search
  lastQuery = '';
  // restore focus so the user can type immediately
  try { inputEl.focus(); } catch (e) {}
      addToTable(it);
      // Re-render dropdown in case user continues typing
      render(filterItems(document.getElementById('search').value));
    });

    frag.appendChild(li);
  }

  ul.appendChild(frag);
  dd.classList.add('open');
}

function selectGoalItem() {
  // PRNG
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }

  // Deterministic shuffle
  function seededShuffle(array, seed) {
    let rng = mulberry32(seed);
    let a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      let j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Local day index (midnight rollover in user's timezone)
  function getLocalDayIndex() {
    let now = new Date();
    let startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor(startOfDay.getTime() / 86400000);
  }

  let dayIndex = getLocalDayIndex();

  // Which cycle are we in? (reshuffle every full pass)
  let cycle = Math.floor(dayIndex / items.length)+2;

  // Shuffle deterministically for this cycle
  let shuffled = seededShuffle(items, cycle);

  // Position inside cycle
  let pos = dayIndex % items.length;

  goalItem = shuffled[pos];

  if (goalItem) {
    //console.log("Goal item of the day:", goalItem);
  }
}




(async function init() {
  await loadItems();
  selectGoalItem();
  const input = document.getElementById('search');
  const onInput = debounce(() => {
    const q = input.value;
    if (q === lastQuery) return;
    lastQuery = q;
  const results = filterItems(q);
  render(results);
  // Open dropdown only when loading has finished and we actually have matches
  if (!loadingItems && results.length > 0) document.getElementById('dropdown').classList.add('open');
  }, 20);

  input.addEventListener('input', onInput);
  // Guess buttons in dropdown (placeholder behavior)
  const gb1 = document.getElementById('guessBtn1');
  const gb2 = document.getElementById('guessBtn2');
  if (gb1) gb1.addEventListener('click', () => {
    if (gb1.disabled) return;
    // method 1: quick one-line lookup for Upgrade Slots in common places
    const upgrades = goalItem?.raw?.stats?.['Upgrade Slots'] ?? goalItem?.raw?.['Upgrade Slots'] ?? goalItem?.raw?.upgradeslots ?? 'Unknown';
    gb1.textContent = upgrades;
    gb1.setAttribute('aria-label', `Upgradeslots: ${upgrades}`);
  });
  if (gb2) gb2.addEventListener('click', () => {
    if (gb2.disabled) return;
    // Try several common fields for category, fall back to class or 'Unknown'
    const category = goalItem?.raw?.category || goalItem?.raw?.type || goalItem?.raw?.class || 'Unknown';
    gb2.textContent = category;
    gb2.setAttribute('aria-label', `Category: ${category}`);
  });
  // ensure buttons start in correct locked/unlocked state
  updateClueState();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('dropdown').classList.remove('open');
    if (e.key === 'Enter') {
      const first = filterItems(input.value)[0];
  if (first) {
      console.log('entered item:', first);
  // increment guess counter when user submits via Enter
  incrementGuessCount();
      // Remove item from the items array so it won't appear in future searches
      items = items.filter(item => item.name !== first.name);
     
      document.getElementById('dropdown').classList.remove('open');
  const inputEl = document.getElementById('search');
  inputEl.value = "";
  lastQuery = '';
  try { inputEl.focus(); } catch (e) {}
      addToTable(first);
      // Re-render dropdown in case user continues typing
      render(filterItems(document.getElementById('search').value));
      }
    }
  });

  document.addEventListener('click', (e) => {
    const combo = document.getElementById('combo');
    if (!combo.contains(e.target)) {
      document.getElementById('dropdown').classList.remove('open');
      input.value = "";
    }
  });

  // Help modal wiring (How to Play)
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.getElementById('helpClose');
  if (helpBtn && helpModal) {
    helpBtn.addEventListener('click', () => {
      helpModal.setAttribute('aria-hidden', 'false');
    });
  }
  if (helpClose && helpModal) helpClose.addEventListener('click', () => { helpModal.setAttribute('aria-hidden', 'true'); });
  if (helpModal) helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.setAttribute('aria-hidden', 'true'); });

  // About modal wiring
  const aboutBtn = document.getElementById('aboutBtn');
  const aboutModal = document.getElementById('aboutModal');
  const aboutClose = document.getElementById('aboutClose');
  if (aboutBtn && aboutModal) {
    aboutBtn.addEventListener('click', () => { aboutModal.setAttribute('aria-hidden', 'false'); });
  }
  if (aboutClose && aboutModal) aboutClose.addEventListener('click', () => { aboutModal.setAttribute('aria-hidden', 'true'); });
  if (aboutModal) aboutModal.addEventListener('click', (e) => { if (e.target === aboutModal) aboutModal.setAttribute('aria-hidden', 'true'); });

  // Privacy modal wiring
  const privacyLink = document.getElementById('privacyLink');
  const privacyModal = document.getElementById('privacyModal');
  const privacyClose = document.getElementById('privacyClose');
  if (privacyLink && privacyModal) {
    privacyLink.addEventListener('click', (e) => { e.preventDefault(); privacyModal.setAttribute('aria-hidden', 'false'); });
  }
  if (privacyClose && privacyModal) privacyClose.addEventListener('click', () => { privacyModal.setAttribute('aria-hidden', 'true'); });
  if (privacyModal) privacyModal.addEventListener('click', (e) => { if (e.target === privacyModal) privacyModal.setAttribute('aria-hidden', 'true'); });
})();

function addToTable(it) {
  const tableWrap = document.querySelector('.table-wrap');
  const tbody = document.querySelector('#itemTable tbody');
  // Reveal table area (CSS controls visual presentation)
  const wasVisible = tableWrap.classList.contains('visible');
  tableWrap.classList.add('visible');
  // If table was not visible before, animate the header
  if (!wasVisible) {
  const headerRow = document.querySelector('#itemTable thead tr.table-head');
  if (headerRow) headerRow.classList.add('fade-in');
  }
  const row = document.createElement('tr');
  console.log(it);

  // Helper to get stat value as number (or 0 if not present)
  function getStat(val) {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'string') {
      const n = parseFloat(val);
      return isNaN(n) ? 0 : n;
    }
    return Number(val);
  }

  // Helper to format sell price with coin images
  function formatSellPrice(value) {
    // Ensure value is a string, remove commas/whitespace, then parse
    const cleaned = String(value).replace(/[\,\s]/g, '');
    const n = parseInt(cleaned, 10);
    if (isNaN(n) || n <= 0) return value;
    // Correct Idleon coin denominations, matching image order (1.png = Copper, 2.png = Silver, ...)
    const denominations = [
      1, // Copper
      100, // Silver
      10000, // Gold
      1000000, // Platinum
      100000000, // Dementia
      10000000000, // Void
      1000000000000, // Lustre
      100000000000000, // Starfire
      10000000000000000, // Dreadlo
      1000000000000000000, // Godshard
      100000000000000000000, // Sunder
      10000000000000000000000, // Tydal
      1000000000000000000000000, // Marbiglass
      100000000000000000000000000, // Orberal
      10000000000000000000000000000 // Eclipse
    ];
    const frag = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'sell-rows';
    let row = document.createElement('div');
    row.className = 'sell-row';
    let inRow = 0;
    let remaining = n;
    for (let i = denominations.length - 1; i >= 0; i--) {
      const coinValue = denominations[i];
      const count = Math.floor(remaining / coinValue);
      if (count > 0) {
        const span = document.createElement('span');
        span.className = 'sell-price';
        span.appendChild(document.createTextNode(String(count)));
        const img = document.createElement('img');
        img.className = 'coin-img';
        img.src = `images/coins/${i+1}.png`;
        img.alt = 'coin';
        span.appendChild(img);
        row.appendChild(span);
        remaining -= count * coinValue;
        inRow++;
        if (inRow === 3) {
          container.appendChild(row);
          row = document.createElement('div'); row.className = 'sell-row';
          inRow = 0;
        }
      }
    }
    if (row.children.length > 0) container.appendChild(row);
    frag.appendChild(container);
    return frag;
  }

  // Prepare values for comparison
  const goal = goalItem;
  const statMap = {
    class: { type: 'red', value: it.raw.class || '', goal: goal?.raw?.class || '' },
    level_requirement: { type: 'yellow', value: it.raw.level_requirement || '0', goal: goal?.raw?.level_requirement || '0' },
    power: { type: 'yellow', value: it.raw.stats?.power || '0', goal: goal?.raw?.stats?.power || '0' },
    Speed: { type: 'yellow', value: it.raw.stats?.Speed ? it.raw.stats.Speed.split(' ')[0] : '0', goal: goal?.raw?.stats?.Speed ? goal.raw.stats.Speed.split(' ')[0] : '0' },
    Strength: { type: 'yellow', value: it.raw.stats?.Strength || '0', goal: goal?.raw?.stats?.Strength || '0' },
    Agility: { type: 'yellow', value: it.raw.stats?.Agility || '0', goal: goal?.raw?.stats?.Agility || '0' },
    Wisdom: { type: 'yellow', value: it.raw.stats?.Wisdom || '0', goal: goal?.raw?.stats?.Wisdom || '0' },
    Luck: { type: 'yellow', value: it.raw.stats?.Luck || '0', goal: goal?.raw?.stats?.Luck || '0' },
    sell_price: { type: 'yellow', value: it.raw.sell_price || '-', goal: goal?.raw?.sell_price || '0' },
    source: { type: 'red', value: it.raw.source ? it.raw.source.split('(')[0].trim() : '-', goal: goal?.raw?.source ? goal.raw.source.split('(')[0].trim() : '-' }
  };

  // Build cells (first cell is combined Item: icon + name)
  const cells = [
    { type: 'item', html: it.name, icon: it.icon },
    // class
    { type: 'red', key: 'class' },
    // level req
    { type: 'yellow', key: 'level_requirement' },
    // power
    { type: 'yellow', key: 'power' },
    // speed
    { type: 'yellow', key: 'Speed' },
    // strength
    { type: 'yellow', key: 'Strength' },
    // agility
    { type: 'yellow', key: 'Agility' },
    // wisdom
    { type: 'yellow', key: 'Wisdom' },
    // luck
    { type: 'yellow', key: 'Luck' },
    // sell price
    { type: 'yellow', key: 'sell_price' },
    // source
    { type: 'red', key: 'source' }
  ];

  const lessImg = 'images/less.png';
  const moreImg = 'images/more.png';

  // Build cells using DOM APIs (no inline styles)
  for (const cell of cells) {
    const td = document.createElement('td');
    // mark for staggered fade-in
    td.classList.add('cell-fade');
    // default padding/box handled by CSS (.table-panel td)
    if (cell.type === 'item') {
      td.classList.add('item-cell');
      // icon
      const img = document.createElement('img');
      img.src = cell.icon || it.icon;
      img.alt = it.name || cell.html || '';
      img.className = 'item-icon';
      img.onerror = () => { img.src = placeholder(); };
      td.appendChild(img);
      // name
      const nameWrap = document.createElement('div');
      nameWrap.className = 'name-cell';
      nameWrap.textContent = cell.html || it.name || '';
      td.appendChild(nameWrap);
      row.appendChild(td);
      continue;
    }

    const info = statMap[cell.key];
    // common stat cell classes for stat-type cells
    td.classList.add('stat-col');
    td.classList.add(cell.type === 'yellow' ? 'type-yellow' : cell.type === 'red' ? 'type-red' : 'type-green');
    td.style.position = 'relative';

    if (cell.type === 'yellow') {
      const v = getStat(info.value);
      const g = getStat(info.goal);
      // arrow background if not equal
      if (v < g) {
        const bgImg = document.createElement('img');
        bgImg.className = 'cell-arrow-bg';
        bgImg.src = moreImg;
        bgImg.alt = '';
        td.appendChild(bgImg);
        // mark as a miss when it shows an arrow (not a match)
        td.classList.add('cell-miss');
      } else if (v > g) {
        const bgImg = document.createElement('img');
        bgImg.className = 'cell-arrow-bg';
        bgImg.src = lessImg;
        bgImg.alt = '';
        td.appendChild(bgImg);
        // mark as a miss when it shows an arrow (not a match)
        td.classList.add('cell-miss');
      } else {
        // match -> green background handled by CSS type when appropriate
        td.classList.add('cell-match');
      }

      if (cell.key === 'sell_price') {
        const frag = formatSellPrice(info.value);
        td.appendChild(frag);
      } else {
        const span = document.createElement('span');
        span.className = 'cell-content';
        span.textContent = info.value;
        td.appendChild(span);
      }
  row.appendChild(td);
      continue;
    }

    if (cell.type === 'red') {
      if (info.value === info.goal) {
        td.classList.add('cell-match');
      } else {
        td.classList.add('cell-miss');
      }
      const span = document.createElement('span');
      span.className = 'cell-content';
      span.textContent = info.value;
      td.appendChild(span);
      row.appendChild(td);
      continue;
    }

    // fallback
    td.textContent = info.value;
    row.appendChild(td);
  }

  // insert at top
  tbody.insertBefore(row, tbody.firstChild);
  // Staggered reveal of cells: add 'in' class to each td with a small delay
  const tds = Array.from(row.querySelectorAll('td'));
  const staggerMs = 500; // per-cell stagger
  const animMs = 260;   // matches CSS animation duration
  tds.forEach((c, i) => {
    setTimeout(() => { c.classList.add('in'); }, staggerMs * i);
  });
  // If this is the goal item, show the modal after the last cell's animation completes + 1s
  try {
    if (goalItem && it && it.name === goalItem.name) {
      // Ensure the dropdown and its wrapper are fully hidden when the user guessed the goal item
      try {
        const dropdownEl = document.getElementById('dropdown');
        if (dropdownEl) {
          dropdownEl.classList.remove('open');
          dropdownEl.style.display = 'none';
          dropdownEl.setAttribute('aria-hidden', 'true');
        }
      } catch (e) {}
      // Hide and disable the search input and its surrounding combo wrapper so the
      // entire input box is visually removed and made inert.
      try {
        const inputEl = document.getElementById('search');
        const comboWrap = document.getElementById('combo');
        if (inputEl) {
          inputEl.style.display = 'none';
          inputEl.disabled = true;
          inputEl.setAttribute('aria-hidden', 'true');
        }
        if (comboWrap) {
          comboWrap.style.display = 'none';
          comboWrap.setAttribute('aria-hidden', 'true');
          comboWrap.classList.add('goal-guessed');
        }
      } catch (e) {}
      if (typeof goalModalTimeout !== 'undefined' && goalModalTimeout) { clearTimeout(goalModalTimeout); }
      const lastInDelay = staggerMs * (tds.length - 1);
      const totalDelay = lastInDelay + animMs + 1000; // wait 1s after animation
      goalModalTimeout = setTimeout(() => {
        showGoalModal(it);
        goalModalTimeout = null;
      }, totalDelay);
    }
  } catch (e) { console.error('Goal scheduling failed', e); }
}

// ---------------- Goal modal and timer ----------------
let goalTimerInterval = null;
let goalModalTimeout = null;
function showGoalModal(item) {
  const modal = document.getElementById('goalModal');
  const icon = document.getElementById('goalIcon');
  const name = document.getElementById('goalName');
  const timer = document.getElementById('goalTimer');
  if (!modal || !icon || !name || !timer) return;
  icon.src = item.icon || placeholder();
  icon.alt = item.name || 'item';
  name.textContent = item.name || '';
  // update guesses display
  try { document.getElementById('goalGuesses').textContent = String(guessCount || 0); } catch (e) {}
  modal.setAttribute('aria-hidden', 'false');

  // update timer immediately and every second until local midnight
  function update() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24,0,0,0);
    const diff = midnight - now;
    if (diff <= 0) {
      timer.textContent = '00:00:00';
      clearInterval(goalTimerInterval);
      goalTimerInterval = null;
      return;
    }
    const hrs = String(Math.floor(diff / (1000*60*60))).padStart(2,'0');
    const mins = String(Math.floor((diff % (1000*60*60)) / (1000*60))).padStart(2,'0');
    const secs = String(Math.floor((diff % (1000*60)) / 1000)).padStart(2,'0');
    timer.textContent = `${hrs}:${mins}:${secs}`;
  }
  update();
  if (goalTimerInterval) clearInterval(goalTimerInterval);
  goalTimerInterval = setInterval(update, 1000);

  // Close button wiring
  const close = document.getElementById('goalClose');
  if (close) close.onclick = () => hideGoalModal();
  // Also close when clicking backdrop outside panel
  modal.onclick = (e) => { if (e.target === modal) hideGoalModal(); };
}

function hideGoalModal() {
  const modal = document.getElementById('goalModal');
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  if (goalTimerInterval) { clearInterval(goalTimerInterval); goalTimerInterval = null; }
}

// Increments the guess count and updates UI/clue availability
function incrementGuessCount() {
  guessCount = (guessCount || 0) + 1;
  try { document.getElementById('goalGuesses').textContent = String(guessCount); } catch (e) {}
  updateClueState();
}

// Update the clue buttons and note text based on current guessCount
function updateClueState() {
  const btnWorld = document.getElementById('guessBtn1');
  const btnCategory = document.getElementById('guessBtn2');
  const note1 = document.getElementById('note1');
  const note2 = document.getElementById('note2');
  // compute remaining counts (safe even if CLUE_UNLOCKS not set)
  const remainingWorld = Math.max(0, (CLUE_UNLOCKS.world || 0) - guessCount);
  const remainingCategory = Math.max(0, (CLUE_UNLOCKS.category || 0) - guessCount);

  // World clue (update only if element exists)
  if (btnWorld) {
    if (remainingWorld > 0) {
      btnWorld.disabled = true;
      btnWorld.classList.add('locked');
      if (note1) note1.textContent = `Unlocks in ${remainingWorld} guess${remainingWorld === 1 ? '' : 'es'}`;
    } else {
      btnWorld.disabled = false;
      btnWorld.classList.remove('locked');
      if (note1) note1.textContent = '';
    }
  } else if (note1) {
    // if button is missing but note exists, still display remaining
    note1.textContent = remainingWorld > 0 ? `Unlocks in ${remainingWorld} guess${remainingWorld === 1 ? '' : 'es'}` : '';
  }

  // Category clue (update only if element exists)
  if (btnCategory) {
    if (remainingCategory > 0) {
      btnCategory.disabled = true;
      btnCategory.classList.add('locked');
      if (note2) note2.textContent = `Unlocks in ${remainingCategory} guess${remainingCategory === 1 ? '' : 'es'}`;
    } else {
      btnCategory.disabled = false;
      btnCategory.classList.remove('locked');
      if (note2) note2.textContent = '';
    }
  } else if (note2) {
    note2.textContent = remainingCategory > 0 ? `Unlocks in ${remainingCategory} guess${remainingCategory === 1 ? '' : 'es'}` : '';
  }
}
