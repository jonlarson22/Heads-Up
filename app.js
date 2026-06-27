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

// Audio Objects
const beepSound = new Audio('sounds/countdown_beep.mp3');
const finalBuzzer = new Audio('sounds/final_buzzer.mp3');
const startBuzzer = new Audio('sounds/start_buzzer.mp3');

// Helper to reliably play sound (resetting to start each time)
function playSound(soundObj) {
  soundObj.currentTime = 0;
  soundObj.play().catch(e => console.log('Audio blocked by browser:', e));
}

// ==========================================
// 2. DOM ELEMENT DECLARATIONS
// ==========================================
const views = document.querySelectorAll('.view');

// Lobby DOM
const playerSelect = document.getElementById('playerSelect');
const guestNameInput = document.getElementById('guestNameInput');
const categorySelect = document.getElementById('categorySelect');
const startBtn = document.getElementById('startBtn');
const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');

// Stage DOM
const stageCategoryTitle = document.getElementById('stageCategoryTitle');
const scoreValue = document.getElementById('scoreValue');
const cardContent = document.getElementById('cardContent');
const progressBar = document.getElementById('progressBar');
const controlsPreStart = document.getElementById('controlsPreStart');
const controlsActive = document.getElementById('controlsActive');
const startTimerBtn = document.getElementById('startTimerBtn');
const skipBtn = document.getElementById('skipBtn');
const correctBtn = document.getElementById('correctBtn');

// Recap DOM
const recapPlayerName = document.getElementById('recapPlayerName');
const recapScoreValue = document.getElementById('recapScoreValue');
const recapPassStats = document.getElementById('recapPassStats');
const playAgainBtn = document.getElementById('playAgainBtn');
const changeModeBtn = document.getElementById('changeModeBtn');

// Leaderboard DOM
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
// 6. GAME STAGE LIFECYCLE (WITH AUDIO)
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

  stageCategoryTitle.textContent = currentCategoryName;
  shuffledBag = [];
  clearInterval(timerInterval);
  
  progressBar.style.width = '100%';
  progressBar.classList.remove('warning');
  currentScore = 0;
  currentPasses = 0;
  scoreValue.textContent = '0';
  
  cardContent.innerHTML = `<h2 class="game-word">Place on forehead to start!</h2>`;
  controlsPreStart.classList.remove('hidden');
  controlsActive.classList.add('hidden');

  setView('stage');
}

// NEW: Pre-game flashing countdown
function startPreGameCountdown() {
  controlsPreStart.classList.add('hidden');
  let count = 3;

  // Immediately draw the 3 and beep
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
      
      // Short delay before showing first word and starting timer
      setTimeout(() => {
        startActiveTimer();
      }, 800); 
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

    // Turn bar pink/warning in last 15 seconds (25%)
    if (pct <= 25) progressBar.classList.add('warning');

    // Beep for the final 5 seconds
    if (timeLeft <= 5 && timeLeft > 0) {
      playSound(beepSound);
    }

    if (timeLeft <= 0) {
      playSound(finalBuzzer);
      triggerRecap();
    }
  }, 1000);
}

function triggerRecap() {
  clearInterval(timerInterval);
  
  recapPlayerName.textContent = `${currentPlayerName}'s Round`;
  recapScoreValue.textContent = currentScore;
  recapPassStats.textContent = `${currentScore} Correct • ${currentPasses} Passes`;

  // Push score to local storage mock array
  saveScoreRecord({
    player: currentPlayerName,
    score: currentScore,
    passes: currentPasses,
    category: currentCategory,
    catName: currentCategoryName 
  });

  setView('recap');
}

// ==========================================
// 7. LEADERBOARD ENGINE (LOCALSTORAGE MOCK)
// ==========================================
// Check if we have saved scores, otherwise load some defaults
let LOCAL_LEADERBOARD = JSON.parse(localStorage.getItem('headsUpScores')) || [
  { player: "Mom", score: 14, passes: 1, category: "family_jokes", catName: "Inside Jokes" },
  { player: "Jonathan", score: 12, passes: 3, category: "movies", catName: "Movie Night" }
];

function saveScoreRecord(record) {
  LOCAL_LEADERBOARD.push(record);
  
  // Sort list so highest score is always at the top
  LOCAL_LEADERBOARD.sort((a, b) => b.score - a.score);
  
  // Save back to the browser's local memory
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
      <div class="points">${entry.score}</div>
    `;
    leaderboardList.appendChild(card);
  });
}

// ==========================================
// 8. EVENT LISTENERS
// ==========================================
startBtn.addEventListener('click', initStage);

// CHANGED: This button now triggers the countdown, not the timer directly
startTimerBtn.addEventListener('click', startPreGameCountdown);

skipBtn.addEventListener('click', () => {
  currentPasses++;
  drawNextCard();
});

correctBtn.addEventListener('click', () => {
  currentScore++;
  scoreValue.textContent = currentScore;
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
