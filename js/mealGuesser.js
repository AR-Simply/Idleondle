// mealGuesser.js
// Daily Meal guessing page logic. Reuses shared.js helpers (initShared, notifyGoalGuessed, etc.)
// Creates/updates per-game cookie: idleondle_win_meal and idleondle_last_win handled by shared.js recordWin().

import { initShared, notifyGoalGuessed, getDailyDeterministicIndex, setGoalItem, getGoalItem } from './shared.js';

// Configuration:
// - Dropdown suggestions come from SPICES (`idleon_spices.json`).
// - The actual daily goal to guess is a MEAL chosen deterministically from `idleon_meals.json`.
// - Cookies still record wins under the logical game id 'meal'.
// We therefore load a second dataset (meals) purely to override the goal item after initShared finishes.

// Utility to safely access nested properties
function safeLower(s){ try { return String(s||'').normalize('NFC').toLocaleLowerCase('en'); } catch(e){ return String(s||'').toLowerCase(); } }

// Seed offset so meal daily sequence is different from items/cards.
const SEED_OFFSET = 0; // Use same seed behavior as other games (no additional offset)

// Paths
const MEALS_JSON = '../json/idleon_meals.json';
const SPICES_JSON = '../json/idleon_spices.json';

// Internal cache of meals flattened to { name, icon, raw }
let _meals = [];
// Internal map of spice name -> { name, icon, raw }
let _spiceMap = Object.create(null);
// Game state for spice guessing
let _requiredSpices = [];
let _revealedSpices = new Set();
let _spiceImgMap = Object.create(null); // name -> <img>
let _mealWinFired = false;
let _guessCount = 0; // counts total user guesses until win
let _spiceSlotMap = Object.create(null); // name -> slot wrapper div

// Reveal spice silhouettes progressively: first spice visible from start, then one new outline every 2 guesses
function updateSpiceOutlineProgress() {
	try {
		if (!_requiredSpices.length) return;
		const total = _requiredSpices.length;
		const visibleSilhouettes = Math.min(1 + Math.floor(_guessCount / 2), total);
		_requiredSpices.forEach((name, idx) => {
			const img = _spiceImgMap[name];
			const slot = _spiceSlotMap[name] || (img ? img.parentNode : null);
			if (!img || !slot) return;
			const q = slot.querySelector('.spice-q');
			if (_revealedSpices.has(name)) {
				slot.style.display = 'inline-flex';
				img.style.filter = 'none';
				img.style.opacity = '1';
				img.style.display = 'inline-block';
				if (q) q.style.display = 'none';
				if (!img.alt && img.dataset.originalName) {
					img.alt = img.dataset.originalName;
					img.title = img.dataset.originalName;
				}
			} else {
				if (idx < visibleSilhouettes) {
					// Silhouette unlocked: show image darkened, hide '?'
					slot.style.display = 'inline-flex';
					img.style.display = 'inline-block';
					img.style.filter = 'brightness(0)';
					img.style.opacity = '0.18';
					if (q) q.style.display = 'none';
				} else {
					// Locked: hide image completely, show '?'
					slot.style.display = 'inline-flex';
					img.style.display = 'none';
					if (q) q.style.display = 'block';
				}
			}
		});
		// Progress note element
		let note = document.getElementById('mealSpiceProgress');
		const spiceBox = document.getElementById('mealSpiceBox');
		if (!note && spiceBox) {
			note = document.createElement('div');
			note.id = 'mealSpiceProgress';
			note.style.width = '100%';
			note.style.textAlign = 'center';
			note.style.fontSize = '12px';
			note.style.fontWeight = '600';
			note.style.letterSpacing = '0.4px';
			note.style.marginTop = '4px';
			note.style.opacity = '0.9';
			note.style.color = '#fff';
			spiceBox.appendChild(note);
		}
		if (note) {
			const currentVisible = Math.min(visibleSilhouettes, total);
			if (_revealedSpices.size === total || currentVisible === total) {
				// Hide the note entirely when everything is visible or revealed
				note.style.display = 'none';
			} else {
				note.style.display = 'block';
				const nextRevealAt = currentVisible * 2; // guess count when next silhouette appears
				const remaining = Math.max(0, nextRevealAt - _guessCount);
				note.textContent = `Outline revealed in ${remaining} wrong guess${remaining === 1 ? '' : 'es'}`;
			}
		}
	} catch(e){ /* non-fatal */ }
}

