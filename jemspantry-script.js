class UndoManager {
  constructor(maxHistory = 50) {
    this.history = [];
    this.currentIndex = -1;
    this.maxHistory = maxHistory;
  }

  record(action) {
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(action);
    this.currentIndex++;

    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.currentIndex--;
    }

    updateUndoRedoButtons();
  }

  undo() {
    if (this.currentIndex < 0) return false;
    const action = this.history[this.currentIndex];
    if (action && action.undo) action.undo();
    this.currentIndex--;
    updateUndoRedoButtons();
    return true;
  }

  redo() {
    if (this.currentIndex >= this.history.length - 1) return false;
    this.currentIndex++;
    const action = this.history[this.currentIndex];
    if (action && action.redo) action.redo();
    updateUndoRedoButtons();
    return true;
  }

  canUndo() { return this.currentIndex >= 0; }
  canRedo() { return this.currentIndex < this.history.length - 1; }
}

const undoManager = new UndoManager();

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (undoBtn) undoBtn.disabled = !undoManager.canUndo();
  if (redoBtn) redoBtn.disabled = !undoManager.canRedo();
}

function performUndo() {
  if (undoManager.undo()) {
    toast('Action undone');
  }
}

function performRedo() {
  if (undoManager.redo()) {
    toast('Action redone');
  }
}

function createDeleteAction(itemId, itemData, shoppingListSnapshot) {
  return {
    undo: () => {
      inventory.push(JSON.parse(JSON.stringify(itemData)));
      shoppingList = JSON.parse(JSON.stringify(shoppingListSnapshot));
      saveInventoryToStorage();
      saveShoppingList();
      updateCartBadge();
      render();
      toast('Item restored');
    },
    redo: () => {
      inventory = inventory.filter(x => x.rowNumber !== itemId);
      shoppingList = shoppingList.filter(x => x.rowNumber !== itemId);
      saveInventoryToStorage();
      saveShoppingList();
      updateCartBadge();
      render();
      toast('Item removed');
    }
  };
}

function createEditAction(itemId, oldData, newData) {
  return {
    undo: () => {
      const idx = inventory.findIndex(x => x.rowNumber === itemId);
      if (idx !== -1) inventory[idx] = JSON.parse(JSON.stringify(oldData));
      saveInventoryToStorage();
      reconcileShoppingListWithInventory();
      updateCartBadge();
      render();
      toast('Changes undone');
    },
    redo: () => {
      const idx = inventory.findIndex(x => x.rowNumber === itemId);
      if (idx !== -1) inventory[idx] = JSON.parse(JSON.stringify(newData));
      saveInventoryToStorage();
      reconcileShoppingListWithInventory();
      updateCartBadge();
      render();
      toast('Changes redone');
    }
  };
}

const APP_VERSION = "1.0.0";

let inventory = [];
let shoppingList = [];
let filters = { loc: new Set(), stor: new Set() };
let openCats = new Set();

const INVENTORY_STORAGE_KEY = "jemspantry_inventory_v1";
const SHOPPING_STORAGE_KEY = "jemspantry_shoppingList_v1";
const OPENCATS_STORAGE_KEY = "jemspantry_openCats_v1";
const REGION_KEY = "jemspantry_region_v1";
const STORE_COLORS_KEY = "jemspantry_storeColors_v1";
const COACH_MARK_HIDE_KEY = "jemspantry_hideCoachMarks_v1";

let region = "UK";
let storeColors = {};
let editingId = null;
let currentCoachMarkStep = 0;
let isStartupCoachMark = false;
let pendingImportData = null;
let pendingImportMode = null;
let currentViewMode = null; // Track which view is displayed in coach mark overlay

const CATEGORIES = [
  "Fruit & Veg",
  "Meat, Poultry & Seafood",
  "Dairy & Refrigerated",
  "Bakery & Bread",
  "Pantry & Dry Goods",
  "Herbs & Spices",
  "Cereals & Breakfast",
  "Canned Goods & Sauces",
  "Frozen Foods",
  "Snacks",
  "Beverages",
  "Condiments & Oils",
  "Household & Cleaning",
  "Personal Care & Pharmacy"
];

const COACH_MARKS = [
  {
    title: "JemsPantry",
    text: "Our Mission\n\nOur goal is to make food organisation simple and help households waste less food while saving time and money.",
    icon: null,
    iconClass: "green",
    buttonText: "Next",
    isMission: true
  },
  {
    title: "Add Items",
    text: "Tap + to add pantry items with quantity, storage,\nand expiry.",
    icon: "plus",
    iconClass: "green",
    buttonText: "Next"
  },
  {
    title: "Find Items Quickly",
    text: "Use search, location, and storage filters to find items. Switch regions to see region-specific brands.",
    icon: "search",
    iconClass: "primary",
    buttonText: "Next"
  },
  {
    title: "Smart Categories",
    text: "Items are automatically categorised. Expand categories to see all your items organised by type.",
    icon: "folder",
    iconClass: "primary",
    buttonText: "Next"
  },
  {
    title: "Shopping List",
    text: "When items run low (qty ≤ 2), add them to your shopping list. Check items off as you buy them.",
    icon: "cart",
    iconClass: "blue",
    buttonText: "Next"
  },
  {
    title: "Import / Export Your Items",
    text: "Import or export your pantry list as a CSV or TSV file so you can back up your items data offline anytime.",
    icon: "document",
    iconClass: "primary",
    buttonText: "Next"
  },
  {
    title: "100% Privacy",
    text: "All your pantry data is stored locally on your device. Nothing is uploaded to external servers.",
    icon: "shield",
    iconClass: "success",
    buttonText: "Done"
  }
];

const REGION_BRANDS = {
  UK: {
    dairy: ["cathedral city","arla","muller","müller","oatly","alpro","lurpak","kerrygold","anchor","philadelphia","lindahls","yeo valley"],
    bakery: ["warburtons","kingsmill","hovis","allinsons","allinson's","jacksons","jackson's","roberts","sunblest"],
    breakfast: ["weetabix","alpen","jordans","jordan's","ready brek","dorset cereals","shreddies"],
    herbsSpices: ["schwartz","bart","rajah","east end","trs","oxo"],
    canned: ["heinz","branston","baxters","princes","john west","napolina","mutti","cirio"],
    frozen: ["birds eye","birdseye","mccain","goodfella's","goodfellas","chicago town","aunt bessie's","aunt bessies"],
    snacks: ["walkers","mcvities","cadbury","tunnocks","foxs","fox's","tyrrells","kettle","pringles","doritos","ferrero"],
    beverages: ["coca cola","coca-cola","pepsi","ribena","lucozade","vimto","tango","robinsons","irn bru","irn-bru","twinings","pg tips"],
    personalCare: ["gillette","venus","colgate","sensodyne","sure","lynx"]
  },
  US: {
    dairy: ["kraft","philadelphia","land o'lakes","daisy","chobani","yoplait","dannon","horizon","silk","oatly"],
    bakery: ["wonder","pepperidge farm","sara lee","nature's own","entennmann's","martin's","bimbo","oroweat","ball park","thomas'"],
    breakfast: ["kellogg's","quaker","cheerios","special k","general mills"],
    herbsSpices: ["mccormick","simply organic","spice islands"],
    canned: ["campbell's","progresso","hunts","del monte","libby's","hormel","stagg","goya","bush's","heinz"],
    frozen: ["ore-ida","birds eye","mccain","ben & jerry's","haagen-dazs"],
    snacks: ["lays","doritos","cheetos","ritz","oreo","hershey's","reese's","nature valley","ferrero"],
    beverages: ["gatorade","powerade","coke","coca-cola","pepsi","dr pepper","mountain dew","snapple","arizona"],
    personalCare: ["gillette","crest","colgate","old spice","degree"]
  },
  EU: {
    dairy: ["danone","nestle","muller","müller","arla","president","président","galbani","valio","kerrygold"],
    bakery: ["wasa","jacquet"],
    breakfast: ["alpen","nestle cereals","jordans","jordan's"],
    herbsSpices: ["ducros","santa maria","fuchs","knorr"],
    canned: ["mutti","cirio","bonduelle","rio mare","ortiz","heinz"],
    frozen: ["findus","dr oetker","mccain"],
    snacks: ["haribo","milka","ritter sport","lays","pringles","kinder","ferrero","oreo","jacobs"],
    beverages: ["coca-cola","pepsi","fanta","sprite","san pellegrino","lavazza","nescafe","nespresso"],
    personalCare: ["nivea","dove","sensodyne","gillette"]
  },
  Global: {
    dairy: ["danone","nestle","oatly","alpro","arla","philadelphia","yoplait","muller","müller","kerrygold","lindahls"],
    bakery: ["bimbo","warburtons","hovis","pepperidge farm","sara lee","wasa"],
    breakfast: ["quaker","cheerios","weetabix","alpen","kellogg's"],
    herbsSpices: ["schwartz","mccormick","simply organic","bart","knorr"],
    canned: ["heinz","campbell's","mutti","cirio","del monte","libby's","princes","john west","goya"],
    frozen: ["birds eye","birdseye","mccain","findus","ben & jerry's","haagen-dazs"],
    snacks: ["pringles","oreo","doritos","lays","kettle","walkers","haribo","kinder","cadbury","mcvities","ferrero"],
    beverages: ["coca-cola","pepsi","fanta","sprite","nescafe","nespresso","lavazza","twinings"],
    personalCare: ["gillette","colgate","sensodyne","dove","nivea"]
  }
};

let toastTimer = null;
let toastHideTimer = null;

function toast(msg){
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hide');
  t.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  if (toastHideTimer) clearTimeout(toastHideTimer);

  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    t.classList.add('hide');
  }, 2200);

  toastHideTimer = setTimeout(() => {
    t.classList.remove('hide');
  }, 2500);
}

