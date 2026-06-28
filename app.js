// ==========================================
// 1. GAME DEFINITIONS & STATE
// ==========================================
const FALLBACK_DATA = {
  family_jokes: ["Dad's Sneezing", "The Dog's Breath", "Camping 2025", "Mom's Cooking", "Burnt Toast", "Roadtrip Songs"],
  movies: ["Star Wars", "Frozen", "The Matrix", "Toy Story", "Jurassic Park", "Shrek", "Moana"],
  animals: ["Elephant", "Giraffe", "Sloth", "T-Rex", "Penguin", "Kangaroo", "Cheetah"]
};

let gameData = FALLBACK_DATA; 
let shuffledBag = [];
let currentCategory = 'family_jokes';
let currentCategoryName = 'Inside Jokes';
let currentPlayerName = ''; 

const ROUND_DURATION = 60;
let timeLeft = 60;
let currentScore = 0;
let currentPasses = 0; 
let timerInterval = null;
let isWaitingForRotation = false; // NEW: Tracks if Gatekeeper is active

// Audio Objects
const beepSound = new Audio('sounds/countdown_beep.mp3');
const finalBuzzer = new Audio('sounds/final_buzzer.mp3');
const startBuzzer = new Audio('sounds/start_buzzer.mp3');

function playSound(soundObj) {
  soundObj.currentTime = 0;
  soundObj.play().catch(e => console.log('Audio blocked by browser:', e));
}

// ==========================================
// 2. DOM ELEMENT DECLARATIONS
// ==========================================
const views = document.querySelectorAll('.view');

const playerSelect = document.getElementById('playerSelect');
const guestNameInput = document.getElementById('guestNameInput');
const categorySelect = document.getElementById('categorySelect');
const startBtn = document.getElementById('startBtn');
const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');

const scoreValue = document.getElementById('scoreValue'); 
const cardContent = document.getElementById('cardContent');
const progressBar = document.getElementById('progressBar');
const controlsPreStart = document.getElementById('controlsPreStart');
const controlsActive = document.getElementById('controlsActive');
const startTimerBtn = document.getElementById('startTimerBtn');
const skipBtn = document.getElementById('skipBtn');
const correctBtn = document.getElementById('correctBtn');

const recapPlayerName = document.getElementById('recapPlayerName');
const recapScoreValue = document.getElementById('recapScoreValue');
const recapPassStats = document.getElementById('recapPassStats');
const playAgainBtn = document.getElementById('playAgainBtn');
const changeModeBtn = document.getElementById('changeModeBtn');

const filterCategory = document.getElementById('filterCategory');
const leaderboardList = document.getElementById('leaderboardList');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');

// ==========================================
// 3. CORE ROUTER ENGINE
// ==========================================
function setView(viewId) {
  views.forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add('active');
}

// ==========================================
// 4. PLAYER SELECTION HELPERS
// ==========================================
playerSelect.addEventListener('change', (e) => {
  if (e.target.value === 'GUEST') {
    guestNameInput.classList.remove('hidden');
    guestNameInput.focus();
  } else {
    guestNameInput.classList.add('hidden');
  }
});

function getActivePlayerName() {
  const selected = playerSelect.value;
  if (!selected) return null;
  if (selected === 'GUEST') {
    const custom = guestNameInput.value.trim();
    return custom.length > 0 ? custom : "Mystery Guest";
  }
  return selected;
}

// ==========================================
// 5. SHUFFLE & CARD ENGINE
// ==========================================
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function drawNextCard() {
  if (shuffledBag.length === 0) {
    shuffledBag = [...gameData[currentCategory]];
    shuffleArray(shuffledBag);
  }
  const nextWord = shuffledBag.pop();
  cardContent.innerHTML = `<h2 class="game-word">${nextWord}</h2>`;
}

// ==========================================
// 6. GAME STAGE LIFECYCLE
// ==========================================
function initStage() {
  const playerName = getActivePlayerName();
  if (!playerName) {
    alert("Please select who is playing first!");
    return;
  }

  currentPlayerName = playerName;
  currentCategory = categorySelect.value;
  currentCategoryName = categorySelect.options[categorySelect.selectedIndex].text;
  localStorage.setItem('last_player', playerSelect.value);

  shuffledBag = [];
  clearInterval(timerInterval);
  isWaitingForRotation = false;
  
  progressBar.style.width = '100%';
  progressBar.classList.remove('warning');
  currentScore = 0;
  currentPasses = 0;
  scoreValue.textContent = '0';
  
  cardContent.innerHTML = `<h2 class="game-word">Place on forehead!</h2>`;
  controlsPreStart.classList.remove('hidden');
  controlsActive.classList.add('hidden');

  setView('stage');
}

// SMART GATEKEEPER: Eliminates double-tapping
function handleCountdownRequest() {
  // 1. Force programmatic lock if browser supports it
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }

  const isVertical = window.innerHeight > window.innerWidth;

  if (isVertical) {
    isWaitingForRotation = true;
    controlsPreStart.classList.add('hidden');
    cardContent.innerHTML = `<h2 class="game-word" style="color: var(--accent); font-size: 2.5rem;">📲 Rotate phone sideways to start!</h2>`;
    return; 
  }

  startPreGameCountdown();
}

