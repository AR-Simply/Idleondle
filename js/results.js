// js/results.js
// Render a Daily Results box by reading cookies created by shared.js
import { initShared } from './shared.js';

// Centralized, easy-to-extend game ordering and labels
const GAME_DISPLAY_ORDER = [
	'item',        // Item Guesser
	'hard_item',   // HARD Item Guesser
	'card',        // Card Guesser
	'hard_card',   // HARD Card Guesser
	'monster',     // Monster Guesser
	'hard_monster', // HARD Monster Guesser
	'map',        // Map Guesser
	'hard_map',    // HARD Map Guesser
	'meal',        // Meal Guesser
	'pack',         // Pack Guesser
	'npc',         // NPC Guesser
	'recipe'       // Recipe Guesser
];
const GAME_LABELS = {
	item: 'Item Guesser',
	hard_item: 'HARD Item Guesser',
	card: 'Card Guesser',
	hard_card: 'HARD Card Guesser',
	monster: 'Monster Guesser',
	hard_monster: 'HARD Monster Guesser',
	map: 'Map Guesser',
	hard_map: 'HARD Map Guesser',
	meal: 'Meal Guesser',
	pack: 'Pack Guesser',
    npc: 'NPC Guesser',
	recipe: 'Recipe Guesser'
};
const normKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '_');

function safeLower(s) { try { return String(s).normalize('NFC').toLocaleLowerCase('en'); } catch(e){ return String(s||'').toLowerCase(); } }

function getCookie(name) {
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
	return null;
}

function parseWinPayload(val) {
	if (!val) return null;
	try { const p = JSON.parse(val); if (p && p.time) return p; } catch (e) {}
	// legacy ISO string
	const d = new Date(val);
	if (isNaN(d.getTime())) return null;
	return { time: d.toISOString(), guesses: 0 };
}

function isTodayISOString(iso) {
	if (!iso) return false;
	const then = new Date(iso);
	if (isNaN(then.getTime())) return false;
	const now = new Date();
	return then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate();
}

function collectWinsToday() {
	const wins = [];
	try {
		const pairs = document.cookie.split(';').map(s => s.trim()).filter(Boolean);
		for (const p of pairs) {
			const eq = p.indexOf('=');
			const k = eq === -1 ? p : p.slice(0, eq);
			const v = eq === -1 ? '' : decodeURIComponent(p.slice(eq+1));
			if (!k.startsWith('idleondle_win_')) continue;
					const gameRaw = k.slice('idleondle_win_'.length) || 'unknown';
					const gameName = gameRaw.replace(/_/g, ' ');
			const payload = parseWinPayload(v);
			if (payload && isTodayISOString(payload.time)) {
				wins.push({ key: k, game: gameName, guesses: Number(payload.guesses) || 0, time: payload.time });
			}
		}
	} catch (e) { /* non-fatal */ }
	// Sort using a fixed, easy-to-extend display order. Fall back to time.
	const rank = (g) => {
		const k = normKey(g);
		const i = GAME_DISPLAY_ORDER.indexOf(k);
		return i === -1 ? Number.POSITIVE_INFINITY : i;
	};
	wins.sort((a,b) => {
		const ra = rank(a.game);
		const rb = rank(b.game);
		if (ra !== rb) return ra - rb;
		// Same bucket: fall back to earlier completion first
		return new Date(a.time) - new Date(b.time);
	});
	return wins;
}

function resolveIcon(src) {
	if (!src) return '../images/Gem.png';
	// If src already looks like a URL or path, return it; otherwise default
	return src;
}