function escapeHtml(text){
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text ?? '').replace(/[&<>"']/g, m => map[m]);
}

function updateHeaderHeight(){
  const header = document.querySelector('.header');
  const height = header.offsetHeight;
  document.documentElement.style.setProperty('--header-height', height + 'px');
}

function showSplashIfNeeded(){
  const splash = document.getElementById("splash");
  const ver = document.getElementById("splashVersion");
  if (ver) ver.textContent = `Version ${APP_VERSION}`;

  splash.classList.add("active");
  splash.setAttribute("aria-hidden", "false");
  document.body.classList.add('splash-showing');

  const HOLD_MS = 2500;
  const FADE_MS = 450;

  setTimeout(() => {
    splash.classList.add("fading");
    setTimeout(() => {
      splash.classList.remove("active", "fading");
      splash.setAttribute("aria-hidden", "true");
      document.body.classList.remove("splash-showing", "preload-main");
      maybeShowStartupCoachMarks();
    }, FADE_MS + 20);
  }, HOLD_MS);
}

function getHideCoachMarks(){
  try {
    return localStorage.getItem(COACH_MARK_HIDE_KEY) === "1";
  } catch(e){
    return false;
  }
}

function setCoachMarkPreference(checked){
  try {
    localStorage.setItem(COACH_MARK_HIDE_KEY, checked ? "1" : "0");
  } catch(e){}
}

function maybeShowStartupCoachMarks(){
  if (getHideCoachMarks()) return;
  openCoachMarks(true);
}

function buildCoachMarkInner(step, stepIndex){
  let iconHTML = '';
  if (step.icon === null) {
    iconHTML = '';
  } else if (step.icon === 'plus') {
    iconHTML = `
      <div class="coach-mark-icon ${step.iconClass}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" xmlns="http://www.w3.org/2000/svg" aria-label="Add item button">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
    `;
  } else if (step.icon === 'search') {
    iconHTML = `
      <div class="coach-mark-icon ${step.iconClass}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg" aria-label="Search icon">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
      </div>
    `;
  } else if (step.icon === 'folder') {
    iconHTML = `
      <div class="coach-mark-icon ${step.iconClass}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg" aria-label="Categories">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
    `;
  } else if (step.icon === 'cart') {
    iconHTML = `
      <div class="coach-mark-icon ${step.iconClass}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg" aria-label="Shopping cart">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
      </div>
    `;
  } else if (step.icon === 'document') {
    iconHTML = `
      <div class="coach-mark-icon ${step.iconClass}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg" aria-label="Document with arrow">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
          <polyline points="13 2 13 9 20 9"></polyline>
          <path d="M12 17v-4"></path>
          <path d="M10 15l2-2 2 2"></path>
        </svg>
      </div>
    `;
  } else if (step.icon === 'shield') {
    iconHTML = `
      <div class="coach-mark-icon ${step.iconClass}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg" aria-label="Shield lock">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <circle cx="12" cy="12" r="2"></circle>
        </svg>
      </div>
    `;
  }

  const isWelcome = stepIndex === 0;
  const isMission = step.isMission || false;
  const isLastStep = stepIndex === COACH_MARKS.length - 1;

  let textHTML = '';
  if (isMission) {
    const textParts = step.text.split('\n\n');
    textHTML = textParts.map((part, idx) => idx === 0
      ? `<p class="coach-mark-text ${isWelcome ? 'welcome' : ''}" style="font-weight: 900; margin-bottom: 8px;">${escapeHtml(part)}</p>`
      : `<p class="coach-mark-text ${isWelcome ? 'welcome' : ''}">${escapeHtml(part)}</p>`
    ).join('');
  } else {
    textHTML = `<p class="coach-mark-text ${isWelcome ? 'welcome' : ''}">${escapeHtml(step.text).replace(/\n/g, "<br>")}</p>`;
  }

  const helperText = !isLastStep
    ? `<p class="coach-mark-text" style="margin: 4px 0 0; font-size: 12px; opacity: 0.85;">Tap or swipe to continue</p>`
    : '';
  const actionButton = isLastStep
    ? `<button class="coach-mark-button" onclick="closeCoachMarks()" aria-label="Close guide - Step ${stepIndex + 1} of ${COACH_MARKS.length}">Close</button>`
    : '';

  return `
    ${iconHTML}
    <h2 class="coach-mark-title ${isWelcome ? 'welcome' : ''}" style="${isWelcome ? 'font-size: 28px;' : ''}">${escapeHtml(step.title)}</h2>
    ${textHTML}
    ${helperText}
    ${actionButton}
  `;
}

function renderCoachMark(direction = 'none'){
  const step = COACH_MARKS[currentCoachMarkStep];
  if (!step) return;

  const content = document.getElementById('coachMarkContent');
  const isLastStep = currentCoachMarkStep === COACH_MARKS.length - 1;
  const panel = document.createElement('div');
  panel.className = 'coach-mark-panel';
  if (direction === 'forward') panel.classList.add('enter-from-right');
  if (direction === 'backward') panel.classList.add('enter-from-left');
  panel.innerHTML = buildCoachMarkInner(step, currentCoachMarkStep);

  coachSwipeLock = true;
  const currentPanel = content.querySelector('.coach-mark-panel');
  if (currentPanel) {
    currentPanel.classList.remove('enter-from-right', 'enter-from-left');
    currentPanel.classList.add(direction === 'backward' ? 'exit-to-right' : 'exit-to-left');
    currentPanel.addEventListener('animationend', () => currentPanel.remove(), { once: true });
  } else {
    content.innerHTML = '';
  }
  content.appendChild(panel);
  const unlock = () => { coachSwipeLock = false; };
  panel.addEventListener('animationend', unlock, { once: true });
  if (direction === 'none') requestAnimationFrame(unlock);

  content.setAttribute('tabindex', '0');
  content.setAttribute('aria-label', `${escapeHtml(step.title)} - Step ${currentCoachMarkStep + 1} of ${COACH_MARKS.length}${isLastStep ? '. Close button below.' : '. Tap or swipe for next step.'}`);

  const dotsContainer = document.getElementById('coachMarkDots');
  dotsContainer.innerHTML = '';
  for (let i = 0; i < COACH_MARKS.length; i++) {
    const dot = document.createElement('div');
    dot.className = `coach-mark-dot ${i === currentCoachMarkStep ? 'active' : ''}`;
    dot.onclick = () => goToCoachMark(i);
    dot.setAttribute('aria-label', `Step ${i + 1}${i === currentCoachMarkStep ? ' - current' : ''}`);
    dot.setAttribute('role', 'button');
    dot.setAttribute('tabindex', i === currentCoachMarkStep ? '0' : '-1');
    dotsContainer.appendChild(dot);
  }

  const prevBtn = document.getElementById('coachMarkPrev');
  const nextBtn = document.getElementById('coachMarkNext');
  prevBtn.disabled = currentCoachMarkStep === 0;
  nextBtn.disabled = isLastStep;
  prevBtn.setAttribute('aria-label', `Previous step - Step ${currentCoachMarkStep} of ${COACH_MARKS.length}`);
  nextBtn.setAttribute('aria-label', `Next step - Step ${currentCoachMarkStep + 2} of ${COACH_MARKS.length}`);

  attachCoachMarkInteractions();
}

let coachSwipeLock = false;

function attachCoachMarkInteractions(){
  const content = document.getElementById('coachMarkContent');
  if (!content) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved = false;

  content.onclick = (event) => {
    if (coachSwipeLock) return;
    if (event.target.closest('.coach-mark-button, .coach-mark-dot, .coach-mark-nav-btn')) return;
    if (currentViewMode === 'about') return; // Don't advance on click in about view
    if (currentCoachMarkStep < COACH_MARKS.length - 1) {
      nextCoachMark();
    }
  };

  content.onkeydown = (event) => {
    if (coachSwipeLock) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (currentViewMode === 'about') return; // Don't advance on key in about view
      if (currentCoachMarkStep < COACH_MARKS.length - 1) {
        nextCoachMark();
      }
    }
    if (event.key === 'ArrowLeft' && currentCoachMarkStep > 0) {
      event.preventDefault();
      prevCoachMark();
    }
    if (event.key === 'ArrowRight' && currentCoachMarkStep < COACH_MARKS.length - 1) {
      event.preventDefault();
      nextCoachMark();
    }
  };

  content.ontouchstart = (event) => {
    if (!event.touches || !event.touches.length) return;
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    touchMoved = false;
  };

  content.ontouchmove = (event) => {
    if (!event.touches || !event.touches.length) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) {
      touchMoved = true;
    }
  };

  content.ontouchend = (event) => {
    if (coachSwipeLock) return;
    if (!event.changedTouches || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (touchMoved && absX > 36 && absX > absY * 1.2) {
      if (currentViewMode === 'about') return; // Don't swipe in about view
      if (deltaX < 0 && currentCoachMarkStep < COACH_MARKS.length - 1) {
        nextCoachMark();
      } else if (deltaX > 0 && currentCoachMarkStep > 0) {
        prevCoachMark();
      }
    }
  };
}

function nextCoachMark(){
  if (currentCoachMarkStep < COACH_MARKS.length - 1) {
    currentCoachMarkStep++;
    renderCoachMark('forward');
  }
}

function prevCoachMark(){
  if (currentCoachMarkStep > 0) {
    currentCoachMarkStep--;
    renderCoachMark('backward');
  }
}

function goToCoachMark(index){
  const nextIndex = Math.max(0, Math.min(index, COACH_MARKS.length - 1));
  const direction = nextIndex > currentCoachMarkStep ? 'forward' : (nextIndex < currentCoachMarkStep ? 'backward' : 'none');
  currentCoachMarkStep = nextIndex;
  renderCoachMark(direction);
}

function openHelpMenu(){
  currentViewMode = null; // Reset view mode
  const overlay = document.getElementById('helpMenuOverlay');
  overlay.classList.add('active');
}

function closeHelpMenu(event){
  if (event && event.target !== document.getElementById('helpMenuOverlay')) return;
  document.getElementById('helpMenuOverlay').classList.remove('active');
}

function openUserGuide(){
  const helpMenuOverlay = document.getElementById('helpMenuOverlay');
  if (helpMenuOverlay) {
    helpMenuOverlay.classList.remove('active');
  }
  setTimeout(() => {
    currentViewMode = null;
    openCoachMarks(false);
  }, 50);
}

