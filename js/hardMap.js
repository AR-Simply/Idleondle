// js/hardMap.js
// Initializes the Map Guesser in hard mode (uses same logic as mapGuesser but with hard dataset/seedOffset)
import { initMapGuesser } from './mapGuesser.js';

// Mark page as hard-mode for shared detection and cookie naming
try { if (document?.body) { document.body.dataset.hard = 'map'; document.body.dataset.game = 'hard_map'; } } catch (e) { /* non-fatal */ }

// Initialize with map-specific hard options: use a separate seed offset and (optionally)
// a different JSON dataset if one exists. For now we reuse the standard maps JSON but set
// seedOffset to isolate the daily sequence and bump clue unlocks if desired.

const cfg = {
  // Use the same dataset; if you want a special hard dataset, change this path to json/idleon_maps_hard.json
  dataUrl: '../json/idleon_maps.json',
  imageBase: '../images',
  // Hard mode: clue thresholds specific for hard map
  // First clue (world) unlocks after 5 guesses; second (enemy/category) unlocks after 9 guesses
  clueUnlocks: { world: 5, category: 9 },
  // seedOffset separates the hard sequence from normal map sequence
  seedOffset: 997,
  // Scale / zoom options could be tuned here if desired
  // initialScale: 10,
   zoomSteps: 14,
  // onSelect can be left undefined; default shared behavior will notify correct guess
};

// Wait for DOMContentLoaded to ensure shared UI elements are present
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Initialize map guesser and then post-process the inserted DOM so we can
    // apply visual transforms without interfering with the image's own
    // transform (translate + scale) used by mapGuesser for zooming.
    Promise.resolve(initMapGuesser(cfg)).then(() => {
      try {
        // The mapGuesser inserts an element with id 'dailyMap' containing
        // the image (class 'daily-map-img') and an overlay (class 'daily-map-overlay').
        const daily = document.getElementById('dailyMap');
        if (!daily) return;

        // If already wrapped, skip
        if (daily.parentElement && daily.parentElement.classList.contains('hard-map-wrap')) return;

  // Measure the current frame size BEFORE reparenting. Reparenting the
  // element into a new wrapper can change layout immediately and yield
  // an incorrect (collapsed) bounding rect on some mobile browsers.
  let initialRect = null;
  try { initialRect = daily.getBoundingClientRect(); } catch (e) { initialRect = null; }

  // Create wrapper that applies rotate + mirror + grayscale filter
  const wrap = document.createElement('div');
  wrap.className = 'hard-map-wrap';
  // Insert wrapper and move the daily element inside it
  daily.parentNode.insertBefore(wrap, daily);
  wrap.appendChild(daily);

  // If measurement before reparent succeeded, use it; otherwise a later
  // sizing pass will attempt to compute correct dimensions.

        // Apply styles directly so the effect is immediate and isolated.
        // The wrapper will rotate 180deg, mirror horizontally (scaleX(-1))
        // and apply greyscale. Use transform-style preserve-3d to avoid
        // interfering with child's transforms.
        wrap.style.display = 'inline-flex';
        wrap.style.position = 'relative';
        wrap.style.transform = 'rotate(180deg) scaleX(-1)';
        wrap.style.filter = 'grayscale(100%)';
        wrap.style.transformStyle = 'preserve-3d';
        wrap.style.alignItems = 'center';
        wrap.style.justifyContent = 'center';

        // Helper to remove greyscale when the hard map is completed
        const colorizeMap = () => {
          try {
            // Keep rotation + mirror but remove greyscale so image returns to color
            wrap.style.filter = '';
            // mark state for potential styling hooks
            wrap.classList.add('hard-map-revealed');
          } catch (e) { /* non-fatal */ }
        };

        // Small helper: check whether a per-game win cookie exists for today
        const hasWinToday = (gameKey) => {
          try {
            const safe = String(gameKey || '').toLowerCase().replace(/[^a-z0-9_-]+/gi, '_');
            const k = 'idleondle_win_' + safe;
            const pairs = (document.cookie || '').split(';').map(s => s.trim()).filter(Boolean);
            let v = null;
            for (const p of pairs) {
              const idx = p.indexOf('=');
              const name = idx === -1 ? p : p.slice(0, idx);
              const val = idx === -1 ? '' : decodeURIComponent(p.slice(idx + 1));
              if (name === k) { v = val; break; }
            }
            if (!v) return false;
            let iso = null;
            try { const parsed = JSON.parse(v); iso = parsed && parsed.time ? parsed.time : null; } catch (e) { iso = v; }
            if (!iso) return false;
            const then = new Date(iso);
            if (isNaN(then.getTime())) return false;
            const now = new Date();
            return then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate();
          } catch (e) { return false; }
        };

        // If the user already completed today's hard map, reveal colors immediately
        try { if (hasWinToday('hard_map')) colorizeMap(); } catch (e) { /* non-fatal */ }

        // Listen for the global correct-guess event so we can reveal the map on win
        try {
          document.addEventListener('guess:correct', (ev) => {
            try { colorizeMap(); } catch (e) { /* non-fatal */ }
          });
        } catch (e) { /* non-fatal */ }

        // Small-screen bugfix: some mobile browsers compute sizes after
        // transforms and this can cause the wrapper to collapse when the
        // page is loaded at small viewport sizes. Copy the computed
        // dimensions of the `.daily-map` frame into the wrapper so it
        // preserves layout. Observe for changes and update on resize.
        const updateWrapperSize = () => {
          try {
            let rect = null;
            // Prefer the pre-reparent measurement if available and looks valid
            if (initialRect && initialRect.width > 4 && initialRect.height > 4) rect = initialRect;
            else rect = daily.getBoundingClientRect();
            // Use pixel sizes to avoid percentage collapse; keep min sizes
            if (rect && rect.width > 2 && rect.height > 2) {
              wrap.style.width = Math.round(rect.width) + 'px';
              wrap.style.height = Math.round(rect.height) + 'px';
            }
          } catch (e) { /* non-fatal */ }
        };

        // Debounce helper
        let _ts = 0; const debounceUpdate = () => { const now = Date.now(); if (now - _ts < 80) { clearTimeout(debounceUpdate._t); debounceUpdate._t = setTimeout(() => { _ts = Date.now(); updateWrapperSize(); }, 120); return; } _ts = now; updateWrapperSize(); };

        // Initial sizing pass using the pre-measured rect (if any).
        debounceUpdate();

        // If the initial measurement was extremely small (collapse), try a
        // delayed retry after layout finishes (helps on slow devices).
        try {
          if (!initialRect || initialRect.width < 6) {
            setTimeout(() => { try { initialRect = daily.getBoundingClientRect(); debounceUpdate(); } catch (e) {} }, 220);
          }
        } catch (e) { /* non-fatal */ }

        // Use ResizeObserver when available (observe the daily frame for layout changes)
        try {
          if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => debounceUpdate());
            ro.observe(daily);
            // Also observe the wrapper's parent in case layout shifts occur
            if (wrap.parentElement) ro.observe(wrap.parentElement);
          } else {
            // Fallback: listen for window resize
            window.addEventListener('resize', debounceUpdate);
          }
        } catch (e) { window.addEventListener('resize', debounceUpdate); }

        // Ensure the overlay still blocks interactions (overlay sits inside dailyMap)
        // no further action required because we moved the exact DOM structure.
      } catch (e) { console.error('hardMap post-processing failed', e); }
    }).catch(e => { console.error('initMapGuesser promise rejected', e); });

  } catch (e) { console.error('hardMap init failed', e); }
});

export default { initHardMap: (o) => initMapGuesser(Object.assign({}, cfg, o || {})) };
