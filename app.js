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
let currentCategory = 'movies';
let currentCategoryName = 'Movies';
let currentPlayerName = ''; // NEW: Track who is playing

const ROUND_DURATION = 60;
let timeLeft = 60;
let currentScore = 0;
let currentPasses = 0; // NEW: Track passes for accuracy stats
let timerInterval = null;

// ==========================================
// 2. DOM ELEMENT DECLARATIONS
// ==========================================
const screens = document.querySelectorAll('.screen');

// Lobby Elements
const playerSelect = document.getElementById('playerSelect');
const guestNameInput = document.getElementById('guestNameInput');
const categorySelect = document.getElementById('categorySelect');
const startBtn = document.getElementById('startBtn');
const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');

// Leaderboard Elements
const leaderboardScreen = document.getElementById('leaderboardScreen');
const filterCategory = document.getElementById('filterCategory');
const leaderboardList = document.getElementById('leaderboardList');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');

// Note: Stage and Recap DOM elements will be re-connected once we 
// paste their HTML back into index.html!

// ==========================================
// 3. CORE ROUTER ENGINE
// ==========================================
function showScreen(screenId) {
  screens.forEach(s => s.classList.remove('active-screen'));
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add('active-screen');
  }
}

// ==========================================
// 4. PLAYER & GUEST SELECTION LOGIC
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
    const customName = guestNameInput.value.trim();
    return customName.length > 0 ? customName : "Mystery Guest";
  }
  return selected;
}

// ==========================================
// 5. DATA & SHUFFLE BAG LOGIC
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
  
  // Assuming cardContent element exists on Stage screen
  const cardContent = document.getElementById('cardContent');
  if (cardContent) {
    cardContent.innerHTML = `<h2 class="game-word">${nextWord}</h2>`;
  }
}

// ==========================================
// 6. GAMEFLOW & VIEW HANDLERS
// ==========================================
function handleStartClick() {
  const playerName = getActivePlayerName();
  if (!playerName) {
    alert("Please select who is playing first!");
    return;
  }

  currentPlayerName = playerName;
  currentCategory = categorySelect.value;
  currentCategoryName = categorySelect.options[categorySelect.selectedIndex].text;
  
  // Save last played user to auto-select next time
  localStorage.setItem('last_player', playerSelect.value);

  // Transition to Stage Screen (Placeholder until Stage HTML is added)
  console.log(`Starting game for ${currentPlayerName} in category: ${currentCategoryName}`);
  // initStage(); 
}

function renderLeaderboard() {
  showScreen('leaderboardScreen');
  // TODO: Fetch data from Firebase and render into #leaderboardList
}

// ==========================================
// 7. EVENT LISTENERS & INIT
// ==========================================
startBtn.addEventListener('click', handleStartClick);
viewLeaderboardBtn.addEventListener('click', renderLeaderboard);
backToLobbyBtn.addEventListener('click', () => showScreen('lobbyScreen'));

window.addEventListener('DOMContentLoaded', () => {
  // Auto-select the last person who played
  const lastPlayer = localStorage.getItem('last_player');
  if (lastPlayer) {
    playerSelect.value = lastPlayer;
    if (lastPlayer === 'GUEST') guestNameInput.classList.remove('hidden');
  }
});