function openAbout(){
  const helpMenuOverlay = document.getElementById('helpMenuOverlay');
  if (helpMenuOverlay) {
    helpMenuOverlay.classList.remove('active');
  }
  setTimeout(() => {
    currentViewMode = 'about'; // Set to about mode
    const overlay = document.getElementById('coachMarkOverlay');
    const contentDiv = document.getElementById('coachMarkContent');
    const footerDiv = document.querySelector('.coach-mark-footer');
    const prefDiv = document.getElementById('coachMarkStartupPref');
    
    contentDiv.style.overflow = 'auto';
    contentDiv.style.overflowY = 'auto';
    contentDiv.style.WebkitOverflowScrolling = 'touch';
    
    contentDiv.innerHTML = `
      <h2 class="coach-mark-title" style="font-size: 22px; margin-bottom: 16px; color: #fff;">About JemsPantry</h2>
      <div class="about-container">
        <div class="about-card"><p class="about-card-text">Track pantry, fridge, and freezer items</p></div>
        <div class="about-card"><p class="about-card-text">Expiry date reminders</p></div>
        <div class="about-card"><p class="about-card-text">Quick item search</p></div>
        <div class="about-card"><p class="about-card-text">Meal planning with available ingredients</p></div>
        <div class="about-card"><p class="about-card-text">Reduce food waste and save money</p></div>
        <div class="about-version">
          <div class="about-version-item"><strong>Version:</strong> 1.0.0</div>
          <div class="about-version-item"><strong>Last Updated:</strong> March 2026</div>
        </div>
      </div>
    `;
    
    footerDiv.innerHTML = `<button class="coach-mark-button" onclick="closeCoachMarks()" style="background: #fff; color: var(--primary); width: auto;">Close</button>`;
    footerDiv.style.justifyContent = 'center';
    prefDiv.style.display = 'none';
    
    overlay.classList.add('active');
  }, 350);
}

function openCoachMarks(isStartup = false){
  currentCoachMarkStep = 0;
  currentViewMode = null; // Reset view mode
  isStartupCoachMark = isStartup;
  const overlay = document.getElementById('coachMarkOverlay');
  const contentDiv = document.getElementById('coachMarkContent');
  const coachContainer = overlay ? overlay.querySelector('.coach-mark-container') : null;
  const prefSection = document.getElementById('coachMarkStartupPref');
  const checkbox = document.getElementById('coachMarkDontShow');
  const existingFooter = overlay ? overlay.querySelector('.coach-mark-footer') : null;

  if (contentDiv) {
    contentDiv.style.overflow = '';
    contentDiv.style.overflowY = '';
    contentDiv.style.WebkitOverflowScrolling = '';
  }

  if (existingFooter) {
    existingFooter.outerHTML = `
      <div class="coach-mark-footer" role="navigation" aria-label="Coach mark navigation">
        <div class="coach-mark-dots" id="coachMarkDots" role="tablist" aria-label="Step indicators"></div>
        <div class="coach-mark-nav">
          <button class="coach-mark-nav-btn" id="coachMarkPrev" onclick="prevCoachMark()" aria-label="Previous step">←</button>
          <button class="coach-mark-nav-btn" id="coachMarkNext" onclick="nextCoachMark()" aria-label="Next step">→</button>
        </div>
      </div>`;
  } else if (coachContainer) {
    const footerMarkup = document.createElement('div');
    footerMarkup.className = 'coach-mark-footer';
    footerMarkup.setAttribute('role', 'navigation');
    footerMarkup.setAttribute('aria-label', 'Coach mark navigation');
    footerMarkup.innerHTML = `
      <div class="coach-mark-dots" id="coachMarkDots" role="tablist" aria-label="Step indicators"></div>
      <div class="coach-mark-nav">
        <button class="coach-mark-nav-btn" id="coachMarkPrev" onclick="prevCoachMark()" aria-label="Previous step">←</button>
        <button class="coach-mark-nav-btn" id="coachMarkNext" onclick="nextCoachMark()" aria-label="Next step">→</button>
      </div>`;
    coachContainer.appendChild(footerMarkup);
  }

  prefSection.style.display = isStartup ? 'flex' : 'none';
  if (checkbox) checkbox.checked = getHideCoachMarks();

  renderCoachMark();
  overlay.classList.add('active');
  overlay.setAttribute('aria-label', isStartup ? 'Onboarding guide for JemsPantry' : 'Help guide for JemsPantry');
}

function closeCoachMarks(event){
  if (event && event.target !== document.getElementById('coachMarkOverlay')) return;
  currentViewMode = null; // Reset view mode
  document.getElementById('coachMarkOverlay').classList.remove('active');
}

function saveRegion(){
  try { localStorage.setItem(REGION_KEY, region); } catch(e){}
}

function loadRegion(){
  try {
    region = localStorage.getItem(REGION_KEY) || "UK";
  } catch(e){
    region = "UK";
  }
}

function selectRegion(val){
  region = val;
  saveRegion();
  syncRegionUI();
  toast(`Region: ${val}`);
  render();
}

function syncRegionUI(){
  document.querySelectorAll('.help-region-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-region') === region);
  });
}

function clearSearch(){
  document.getElementById('search').value = '';
  document.querySelector('.search-clear').classList.remove('active');
  render();
}

function setFilter(type,val,el){
  filters[type].has(val) ? filters[type].delete(val) : filters[type].add(val);
  el.classList.toggle('active');
  render();
}

function clearFilters() {
  filters.loc.clear();
  filters.stor.clear();

  document.querySelectorAll('.filter-chips .chip').forEach(chip => {
    chip.classList.remove('active');
  });

  render();
  toast('Filters cleared');
}

function saveOpenCatsToStorage(){
  try { localStorage.setItem(OPENCATS_STORAGE_KEY, JSON.stringify([...openCats])); } catch(e){}
}

