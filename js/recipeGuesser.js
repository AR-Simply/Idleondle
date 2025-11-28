// js/recipeGuesser.js
import { initShared, getGoalItem } from './shared.js';

// Helper to resolve image paths (similar to shared.js resolveIcon)
function resolveRecipePath(path) {
  if (!path) return '../images/icon.png';
  // Convert backslashes to forward slashes
  const cleaned = String(path).replace(/\\/g, '/');
  // If path already starts with images/, make it relative to recipe folder
  if (cleaned.startsWith('images/')) {
    return '../' + cleaned;
  }
  return cleaned;
}

export async function initRecipeGuesser(options = {}) {
  const sharedConfig = Object.assign({
    dataUrl: '../json/idleon_recipes.json',
    imageBase: '../images',
    guessButtonHandlers: {
      guessBtn2: () => {
        const gb2 = document.getElementById('guessBtn2');
        if (!gb2 || gb2.disabled) return;
        const goal = getGoalItem();
        const tab = goal?.raw?.tab || goal?.raw?.Tab || 'Unknown';
        gb2.textContent = `Tab ${tab}`;
        gb2.setAttribute('aria-label', `Anvil Tab: ${tab}`);
      }
    }
  }, options || {});

  await initShared(sharedConfig);

  // Track blur reduction for boxes 2-5
  let blurBoxes = []; // Will store references to blur boxes 2-5
  const initialBlur = 20; // Starting blur value in px
  const guessesPerBox = 5; // Number of guesses to fully clear one box

  // Render the daily recipe image below the combo
  try {
    const goal = getGoalItem();
    const container = document.createElement('div');
    container.id = 'dailyRecipe';
    container.className = 'daily-recipe';

    const img = document.createElement('img');
    img.className = 'daily-recipe-img';
    img.alt = goal?.name || 'Daily recipe';
    
    // Use recipe path if available, otherwise fallback to icon
    const recipePath = goal?.raw?.recipe || goal?.raw?.Recipe;
    img.src = recipePath ? resolveRecipePath(recipePath) : (goal?.icon || '../images/icon.png');
    img.onerror = () => { 
      console.warn('Failed to load recipe image:', img.src);
      img.src = '../images/icon.png'; 
    };

    container.appendChild(img);

    // Get the number of items to determine how many blur boxes to show
    const itemCount = goal?.raw?.items || goal?.raw?.Items || 0;

    // Add obscuring box with "?" over part of the recipe
    const obscureBox = document.createElement('div');
    obscureBox.className = 'recipe-obscure-box';
    obscureBox.textContent = '?';
    container.appendChild(obscureBox);

    // Add second obscuring box with blur effect
    const blurBox = document.createElement('div');
    blurBox.className = 'recipe-blur-box';
    container.appendChild(blurBox);

    // Add blur boxes dynamically based on item count
    // Blur box 2 (index 0)
    if (itemCount > 0) {
      const blurBox2 = document.createElement('div');
      blurBox2.className = 'recipe-blur-box-2';
      container.appendChild(blurBox2);
      blurBoxes.push(blurBox2);
    }

    // Blur box 3 (index 1)
    if (itemCount > 1) {
      const blurBox3 = document.createElement('div');
      blurBox3.className = 'recipe-blur-box-3';
      container.appendChild(blurBox3);
      blurBoxes.push(blurBox3);
    }

    // Blur box 4 (index 2)
    if (itemCount > 2) {
      const blurBox4 = document.createElement('div');
      blurBox4.className = 'recipe-blur-box-4';
      container.appendChild(blurBox4);
      blurBoxes.push(blurBox4);
    }

    // Blur box 5 (index 3)
    if (itemCount > 3) {
      const blurBox5 = document.createElement('div');
      blurBox5.className = 'recipe-blur-box-5';
      container.appendChild(blurBox5);
      blurBoxes.push(blurBox5);
    }

    // Add overlay to prevent direct interaction
    const overlay = document.createElement('div');
    overlay.className = 'daily-recipe-overlay';
    overlay.addEventListener('contextmenu', (ev) => { ev.preventDefault(); });
    overlay.addEventListener('dragstart', (ev) => { ev.preventDefault(); });
    container.appendChild(overlay);

    // Insert after the combo
    const combo = document.getElementById('combo');
    if (combo && combo.parentNode) combo.parentNode.insertBefore(container, combo.nextSibling);

    // Add notice below the recipe image
    const notice = document.createElement('div');
    notice.className = 'recipe-notice';
    notice.textContent = 'Only anvil tab 1 for now!';
    if (combo && combo.parentNode) combo.parentNode.insertBefore(notice, container.nextSibling);

    // Listen for guess events to reduce blur
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('guess:updated', (e) => {
        try {
          const guessCount = (e && e.detail && typeof e.detail.guessCount === 'number') ? e.detail.guessCount : 
                             (typeof window !== 'undefined' && typeof window.guessCount === 'number') ? window.guessCount : 0;
          
          // Calculate which box we're working on and how much blur remains
          // Start from the last box (highest index) and work backwards
          const totalBoxes = blurBoxes.length;
          const boxIndex = Math.floor(guessCount / guessesPerBox);
          const guessesInCurrentBox = guessCount % guessesPerBox;
          
          // Update blur for each box
          blurBoxes.forEach((box, idx) => {
            // Reverse index (start from last box)
            const reverseIdx = totalBoxes - 1 - idx;
            
            if (boxIndex > reverseIdx) {
              // This box should be completely clear
              box.style.backdropFilter = 'blur(0px)';
              box.style.webkitBackdropFilter = 'blur(0px)';
            } else if (boxIndex === reverseIdx) {
              // This is the box we're currently clearing
              const blurReduction = (guessesInCurrentBox / guessesPerBox) * initialBlur;
              const currentBlur = Math.max(0, initialBlur - blurReduction);
              box.style.backdropFilter = `blur(${currentBlur}px)`;
              box.style.webkitBackdropFilter = `blur(${currentBlur}px)`;
            }
            // Boxes with reverseIdx > boxIndex remain at full blur (default CSS)
          });
        } catch (err) {
          console.warn('Error updating recipe blur:', err);
        }
      });

      // When the guess is correct, fade away all boxes
      document.addEventListener('guess:correct', (e) => {
        try {
          // Fade out obscure box
          if (obscureBox) {
            obscureBox.style.transition = 'opacity 0.5s ease-out';
            obscureBox.style.opacity = '0';
          }
          // Fade out first blur box
          if (blurBox) {
            blurBox.style.transition = 'opacity 0.5s ease-out';
            blurBox.style.opacity = '0';
          }
          // Fade out all other blur boxes
          blurBoxes.forEach((box) => {
            box.style.transition = 'opacity 0.5s ease-out';
            box.style.opacity = '0';
          });
        } catch (err) {
          console.warn('Error fading recipe boxes:', err);
        }
      });
    }
  } catch (e) {
    console.warn('Failed to render daily recipe', e);
  }
}

// Auto-init when imported
if (typeof window !== 'undefined') {
  initRecipeGuesser().catch(e => console.error('RecipeGuesser init failed', e));
  window.recipeGuesser = window.recipeGuesser || {};
  window.recipeGuesser.initRecipeGuesser = initRecipeGuesser;
}

export default { initRecipeGuesser };