function renderResultsBox() {
	const container = document.getElementById('resultsList');
	if (!container) return;
	const wins = collectWinsToday();
	container.innerHTML = '';
	// Center everything inside the results area
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.alignItems = 'center';
	container.style.justifyContent = 'flex-start';
	container.style.gap = '6px';
	container.style.padding = '4px 0';

	if (!wins.length) {
		const em = document.createElement('em'); em.textContent = 'Win some games and come back'; em.style.fontStyle = 'italic'; container.appendChild(em); return;
	}

	const list = document.createElement('div'); list.className = 'results-items';
	list.style.display = 'flex'; list.style.flexDirection = 'column'; list.style.gap = '4px'; list.style.width = '100%';
			for (const w of wins) {
			const row = document.createElement('div'); row.className = 'results-row results-row-line';
			row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'space-between';
			row.style.gap = '8px'; row.style.width = '100%'; row.style.maxWidth = '360px'; row.style.margin = '0 auto';

			const leftWrap = document.createElement('div'); leftWrap.className = 'results-line-left';
				const raw = w.game.trim();
				const key = normKey(raw);
				const friendly = GAME_LABELS[key] || capitalizeWords(raw);
				const nameSpan = document.createElement('span'); nameSpan.className = 'results-game-line'; nameSpan.textContent = friendly + ':';
				// Mark hard modes visually (red text)
				if (/hard/i.test(friendly)) nameSpan.classList.add('hard-mode');
			leftWrap.appendChild(nameSpan);

			const rightWrap = document.createElement('div'); rightWrap.className = 'results-line-right'; rightWrap.style.display = 'flex'; rightWrap.style.alignItems = 'center'; rightWrap.style.gap = '6px';
			const guessesSpan = document.createElement('span'); guessesSpan.className = 'results-meta-line'; guessesSpan.textContent = w.guesses;
			// Determine rank icon based on guesses and mode
			const isHard = /hard/i.test(friendly);
			const rank = determineRank(w.guesses, isHard);
			const icon = document.createElement('img');
			icon.className = 'results-gem rank-icon';
			icon.alt = 'rank ' + rank;
			icon.src = buildRankIcon(rank);
			rightWrap.appendChild(guessesSpan); rightWrap.appendChild(icon);

			row.appendChild(leftWrap);
			row.appendChild(rightWrap);
			list.appendChild(row);
		}
	container.appendChild(list);

	// Footer section (title image + thank you + countdown)
	const footer = document.createElement('div');
	footer.className = 'results-end-section';
	footer.style.display = 'flex';
	footer.style.flexDirection = 'column';
	footer.style.alignItems = 'center';
	footer.style.justifyContent = 'center';
	footer.style.marginTop = wins.length ? '18px' : '12px';
	footer.style.gap = '6px';

	const titleImg = document.createElement('img');
	titleImg.src = '../images/title.png';
	titleImg.alt = 'Idleondle';
	titleImg.style.width = '240px';
	titleImg.style.maxWidth = '80%';
	titleImg.style.filter = 'drop-shadow(0 4px 10px rgba(0,0,0,0.35))';

	const thanks = document.createElement('div');
	thanks.textContent = 'Thank you for playing!';
	thanks.style.fontWeight = '800';
	thanks.style.fontSize = '18px';
	thanks.style.letterSpacing = '0.5px';

	const see = document.createElement('div');
	see.textContent = 'Keep your streak alive! See you in:';
	see.style.fontSize = '13px';
	see.style.fontWeight = '600';
	see.style.color = 'var(--muted)';
	see.style.marginTop = '2px';

    // Use same structure and classes as goal modal timer
    const timerWrap = document.createElement('div');
    timerWrap.className = 'goal-timer-wrap';
    const timer = document.createElement('span');
    timer.className = 'goal-timer';
    timer.id = 'resultsMidnightTimer';
    timer.textContent = '00:00:00';

	footer.appendChild(titleImg);
	footer.appendChild(thanks);
	footer.appendChild(see);
	timerWrap.appendChild(timer);
	footer.appendChild(timerWrap);

	// Insert copy button at the very top of the end section (above title)
	try {
		const copyBtn = document.createElement('button');
		copyBtn.id = 'copyResultsBtn';
		copyBtn.type = 'button';
		copyBtn.className = 'guess-btn';
		copyBtn.textContent = 'Copy Results';
		copyBtn.setAttribute('aria-label','Copy daily results');
		copyBtn.title = 'Copy daily results';
		copyBtn.style.marginBottom = '8px';
		footer.insertBefore(copyBtn, footer.firstChild);
		copyBtn.addEventListener('click', copyShareText);
	} catch(e) { /* non-fatal */ }

	// Ko-fi support link
	const kofiMsg = document.createElement('div');
	kofiMsg.textContent = 'Follow on Ko-fi for development updates and news';
	kofiMsg.style.fontSize = '13px';
	kofiMsg.style.fontWeight = '600';
	kofiMsg.style.color = 'var(--muted)';
	kofiMsg.style.marginTop = '8px';
	kofiMsg.style.textAlign = 'center';
	footer.appendChild(kofiMsg);
	const kofi = document.createElement('div');
	kofi.style.marginTop = '6px';
	kofi.innerHTML = "<a href='https://ko-fi.com/S6S51KOEMK' target='_blank' rel='noopener'><img height='36' style='border:0;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' alt='Buy Me a Coffee at ko-fi.com' /></a>";
	footer.appendChild(kofi);
	container.appendChild(footer);

	startMidnightCountdown(timer);
}