function loadOpenCatsFromStorage(){
  try{
    const raw = localStorage.getItem(OPENCATS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  }catch(e){
    return new Set();
  }
}

function toggleCategory(cat){
  openCats.forEach(c => {
    if (c !== cat) openCats.delete(c);
  });
  
  openCats.has(cat) ? openCats.delete(cat) : openCats.add(cat);
  saveOpenCatsToStorage();
  render();
}

function getOpenCategory(){
  return openCats.size > 0 ? Array.from(openCats)[0] : null;
}

const STORE_BRAND_STYLES = {
  UK: {
    "tesco": { bg: "#2F6FD6", text: "#FFFFFF" },
    "sainsbury's": { bg: "#F68B1F", text: "#111111" },
    "asda": { bg: "#78BE20", text: "#111111" },
    "aldi": { bg: "#00539F", text: "#FFFFFF" },
    "lidl": { bg: "#0050AA", text: "#FFFFFF" },
    "morrisons": { bg: "#1B5E20", text: "#FFFFFF" },
    "co-op": { bg: "#00A1E0", text: "#111111" },
    "waitrose": { bg: "#3E6F31", text: "#FFFFFF" },
    "iceland": { bg: "#D7261E", text: "#FFFFFF" },
    "ocado": { bg: "#7F3FBF", text: "#FFFFFF" }
  },
  US: {
    "walmart": { bg: "#0071CE", text: "#FFFFFF" },
    "costco": { bg: "#E31837", text: "#FFFFFF" },
    "kroger": { bg: "#0054A6", text: "#FFFFFF" },
    "albertsons": { bg: "#1B5FA7", text: "#FFFFFF" },
    "publix": { bg: "#067A33", text: "#FFFFFF" },
    "h-e-b": { bg: "#C8102E", text: "#FFFFFF" },
    "aldi": { bg: "#00539F", text: "#FFFFFF" },
    "trader joe's": { bg: "#B22222", text: "#FFFFFF" },
    "whole foods": { bg: "#2E6B3F", text: "#FFFFFF" },
    "meijer": { bg: "#D71920", text: "#FFFFFF" }
  },
  EU: {
    "carrefour": { bg: "#004E9E", text: "#FFFFFF" },
    "lidl": { bg: "#0050AA", text: "#FFFFFF" },
    "kaufland": { bg: "#D5001C", text: "#FFFFFF" },
    "aldi": { bg: "#00539F", text: "#FFFFFF" },
    "e.leclerc": { bg: "#005BBB", text: "#FFFFFF" },
    "rewe": { bg: "#CC071E", text: "#FFFFFF" },
    "edeka": { bg: "#0054A6", text: "#FFFFFF" },
    "intermarché": { bg: "#E30613", text: "#FFFFFF" },
    "mercadona": { bg: "#00843D", text: "#FFFFFF" },
    "auchan": { bg: "#D71920", text: "#FFFFFF" }
  }
};

const DEFAULT_STORE_COLORS = ["#2D7A4F","#3B82F6","#EF4444","#F59E0B","#8B5CF6","#06B6D4","#EC4899"];

function normalizeText(s){
  return String(s || "")
    .toLowerCase()
    .replace(/['`]/g, "'")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

function storeKey(store){
  return normalizeText(store);
}

function getStoreStyle(store, regionName = region){
  const key = storeKey(store);
  if (!key) return null;

  const regionStyles = STORE_BRAND_STYLES[regionName] || {};
  if (regionStyles[key]) return regionStyles[key];

  for (const reg of Object.keys(STORE_BRAND_STYLES)) {
    if (STORE_BRAND_STYLES[reg][key]) return STORE_BRAND_STYLES[reg][key];
  }

  if (storeColors[key]) {
    return {
      bg: storeColors[key],
      text: getContrastingTextColor(storeColors[key])
    };
  }

  return null;
}

function saveStoreColors(){
  try { localStorage.setItem(STORE_COLORS_KEY, JSON.stringify(storeColors)); } catch(e){}
}

function loadStoreColors(){
  try{
    const raw = localStorage.getItem(STORE_COLORS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    storeColors = (parsed && typeof parsed === "object") ? parsed : {};
  }catch(e){
    storeColors = {};
  }
}

function getStoreColor(store){
  const style = getStoreStyle(store);
  return style ? style.bg : null;
}

function getStoreTextColor(store){
  const style = getStoreStyle(store);
  return style ? style.text : null;
}

function setStoreColor(store,hex){
  const key = storeKey(store);
  if (!key) return;
  storeColors[key] = hex;
  saveStoreColors();
}

function getContrastingTextColor(hexColor){
  const hex = String(hexColor || "").replace("#", "");
  if (hex.length !== 6) return "#FFFFFF";
  const r = parseInt(hex.substring(0,2),16);
  const g = parseInt(hex.substring(2,4),16);
  const b = parseInt(hex.substring(4,6),16);
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  return luminance > 0.62 ? "#000000" : "#FFFFFF";
}

function ensureStoreHasColor(store){
  const s = String(store || "").trim();
  if (!s) return;
  if (getStoreStyle(s)) return;

  const key = storeKey(s);
  if (storeColors[key]) return;

  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  storeColors[key] = DEFAULT_STORE_COLORS[hash % DEFAULT_STORE_COLORS.length];
  saveStoreColors();
}

function saveInventoryToStorage(){
  try { localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(inventory)); } catch(e){}
}

function loadInventoryFromStorage(){
  try{
    const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){
    return [];
  }
}

function saveShoppingList(){
  try { localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(shoppingList)); } catch(e){}
}

function loadShoppingListFromStorage(){
  try{
    const raw = localStorage.getItem(SHOPPING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){
    return [];
  }
}

function reconcileShoppingListWithInventory(){
  const byRow = new Map(inventory.map(i => [i.rowNumber, i]));
  shoppingList = shoppingList
    .filter(x => byRow.has(x.rowNumber))
    .map(x => {
      const inv = byRow.get(x.rowNumber);
      return {
        ...x,
        item: inv.item,
        store: inv.store,
        quantity: inv.quantity,
        category: inv.category
      };
    });
  saveShoppingList();
}

let _confirm = { onYes:null, onNo:null };

function showConfirm({ title, message, yesText="Yes", noText="No", onYes, onNo }){
  _confirm.onYes = typeof onYes === "function" ? onYes : null;
  _confirm.onNo = typeof onNo === "function" ? onNo : null;
  document.getElementById("confirmTitle").textContent = title || "Confirm";
  document.getElementById("confirmMessage").textContent = message || "Are you sure?";
  document.getElementById("confirmYesBtn").textContent = yesText;
  document.getElementById("confirmNoBtn").textContent = noText;
  document.getElementById("confirmModal").classList.add("active");
}

function closeConfirm(event){
  if (event && event.target !== document.getElementById("confirmModal")) return;
  document.getElementById("confirmModal").classList.remove("active");
  _confirm.onYes = null;
  _confirm.onNo = null;
}

function confirmYes(){
  const fn = _confirm.onYes;
  closeConfirm();
  if(fn) fn();
}

function confirmNo(){
  const fn = _confirm.onNo;
  closeConfirm();
  if(fn) fn();
}

function detectCategoryAuto(item){
  const name = normalizeText(item.item);
  if (item.storage === "Freezer") return "Frozen Foods";

  const scores = new Map();
  const add = (cat, pts) => scores.set(cat, (scores.get(cat) || 0) + pts);
  const has = (k) => name.includes(normalizeText(k));
  const hasAny = (arr) => arr.some(has);

  const BRAND = {
    produce: ["dole","fyffes","pink lady","chiquita","zespri","pink lady apples"],
    bakery: ["warburtons","kingsmill","hovis","allinson's","allinsons","jackson's","jacksons","roberts","sunblest","soreen","genius"],
    dairy: ["cathedral city","arla","lactofree","lacto free","yazoo","actimel","activia","danone","yoplait","muller","müller","oatly","alpro","lurpak","kerrygold","anchor","philadelphia","galbani","president","président","fage","lindahls","yeo valley"],
    meat: ["heck","richmond","bernard matthews"],
    fish: ["young's","youngs","mowi","john west"],
    dry: ["uncle ben's","uncle bens","ben's original","bens original","dolmio","barilla","napolina","bachelor's","bachelors","super noodles","pot noodle","tilda","de cecco","buitoni","ragu","oxo"],
    herbsSpices: ["schwartz","mccormick","bart","rajah","east end","trs","ducros","santa maria","simply organic","spice islands","fuchs"],
    breakfast: ["weetabix","kellogg's","quaker","alpen","jordans","jordan's","dorset cereals","ready brek","cheerios","general mills","nestle cereals","oatibix","shreddies"],
    canned: ["heinz","branston","princes","napolina","mutti","cirio","campbell's","baxters","progresso","del monte","libby's","goya"],
    frozen: ["birds eye","birdseye","findus","mccain","goodfella's","goodfellas","chicago town","ben & jerry's","ben and jerry's","haagen-dazs","häagen-dazs","ore-ida","aunt bessie's","aunt bessies","dr oetker"],
    snacks: ["mcvities","mcvitie's","cadbury","oreo","lotus","walkers","doritos","cheetos","lays","pringles","kettle","tyrrells","lindt","milka","ferrero","ferrero rocher","kinder","haribo","rowntree's","skinny whip","love mallow","nature valley","graze","nakd"],
    beverages: ["coca cola","coca-cola","coke","pepsi","fanta","sprite","schweppes","fever-tree","ribena","vimto","tropicana","innocent","twinings","pg tips","tetley","nescafe","nespresso","lavazza","illy","starbucks","guinness","perrier","evian","volvic","gatorade","powerade"],
    condiments: ["hellmann's","hellmanns","best foods","hp","lea & perrins","lea and perrins","kikkoman","red boat","megachef","lee kum kee","tabasco","frank's redhot","franks redhot","blue dragon","sharwood's","sharwoods","patak's","pataks","amoy","sabra","fry light"],
    cleaning: ["fairy","persil","bold","ariel","lenor","comfort","flash","cif","domestos","dettol","andrex","cushelle","finish","vanish","harpic"],
    meds: ["calpol","nurofen","benylin","strepsils","lemsip","gaviscon","panadol","sudafed","gillette","venus","colgate","sensodyne","oral-b","corsodyl","sure","lynx","dove","nivea"]
  };

  if (hasAny(BRAND.produce)) add("Fruit & Veg", 6);
  if (hasAny(BRAND.bakery)) add("Bakery & Bread", 7);
  if (hasAny(BRAND.dairy)) add("Dairy & Refrigerated", 8);
  if (hasAny(BRAND.meat)) add("Meat, Poultry & Seafood", 6);
  if (hasAny(BRAND.fish)) add("Meat, Poultry & Seafood", 7);
  if (hasAny(BRAND.dry)) add("Pantry & Dry Goods", 6);
  if (hasAny(BRAND.herbsSpices)) add("Herbs & Spices", 8);
  if (hasAny(BRAND.breakfast)) add("Cereals & Breakfast", 8);
  if (hasAny(BRAND.canned)) add("Canned Goods & Sauces", 6);
  if (hasAny(BRAND.frozen)) add("Frozen Foods", 8);
  if (hasAny(BRAND.snacks)) add("Snacks", 7);
  if (hasAny(BRAND.beverages)) add("Beverages", 7);
  if (hasAny(BRAND.condiments)) add("Condiments & Oils", 7);
  if (hasAny(BRAND.cleaning)) add("Household & Cleaning", 8);
  if (hasAny(BRAND.meds)) add("Personal Care & Pharmacy", 9);

  if (has("heinz")) {
    add("Canned Goods & Sauces", 6);
    add("Condiments & Oils", 4);
  }
  if (hasAny(["nestle","nestlé"])) {
    add("Snacks", 4);
    add("Cereals & Breakfast", 4);
    add("Beverages", 3);
  }
  if (has("quaker")) {
    add("Cereals & Breakfast", 6);
    add("Pantry & Dry Goods", 3);
  }
  if (has("knorr")) {
    add("Canned Goods & Sauces", 4);
    add("Condiments & Oils", 4);
    add("Herbs & Spices", 3);
  }
  if (has("maggi")) {
    add("Pantry & Dry Goods", 4);
    add("Condiments & Oils", 4);
    add("Canned Goods & Sauces", 3);
  }
  if (hasAny(["colman's","colmans"])) {
    add("Condiments & Oils", 6);
    add("Herbs & Spices", 4);
  }
  if (has("schwartz")) {
    add("Herbs & Spices", 8);
    add("Pantry & Dry Goods", 2);
  }
  if (hasAny(["birds eye","birdseye"])) {
    add("Frozen Foods", 8);
    add("Meat, Poultry & Seafood", 3);
    add("Fruit & Veg", 2);
  }
  if (hasAny(["patak's","pataks","sharwood's","sharwoods","blue dragon"])) {
    add("Condiments & Oils", 5);
    add("Canned Goods & Sauces", 5);
    add("Pantry & Dry Goods", 3);
  }
  if (has("oxo")) {
    add("Pantry & Dry Goods", 7);
    add("Herbs & Spices", 3);
  }
  if (has("ferrero")) add("Snacks", 8);
  if (hasAny(["gillette","venus"])) add("Personal Care & Pharmacy", 8);
  if (has("fry light")) add("Condiments & Oils", 9);

  const pack = REGION_BRANDS[region] || REGION_BRANDS.Global;
  if (pack?.dairy?.some(has)) add("Dairy & Refrigerated", 3);
  if (pack?.bakery?.some(has)) add("Bakery & Bread", 3);
  if (pack?.breakfast?.some(has)) add("Cereals & Breakfast", 3);
  if (pack?.herbsSpices?.some(has)) add("Herbs & Spices", 3);
  if (pack?.canned?.some(has)) add("Canned Goods & Sauces", 3);
  if (pack?.frozen?.some(has)) add("Frozen Foods", 3);
  if (pack?.snacks?.some(has)) add("Snacks", 2);
  if (pack?.beverages?.some(has)) add("Beverages", 2);
  if (pack?.personalCare?.some(has)) add("Personal Care & Pharmacy", 3);

  if (item.storage === "Fridge") {
    add("Dairy & Refrigerated", 2);
    add("Fruit & Veg", 1);
    add("Condiments & Oils", 1);
  }
  if (item.storage === "Cupboard") {
    add("Pantry & Dry Goods", 1);
    add("Cereals & Breakfast", 1);
    add("Snacks", 1);
  }

  if (hasAny(["black pepper","white pepper","peppercorn","mustard powder","sesame seeds","sesame seed","mixed herbs","italian seasoning"])) add("Herbs & Spices", 14);
  if (hasAny(["bell pepper","red pepper","green pepper"])) add("Fruit & Veg", 14);
  if (hasAny(["cornflakes","corn flakes","malt wheats","mini wheats","shredded wheat","wheaties"])) add("Cereals & Breakfast", 14);
  if (hasAny(["mixed baby leaves","baby leaves","babyleaf","babyleaf salad","salad leaves","leaf salad"])) add("Fruit & Veg", 14);
  if (hasAny(["parmigiano reggiano","parmigiano","grana padano","grated parmigiano","kvarg","coleslaw"])) add("Dairy & Refrigerated", 14);
  if (hasAny(["dishwasher cleaner","dishwasher tablet","dishwasher tablets","rinse aid","caddy liners","compostable liners","tie top liners"])) add("Household & Cleaning", 14);
  if (hasAny(["oxo stock powder","stock powder","stock pot","stock pots","bouillon","icing pens","icing sugar","meringue nest","meringue nests"])) add("Pantry & Dry Goods", 14);
  if (hasAny(["fry light","spray oil","cooking spray"])) add("Condiments & Oils", 14);
  if (hasAny(["ferrero rocher","wafer bars","wafer bar","toffee bars","skinny whip","pink and whites","pink & whites"])) add("Snacks", 14);
  if (hasAny(["gillette venus","disposable razors","razor","razors","shaving"])) add("Personal Care & Pharmacy", 14);
  if (hasAny(["gherkin","gherkins","pickled gherkins"])) add("Canned Goods & Sauces", 14);
  if (hasAny(["houmous","hummous"])) add("Condiments & Oils", 14);
  if (has("saffron")) add("Herbs & Spices", 14);

  const KEYWORDS = {
    "Fruit & Veg": [
      "apple","apples","banana","bananas","orange","oranges","pear","pears","grape","grapes","melon","watermelon","pineapple","mango","peach","plum","apricot","cherry","cherries","blueberry","blueberries","strawberry","strawberries","raspberry","blackberry","kiwi","lime","lemon","avocado","papaya","guava","grapefruit","clementine","satsuma","mandarin","fig","pomegranate","nectarine","rhubarb","carrot","carrots","broccoli","cauliflower","cabbage","cucumber","tomato","tomatoes","lettuce","spinach","kale","pepper","peppers","onion","onions","garlic","leek","celery","beet","beetroot","radish","turnip","parsnip","potato","potatoes","sweet potato","courgette","zucchini","aubergine","eggplant","mushroom","asparagus","artichoke","green beans","peas","vegetable","vegetables","veg","baby leaf","baby leaves","babyleaf","mixed leaves","salad leaves","leaf salad"
    ],
    "Meat, Poultry & Seafood": [
      "beef","pork","lamb","chicken","turkey","duck","steak","mince","minced","ground beef","ground chicken","sausage","sausages","bacon","burger","burgers","ham","gammon","pepperoni","salami","chorizo","fish","salmon","tuna","cod","haddock","plaice","halibut","mackerel","trout","prawn","prawns","shrimp","crab","lobster","mussels","anchovy","sardine","kipper","venison","seafood"
    ],
    "Dairy & Refrigerated": [
      "milk","cheese","butter","yoghurt","yogurt","eggs","cream","cheddar","mozzarella","parmesan","parmigiano","parmigiano reggiano","grana padano","feta","brie","camembert","halloumi","edam","stilton","quark","kvarg","ricotta","sour cream","cottage cheese","lactose free","string cheese","cream cheese","double cream","single cream","semi skimmed","skimmed","whole milk","buttermilk","créme fraiche","creme fraiche","custard","kefir","fromage frais","soft cheese","skyr","coleslaw"
    ],
    "Bakery & Bread": [
      "bread","roll","rolls","bagel","bagels","wrap","wraps","naan","pitta","pita","baguette","sourdough","croissant","muffin","bun","buns","crumpet","brioche","ciabatta","focaccia","loaf","toastie","teacake"
    ],
    "Pantry & Dry Goods": [
      "rice","pasta","noodles","ramen","couscous","quinoa","lentil","lentils","flour","oats","porridge","bean","beans","chickpea","chickpeas","pulses","sugar","honey","syrup","maple","treacle","molasses","jam","preserves","marmalade","semolina","polenta","bulgur","barley","breadcrumbs","stock cube","stock cubes","stock powder","stock pot","stock pots","bouillon","gravy","gravy granules","stuffing","cracker","crackers","taco kit","tortilla kit","pancake mix","baking powder","bicarbonate","baking soda","yeast","custard powder","jelly","gelatine","gelatin","rice pudding","spaghetti","macaroni","penne","fusilli","lasagne sheets","lasagna sheets","icing","icing sugar","icing pens","meringue","meringue nest","meringue nests","oxo"
    ],
    "Herbs & Spices": [
      "herb","herbs","spice","spices","seasoning","paprika","cumin","turmeric","coriander","oregano","basil","thyme","rosemary","parsley","mint","dill","chives","tarragon","cinnamon","nutmeg","cardamom","ginger","cloves","pepper","salt","chilli","chili","mustard","vanilla","cocoa","schwartz","colman's","colmans","season all","mixed herbs","italian seasoning","garam masala","five spice","allspice","bay leaf","bay leaves","sage","marjoram","sesame seeds","sesame seed","saffron","garlic powder","onion powder","black pepper","white pepper","peppercorn"
    ],
    "Cereals & Breakfast": [
      "cereal","cereals","porridge","muesli","granola","oats","weetabix","cornflakes","frosties","cheerios","bran","flakes","alpen","oatibix","readybrek","ready brek","shreddies","shredded wheat","coco pops","rice krispies","breakfast biscuit","breakfast bar","granola bar","wheats","malt wheats","mini wheats","wheat biscuits"
    ],
    "Canned Goods & Sauces": [
      "tin","tins","tinned","canned","passata","soup","soups","pesto","pickle","olives","capers","pasta sauce","curry sauce","baked beans","chopped tomatoes","jar","jars","tomato puree","tomato purée","sundried tomato","sun dried tomato","coconut milk","evaporated milk","condensed milk","sweetcorn","tuna chunks","bean salad","salsa jar","borscht","minestrone","tomato soup","mushroom soup","gherkin","gherkins","pickled gherkins"
    ],
    "Frozen Foods": [
      "frozen","sorbet","gelato","popsicle","lolly","ice cream","pizza","chips","fries","hash browns","nuggets","dumplings","gyoza","spring rolls","ice lolly","frozen peas","frozen veg","frozen vegetables","ice lollies"
    ],
    "Snacks": [
      "biscuit","biscuits","cookie","cookies","chocolate","crisps","crisp","chips","popcorn","pretzel","flapjack","nuts","trail mix","candy","sweet","sweets","granola bar","cereal bar","protein bar","energy bar","snack bar","rice cake","tart","tarts","brownie","muffin bites","cracker","crackers","nachos","marshmallow","jelly sweets","bars","wafer bar","wafer bars","toffee bars","rocher","pink and whites","pink & whites"
    ],
    "Beverages": [
      "juice","cola","tea","coffee","squash","cordial","smoothie","lemonade","cider","beer","wine","vodka","gin","rum","whisky","whiskey","fizz","tonic","water","sparkling","hot chocolate","coke","pepsi","fanta","sprite","kombucha","milkshake","espresso","latte","herbal tea","iced tea","orange juice","apple juice"
    ],
    "Condiments & Oils": [
      "oil","olive oil","vegetable oil","mayo","mayonnaise","mustard","vinegar","ketchup","bbq","hot sauce","soy sauce","worcestershire","fish sauce","oyster sauce","hoisin","sriracha","pesto","hummus","houmous","hummous","tahini","aioli","guacamole","sauce","dressing","teriyaki","tamari","chutney","relish","salad cream","fry light","spray oil","cooking spray"
    ],
    "Household & Cleaning": [
      "cleaning","detergent","washing powder","washing tablet","laundry","bleach","disinfectant","wipes","toilet paper","tissues","bin bags","bin liner","kitchen roll","paper towel","sponge","cloth","napkins","foil","cling film","washing up liquid","fabric softener","antibacterial","surface cleaner","multi surface","dish soap","soap pads","rubber gloves","toilet cleaner","limescale remover","air freshener","dishwasher","dishwasher cleaner","dishwasher tablet","dishwasher tablets","rinse aid","caddy liners","compostable liners","liners","tie top liners"
    ],
    "Personal Care & Pharmacy": [
      "medicine","vitamins","vitamin","supplement","paracetamol","ibuprofen","aspirin","antihistamine","shampoo","conditioner","soap","lotion","moisturiser","moisturizer","deodorant","toothpaste","toothbrush","mouthwash","floss","sunscreen","cold","flu","cough","antacid","allergy","cream","plasters","bandage","bandages","pain relief","lip balm","hand cream","face wash","body wash","sanitiser","sanitizer","razor","razors","gillette","shaving"
    ]
  };

  Object.entries(KEYWORDS).forEach(([category, keywords]) => {
    if (keywords.some(has)) add(category, 10);
  });

  let best = null;
  let bestScore = 0;
  for (const category of CATEGORIES){
    const score = scores.get(category) || 0;
    if (score > bestScore){
      bestScore = score;
      best = category;
    }
  }
  return best;
}

function isItemIncomplete(item){
  const hasItem = item.item && String(item.item).trim();
  const hasStore = item.store && String(item.store).trim();
  const hasLocation = item.location && String(item.location).trim();
  const hasStorage = item.storage && String(item.storage).trim();
  
  return !hasItem || !hasStore || !hasLocation || !hasStorage;
}

function getCategory(item){
  const manualCategory = item.category && String(item.category).trim();
  if (manualCategory && CATEGORIES.includes(manualCategory)) return manualCategory;
  return detectCategoryAuto(item);
}

function isItemUnsorted(item){
  if (isItemIncomplete(item)) return true;

  const manualCategory = item.category && String(item.category).trim();
  if (manualCategory && !CATEGORIES.includes(manualCategory)) return true;

  return !getCategory(item);
}

function updateCartBadge(){
  const badge = document.getElementById('cartBadge');
  const count = shoppingList.length;
  if (count === 0) badge.classList.add('hidden');
  else {
    badge.classList.remove('hidden');
    badge.textContent = count;
  }
}

function addToShoppingList(rowNumber){
  const item = inventory.find(x => x.rowNumber === rowNumber);
  if (!item) return;

  const existing = shoppingList.find(x => x.rowNumber === rowNumber);
  if (existing){
    shoppingList = shoppingList.filter(x => x.rowNumber !== rowNumber);
    toast('Removed from shopping list');
  } else {
    shoppingList.push({
      rowNumber,
      item: item.item,
      store: item.store,
      quantity: item.quantity,
      category: item.category,
      checked:false
    });
    toast('Added to shopping list');
  }

  saveShoppingList();
  updateCartBadge();
  render();
  renderShoppingList();
}

function openShoppingList(){
  renderShoppingList();
  requestAnimationFrame(() => {
    document.getElementById('shoppingModal').classList.add('active');
  });
}

function closeShoppingList(event){
  if (event && event.target !== document.getElementById('shoppingModal')) return;
  document.getElementById('shoppingModal').classList.remove('active');
}

function toggleShoppingItem(index){
  if (shoppingList[index]){
    shoppingList[index].checked = !shoppingList[index].checked;
    saveShoppingList();
    renderShoppingList();
  }
}

function removeFromShoppingList(index){
  shoppingList.splice(index,1);
  saveShoppingList();
  updateCartBadge();
  render();
  renderShoppingList();
}

function clearCheckedItems(){
  shoppingList = shoppingList.filter(x => !x.checked);
  saveShoppingList();
  updateCartBadge();
  render();
  renderShoppingList();
}

function clearAllItems(){
  showConfirm({
    title:"Clear shopping list?",
    message:"This will remove all items from your shopping list.",
    yesText:"Yes",
    noText:"No",
    onYes: () => {
      shoppingList = [];
      saveShoppingList();
      updateCartBadge();
      render();
      renderShoppingList();
      toast("Shopping list cleared");
    }
  });
}

function renderShoppingList(){
  const content = document.getElementById('shoppingListContent');

  if (shoppingList.length === 0){
    content.innerHTML = `
      <div class="shopping-list-empty">
        <div class="shopping-list-empty-icon">🛒</div>
        <h3 style="margin:0 0 8px;font-size:16px;color:var(--text-primary);">No items yet</h3>
        <p>Add items from your pantry to start shopping</p>
      </div>
    `;
    return;
  }

  const grouped = {};
  shoppingList.forEach((item,index) => {
    const store = item.store || 'Other';
    if (!grouped[store]) grouped[store] = [];
    grouped[store].push({ ...item, index });
  });

  let html = '';
  Object.keys(grouped).sort().forEach(store => {
    const bg = getStoreColor(store) || "#2D7A4F";
    const fg = getStoreTextColor(store) || getContrastingTextColor(bg);

    html += `<div class="shopping-list-grouped">`;
    html += `<div class="shopping-store-header" style="background:${bg};color:${fg};">${escapeHtml(store)}</div>`;

    grouped[store].forEach(item => {
      html += `
        <div class="shopping-list-item ${item.checked ? 'checked' : ''}">
          <input type="checkbox" class="shopping-item-checkbox" ${item.checked ? 'checked' : ''} onchange="toggleShoppingItem(${item.index})">
          <div class="shopping-item-info">
            <span class="shopping-item-name">${escapeHtml(item.item)}</span>
          </div>
          <button class="shopping-item-remove" onclick="removeFromShoppingList(${item.index})">✕</button>
        </div>
      `;
    });

    html += `</div>`;
  });

  html += `
    <div class="shopping-actions">
      <button class="btn-action primary" onclick="clearCheckedItems()">Clear Checked</button>
      <button class="btn-action danger" onclick="clearAllItems()">Clear All</button>
    </div>
    <div class="shopping-list-count">
      ${shoppingList.filter(x => x.checked).length} of ${shoppingList.length} items
    </div>
  `;

  content.innerHTML = html;
}

function populateCategoryDropdown(){
  const sel = document.getElementById('f_category');
  let html = `<option value="">Auto (recommended)</option>`;
  CATEGORIES.forEach(c => html += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
  sel.innerHTML = html;
}

function scrollItemModalToTop(){
  const modalScroller = document.querySelector("#itemModal .modal-content");
  if (modalScroller) modalScroller.scrollTop = 0;
  const body = document.getElementById("itemModalBody");
  if (body) body.scrollTop = 0;
}

function clearFieldErrors(){
  const fields = document.querySelectorAll('.field');
  fields.forEach(field => field.classList.remove('error'));
}

function openItemEditor(rowNumber){
  populateCategoryDropdown();
  clearFieldErrors();
  const modal = document.getElementById('itemModal');
  const title = document.getElementById('itemModalTitle');
  const remRow = document.getElementById('removeRow');
  editingId = rowNumber;

  if (!rowNumber){
    title.textContent = "Add Item";
    remRow.style.display = "none";
    document.getElementById('f_item').value = "";
    document.getElementById('f_store').value = "";
    document.getElementById('f_qty').value = 1;
    document.getElementById('f_location').value = "Kitchen";
    document.getElementById('f_storage').value = "Cupboard";
    
    const openCategory = getOpenCategory();
    document.getElementById('f_category').value = openCategory || "";
    
    document.getElementById('f_expiry').value = "";
    document.getElementById('f_notes').value = "";
    modal.classList.add('active');
    setTimeout(() => {
      scrollItemModalToTop();
      document.getElementById('f_item').focus();
    }, 60);
    return;
  }

  const item = inventory.find(x => x.rowNumber === rowNumber);
  if (!item) return;

  title.textContent = "Edit Item";
  remRow.style.display = "block";
  document.getElementById('f_item').value = item.item || "";
  document.getElementById('f_store').value = item.store || "";
  document.getElementById('f_qty').value = Number.isFinite(item.quantity) ? item.quantity : 1;
  document.getElementById('f_location').value = item.location || "Kitchen";
  document.getElementById('f_storage').value = item.storage || "Cupboard";
  document.getElementById('f_category').value = CATEGORIES.includes(item.category) ? item.category : "";
  document.getElementById('f_expiry').value = item.expiry || "";
  document.getElementById('f_notes').value = item.notes || "";
  modal.classList.add('active');

  setTimeout(() => {
    scrollItemModalToTop();
    document.getElementById('f_item').focus();
  }, 60);
}

function closeItemEditor(event){
  if (event && event.target !== document.getElementById('itemModal')) return;
  document.getElementById('itemModal').classList.remove('active');
  editingId = null;
}

function setupDrawerSwipeToClose(){
  const drawerConfigs = [
    { overlayId: 'shoppingModal' },
    { overlayId: 'itemModal', onClose: () => { editingId = null; } }
  ];

  drawerConfigs.forEach(({ overlayId, onClose }) => {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    const header = overlay.querySelector('.modal-header');
    const sheet = overlay.querySelector('.modal-content');
    if (!header || !sheet) return;
    if (header.dataset.swipeBound === '1') return;
    header.dataset.swipeBound = '1';

    let startY = 0;
    let currentY = 0;
    let dragging = false;

    const resetSheet = () => {
      sheet.style.transition = 'transform .24s ease, opacity .24s ease';
      sheet.style.transform = 'translateY(0)';
      sheet.style.opacity = '1';
      setTimeout(() => {
        sheet.style.transition = '';
      }, 260);
    };

    header.addEventListener('touchstart', (e) => {
      if (!overlay.classList.contains('active')) return;
      if (!e.touches || !e.touches.length) return;
      dragging = true;
      startY = e.touches[0].clientY;
      currentY = startY;
      sheet.style.transition = 'none';
    }, { passive: true });

    header.addEventListener('touchmove', (e) => {
      if (!dragging || !e.touches || !e.touches.length) return;
      currentY = e.touches[0].clientY;
      const deltaY = Math.max(0, currentY - startY);
      sheet.style.transform = `translateY(${deltaY}px)`;
      sheet.style.opacity = String(Math.max(0.78, 1 - (deltaY / 500)));
    }, { passive: true });

    header.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      const deltaY = Math.max(0, currentY - startY);
      if (deltaY > 72) {
        sheet.style.transition = 'transform .22s ease, opacity .22s ease';
        sheet.style.transform = 'translateY(100%)';
        sheet.style.opacity = '0.88';
        setTimeout(() => {
          overlay.classList.remove('active');
          sheet.style.transition = '';
          sheet.style.transform = '';
          sheet.style.opacity = '';
          if (typeof onClose === 'function') onClose();
        }, 220);
      } else {
        resetSheet();
      }
    });

    header.addEventListener('touchcancel', () => {
      dragging = false;
      resetSheet();
    });
  });
}

function validateUnsortedItem(){
  if (!editingId) return true;
  
  const item = inventory.find(x => x.rowNumber === editingId);
  if (!item || !isItemUnsorted(item)) return true;
  
  const f_item = document.getElementById('f_item');
  const f_store = document.getElementById('f_store');
  const f_location = document.getElementById('f_location');
  const f_storage = document.getElementById('f_storage');
  
  const itemField = f_item.closest('.field');
  const storeField = f_store.closest('.field');
  const locationField = f_location.closest('.field');
  const storageField = f_storage.closest('.field');
  
  [itemField, storeField, locationField, storageField].forEach(f => {
    if (f) f.classList.remove('error');
  });
  
  const missingFields = [];
  
  if (!f_item.value.trim()) {
    itemField.classList.add('error');
    missingFields.push('Item Name');
  }
  if (!f_store.value.trim()) {
    storeField.classList.add('error');
    missingFields.push('Store');
  }
  if (!f_location.value.trim()) {
    locationField.classList.add('error');
    missingFields.push('Location');
  }
  if (!f_storage.value.trim()) {
    storageField.classList.add('error');
    missingFields.push('Storage Type');
  }
  
  if (missingFields.length > 0) {
    toast(`Required: ${missingFields.join(', ')}`);
    return false;
  }
  
  return true;
}

function saveItemFromModal(){
  const itemName = document.getElementById('f_item').value.trim();
  if (!itemName){
    toast("Item name required");
    return;
  }

  if (!validateUnsortedItem()){
    return;
  }

  const selectedCategory = document.getElementById('f_category').value;
  const payload = {
    item: itemName,
    store: document.getElementById('f_store').value.trim(),
    quantity: Math.max(0, parseInt(document.getElementById('f_qty').value || "0", 10)),
    location: document.getElementById('f_location').value,
    storage: document.getElementById('f_storage').value,
    category: CATEGORIES.includes(selectedCategory) ? selectedCategory : "",
    expiry: document.getElementById('f_expiry').value,
    notes: document.getElementById('f_notes').value.trim()
  };

  ensureStoreHasColor(payload.store);

  if (!editingId){
    const newId = Date.now() + Math.floor(Math.random()*1000);
    const newItem = { rowNumber: newId, ...payload };
    inventory.push(newItem);
    toast("Item added");
  } else {
    const idx = inventory.findIndex(x => x.rowNumber === editingId);
    if (idx !== -1) {
      const oldData = JSON.parse(JSON.stringify(inventory[idx]));
      inventory[idx] = { ...inventory[idx], ...payload };
      undoManager.record(createEditAction(editingId, oldData, inventory[idx]));
      toast("Item updated");
    }
  }

  saveInventoryToStorage();
  reconcileShoppingListWithInventory();
  updateCartBadge();
  render();
  closeItemEditor();
}

function removeItemFromModal(){
  if (!editingId) return;
  const item = inventory.find(x => x.rowNumber === editingId);
  if (!item) return;

  showConfirm({
    title:"Remove item?",
    message:`Remove "${item.item}" from this device?`,
    yesText:"Yes",
    noText:"No",
    onYes: () => {
      const itemBackup = JSON.parse(JSON.stringify(item));
      const shoppingBackup = JSON.parse(JSON.stringify(shoppingList));

      inventory = inventory.filter(x => x.rowNumber !== editingId);
      shoppingList = shoppingList.filter(x => x.rowNumber !== editingId);
      saveInventoryToStorage();
      saveShoppingList();
      updateCartBadge();

      undoManager.record(createDeleteAction(editingId, itemBackup, shoppingBackup));

      render();
      closeItemEditor();
      toast("Item removed (Undo available)");
    }
  });
}

function removeItem(row){
  const item = inventory.find(x => x.rowNumber === row);
  if (!item) return;

  showConfirm({
    title:"Remove item?",
    message:`Remove "${item.item}" from this device?`,
    yesText:"Yes",
    noText:"No",
    onYes: () => {
      const itemBackup = JSON.parse(JSON.stringify(item));
      const shoppingBackup = JSON.parse(JSON.stringify(shoppingList));

      inventory = inventory.filter(x => x.rowNumber !== row);
      shoppingList = shoppingList.filter(x => x.rowNumber !== row);
      saveInventoryToStorage();
      saveShoppingList();
      updateCartBadge();

      undoManager.record(createDeleteAction(row, itemBackup, shoppingBackup));

      render();
      toast("Item removed (Undo available)");
    }
  });
}

function updateQty(row, delta){
  const item = inventory.find(x => x.rowNumber === row);
  if (!item) return;
  item.quantity = Math.max(0, (item.quantity ?? 0) + delta);

  const inCart = shoppingList.find(x => x.rowNumber === row);
  if (inCart){
    inCart.quantity = item.quantity;
    saveShoppingList();
  }

  saveInventoryToStorage();
  render();
}

function parseLocalDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatExpiryDateForRegion(expiryDateStr) {
  const expiry = parseLocalDate(expiryDateStr);
  if (!expiry) return escapeHtml(expiryDateStr || '');

  const dd = String(expiry.getDate()).padStart(2, '0');
  const mm = String(expiry.getMonth() + 1).padStart(2, '0');
  const yyyy = expiry.getFullYear();

  return region === 'US' ? `${mm}-${dd}-${yyyy}` : `${dd}-${mm}-${yyyy}`;
}

function getExpiryInfo(expiryDateStr) {
  const expiry = parseLocalDate(expiryDateStr);
  if (!expiry) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const dayMs = 1000 * 60 * 60 * 24;
  const daysUntilExpiry = Math.round((expiry.getTime() - today.getTime()) / dayMs);

  if (daysUntilExpiry < 0) {
    return { status: 'expired', daysUntilExpiry };
  }

  if (daysUntilExpiry <= 3) {
    return { status: 'expiring-soon', daysUntilExpiry };
  }

  return { status: null, daysUntilExpiry };
}

function getExpiryStatus(expiryDateStr) {
  const info = getExpiryInfo(expiryDateStr);
  return info ? info.status : null;
}

function getExpiryBadgeHtml(expiryDateStr) {
  const info = getExpiryInfo(expiryDateStr);
  if (!info || !info.status) return '';

  if (info.status === 'expired') {
    return `<span class="expiry-badge expired">EXPIRED</span>`;
  }

  const days = Math.max(0, info.daysUntilExpiry);
  const label = `${days} ${days === 1 ? 'DAY' : 'DAYS'}`;
  return `<span class="expiry-badge expiring-soon">${label}</span>`;
}

function render(){
  const container = document.getElementById('main');
  const query = document.getElementById('search').value.toLowerCase();
  const searchBtn = document.querySelector('.search-clear');
  searchBtn.classList.toggle('active', query.length > 0);
  container.innerHTML = '';

  const filtered = inventory.filter(i => {
    const name = (i.item || "").toLowerCase();
    const store = (i.store || "").toLowerCase();
    const notes = (i.notes || "").toLowerCase();
    const sMatch = !query || name.includes(query) || store.includes(query) || notes.includes(query);
    const lMatch = filters.loc.size === 0 || filters.loc.has(i.location);
    const rMatch = filters.stor.size === 0 || filters.stor.has(i.storage);
    return sMatch && lMatch && rMatch;
  });

  if (filtered.length === 0){
    const hasActiveFilters = filters.loc.size > 0 || filters.stor.size > 0;
    const clearButtonHtml = hasActiveFilters ? 
      `<button class="clear-filters-btn" onclick="clearFilters()">Clear Filters</button>` : '';

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🧺</div>
        <h2>No items found</h2>
        <p>Try adjusting your filters or search</p>
        ${clearButtonHtml}
      </div>
    `;
    return;
  }

  const unsortedItems = filtered.filter(i => isItemUnsorted(i));
  const sortedItems = filtered.filter(i => !isItemUnsorted(i));

  const derivedCategories = sortedItems
    .map(i => getCategory(i) || 'Uncategorised')
    .filter(cat => cat && cat !== 'Slimming World');
  const allCats = [...new Set([...CATEGORIES, ...derivedCategories])];
  
  if (unsortedItems.length > 0) {
    allCats.unshift("Unsorted Items");
  }

  allCats.forEach(cat => {
    let items;
    if (cat === "Unsorted Items") {
      items = unsortedItems;
    } else {
      items = sortedItems.filter(i => (getCategory(i) || 'Uncategorised') === cat);
    }
    
    if (items.length === 0) return;

    const block = document.createElement('div');
    block.className = `category-card ${openCats.has(cat) ? 'open' : ''} ${cat === 'Unsorted Items' ? 'unsorted-items' : ''}`;

    const catHeader = document.createElement('div');
    catHeader.className = 'cat-header';
    catHeader.onclick = () => toggleCategory(cat);
    catHeader.innerHTML = `
      <h2 class="cat-title">${escapeHtml(cat)}</h2>
      <span class="cat-count">${items.length}</span>
      <svg class="cat-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;
    block.appendChild(catHeader);

    const content = document.createElement('div');
    content.className = 'cat-content';

    if (cat === 'Unsorted Items') {
      const warning = document.createElement('div');
      warning.className = 'unsorted-warning';
      warning.textContent = 'These items need additional information or a valid category.';
      content.appendChild(warning);
    }

    items.sort((a,b) => (b.quantity || 0) - (a.quantity || 0)).forEach(i => {
      const isInCart = shoppingList.some(x => x.rowNumber === i.rowNumber);
      const showAddBtn = (i.quantity ?? 0) <= 2;
      const row = document.createElement('div');
      const storageClass = i.storage === "Fridge" ? "fridge" : i.storage === "Cupboard" ? "cupboard" : "freezer";
      const expiryClass = getExpiryStatus(i.expiry) || '';
      row.className = `item-row ${storageClass} ${expiryClass} ${(i.quantity ?? 0) === 0 ? 'out-of-stock' : ''}`;

      const expiryLine = i.expiry ? `Expiry: ${escapeHtml(formatExpiryDateForRegion(i.expiry))}` : "";
      const notesLine = i.notes ? `Notes: ${escapeHtml(i.notes)}` : "";
      const expiryBadge = getExpiryBadgeHtml(i.expiry);

      row.innerHTML = `
        <div class="item-info">
          <span class="item-label">${escapeHtml(i.item)}</span>
          <div class="item-meta">${escapeHtml(i.store || "Store")} • ${escapeHtml(i.location)} • ${escapeHtml(i.storage)}</div>
          <div class="item-cat">${escapeHtml(getCategory(i) || "Uncategorised")}</div>
          ${(expiryLine || notesLine) ? `<div class="item-submeta">${[expiryLine, notesLine].filter(Boolean).join(" • ")}</div>` : ""}
          ${expiryBadge}
        </div>
        <div class="item-actions">
          <div class="item-controls">
            <button class="add-to-shop ${showAddBtn ? 'show' : ''} ${isInCart ? 'in-cart' : ''}" onclick="addToShoppingList(${i.rowNumber})">
              <svg class="add-to-shop-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0020 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
              </svg>
              ${isInCart ? 'In Cart' : 'Add'}
            </button>
            <div class="qty-control">
              <button class="qty-btn minus" onclick="updateQty(${i.rowNumber}, -1)">−</button>
              <div class="qty-display">${i.quantity ?? 0}</div>
              <button class="qty-btn plus" onclick="updateQty(${i.rowNumber}, 1)">+</button>
            </div>
            <div class="item-footer-actions">
              <button class="edit-btn" onclick="openItemEditor(${i.rowNumber})" title="Edit">✎</button>
              <button class="remove-btn" onclick="removeItem(${i.rowNumber})">Remove</button>
            </div>
          </div>
        </div>
      `;
      content.appendChild(row);
    });

    block.appendChild(content);
    container.appendChild(block);
  });
}

function setupFieldErrorListeners(){
  const requiredFields = ['f_item', 'f_store', 'f_location', 'f_storage'];
  requiredFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('input', () => {
        const fieldContainer = field.closest('.field');
        if (fieldContainer) {
          fieldContainer.classList.remove('error');
        }
      });
      field.addEventListener('change', () => {
        const fieldContainer = field.closest('.field');
        if (fieldContainer) {
          fieldContainer.classList.remove('error');
        }
      });
    }
  });
}

