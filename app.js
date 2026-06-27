// ==========================================
// 1. GAME DEFINITIONS & STATE
// ==========================================
// Hardcoded fallback data - later we will pull this from Firebase/JSON
const FALLBACK_DATA = {
  family_jokes: ["Dad's Sneezing", "The Dog's Breath", "Camping 2025", "Mom's Cooking"],
  movies: ["Star Wars", "Frozen", "The Matrix", "Toy Story", "Jurassic Park"],
  animals: ["Elephant", "Giraffe", "Sloth", "T-Rex", "Penguin"]
};

let gameData = FALLBACK_DATA; 
let shuffledBag = [];
let currentCategory = 'family_jokes';
let currentCategoryName = 'Family Inside Jokes';

const ROUND_DURATION = 60;
let timeLeft = 60;
let currentScore = 0;
let timerInterval = null;

// ==========================================
// 2. DOM ELEMENT DECLARATIONS
// ==========================================
const views = document.querySelectorAll('.view');
const categorySelect = document.getElementById('categorySelect');
const startGameBtn = document.getElementById('startGameBtn');

const stageCategoryTitle = document.getElementById('stageCategoryTitle');
const scoreValue = document.getElementById('scoreValue');
const cardContent = document.getElementById('cardContent');
const progressBar = document.getElementById('progressBar');

const controlsPreStart = document.getElementById('controlsPreStart');
const controlsActive = document.getElementById('controlsActive');
const startTimerBtn = document.getElementById('startTimerBtn');
const skipBtn = document.getElementById('skipBtn');
const correctBtn = document.getElementById('correctBtn');

const recapScoreValue = document.getElementById('recapScoreValue');
const playAgainBtn = document.getElementById('playAgainBtn');
const changeModeBtn = document.getElementById('changeModeBtn');

// ==========================================
// 3. CORE ROUTER ENGINE
// ==========================================
function setView(viewId) {
  views.forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${viewId}`).classList.add('active');
}

// ==========================================
// 4. DATA & SHUFFLE BAG LOGIC
// ==========================================
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function drawNextCard() {
  if (shuffledBag.length === 0) {
    // Reload and reshuffle the bag if we run out of words
    shuffledBag = [...gameData[currentCategory]];
    shuffleArray(shuffledBag);
  }
  const nextWord = shuffledBag.pop();
  
  cardContent.innerHTML = `<h2 class="game-word">${nextWord}</h2>`;
}

// ==========================================
// 5. VIEW HANDLERS & TIMER ENGINE
// ==========================================
function initStage() {
  currentCategory = categorySelect.value;
  currentCategoryName = categorySelect.options[categorySelect.selectedIndex].text;
  
  stageCategoryTitle.textContent = currentCategoryName;
  shuffledBag = []; // Reset bag for the new category
  
  clearInterval(timerInterval);
  progressBar.style.width = '100%';
  progressBar.classList.remove('warning');

  currentScore = 0;
  scoreValue.textContent = '0';
  
  // Show prompt instead of first word
  cardContent.innerHTML = `<h2 class="game-word">Place on forehead to start!</h2>`;

  controlsPreStart.classList.remove('hidden');
  controlsActive.classList.add('hidden');

  setView('stage');
}

function startActiveTimer() {
  controlsPreStart.classList.add('hidden');
  controlsActive.classList.remove('hidden');

  drawNextCard(); // Pull the first actual word
  
  timeLeft = ROUND_DURATION;
  
  // Note: If you want to add device motion (tilt) permissions,
  // this click event is exactly where you must request it for iOS.

  timerInterval = setInterval(() => {
    timeLeft--;
    const pct = (timeLeft / ROUND_DURATION) * 100;
    progressBar.style.width = `${pct}%`;

    if (pct <= 25) progressBar.classList.add('warning');

    if (timeLeft <= 0) {
      triggerRecap();
    }
  }, 1000);
}

function triggerRecap() {
  clearInterval(timerInterval);
  recapScoreValue.textContent = currentScore;
  setView('recap');
}

// ==========================================
// 6. EVENT LISTENERS
// ==========================================
startGameBtn.addEventListener('click', initStage);
startTimerBtn.addEventListener('click', startActiveTimer);

skipBtn.addEventListener('click', drawNextCard);
correctBtn.addEventListener('click', () => {
  currentScore++;
  scoreValue.textContent = currentScore;
  drawNextCard();
});

playAgainBtn.addEventListener('click', initStage);
changeModeBtn.addEventListener('click', () => setView('lobby'));