async function loadMeals() {
	try {
		const res = await fetch(MEALS_JSON, { cache: 'no-store' });
		if (!res.ok) throw new Error('Failed meals.json ' + res.status);
		const json = await res.json();
		const mealsNode = json.Meals || json.meals || json;
		const out = [];
		for (const [name, obj] of Object.entries(mealsNode)) {
			if (!name || !obj) continue;
			const icon = obj.icon || obj.Icon || obj.image;
			if (!icon) continue;
			out.push({ name: String(name), icon: resolveIconRelative(icon), raw: obj });
		}
		_meals = out;
	} catch (e) { console.warn('MealGuesser: could not load meals JSON', e); }
}

// Load spices JSON (for icon mapping when rendering required spices panel)
async function loadSpices() {
    try {
        const res = await fetch(SPICES_JSON, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed spices.json ' + res.status);
        const json = await res.json();
        const node = json.Spices || json.spices || json;
        for (const [name, obj] of Object.entries(node)) {
            if (!name || !obj) continue;
            const icon = obj.icon || obj.Icon || obj.image;
            if (!icon) continue;
            _spiceMap[name] = { name, icon: resolveIconRelative(icon), raw: obj };
        }
    } catch (e) { console.warn('MealGuesser: could not load spices JSON (icons)', e); }
}

// Resolve icons inside meals file (icons are relative, we assume they belong under images/meals or provided raw)
function resolveIconRelative(p){
	// Also normalise Windows style backslashes to forward slashes for web paths
	const cleaned = String(p||'')
		.replace(/^\.\/?/, '')
		.replace(/\\\\/g,'/')
		.replace(/\\/g,'/');
	// If the path already looks like an images path keep as-is, else prefix with ../images/ if not already
	if (/^https?:/i.test(cleaned)) return cleaned;
	if (cleaned.startsWith('../')) return cleaned;
	if (cleaned.startsWith('images/')) return '../' + cleaned;
	return '../images/' + cleaned; // fallback
}

// Deterministic daily meal selection independent from spices list
function pickDailyMeal(){
	if (!_meals.length) return null;
	const idx = getDailyDeterministicIndex(_meals.length, SEED_OFFSET);
	return _meals[idx] || null;
}

// After selection, check if guessed meal is goal and show modal (shared handles cookie recording)
function onSelectMeal(it){
	try {
		if (!it) return;
		if (!_mealWinFired) { _guessCount++; }
		// Tag item with friendly game name so shared.js records correct cookie
		it._gameName = 'meal';
		const goal = window.getGoalItem ? window.getGoalItem() : null;
		// If player guesses the meal name directly, count that as immediate win
		if (goal && goal.name === it.name) {
			// Correct full meal guess: reward by decrementing guess counter
			if (_guessCount > 0) _guessCount = Math.max(0, _guessCount - 1);
			if (!_mealWinFired) { _mealWinFired = true; notifyGoalGuessed(it); }
			// Remove spice overlay if present (direct meal guess win)
			try { const ov = document.getElementById('mealSpiceOverlay'); if (ov) ov.remove(); } catch(e){}
			return;
		}
		// Otherwise treat guesses as spice guesses; if the guessed item is a required spice, reveal it
		try {
			if (_requiredSpices.length && it && it.name) {
				// Normalize comparison similar to shared filter logic
				const guessName = it.name.trim();
				const matchIdx = _requiredSpices.findIndex(s => s === guessName);
				if (matchIdx !== -1 && !_revealedSpices.has(guessName)) {
					_revealedSpices.add(guessName);
					const img = _spiceImgMap[guessName];
					if (img) {
						img.classList.add('revealed');
						img.style.transition = 'filter 400ms ease, opacity 400ms ease';
							requestAnimationFrame(()=>{ img.style.filter='none'; img.style.opacity='1'; img.style.display='inline-block'; });
							// Restore alt/title now that spice is revealed
							if (!img.alt && img.dataset.originalName) {
								img.alt = img.dataset.originalName;
								img.title = img.dataset.originalName;
							}
							// Hide question mark overlay
							try { const slot = img.parentNode; const q = slot?.querySelector('.spice-q'); if (q) q.style.display='none'; } catch(e){}
					}
					// Correct spice guess: decrement guess counter as reward
					if (_guessCount > 0) _guessCount = Math.max(0, _guessCount - 1);
					// Win if all required spices are revealed
					if (_revealedSpices.size === _requiredSpices.length) {
						if (!_mealWinFired) {
							_mealWinFired = true;
							// Use goal meal as the winning item reference
								if (goal) notifyGoalGuessed(goal); else notifyGoalGuessed(it);
								// Remove spice overlay upon win
								try { const ov = document.getElementById('mealSpiceOverlay'); if (ov) ov.remove(); } catch(e){}
						}
					}
				}
			}
			// Update outline progression after processing spice guess
			updateSpiceOutlineProgress();
		} catch(e){ /* non-fatal spice reveal */ }
		// Update outline progression for any non-spice guess as well
		updateSpiceOutlineProgress();
	} catch(e){ /* non-fatal */ }
}

// Custom clue handler: reuse guessBtn2 for Category (e.g., Source or Type field in meal JSON)
const guessHandlers = {
	guessBtn2: () => {
		const btn = document.getElementById('guessBtn2');
		if (!btn || btn.disabled) return;
		try {
			const goal = window.getGoalItem ? window.getGoalItem() : null;
			const category = goal?.raw?.category || goal?.raw?.type || goal?.raw?.class || 'Unknown';
			btn.textContent = category;
			btn.setAttribute('aria-label', `Category: ${category}`);
		} catch(e){ /* ignore */ }
	}
};

// Initialise once DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
	// First load meals dataset (for goal selection)
	await loadMeals();
	// Load spices mapping so we can display required spice icons
	await loadSpices();
	// Initialise shared with SPICES for dropdown
	initShared({
		dataUrl: SPICES_JSON,
		imageBase: '../images',
		seedOffset: SEED_OFFSET, // still influences shared's internal shuffle but we will override goal
		onSelect: onSelectMeal,
		clueUnlocks: { category: 999 },
		guessButtonHandlers: guessHandlers
	});

	// After a short delay allow shared to finish; then set goal via public API
	setTimeout(() => {
		try {
			const mealGoal = pickDailyMeal();
			if (mealGoal) {
				setGoalItem(mealGoal);
				window.__mealDailyGoal = mealGoal;
				const titleEl = document.querySelector('.guess-title');
				if (titleEl) titleEl.textContent = "Guess today's IdleOn meal!";

				// Variant selection: 1=luck,2=fire,3=early using shared deterministic index
				// Use array length 3 so getDailyDeterministicIndex returns 0..2 then map +1
				let variantRaw = getDailyDeterministicIndex(3, 0); // 0,1,2
				const variant = (variantRaw % 3) + 1; // 1..3
				window.__mealDailyVariant = variant;

					const variantTextMap = {
						1: 'Best recipe by <span class="mv-key">Luck</span> for:',
						2: 'Best recipe by <span class="mv-key">Fire Time</span> for:',
						3: '<span class="mv-key">Earliest</span> Recipe for:'
					};

				// Insert label + recipe guidance under the combo (dropdown input wrapper)
				const combo = document.getElementById('combo');
				if (combo && combo.parentNode) {
					// Ensure a container wrapper for meal info (idempotent)
					let infoWrap = document.getElementById('mealDailyInfo');
					if (!infoWrap) {
						infoWrap = document.createElement('div');
						infoWrap.id = 'mealDailyInfo';
						infoWrap.style.margin = '16px auto 14px';
						infoWrap.style.width = 'min(425px, 90%)';
						infoWrap.style.display = 'flex';
						infoWrap.style.flexDirection = 'column';
						infoWrap.style.alignItems = 'center';
						infoWrap.style.gap = '12px';
						infoWrap.style.padding = '14px 18px 18px';
						infoWrap.style.background = 'rgba(20,24,48,0.65)';
						infoWrap.style.border = '1px solid rgba(122,162,255,0.25)';
						infoWrap.style.borderRadius = '12px';
						infoWrap.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
						infoWrap.style.backdropFilter = 'blur(4px)';
						infoWrap.style.webkitBackdropFilter = 'blur(4px)';
						combo.parentNode.insertBefore(infoWrap, combo.nextSibling);
					}

					// Label element
					let labelEl = document.getElementById('mealVariantLabel');
					if (!labelEl) {
						labelEl = document.createElement('div');
						labelEl.id = 'mealVariantLabel';
						labelEl.style.fontSize = '14px';
						labelEl.style.fontWeight = '700';
						labelEl.style.textAlign = 'center';
						labelEl.style.color = 'var(--text)';
						infoWrap.appendChild(labelEl);
					}
					// Enhanced heading: prepend 'Guess the ' and add richer styling
					const baseText = variantTextMap[variant] || '';
					labelEl.innerHTML =  baseText;
					labelEl.style.fontSize = '18px';
					labelEl.style.lineHeight = '1.2';
					labelEl.style.fontWeight = '800';
					labelEl.style.letterSpacing = '0.5px';
					labelEl.style.textShadow = '0 2px 6px rgba(0,0,0,0.55)';
					// Always use white base so red highlight stands out
					labelEl.style.background = 'none';
					labelEl.style.webkitBackgroundClip = '';
					labelEl.style.backgroundClip = '';
					labelEl.style.color = '#ffffff';
					try {
						labelEl.querySelectorAll('.mv-key').forEach(span => {
							span.style.color = '#ff4242';
							span.style.fontWeight = '900';
							span.style.textShadow = '0 1px 4px rgba(0,0,0,0.55)';
						});
					} catch(e) { /* ignore */ }

					// Meal image container
					let imgWrap = document.getElementById('mealDailyImageWrap');
					if (!imgWrap) {
						imgWrap = document.createElement('div');
						imgWrap.id = 'mealDailyImageWrap';
						imgWrap.style.display = 'flex';
						imgWrap.style.flexDirection = 'column';
						imgWrap.style.alignItems = 'center';
						imgWrap.style.gap = '4px';
						infoWrap.appendChild(imgWrap);
					}

					let imgEl = document.getElementById('mealDailyImage');
					if (!imgEl) {
						imgEl = document.createElement('img');
						imgEl.id = 'mealDailyImage';
						imgEl.style.width = '96px';
						imgEl.style.height = '96px';
						imgEl.style.objectFit = 'contain';
						imgEl.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))';
						imgWrap.appendChild(imgEl);
					}
					imgEl.alt = mealGoal.name || 'Daily meal';
					imgEl.src = mealGoal.icon || '../images/icon.png';
					imgEl.onerror = () => { imgEl.src = '../images/icon.png'; };
				}


				// ----- Required Spices Box (below mealDailyInfo) -----
				try {
					const variantKey = variant === 1 ? 'luck' : (variant === 2 ? 'fire' : 'early');
					const spiceNames = Array.isArray(mealGoal?.raw?.[variantKey]) ? mealGoal.raw[variantKey] : [];
					const entries = spiceNames.map(n => {
						const rec = _spiceMap[n];
						return { name: n, icon: rec?.icon || '../images/icon.png' };
					}).slice(0,4);
					// Persist required spices for guess checking
					_requiredSpices = entries.map(e => e.name);
					_revealedSpices = new Set();
					_spiceImgMap = Object.create(null);
					// Move spice box INSIDE mealDailyInfo and place it ABOVE the meal image
					const infoWrapCurrent = document.getElementById('mealDailyInfo');
					let spiceBox = document.getElementById('mealSpiceBox');
					if (!spiceBox) {
						spiceBox = document.createElement('div');
						spiceBox.id = 'mealSpiceBox';
						spiceBox.style.display = 'flex';
						spiceBox.style.flexWrap = 'wrap';
						spiceBox.style.gap = '14px';
						spiceBox.style.justifyContent = 'center';
						spiceBox.style.alignItems = 'center';
						spiceBox.style.width = '100%';
						spiceBox.style.padding = '8px 4px 4px';
						spiceBox.style.background = 'linear-gradient(180deg, rgba(23,26,44,0.55), rgba(23,26,44,0.35))';
						spiceBox.style.border = '1px solid rgba(122,162,255,0.2)';
						spiceBox.style.borderRadius = '10px';
						spiceBox.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35) inset';
						spiceBox.setAttribute('aria-label', 'Required spices');
						if (infoWrapCurrent) {
							// Insert at the top of the wrapper so it appears above variant label + image
							infoWrapCurrent.insertBefore(spiceBox, infoWrapCurrent.firstChild);
						}
					}
					spiceBox.innerHTML = '';
					entries.forEach(ent => {
						const img = document.createElement('img');
						img.src = ent.icon;
						// Hide metadata until reveal
						img.alt = '';
						img.title = '';
						img.dataset.originalName = ent.name;
						img.style.width = '64px';
						img.style.height = '64px';
						img.style.objectFit = 'contain';
						img.style.filter = 'brightness(0)';
						img.style.opacity = '0.18';
						img.style.borderRadius = '8px';
						img.style.background = 'rgba(255,255,255,0.02)';
						img.style.transition = 'filter 400ms ease, opacity 400ms ease';
						img.onerror = () => { img.src = '../images/icon.png'; };
						// Wrap in slot for '?' overlay
						const slot = document.createElement('div');
						slot.className = 'spice-slot';
						slot.style.position = 'relative';
						slot.style.width = '64px';
						slot.style.height = '64px';
						slot.style.display = 'inline-flex';
						slot.style.alignItems = 'center';
						slot.style.justifyContent = 'center';
						slot.style.pointerEvents = 'none';
						// Position img absolute for overlay stacking
						img.style.position = 'absolute';
						img.style.left = '0';
						img.style.top = '0';
						img.style.right = '0';
						img.style.bottom = '0';
						slot.appendChild(img);
						const q = document.createElement('span');
						q.className = 'spice-q';
						q.textContent = '?';
						q.style.position = 'relative';
						q.style.fontWeight = '900';
						q.style.fontSize = '36px';
						q.style.color = '#ffffffd9';
						q.style.textShadow = '0 2px 6px rgba(0,0,0,0.65)';
						slot.appendChild(q);
						spiceBox.appendChild(slot);
						_spiceImgMap[ent.name] = img;
						_spiceSlotMap[ent.name] = slot;
					});
					_guessCount = 0; // reset for new daily meal context
					updateSpiceOutlineProgress();
					// Add transparent anti-cheat overlay (blocks right-click / easy inspection)
					let overlay = document.getElementById('mealSpiceOverlay');
					if (!overlay) {
						overlay = document.createElement('div');
						overlay.id = 'mealSpiceOverlay';
						overlay.style.position = 'absolute';
						overlay.style.inset = '0';
						overlay.style.background = 'rgba(0,0,0,0)';
						overlay.style.cursor = 'default';
						overlay.style.zIndex = '5';
						overlay.style.pointerEvents = 'auto';
						overlay.setAttribute('aria-hidden', 'true');
						// Prevent context menu on overlay
						overlay.addEventListener('contextmenu', ev => { ev.preventDefault(); return false; });
						// Ensure parent is positioned for absolute overlay
						if (getComputedStyle(spiceBox).position === 'static') spiceBox.style.position = 'relative';
						spiceBox.appendChild(overlay);
					}

					// If the user has already won today's meal (cookie), reveal all spices immediately
					try {
						function _mealHasWinToday() {
							try {
								const key = 'idleondle_win_meal';
								const pair = (document.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(key + '='));
								if (!pair) return false;
								const raw = decodeURIComponent(pair.split('=')[1] || '');
								let timeStr = null;
								try { const parsed = JSON.parse(raw); if (parsed && parsed.time) timeStr = parsed.time; } catch(e){ timeStr = raw; }
								if (!timeStr) return false;
								const then = new Date(timeStr);
								if (isNaN(then.getTime())) return false;
								const now = new Date();
								return then.getFullYear()===now.getFullYear() && then.getMonth()===now.getMonth() && then.getDate()===now.getDate();
							} catch(e){ return false; }
						}
						if (_requiredSpices.length && _mealHasWinToday()) {
							_requiredSpices.forEach(name => {
								const img = _spiceImgMap[name];
								if (img) {
									img.style.filter = 'none';
									img.style.opacity = '1';
									if (!img.alt && img.dataset.originalName) {
										img.alt = img.dataset.originalName;
										img.title = img.dataset.originalName;
									}
								}
							});
							_revealedSpices = new Set(_requiredSpices);
							_mealWinFired = true; // prevent duplicate win logic later
							try { const ov = document.getElementById('mealSpiceOverlay'); if (ov) ov.remove(); } catch(e){}
						// Hide all question marks since all are revealed
						_requiredSpices.forEach(n=>{ try { const slot=_spiceSlotMap[n]; const q=slot?.querySelector('.spice-q'); if(q) q.style.display='none'; } catch(e){} });
						updateSpiceOutlineProgress();
						}
					} catch(e){ /* non-fatal */ }
					// Adjust gap so spice box separation from rest of content is clear
					if (infoWrapCurrent) infoWrapCurrent.style.gap = '16px';
				} catch (e) { console.warn('MealGuesser: failed to render spice box', e); }

				// Expose variant helper for debugging
				try { window.mealGuesser.variant = variant; } catch(e){}

				// Meal name label under the image (idempotent)
				try {
					const imgWrap2 = document.getElementById('mealDailyImageWrap');
					if (imgWrap2) {
						let nameLbl = document.getElementById('mealNameLabel');
						if (!nameLbl) {
							nameLbl = document.createElement('div');
							nameLbl.id = 'mealNameLabel';
							nameLbl.style.fontSize = '15px';
							nameLbl.style.fontWeight = '600';
							nameLbl.style.letterSpacing = '0.4px';
							nameLbl.style.marginTop = '4px';
							nameLbl.style.color = 'var(--text)';
							nameLbl.style.textAlign = 'center';
							imgWrap2.appendChild(nameLbl);
						}
						nameLbl.textContent = mealGoal.name || '';
					}
				} catch(e){ /* non-fatal */ }
			}
		} catch (e) { console.warn('MealGuesser goal override failed', e); }
	}, 120);
});