function load(){
  openCats = loadOpenCatsFromStorage();
  inventory = loadInventoryFromStorage();
  shoppingList = loadShoppingListFromStorage();
  loadRegion();
  syncRegionUI();
  loadStoreColors();

  if (!inventory || inventory.length === 0){
    inventory = [
      { rowNumber: 1, item: "Bananas", category: "Fruit & Veg", store: "Tesco", location: "Kitchen", storage: "Cupboard", quantity: 5, expiry: "", notes: "" },
      { rowNumber: 2, item: "Milk", category: "Dairy & Refrigerated", store: "Tesco", location: "Kitchen", storage: "Fridge", quantity: 1, expiry: "", notes: "" },
      { rowNumber: 3, item: "Chicken Breast", category: "Meat, Poultry & Seafood", store: "Iceland", location: "Kitchen", storage: "Freezer", quantity: 3, expiry: "", notes: "" }
    ];
    saveInventoryToStorage();
  }

  inventory.forEach(i => ensureStoreHasColor(i.store));
  reconcileShoppingListWithInventory();
  updateCartBadge();
  render();
  updateHeaderHeight();
  setupFieldErrorListeners();
  setupDrawerSwipeToClose();
}

window.addEventListener('load', () => {
  load();
  updateHeaderHeight();
  showSplashIfNeeded();
});

