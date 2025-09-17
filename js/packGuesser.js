// packGuesser.js
// Uses shared.js utilities and the site's seeded selection logic to pick a
// deterministic daily pack, then overlays the pack image with DOM tiles
// which are revealed progressively. Every 2 guesses reveals the next tile.

import { getGoalItem, notifyGoalGuessed } from './shared.js';

// Simple reveal thresholds (guesses at which each rect becomes visible)
const THRESHOLDS = [0, 2, 4, 6];

let overlay = null;
let imgEl = null;
let tiles = [];
let orderedTiles = [];
let revealedCount = 0;
let noteEl = null;

function updateRevealNote(currentGuesses){
  try {
    if (!noteEl) noteEl = document.getElementById('revealNoteText');
    if (!noteEl) return;
    const g = Number(currentGuesses || 0);
    // Count how many non-top tiles are unlocked at g
    const topIdx = orderedTiles.findIndex(t => t.i === 'top-left');
    const bottomsLen = topIdx >= 0 ? topIdx : orderedTiles.length;
    // Which tile index is next to reveal? (uses thresholds order)
    let nextIdx = 0;
    for (let i = 0; i < bottomsLen; i++) {
      const need = THRESHOLDS[i] ?? Infinity;
      if (g >= need) nextIdx = i + 1; else break;
    }
    // If all bottom tiles shown, keep note generic or show 0
    const noteWrap = noteEl.closest ? noteEl.closest('.reveal-note') : null;
    if (nextIdx >= bottomsLen) {
      if (noteWrap) noteWrap.style.display = 'none'; else noteEl.style.display = 'none';
      return;
    } else {
      if (noteWrap) noteWrap.style.display = ''; else noteEl.style.display = '';
    }
    const nextNeeded = THRESHOLDS[nextIdx] ?? Infinity;
    const left = Math.max(0, nextNeeded - g);
    noteEl.textContent = `Square revealed in ${left} ${left === 1 ? 'guess' : 'guesses'}`;
  } catch (e) { /* non-fatal */ }
}

// Custom rectangles in natural image pixels (as provided):
// initial: 221x58 from bottom-left
// then three rectangles 711x130 each to the right
const CUSTOM_RECTS = [ { w: 221, h: 58 }, { w: 711, h: 130 }, { w: 711, h: 130 }, { w: 711, h: 130 } ];


function buildTiles() {
  if (!imgEl || !overlay) return;
  overlay.innerHTML = '';
  tiles = [];
  orderedTiles = [];
  // Use natural image dimensions to compute percentage-based geometry so tiles
  // scale perfectly with the image during zoom/resizes (no pixel gaps).
  const naturalW = Math.max(1, Number(imgEl.naturalWidth) || 1);
  const naturalH = Math.max(1, Number(imgEl.naturalHeight) || 1);

  // Build tiles left-to-right anchored to the bottom edge (use % values)
  let xPerc = 0; // accumulated left offset in % of width
  for (let i = 0; i < CUSTOM_RECTS.length; i++) {
    const r = CUSTOM_RECTS[i] || { w: 0, h: 0 };
    let wPerc = (r.w / naturalW) * 100;
    if (i === 1) { wPerc = wPerc / 4.6; } // preserve empirical adjustment
    let hPerc = (r.h / naturalH) * 100;
    // Make the third tile (index 2) exactly match the second tile and sit to its right
    if (i === 2 && tiles.length > 1) {
      wPerc = tiles[1].wPerc;
      hPerc = tiles[1].hPerc;
    }

    const el = document.createElement('div');
    el.className = 'tile';
    el.style.position = 'absolute';
    el.style.left = xPerc + '%';
    el.style.bottom = '0%';
    el.style.width = wPerc + '%';
    el.style.height = hPerc + '%';
    overlay.appendChild(el);
    // Straight-edged tiles with outlined borders; no jagged clip-path.
    tiles.push({ i, leftPerc: xPerc, wPerc, hPerc, el });
    orderedTiles.push({ i, el });
    xPerc += wPerc;
  }

  // Stretch last tile to fill any remaining horizontal gap so tiles cover the image width
  if (tiles.length && xPerc < 100) {
    const last = tiles[tiles.length - 1];
    const newWperc = Math.max(0, 100 - last.leftPerc);
    last.wPerc = newWperc;
    last.el.style.width = newWperc + '%';
  }

  // Add a top-left cover (above the small initial bottom-left rect) that stays
  // covered until the user wins. Place it after other tiles so it only gets
  // revealed by `onCorrect()` (THRESHOLDS doesn't include it).
  if (tiles.length) {
    const first = tiles[0];
    const topHeightPerc = Math.max(0, 100 - first.hPerc);
    if (topHeightPerc > 0) {
      const topEl = document.createElement('div');
      topEl.className = 'tile';
      topEl.style.position = 'absolute';
      topEl.style.left = '0%';
      // anchor directly above the first bottom tile
      topEl.style.bottom = first.hPerc + '%';
      topEl.style.width = first.wPerc + '%';
      topEl.style.height = topHeightPerc + '%';
      // No jagged edges for the top tile either.
      overlay.appendChild(topEl);
      tiles.push({ i: 'top-left', leftPerc: 0, wPerc: first.wPerc, hPerc: topHeightPerc, el: topEl });
      // push last so it's only cleared on correct
      orderedTiles.push({ i: 'top-left', el: topEl });
    }
  }

  // Invert the reveal order for the bottom tiles (right-to-left) while keeping
  // the top-left cover as the final element so it only reveals on correct.
  try {
    const topIdx = orderedTiles.findIndex(t => t.i === 'top-left');
    const bottoms = topIdx >= 0 ? orderedTiles.slice(0, topIdx) : orderedTiles.slice();
    const tail = topIdx >= 0 ? orderedTiles.slice(topIdx) : [];
    orderedTiles = bottoms.reverse().concat(tail);
  } catch (e) { /* non-fatal reordering failure */ }

  // Ensure initial reveal state is applied immediately after building tiles.
  // This reveals the first square on page load (threshold 0) instead of after the first guess event.
  try {
    const applyInitial = () => {
      const currentGuesses = (window && typeof window === 'object' && typeof window.guessCount === 'number') ? window.guessCount : 0;
      revealTilesForGuesses(currentGuesses || 0);
    };
    // Defer to next frame so the browser commits initial styles before adding 'revealed'
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(applyInitial); else applyInitial();
  } catch (e) { revealTilesForGuesses(0); }
}