// Expose for debugging & modal integration
try {
 if (typeof window !== 'undefined') {
	 window.mealGuesser = Object.assign({}, window.mealGuesser || {}, {
		 onSelectMeal,
		 getRequiredSpices: () => _requiredSpices.map(name => ({ name, img: _spiceImgMap[name] || null })),
		 getSpiceMap: () => ({..._spiceMap})
	 });

	 // Inject spices into goal modal when it opens (meal-specific handling)
	 function injectSpicesIntoModal() {
		 try {
			 const modal = document.getElementById('goalModal');
			 if (!modal) return;
			 // Ensure we are on meal game (use body dataset OR pathname fallback)
			 const gameAttr = (document.body?.dataset?.game || '').toLowerCase();
			 const pathIsMeal = (location.pathname||'').toLowerCase().includes('meal');
			 if (gameAttr !== 'meal' && !pathIsMeal) return;
			 const goalIcon = document.getElementById('goalIcon');
			 const spiceIconsRow = document.getElementById('dailySpiceIcons');
			 const variantEl = document.getElementById('dailyRecipeVariant');
			 const goalNameEl = document.getElementById('goalName');
			 const mealGoal = window.__mealDailyGoal;
			 const haveSpices = Array.isArray(_requiredSpices) && _requiredSpices.length > 0;
			 // Update variant text + goal name formatting
			 const variant = window.__mealDailyVariant || 1;
			 const metric = variant === 1 ? 'Luck' : (variant === 2 ? 'Fire Time' : 'Earliest');
			 // Hide meal icon & name (we only show variant label now)
			 if (goalIcon) goalIcon.style.display = 'none';
			 if (goalNameEl) goalNameEl.style.display = 'none';
			 if (goalNameEl && mealGoal) goalNameEl.textContent = mealGoal.name || '';
			 if (variantEl) {
				 variantEl.textContent = `Best ${metric} Recipe`;
			 }
			 if (!haveSpices) { return; }
			 if (spiceIconsRow) {
				 spiceIconsRow.innerHTML='';
				 _requiredSpices.forEach(name => {
					 const imgSrc = _spiceMap[name]?.icon || '../images/icon.png';
					 const imgEl = document.createElement('img');
					 imgEl.src = imgSrc;
					 imgEl.alt = name;
					 imgEl.title = name;
					 imgEl.style.width = '60px';
					 imgEl.style.height = '60px';
					 imgEl.style.objectFit = 'contain';
					 imgEl.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.45))';
					 imgEl.style.borderRadius = '8px';
					 imgEl.style.background = 'rgba(255,255,255,0.05)';
					 spiceIconsRow.appendChild(imgEl);
				 });
			 }
			 // Deemphasize goalIcon compared to spices (optional keep both)
			 // Ensure icon stays hidden
			 if (goalIcon) goalIcon.style.display = 'none';
		 } catch(e){ /* non-fatal */ }
	 }

	 // Listen for the shared guess:correct event to inject after win
	 document.addEventListener('guess:correct', () => {
		 // Slight delay to let modal build first
		 setTimeout(() => { injectSpicesIntoModal(); }, 60);
	 });
	 // Also attempt injection when modal becomes visible (observer fallback)
	 const observer = new MutationObserver(muts => {
		 for (const m of muts) {
			 if (m.type === 'attributes' && m.target.id === 'goalModal') {
				 const hidden = m.target.getAttribute('aria-hidden');
				 if (hidden === 'false') {
					 setTimeout(() => injectSpicesIntoModal(), 50);
				 }
			 }
		 }
	 });
	 try { const gm = document.getElementById('goalModal'); if (gm) observer.observe(gm, { attributes: true }); } catch(e){}
	 window.mealGuesser.injectSpicesIntoModal = injectSpicesIntoModal;
 }
} catch(e){}