window.addEventListener('resize', updateHeaderHeight);

document.getElementById('search').addEventListener('input', () => {
  render();
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    performUndo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    performRedo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    performRedo();
    return;
  }
  if (e.key === 'Escape'){
    closeShoppingList();
    closeItemEditor();
    closeConfirm();
    closeCoachMarks();
    closeHelpMenu();
    closeDataManager();
    closeImportOptions();
    closeImportSummary();
  }
});

function openDataManager(){
  const helpMenuOverlay = document.getElementById('helpMenuOverlay');
  if (helpMenuOverlay) {
    helpMenuOverlay.classList.remove('active');
  }
  setTimeout(() => {
    const overlay = document.getElementById('dataManagerOverlay');
    if (overlay) {
      overlay.classList.add('active');
    }
  }, 50);
}

function closeDataManager(event){
  if (event && event.target !== document.getElementById('dataManagerOverlay')) return;
  document.getElementById('dataManagerOverlay').classList.remove('active');
}

function closeImportOptions(event){
  if (event && event.target !== document.getElementById('importOptionsOverlay')) return;
  document.getElementById('importOptionsOverlay').classList.remove('active');
}

function closeImportSummary(event){
  if (event && event.target !== document.getElementById('importSummaryOverlay')) return;
  document.getElementById('importSummaryOverlay').classList.remove('active');
}