function revealTilesForGuesses(guessCount) {
  if (!orderedTiles || orderedTiles.length === 0) return;
  for (let idx = 0; idx < orderedTiles.length; idx++) {
    const needed = THRESHOLDS[idx] ?? Infinity;
    const tile = orderedTiles[idx];
    if (!tile || !tile.el) continue;
    if (guessCount >= needed && !tile._revealed) {
      tile.el.classList.add('revealed');
      tile._revealed = true;
      tile.el.addEventListener('transitionend', () => {
        try { if (tile.el && tile.el.parentNode) tile.el.parentNode.removeChild(tile.el); } catch (e) {}
      }, { once: true });
    }
  }
  updateRevealNote(guessCount);
}

function onGuessUpdated(e) {
  const guessCount = e?.detail?.guessCount || 0;
  revealTilesForGuesses(guessCount);
}

function onCorrect(e) {
  // Immediately reveal all tiles when guessed correctly
  if (!orderedTiles) return;
  orderedTiles.forEach(t => { if (t && t.el) t.el.classList.add('revealed'); });
  // Update note to reflect completion
  updateRevealNote(Number.MAX_SAFE_INTEGER);
}

function applyImage(iconUrl) {
  if (!imgEl) return;
  imgEl.src = iconUrl || '';
  const onLoaded = () => { setTimeout(buildTiles, 30); imgEl.removeEventListener('load', onLoaded); };
  imgEl.addEventListener('load', onLoaded);
  // If image already cached/loaded, build immediately
  if (imgEl.complete && imgEl.naturalWidth) { setTimeout(buildTiles, 20); imgEl.removeEventListener('load', onLoaded); }
}

function init() {
  imgEl = document.getElementById('packImage');
  overlay = document.getElementById('tileOverlay');
  if (!imgEl || !overlay) return;

  // Use existing goal item selected by shared.js; if missing, wait for it.
  const gi = getGoalItem && getGoalItem();
  if (gi && gi.icon) {
    // Mark game name so shared.recordWin records under 'pack'
    try { gi._gameName = 'pack'; } catch (e) {}
    applyImage(gi.icon);
  } else {
    // Poll a few times if goal not yet selected
    let attempts = 0;
    const t = setInterval(() => {
      attempts++;
      const g2 = getGoalItem && getGoalItem();
      if (g2 && g2.icon) { try { g2._gameName = 'pack'; } catch (e) {} applyImage(g2.icon); clearInterval(t); }
      if (attempts > 20) clearInterval(t);
    }, 100);
  }

  // Listen for guess updates from shared.js
  document.addEventListener('guess:updated', onGuessUpdated);
  document.addEventListener('guess:correct', onCorrect);

  // Rebuild tiles on resize to keep overlay in sync
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { buildTiles(); revealTilesForGuesses((window.guessCount || 0)); }, 120);
  });
}

// Auto-initialize when DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

// Expose helpers for testing/debugging
window.packGuesser = { buildTiles, revealTilesForGuesses, applyImage };
