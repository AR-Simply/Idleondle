// js/recipeGuesser.js
import { initShared, getGoalItem, filterItems, setGoalItem } from './shared.js';

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

// Helper to create a cropped icon from recipe image
// Crop box parameters (adjust to tune zoom/position)
const CROP_X = 50;   // left offset
const CROP_Y = 55;   // top offset
const CROP_W = 125;   // width of crop
const CROP_H = 125;   // height of crop
function createCroppedIcon(recipePath, callback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CROP_W;
      canvas.height = CROP_H;
      const ctx = canvas.getContext('2d');
      // Crop using defined box
      ctx.drawImage(img, CROP_X, CROP_Y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H);
      callback(canvas.toDataURL());
    } catch (e) {
      console.warn('Failed to crop recipe icon:', e);
      callback('../images/icon.png');
    }
  };
  img.onerror = () => {
    console.warn('Failed to load recipe image for cropping');
    callback('../images/icon.png');
  };
  img.src = recipePath;
}

// Expose crop helper so shared dropdown can use canvas-cropped icons
try {
  if (typeof window !== 'undefined') {
    window.recipeGuesser = window.recipeGuesser || {};
    window.recipeGuesser.createCroppedIcon = createCroppedIcon;
  }
} catch (e) { /* non-fatal */ }

export async function initRecipeGuesser(options = {}) {
  const sharedConfig = Object.assign({
    dataUrl: '../json/idleon_recipes.json',
    imageBase: '../images',
    seedOffset: 1,
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

  // TEMP OVERRIDE (disabled): Force goal item to a specific recipe for debugging
  // try {
  //   const targetName = 'Dirty Coal Miner Baggy Soot Pants';
  //   const candidates = filterItems(targetName) || [];
  //   const exact = candidates.find(it => String(it?.name).trim().toLowerCase() === targetName.toLowerCase());
  //   if (exact) {
  //     setGoalItem(exact);
  //   }
  // } catch (e) { /* non-fatal */ }
  
  // After shared init, replace all item icons with cropped versions
  // Access the items array through filterItems
  const allItems = filterItems('');
  allItems.forEach(item => {
    const recipePath = item.raw?.recipe || item.raw?.Recipe;
    if (recipePath) {
      const resolvedPath = resolveRecipePath(recipePath);
      createCroppedIcon(resolvedPath, (croppedIcon) => {
        item.icon = croppedIcon;
      });
    }
  });
  
  // Also update the goal item's icon for the modal
  const goal = getGoalItem();
  if (goal && goal.raw) {
    const recipePath = goal.raw.recipe || goal.raw.Recipe;
    if (recipePath) {
      const resolvedPath = resolveRecipePath(recipePath);
      createCroppedIcon(resolvedPath, (croppedIcon) => {
        goal.icon = croppedIcon;
        // Update any existing icon displays
        const goalIcon = document.getElementById('goalIcon');
        if (goalIcon) goalIcon.src = croppedIcon;
      });
    }
  }

  // Sync CSS variables for dropdown crop so changes reflect immediately
  try {
    const root = document.documentElement;
    root.style.setProperty('--recipe-crop-x', `${-CROP_X}px`);
    root.style.setProperty('--recipe-crop-y', `${-CROP_Y}px`);
  } catch (e) { /* non-fatal */ }
  // Track blur reduction for boxes 2-5
  let blurBoxes = []; // Will store references to blur boxes 2-5
  const initialBlur = 10; // Starting blur value in px (matches CSS)
  const guessesPerBox = 3; // Number of guesses to fully clear one box

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

    // Blur box 6 (background image box)
    const blurBox6 = document.createElement('div');
    blurBox6.className = 'recipe-blur-box-6';
    container.appendChild(blurBox6);

    // Blur box 7 (background image box)
    const blurBox7 = document.createElement('div');
    blurBox7.className = 'recipe-blur-box-7';
    container.appendChild(blurBox7);

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
          // Fade out background image boxes 6 and 7
          if (blurBox6) {
            blurBox6.style.transition = 'opacity 0.5s ease-out';
            blurBox6.style.opacity = '0';
          }
          if (blurBox7) {
            blurBox7.style.transition = 'opacity 0.5s ease-out';
            blurBox7.style.opacity = '0';
          }
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
