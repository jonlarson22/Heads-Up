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

function startActiveTimer() {
  controlsPreStart.classList.add('hidden');
  controlsActive.classList.remove('hidden');

  drawNextCard();
  timeLeft = ROUND_DURATION;

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
  
  recapPlayerName.textContent = `${currentPlayerName}'s Round`;
  recapScoreValue.textContent = currentScore;
  recapPassStats.textContent = `${currentScore} Correct • ${currentPasses} Passes`;

  // Mock Firebase Push Trigger
  saveScoreRecord({
    player: currentPlayerName,
    score: currentScore,
    passes: currentPasses,
    category: currentCategory,
    date: new Date().toLocaleDateString()
  });

  setView('recap');
}

function saveScoreRecord(record) {
  console.log("Saving record (Offline/Firebase):", record);
  // TODO: Push to Firebase or LocalStorage Queue
}

// ==========================================
// 7. LEADERBOARD ENGINE (MOCK)
// ==========================================
const MOCK_LEADERBOARD = [
  { player: "Mom", score: 14, passes: 1, category: "family_jokes", catName: "Inside Jokes" },
  { player: "Jonathan", score: 12, passes: 3, category: "movies", catName: "Movie Night" },
  { player: "Sarah", score: 9, passes: 0, category: "animals", catName: "Silly Animals" },
  { player: "Dave", score: 8, passes: 5, category: "family_jokes", catName: "Inside Jokes" }
];

function renderLeaderboard() {
  setView('leaderboard');
  filterLeaderboardList();
}

function filterLeaderboardList() {
  const selectedCat = filterCategory.value;
  leaderboardList.innerHTML = '';

  const filtered = selectedCat === 'ALL' 
    ? MOCK_LEADERBOARD 
    : MOCK_LEADERBOARD.filter(item => item.category === selectedCat);

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
startTimerBtn.addEventListener('click', startActiveTimer);

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