// --- Page switcher completion marking (results page only) ---
function hasWinToday(game) {
	try {
		const key = 'idleondle_win_' + safeLower(String(game || 'unknown').replace(/[^a-z0-9_-]+/gi, '_'));
		const val = getCookie(key);
		if (!val) return false;
		let iso = null;
		try { const parsed = JSON.parse(val); if (parsed && parsed.time) iso = parsed.time; } catch (e) { iso = val; }
		if (!iso) return false;
		const d = new Date(iso); if (isNaN(d.getTime())) return false;
		const now = new Date();
		return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
	} catch (e) { return false; }
}

// Page switcher completion is handled centrally in js/shared.js now; remove results-only special-casing

function capitalizeWords(s){ return String(s||'').split(' ').map(w=> w ? w[0].toUpperCase()+w.slice(1) : '').join(' ').trim(); }

function copyShareText() {
	const wins = collectWinsToday();
	const header = 'Can you beat my Idleondle results?';
	// Use full https URL in plain text so most platforms auto-link it
	const footerText = 'https://idleondle.com';
	const footerUrl = 'https://idleondle.com';
	if (!wins.length) {
		const emptyTxt = `${header}\n${footerText}`;
		if (navigator.clipboard?.writeText) navigator.clipboard.writeText(emptyTxt).then(()=> showToast('Nothing yet – copied template!')).catch(()=> showToast('Copy failed.'));
		return;
	}
	// Map rank numbers to emoji
	const rankEmoji = { 1:'🎖️', 2:'🥈', 3:'🥉', 4:'🎀', 5:'💀' };
	const lines = wins.map(w => {
		const raw = w.game.trim();
		const key = normKey(raw);
		const friendly = GAME_LABELS[key] || capitalizeWords(raw);
		const isHard = /hard/i.test(friendly);
		const rank = determineRank(w.guesses, isHard);
		const emoji = rankEmoji[rank] || '💀';
		// Desired format: <gamename>: <score><emoji>
		return { text: `${friendly}: ${w.guesses}${emoji}`, friendly, rank, guesses: w.guesses, emoji };
	});
	const plainLines = lines.map(l => l.text);
	const plainText = `${header}\n` + plainLines.join('\n') + `\n${footerText}`;
	// Build minimal HTML variant for richer paste targets
	// HTML mirrors plain format: <gamename>: <score><emoji> with score bolded
	const htmlLines = lines.map(l => `<div>${escapeHtml(l.friendly)}: <strong>${l.guesses}</strong>${l.emoji}</div>`).join('');
	const html = `<div>${escapeHtml(header)}</div>${htmlLines}<div><a href="${footerUrl}" target="_blank" rel="noopener">${escapeHtml(footerText)}</a></div>`;
	// Try rich clipboard first
	if (navigator.clipboard && window.ClipboardItem) {
		try {
			const data = new ClipboardItem({
				'text/plain': new Blob([plainText], { type: 'text/plain' }),
				'text/html': new Blob([html], { type: 'text/html' })
			});
			navigator.clipboard.write([data]).then(()=> showToast('Results copied!')).catch(()=> {
				// Fallback to plain text
				navigator.clipboard.writeText(plainText).then(()=> showToast('Results copied (text only)')).catch(()=> showToast('Copy failed.'));
			});
			return;
		} catch(e) { /* fall through to plain */ }
	}
	// Plain text fallback
	if (navigator.clipboard?.writeText) {
		navigator.clipboard.writeText(plainText).then(()=> showToast('Results copied!')).catch(()=> showToast('Copy failed.'));
	} else {
		try { const ta = document.createElement('textarea'); ta.value = plainText; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('Results copied!'); } catch(e){ showToast('Copy failed.'); }
	}
	// end fallback block
}


