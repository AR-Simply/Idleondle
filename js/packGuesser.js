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

// Custom rectangles in natural image pixels (as provided):
// initial: 221x58 from bottom-left
// then three rectangles 711x130 each to the right
const CUSTOM_RECTS = [ { w: 221, h: 58 }, { w: 711, h: 130 }, { w: 711, h: 130 }, { w: 711, h: 130 } ];

function buildTiles() {
  if (!imgEl || !overlay) return;
  overlay.innerHTML = '';
  tiles = [];
  orderedTiles = [];

  // Prefer overlay's layout size (it's positioned over the image). Fall back to image rect.
  const rect = imgEl.getBoundingClientRect();
  const overlayW = overlay.clientWidth || Math.round(rect.width);
  const overlayH = overlay.clientHeight || Math.round(rect.height);
  const displayW = Math.max(1, Math.round(overlayW));
  const displayH = Math.max(1, Math.round(overlayH));

  // Scale from natural pixels if available otherwise assume 1:1
  const scaleX = imgEl.naturalWidth ? (displayW / imgEl.naturalWidth) : 1;
  const scaleY = imgEl.naturalHeight ? (displayH / imgEl.naturalHeight) : 1;

  // Build tiles left-to-right anchored to the bottom edge (use style.bottom)
  let x = 0;
  for (let i = 0; i < CUSTOM_RECTS.length; i++) {
    const r = CUSTOM_RECTS[i] || { w: 0, h: 0 };
    let w = Math.max(1, Math.round(r.w * scaleX));
     if (i === 1) {
      w = Math.max(1, Math.round(w /5));
    }
    let h = Math.max(1, Math.round(r.h * scaleY));
    // Make the third tile (index 2) exactly match the second tile and sit to its right
    if (i === 2 && tiles.length > 1) {
      w = tiles[1].w;
      h = tiles[1].h;
    }

    const el = document.createElement('div');
    el.className = 'tile';
    el.style.position = 'absolute';
    el.style.left = x + 'px';
    el.style.bottom = '0px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    overlay.appendChild(el);
    tiles.push({ i, x, w, h, el });
    orderedTiles.push({ i, el });
    x += w;
  }

  // Stretch last tile to fill any remaining horizontal gap so tiles cover the image width
  if (tiles.length && x < displayW) {
    const last = tiles[tiles.length - 1];
    const newW = displayW - last.x;
    last.w = newW;
    last.el.style.width = newW + 'px';
  }

  // Add a top-left cover (above the small initial bottom-left rect) that stays
  // covered until the user wins. Place it after other tiles so it only gets
  // revealed by `onCorrect()` (THRESHOLDS doesn't include it).
  if (tiles.length) {
    const first = tiles[0];
    const topHeight = Math.max(0, displayH - first.h);
    if (topHeight > 0) {
      const topEl = document.createElement('div');
      topEl.className = 'tile';
      topEl.style.position = 'absolute';
      topEl.style.left = '0px';
      // anchor directly above the first bottom tile
      topEl.style.bottom = first.h + 'px';
      topEl.style.width = first.w + 'px';
      topEl.style.height = topHeight + 'px';
      overlay.appendChild(topEl);
      tiles.push({ i: 'top-left', x: 0, w: first.w, h: topHeight, el: topEl });
      // push last so it's only cleared on correct
      orderedTiles.push({ i: 'top-left', el: topEl });
    }
  }
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
}

function onGuessUpdated(e) {
  const guessCount = e?.detail?.guessCount || 0;
  revealTilesForGuesses(guessCount);
}

function onCorrect(e) {
  // Immediately reveal all tiles when guessed correctly
  if (!orderedTiles) return;
  orderedTiles.forEach(t => { if (t && t.el) t.el.classList.add('revealed'); });
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
