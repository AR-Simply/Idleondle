// js/mapGuesser.js
import { initShared, getGoalItem } from './shared.js';

// Module-level state for map zoom control
let _mapImg = null;
let _currentScale = null;
let _scaleStep = 0.75; // fallback amount (not used by multiplicative mode)
// default start zoom (exportable/overrideable)
export let START_ZOOM = 8.4;
// Number of equal zoom steps to reach full reveal (1)
export let ZOOM_STEPS = 8;
let _initialScale = null;
let _zoomMultiplier = null; // multiplicative factor applied each guess

export function setStartZoom(v) { try { START_ZOOM = Number(v) || START_ZOOM; } catch(e){} }
export function setZoomSteps(n) { try { ZOOM_STEPS = Math.max(1, Math.floor(Number(n) || ZOOM_STEPS)); if (_initialScale) { _zoomMultiplier = Math.pow(1 / Math.max(1, _initialScale), 1 / ZOOM_STEPS); } } catch(e){} }

function cornerToOrigin(c) {
  switch ((c || '').toLowerCase()) {
    case 'tr': return '100% 0%';
    case 'bl': return '0% 100%';
    case 'br': return '100% 100%';
    case 'tl':
    default: return '0% 0%';
  }
}

function setMapScale(scale) {
  try {
    if (!_mapImg) return;
    _currentScale = Number(scale) || 1;
    _mapImg.style.transition = 'transform 320ms ease';
    // Preserve the centering translate used in CSS (translate(-50%,-50%)) so
    // scaling does not remove the centering and shift the image to one side.
    // Compose translate + scale into the transform property.
    _mapImg.style.transform = `translate(-50%, -50%) scale(${_currentScale})`;
  } catch (e) { console.warn('setMapScale failed', e); }
}

// Render a simple daily map icon below the combo (search + dropdown)
export async function initMapGuesser(options = {}) {
  const mapGuessHandlers = {
    guessBtn1: () => {
      const gb1 = document.getElementById('guessBtn1'); if (!gb1 || gb1.disabled) return;
      const g = getGoalItem();
      const world = g?.raw?.world || g?.raw?.World || 'Unknown';
      gb1.textContent = world;
      gb1.setAttribute('aria-label', `World: ${world}`);
    },
    guessBtn2: () => {
      const gb2 = document.getElementById('guessBtn2'); if (!gb2 || gb2.disabled) return;
      const g = getGoalItem();
      const enemy = g?.raw?.enemy || g?.raw?.Enemy || 'Unknown';
      gb2.textContent = enemy;
      gb2.setAttribute('aria-label', `Enemy: ${enemy}`);
    }
  };

  const sharedConfig = Object.assign({
    dataUrl: '../json/idleon_maps.json',
    imageBase: '../images',
    guessButtonHandlers: mapGuessHandlers
  }, options || {});

  await initShared(sharedConfig);

  try {
    const goal = getGoalItem();
    const container = document.createElement('div');
    container.id = 'dailyMap';
    container.className = 'daily-map';

    const img = document.createElement('img');
    img.className = 'daily-map-img';
    img.alt = goal?.name || 'Daily map';
    img.src = goal?.icon || ('../images/icon.png');
    img.onerror = () => { img.src = '../images/icon.png'; };

    container.appendChild(img);

    // overlay to prevent direct interaction / saving by right-click
    const overlay = document.createElement('div');
    overlay.className = 'daily-map-overlay';
    overlay.addEventListener('contextmenu', (ev) => { ev.preventDefault(); });
    overlay.addEventListener('dragstart', (ev) => { ev.preventDefault(); });
    container.appendChild(overlay);

    const combo = document.getElementById('combo');
    if (combo && combo.parentNode) combo.parentNode.insertBefore(container, combo.nextSibling);

    // remember for zoom handling
    _mapImg = img;

    // determine initial scale and step (allow override via options)
    _initialScale = (typeof options.initialScale === 'number') ? options.initialScale : (Number(options.initialScale) || START_ZOOM);
    _scaleStep = Number(options.scaleStep) || _scaleStep;
    // compute multiplicative zoom multiplier so that after ZOOM_STEPS guesses
    // the scale reaches 1: multiplier^ZOOM_STEPS = 1/_initialScale  => multiplier = (1/_initialScale)^(1/ZOOM_STEPS)
    try {
      const steps = (typeof options.zoomSteps === 'number') ? options.zoomSteps : (Number(options.zoomSteps) || ZOOM_STEPS);
      ZOOM_STEPS = Math.max(1, Math.floor(steps));
      _zoomMultiplier = Math.pow(1 / Math.max(1, _initialScale), 1 / ZOOM_STEPS);
    } catch (e) { _zoomMultiplier = 1; }

    // Determine starting corner from JSON if present
    const start = (goal && goal.raw && goal.raw.start) ? String(goal.raw.start) : 'tl';
    const origin = cornerToOrigin(start);
    try { _mapImg.style.transformOrigin = origin; } catch (e) {}
    // Also set object-position to keep the focused corner visible when scaled
    try {
      if (origin === '0% 0%') _mapImg.style.objectPosition = '0% 0%';
      else if (origin === '100% 0%') _mapImg.style.objectPosition = '100% 0%';
      else if (origin === '0% 100%') _mapImg.style.objectPosition = '0% 100%';
      else if (origin === '100% 100%') _mapImg.style.objectPosition = '100% 100%';
    } catch (e) {}

  // Apply initial scale
  _currentScale = _initialScale;
    setMapScale(_currentScale);

    // Listen for guess events to zoom out gradually
    try {
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('guess:updated', (e) => {
          try {
            // Determine guess count from event or global
            const guessNum = (e && e.detail && typeof e.detail.guessCount === 'number') ? e.detail.guessCount : (typeof window !== 'undefined' && typeof window.guessCount === 'number' ? window.guessCount : null);
            if (guessNum === null) {
              // Fallback: apply one multiplicative step
              _currentScale = Math.max(1, (_currentScale || _initialScale) * (_zoomMultiplier || 1));
            } else {
              // Deterministic multiplicative scale based on number of guesses so each guess reduces by the same ratio
              _currentScale = Math.max(1, _initialScale * Math.pow(_zoomMultiplier || 1, guessNum));
            }
            setMapScale(_currentScale);
          } catch (err) { /* non-fatal */ }
        });
        document.addEventListener('guess:correct', (e) => {
          try {
            _currentScale = 1;
            setMapScale(1);
          } catch (err) { /* non-fatal */ }
        });
      }
    } catch (e) { /* non-fatal */ }

  } catch (e) {
    console.warn('Failed to render daily map', e);
  }
}

// Auto-init when imported, but skip automatic initialization for explicit
// hard-mode pages so those pages can call initMapGuesser with custom options.
if (typeof window !== 'undefined') {
  try {
    const isHard = !!(document && document.body && document.body.dataset && document.body.dataset.hard);
    if (!isHard) {
      initMapGuesser().catch(e => console.error('MapGuesser init failed', e));
    }
  } catch (e) { /* non-fatal */ }
  window.mapGuesser = window.mapGuesser || {};
  window.mapGuesser.initMapGuesser = initMapGuesser;
  window.mapGuesser.START_ZOOM = START_ZOOM;
  window.mapGuesser.setStartZoom = setStartZoom;
  window.mapGuesser.setZoomSteps = setZoomSteps;
}

export default { initMapGuesser };
