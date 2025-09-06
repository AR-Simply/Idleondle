// ItemGuesser.js
// Page-specific logic for the Item Guesser: table rendering and goal handling.

import { getGoalItem, notifyGoalGuessed } from './shared.js';

// Adds an item row to the table and handles goal detection
export function addToTable(it) {
  const tableWrap = document.querySelector('.table-wrap');
  const tbody = document.querySelector('#itemTable tbody');
  if (!tbody || !tableWrap) return;
  const wasVisible = tableWrap.classList.contains('visible');
  tableWrap.classList.add('visible');
  if (!wasVisible) {
    const headerRow = document.querySelector('#itemTable thead tr.table-head');
    if (headerRow) headerRow.classList.add('fade-in');
  }

  const row = document.createElement('tr');

  function getStat(val) {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'string') { const n = parseFloat(val); return isNaN(n) ? 0 : n; }
    return Number(val);
  }

  function placeholder(label = '📦') {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">\n      <rect width="100%" height="100%" rx="10" ry="10" fill="#141830" stroke="#2a2f47"/>\n      <text x="50%" y="53%" font-family="Segoe UI, system-ui, sans-serif" font-size="28" fill="#7aa2ff" text-anchor="middle" dominant-baseline="middle">${label}</text>\n    </svg>`
    );
  }

  function formatSellPrice(value) {
    const cleaned = String(value).replace(/[\,\s]/g, '');
    const n = parseInt(cleaned, 10);
    if (isNaN(n) || n <= 0) return value;
    const denominations = [1,100,10000,1000000,100000000,10000000000,1000000000000,100000000000000,10000000000000000,1000000000000000000,100000000000000000000,10000000000000000000000,1000000000000000000000000,100000000000000000000000000,10000000000000000000000000000];
    const frag = document.createDocumentFragment();
    const container = document.createElement('div'); container.className = 'sell-rows';
    let rowDiv = document.createElement('div'); rowDiv.className = 'sell-row';
    let inRow = 0; let remaining = n;
    for (let i = denominations.length - 1; i >= 0; i--) {
      const coinValue = denominations[i];
      const count = Math.floor(remaining / coinValue);
      if (count > 0) {
        const span = document.createElement('span'); span.className = 'sell-price'; span.appendChild(document.createTextNode(String(count)));
        const img = document.createElement('img'); img.className = 'coin-img'; img.src = `images/coins/${i+1}.png`; img.alt = 'coin'; span.appendChild(img);
        rowDiv.appendChild(span);
        remaining -= count * coinValue; inRow++; if (inRow === 3) { container.appendChild(rowDiv); rowDiv = document.createElement('div'); rowDiv.className = 'sell-row'; inRow = 0; }
      }
    }
    if (rowDiv.children.length > 0) container.appendChild(rowDiv);
    frag.appendChild(container);
    return frag;
  }

  const goal = getGoalItem();
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

  const cells = [ { type: 'item', html: it.name, icon: it.icon }, { type: 'red', key: 'class' }, { type: 'yellow', key: 'level_requirement' }, { type: 'yellow', key: 'power' }, { type: 'yellow', key: 'Speed' }, { type: 'yellow', key: 'Strength' }, { type: 'yellow', key: 'Agility' }, { type: 'yellow', key: 'Wisdom' }, { type: 'yellow', key: 'Luck' }, { type: 'yellow', key: 'sell_price' }, { type: 'red', key: 'source' } ];

  const lessImg = 'images/less.png';
  const moreImg = 'images/more.png';

  for (const cell of cells) {
    const td = document.createElement('td'); td.classList.add('cell-fade');
    if (cell.type === 'item') {
      td.classList.add('item-cell');
      const img = document.createElement('img'); img.src = cell.icon || it.icon; img.alt = it.name || cell.html || ''; img.className = 'item-icon'; img.onerror = () => { img.src = placeholder(); };
      td.appendChild(img);
      const nameWrap = document.createElement('div'); nameWrap.className = 'name-cell'; nameWrap.textContent = cell.html || it.name || ''; td.appendChild(nameWrap); row.appendChild(td); continue;
    }
    const info = statMap[cell.key]; td.classList.add('stat-col'); td.classList.add(cell.type === 'yellow' ? 'type-yellow' : cell.type === 'red' ? 'type-red' : 'type-green'); td.style.position = 'relative';
    if (cell.type === 'yellow') {
      const v = getStat(info.value); const g = getStat(info.goal);
      if (v < g) { const bgImg = document.createElement('img'); bgImg.className = 'cell-arrow-bg'; bgImg.src = moreImg; bgImg.alt = ''; td.appendChild(bgImg); td.classList.add('cell-miss'); }
      else if (v > g) { const bgImg = document.createElement('img'); bgImg.className = 'cell-arrow-bg'; bgImg.src = lessImg; bgImg.alt = ''; td.appendChild(bgImg); td.classList.add('cell-miss'); }
      else { td.classList.add('cell-match'); }
      if (cell.key === 'sell_price') { const frag = formatSellPrice(info.value); td.appendChild(frag); } else { const span = document.createElement('span'); span.className = 'cell-content'; span.textContent = info.value; td.appendChild(span); }
      row.appendChild(td); continue;
    }
    if (cell.type === 'red') {
      if (info.value === info.goal) td.classList.add('cell-match'); else td.classList.add('cell-miss');
      const span = document.createElement('span'); span.className = 'cell-content'; span.textContent = info.value; td.appendChild(span); row.appendChild(td); continue;
    }
    td.textContent = info.value; row.appendChild(td);
  }

  tbody.insertBefore(row, tbody.firstChild);
  const tds = Array.from(row.querySelectorAll('td'));
  const staggerMs = 500; const animMs = 260;
  tds.forEach((c, i) => { setTimeout(() => { c.classList.add('in'); }, staggerMs * i); });

  try {
    if (goal && it && it.name === goal.name) {
      try { const dropdownEl = document.getElementById('dropdown'); if (dropdownEl) { dropdownEl.classList.remove('open'); dropdownEl.style.display = 'none'; dropdownEl.setAttribute('aria-hidden', 'true'); } } catch (e) {}
      try { const inputEl = document.getElementById('search'); const comboWrap = document.getElementById('combo'); if (inputEl) { inputEl.style.display = 'none'; inputEl.disabled = true; inputEl.setAttribute('aria-hidden', 'true'); } if (comboWrap) { comboWrap.style.display = 'none'; comboWrap.setAttribute('aria-hidden', 'true'); comboWrap.classList.add('goal-guessed'); } } catch (e) {}
      // notify shared to show modal after animations
      notifyGoalGuessed(it);
    }
  } catch (e) { console.error('Goal scheduling failed', e); }
}

export default { addToTable };