function getDataAsArray(){
  return inventory.map(item => [
    item.item,
    CATEGORIES.includes(item.category) ? item.category : '',
    item.store || '',
    item.location || '',
    item.storage || '',
    item.quantity || 0,
    item.expiry || '',
    item.notes || ''
  ]);
}

function getCSVString(){
  const headers = ['Item', 'Category', 'Store', 'Location', 'Storage', 'Quantity', 'Expiry', 'Notes'];
  const data = getDataAsArray();
  
  const escapeCSV = (val) => {
    val = String(val || '');
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  };
  
  const headerRow = headers.map(escapeCSV).join(',');
  const dataRows = data.map(row => row.map(escapeCSV).join(',')).join('\n');
  
  return headerRow + '\n' + dataRows;
}

function getTSVString(){
  const headers = ['Item', 'Category', 'Store', 'Location', 'Storage', 'Quantity', 'Expiry', 'Notes'];
  const data = getDataAsArray();
  
  const headerRow = headers.join('\t');
  const dataRows = data.map(row => row.join('\t')).join('\n');
  
  return headerRow + '\n' + dataRows;
}

function exportAsCSV(){
  const csv = getCSVString();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, `pantry_backup_${new Date().toISOString().split('T')[0]}.csv`);
  toast('Pantry exported as CSV');
}