// THE AUTO-WAKEUP: Listens to physical phone gyroscope
window.addEventListener('resize', () => {
  if (!isWaitingForRotation) return;

  const isNowHorizontal = window.innerWidth > window.innerHeight;
  if (isNowHorizontal) {
    isWaitingForRotation = false;
    startPreGameCountdown(); // Auto-fires! No second tap needed.
  }
});

function startPreGameCountdown() {
  controlsPreStart.classList.add('hidden');
  let count = 3;

  cardContent.innerHTML = `<h2 class="game-word countdown-text">${count}</h2>`;
  playSound(beepSound);
  count--;

  const countdownInterval = setInterval(() => {
    if (count > 0) {
      cardContent.innerHTML = `<h2 class="game-word countdown-text">${count}</h2>`;
      playSound(beepSound);
      count--;
    } else {
      clearInterval(countdownInterval);
      cardContent.innerHTML = `<h2 class="game-word countdown-text" style="color: #06D6A0;">GO!</h2>`;
      playSound(startBuzzer);
      
      setTimeout(() => startActiveTimer(), 800); 
    }
  }, 1000);
}

function startActiveTimer() {
  controlsActive.classList.remove('hidden');
  drawNextCard();
  timeLeft = ROUND_DURATION;

  timerInterval = setInterval(() => {
    timeLeft--;
    const pct = (timeLeft / ROUND_DURATION) * 100;
    progressBar.style.width = `${pct}%`;

    if (pct <= 25) progressBar.classList.add('warning');

    if (timeLeft <= 5 && timeLeft > 0) {
      playSound(beepSound);
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      progressBar.style.width = '0%'; 
      playSound(finalBuzzer);
      
      setTimeout(() => {
        triggerRecap();
      }, 1000);
    }
  }, 1000);
}

function triggerRecap() {
  // NEW: Release orientation lock so they can hold phone upright to read recap
  if (screen.orientation && screen.orientation.unlock) {
    screen.orientation.unlock();
  }

  recapPlayerName.textContent = `${currentPlayerName}'s Round`;
  recapScoreValue.textContent = currentScore;
  recapPassStats.textContent = `${currentScore} Correct • ${currentPasses} Passes`;

  const todayFormatted = new Date().toISOString().split('T')[0];

  saveScoreRecord({
    player: currentPlayerName,
    score: currentScore,
    passes: currentPasses,
    category: currentCategory,
    catName: currentCategoryName,
    date: todayFormatted 
  });

  setView('recap');
}

// ==========================================
// 7. LEADERBOARD ENGINE
// ==========================================
let LOCAL_LEADERBOARD = JSON.parse(localStorage.getItem('headsUpScores')) || [
  { player: "Mom", score: 14, passes: 1, category: "family_jokes", catName: "Inside Jokes", date: "2026-06-25" },
  { player: "Jonathan", score: 12, passes: 3, category: "movies", catName: "Movie Night", date: "2026-06-26" }
];

function saveScoreRecord(record) {
  LOCAL_LEADERBOARD.push(record);
  LOCAL_LEADERBOARD.sort((a, b) => b.score - a.score);
  localStorage.setItem('headsUpScores', JSON.stringify(LOCAL_LEADERBOARD));
}

function renderLeaderboard() {
  setView('leaderboard');
  filterLeaderboardList();
}

function filterLeaderboardList() {
  const selectedCat = filterCategory.value;
  leaderboardList.innerHTML = '';

  const filtered = selectedCat === 'ALL' 
    ? LOCAL_LEADERBOARD 
    : LOCAL_LEADERBOARD.filter(item => item.category === selectedCat);

  if (filtered.length === 0) {
    leaderboardList.innerHTML = `<p style="color: var(--text-muted); margin-top: 40px;">No scores logged for this category yet!</p>`;
    return;
  }

  filtered.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'score-card';
    card.innerHTML = `
      <div class="player-info">
        <strong>${entry.player}</strong><br>
        <small>${entry.catName} (${entry.passes} Passes)</small>
      </div>
      <div class="points-area">
        <div class="points">${entry.score}</div>
        <span class="date-stamp">${entry.date || 'Recent'}</span>
      </div>
    `;
    leaderboardList.appendChild(card);
  });
}

// ==========================================
// 8. EVENT LISTENERS
// ==========================================
startBtn.addEventListener('click', initStage);
startTimerBtn.addEventListener('click', handleCountdownRequest);

skipBtn.addEventListener('click', () => {
  currentPasses++;
  drawNextCard();
});

correctBtn.addEventListener('click', () => {
  currentScore++;
  scoreValue.textContent = currentScore; // RESTORED BUG FIX
  drawNextCard();
});

playAgainBtn.addEventListener('click', initStage);
changeModeBtn.addEventListener('click', () => setView('lobby'));

viewLeaderboardBtn.addEventListener('click', renderLeaderboard);
backToLobbyBtn.addEventListener('click', () => setView('lobby'));
filterCategory.addEventListener('change', filterLeaderboardList);

window.addEventListener('DOMContentLoaded', () => {
  const lastPlayer = localStorage.getItem('last_player');
  if (lastPlayer) {
    playerSelect.value = lastPlayer;
    if (lastPlayer === 'GUEST') guestNameInput.classList.remove('hidden');
  }
});