function escapeHtml(s){ return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
// Graceful fallback for showToast used by shared.js
// Toast helper: prefer existing global showToast; if missing, create a minimal inline version (no alerts)
function showToast(msg) {
	try {
		if (window.showToast) { window.showToast(msg); return; }
		// Minimal inline toast system (only if shared.js not loaded on results page)
		let container = document.getElementById('toast-container');
		if (!container) {
			container = document.createElement('div');
			container.id = 'toast-container';
			container.style.position = 'fixed';
			container.style.bottom = '16px';
			container.style.left = '50%';
			container.style.transform = 'translateX(-50%)';
			container.style.display = 'flex';
			container.style.flexDirection = 'column';
			container.style.gap = '8px';
			container.style.zIndex = '9999';
			document.body.appendChild(container);
		}
		const el = document.createElement('div');
		el.textContent = msg;
		el.style.background = 'rgba(20,22,40,0.92)';
		el.style.color = '#fff';
		el.style.padding = '8px 14px';
		el.style.borderRadius = '6px';
		el.style.fontSize = '14px';
		el.style.fontWeight = '600';
		el.style.boxShadow = '0 4px 10px rgba(0,0,0,0.35)';
		el.style.opacity = '0';
		el.style.transition = 'opacity .25s ease';
		container.appendChild(el);
		requestAnimationFrame(()=> { el.style.opacity = '1'; });
		setTimeout(()=> { el.style.opacity = '0'; el.addEventListener('transitionend', () => { if (el.parentNode) el.parentNode.removeChild(el); }, { once:true }); }, 3000);
	} catch(e) { /* swallow */ }
}

document.addEventListener('DOMContentLoaded', () => {
	// Initialize shared UI so the page-switcher and flame are rendered/updated
	// in the same way as other pages. We still keep the local consent normalization
	// below for compatibility, but calling initShared ensures shared page rendering.
	try { initShared({ imageBase: '../images', skipDataLoad: true }).catch?.(()=>{}); } catch(e) { /* non-fatal */ }
	// Normalize consent cookie here as results page may not import shared.js
	try {
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
			let val = get('analytics_consent');
			if (val !== 'yes' && val !== 'no') {
				const legacy = get('new_umami_consent') || get('umami_consent');
				if (legacy === 'yes' || legacy === 'no') val = legacy;
			}
			if (val === 'yes' || val === 'no') {
				const exp = new Date(Date.now() + 365 * 864e5).toUTCString();
				const parts = [
					`analytics_consent=${encodeURIComponent(val)}`,
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
			} catch (e) {}
			try { document.cookie = parts.join('; '); } catch (e) {}
			if (val === 'yes' && !document.querySelector('script[data-gtag]')) {
				const a = document.createElement('script');
				a.async = true;
				a.src = 'https://www.googletagmanager.com/gtag/js?id=G-5H288JHY22';
				a.setAttribute('data-gtag','1');
				document.head.appendChild(a);
				window.dataLayer = window.dataLayer || [];
				function gtag(){dataLayer.push(arguments);} window.gtag = window.gtag || gtag;
				window.gtag('js', new Date());
				window.gtag('config', 'G-5H288JHY22');
			}
		}
	} catch (e) { /* swallow */ }

	renderResultsBox();
	injectResultsFlame();
	markPageSwitcherCompletion();
	try { const btn = document.getElementById('copyResultsBtn'); if (btn) btn.addEventListener('click', copyShareText); } catch(e) {}
	// Re-render on header click (manual refresh)
	const header = document.querySelector('#resultsbox .results-box-header h2'); if (header) header.addEventListener('click', renderResultsBox);

	// Wire privacy modal (not available via shared.js on results page)
	try {
		const privacyLink = document.getElementById('privacyLink');
		const privacyModal = document.getElementById('privacyModal');
		const privacyClose = document.getElementById('privacyClose');
		if (privacyLink && privacyModal) {
			privacyLink.addEventListener('click', (e) => { e.preventDefault(); privacyModal.setAttribute('aria-hidden','false'); });
		}
		if (privacyClose && privacyModal) {
			privacyClose.addEventListener('click', () => { privacyModal.setAttribute('aria-hidden','true'); });
		}
		if (privacyModal) {
			privacyModal.addEventListener('click', (e) => { if (e.target === privacyModal) privacyModal.setAttribute('aria-hidden','true'); });
		}
	} catch (e) { /* non-fatal */ }
});

// Expose for debugging
window._idleondle_results = { collectWinsToday, renderResultsBox };

// --- Midnight countdown ---
let _midnightTimerInterval = null;
function startMidnightCountdown(el){
	if (!el) return;
	if (_midnightTimerInterval) { clearInterval(_midnightTimerInterval); _midnightTimerInterval = null; }
	function update(){
		const now = new Date();
		const midnight = new Date(now); midnight.setHours(24,0,0,0);
		let diff = midnight - now;
		if (diff < 0) diff = 0;
		const h = String(Math.floor(diff / 3_600_000)).padStart(2,'0');
		const m = String(Math.floor((diff % 3_600_000) / 60_000)).padStart(2,'0');
		const s = String(Math.floor((diff % 60_000) / 1000)).padStart(2,'0');
		el.textContent = `${h}:${m}:${s}`;
		if (diff === 0) { clearInterval(_midnightTimerInterval); _midnightTimerInterval = null; }
	}
	update();
	_midnightTimerInterval = setInterval(update, 1000);
}

// --- Rank helpers ---
// Threshold interpretation chosen so overlapping bounds favor the lower rank threshold for upper range (non-inclusive on upper except final):
// Normal: 1 ->1, 2-3 ->2, 4-6 ->3, 7-9 ->4, 10+ ->5
// Hard:   1 ->1, 2-4 ->2, 5-8 ->3, 9-14 ->4, 15+ ->5
function determineRank(guesses, isHard){
	const g = Number(guesses) || 0;
	if (g <= 1) return 1;
	if (!isHard) { // normal thresholds
		if (g <= 3) return 2;
		if (g <= 6) return 3;
		if (g <= 9) return 4;
		return 5;
	} else { // hard thresholds
		if (g <= 4) return 2;
		if (g <= 8) return 3;
		if (g <= 14) return 4;
		return 5;
	}
}

function buildRankIcon(rank){
	const r = Math.min(5, Math.max(1, Number(rank)||5));
	// results.html is in html/ so we need ../images/...
	return '../images/rank/rank' + r + '.png';
}

// --- Results page flame (daily streak) injection ---
function injectResultsFlame(){
	try {
		if (document.getElementById('resultsFlameWrap')) return; // already inserted
		const header = document.querySelector('.results-box-header') || document.getElementById('resultsbox');
		if (!header) return;
		// Read streak cookies (mirrors shared.js logic simplified)
		const streakVal = (() => { try { return Number(getCookie('idleondle_streak')) || 0; } catch(e){ return 0; } })();
		const wrap = document.createElement('div');
		wrap.id = 'resultsFlameWrap';
		wrap.className = 'flame-wrap';
		wrap.style.margin = '12px 0 0 12px';
		wrap.style.display = 'inline-flex';
		wrap.style.alignItems = 'center';
		wrap.style.justifyContent = 'center';
		const img = document.createElement('img');
		img.id = 'resultsFlameImg';
		img.className = 'flame-icon' + (streakVal === 0 ? ' flame-zero' : '');
		img.alt = 'Daily Streak';
		img.title = 'Daily Streak';
		try { img.src = '../images/flame.png'; } catch(e){ img.src = '../images/flame.png'; }
		const num = document.createElement('span');
		num.className = 'flame-streak';
		num.id = 'resultsFlameStreak';
		num.textContent = String(streakVal);
		wrap.appendChild(img); wrap.appendChild(num);
		// Place to the right of the main title text inside the header.
		// Try to locate an h2 or first heading-like element.
		let titleEl = header.querySelector('h2, .results-title-text');
		if (!titleEl) titleEl = header.firstElementChild;
		if (titleEl) {
			// Insert after title element
			titleEl.insertAdjacentElement('afterend', wrap);
		} else {
			header.appendChild(wrap);
		}
	} catch(e){ /* non-fatal */ }
}