function exportAsTSV(){
  const tsv = getTSVString();
  const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
  downloadFile(blob, `pantry_backup_${new Date().toISOString().split('T')[0]}.tsv`);
  toast('Pantry exported as TSV');
}

function downloadFile(blob, filename){
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function handleFileImport(event){
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    let rows = [];
    
    try {
      if (fileExtension === 'csv') {
        rows = parseCSV(content);
      } else if (fileExtension === 'tsv') {
        rows = parseTSV(content);
      } else {
        toast('Unsupported file format. Please use CSV or TSV.');
        event.target.value = '';
        return;
      }
      
      if (rows.length === 0) {
        toast('No data found in file');
        event.target.value = '';
        return;
      }
      
      pendingImportData = rows;
      showImportOptions();
    } catch (error) {
      toast('Error reading file: ' + error.message);
      console.error(error);
      event.target.value = '';
    }
  };
  
  reader.readAsText(file);
}

function showImportOptions(){
  closeDataManager();
  setTimeout(() => {
    document.getElementById('importOptionsOverlay').classList.add('active');
  }, 50);
}

function proceedWithImport(mode){
  pendingImportMode = mode;
  closeImportOptions();
  setTimeout(() => {
    performImport();
  }, 50);
}

function parseCSV(content){
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

function parseCSVLine(line){
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function parseTSV(content){
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    if (values.length === 0) continue;
    
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || '';
    });
    rows.push(row);
  }
  
  return rows;
}

function performImport(){
  const rows = pendingImportData;
  const mode = pendingImportMode;
  
  if (rows.length === 0) {
    toast('No valid data to import');
    return;
  }
  
  const requiredHeaders = ['item', 'category', 'store', 'location', 'storage', 'quantity'];
  const firstRow = rows[0];
  const missingHeaders = requiredHeaders.filter(header => !(header in firstRow));
  
  if (missingHeaders.length > 0) {
    toast('Missing required columns: ' + missingHeaders.join(', '));
    return;
  }
  
  let summary = {
    matched: 0,
    created: 0,
    ignored: 0
  };

  if (mode === 'replace') {
    const newInventory = rows.map((row, index) => ({
      rowNumber: Date.now() + index,
      item: row.item || '',
      category: CATEGORIES.includes(row.category) ? row.category : '',
      store: row.store || '',
      location: row.location || 'Kitchen',
      storage: row.storage || 'Cupboard',
      quantity: parseInt(row.quantity || 0) || 0,
      expiry: row.expiry || '',
      notes: row.notes || ''
    }));
    
    inventory = newInventory;
    summary.created = newInventory.length;
  } else if (mode === 'merge') {
    const existingItems = new Map(inventory.map(i => [normalizeText(i.item), i]));
    
    rows.forEach(row => {
      const itemName = row.item || '';
      const normalizedName = normalizeText(itemName);
      const uploadedQty = parseInt(row.quantity || 0) || 0;
      
      if (existingItems.has(normalizedName)) {
        const existing = existingItems.get(normalizedName);
        existing.quantity = (existing.quantity || 0) + uploadedQty;
        summary.matched++;
      } else {
        inventory.push({
          rowNumber: Date.now() + Math.random() * 1000,
          item: itemName,
          category: CATEGORIES.includes(row.category) ? row.category : '',
          store: row.store || '',
          location: row.location || 'Kitchen',
          storage: row.storage || 'Cupboard',
          quantity: uploadedQty,
          expiry: row.expiry || '',
          notes: row.notes || ''
        });
        summary.created++;
      }
    });
  }
  
  saveInventoryToStorage();
  reconcileShoppingListWithInventory();
  updateCartBadge();
  render();
  
  showImportSummary(summary);
  
  pendingImportData = null;
  pendingImportMode = null;
  document.getElementById('dataFileInput').value = '';
}

function showImportSummary(summary){
  const overlay = document.getElementById('importSummaryOverlay');
  const content = document.getElementById('importSummaryContent');
  
  content.innerHTML = `
    <div class="import-summary-item">
      <div class="import-summary-number">${summary.matched}</div>
      <div class="import-summary-label">Items Matched &<br>Updated</div>
    </div>
    <div class="import-summary-item">
      <div class="import-summary-number">${summary.created}</div>
      <div class="import-summary-label">New Items<br>Created</div>
    </div>
  `;
  
  overlay.classList.add('active');
  
  toast(`Successfully imported ${summary.matched + summary.created} items`);
}
