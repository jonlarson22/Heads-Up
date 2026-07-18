import { db } from './firebase-init.js';
import { collection, getDocs, addDoc, setDoc, doc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ==========================================
// 1. GAME DEFINITIONS & STATE
// ==========================================
const FALLBACK_DATA = {
  movies: [
    "The Martian", "Star Wars", "Frozen", "Project Hail Mary", "Toy Story", "Jurassic Park", 
    "Shrek", "Moana", "The Avengers", "Harry Potter", "Spider-Man", "The Lion King", 
    "The Super Mario Movie", "Inception", "Titanic", "Finding Nemo", "Back to the Future", "The Lord of the Rings", 
    "Pirates of the Caribbean", "Indiana Jones", "The Dark Knight", "Iron Man", "Gladiator", "The Terminator", 
    "Ghostbusters", "The Incredibles", "Jaws", "Mulan", "Aladdin", "Up"
  ],
  animals: [
    "Elephant", "Giraffe", "Sloth", "T-Rex", "Penguin", "Kangaroo", "Cheetah", 
    "Dragon", "Lion", "Tiger", "Bear", "Shark", "Dolphin", "Whale", "Monkey", 
    "Gorilla", "Zebra", "Hippo", "Rhino", "Crocodile", "Snake", "Turtle", "Frog", 
    "Owl", "Eagle", "Parrot", "Ostrich", "Camel", "Llama", "Octopus"
  ],
  sports: [
    "Handball", "Basketball", "Soccer", "Baseball", "Tennis", "Volleyball", 
    "Golf", "Swimming", "Track and Field", "Gymnastics", "Ice Hockey", "Table Tennis", 
    "Badminton", "Boxing", "Wrestling", "Martial Arts", "Cycling", "Surfing", 
    "Skateboarding", "Snowboarding", "Skiing", "Water Polo", "Rugby", "Cricket", 
    "Fencing", "Archery", "Bowling", "Rowing", "Weightlifting", "Figure Skating"
  ],
  foods: [
    "Pizza", "Cheeseburger", "Tacos", "Sushi", "Pasta", "Fried Chicken", "Steak", 
    "Salad", "Ice Cream", "Chocolate", "Pancakes", "Waffles", "Bacon", "Eggs", 
    "French Fries", "Hot Dog", "Sandwich", "Soup", "Burrito", "Nachos", "Curry", 
    "Fried Rice", "Noodles", "Donut", "Cake", "Pie", "Cookie", "Popcorn", "Cheese", "Bread"
  ]
};

let gameData = FALLBACK_DATA; 
let shuffledBag = [];
let currentCategory = '';
let currentCategoryName = '';
let currentPlayerName = '';
let isGuestPlayer = false;

const ROUND_DURATION = 60;
let timeLeft = 60;
let currentScore = 0;
let currentSkips = 0; 
let timerInterval = null;
let isWaitingForRotation = false; 

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
const filterPlayer = document.getElementById('filterPlayer');
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
    isGuestPlayer = true;
    const custom = guestNameInput.value.trim();
    return custom.length > 0 ? custom : "Mystery Guest";
  }
  
  isGuestPlayer = false;
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

  if (!categorySelect.value) {
    alert("Please choose a category!");
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
  currentSkips = 0;
  
  // CRITICAL FIX: Guarded against null crash
  if (scoreValue) scoreValue.textContent = '0';
  
  cardContent.innerHTML = `<h2 class="game-word">Place on forehead!</h2>`;
  controlsPreStart.classList.remove('hidden');
  controlsActive.classList.add('hidden');

  setView('stage'); 
}

// SMART GATEKEEPER: Enforces horizontal orientation
function handleCountdownRequest() {
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

// AUTO-WAKEUP: Listens to physical phone gyroscope rotation
window.addEventListener('resize', () => {
  if (!isWaitingForRotation) return;
  if (window.innerWidth > window.innerHeight) {
    isWaitingForRotation = false;
    startPreGameCountdown(); 
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
      
      setTimeout(() => triggerRecap(), 1000);
    }
  }, 1000);
}

function triggerRecap() {
  if (screen.orientation && screen.orientation.unlock) {
    screen.orientation.unlock();
  }

  recapPlayerName.textContent = `${currentPlayerName}'s Round`;
  recapScoreValue.textContent = currentScore;
  recapPassStats.textContent = `${currentScore} Correct • ${currentSkips} Skips`;

  // Handle the Save Name button visibility
  const saveNameBtn = document.getElementById('saveNameBtn');
  if (saveNameBtn) {
    if (isGuestPlayer) {
      saveNameBtn.classList.remove('hidden');
      saveNameBtn.disabled = false;
      saveNameBtn.textContent = "💾 Save My Name for Next Time";
    } else {
      saveNameBtn.classList.add('hidden');
    }
  }

  const todayFormatted = new Date().toISOString().split('T')[0];

  saveScoreRecord({
    player: currentPlayerName,
    score: currentScore,
    skips: currentSkips, 
    category: currentCategory,
    catName: currentCategoryName,
    date: todayFormatted 
  });

  setView('recap');
}

// Replace the old localStorage save with this Firestore push
async function saveScoreRecord(record) {
  try {
    // This will cache locally if offline, and sync to Firebase when online
    await addDoc(collection(db, "scores"), record);
    console.log("Score queued for Firebase!");
  } catch (error) {
    console.error("Error saving score:", error);
  }
}

// ==========================================
// 7. LEADERBOARD ENGINE
// ==========================================
let DB_LEADERBOARD = []; // Replaces LOCAL_LEADERBOARD

async function renderLeaderboard() {
  setView('leaderboard');
  leaderboardList.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-muted);">Fetching live scores...</p>';
  
  try {
    const querySnapshot = await getDocs(collection(db, "scores"));
    DB_LEADERBOARD = [];
    
    querySnapshot.forEach((doc) => {
      DB_LEADERBOARD.push(doc.data());
    });
    
    // Sort highest to lowest
    DB_LEADERBOARD.sort((a, b) => b.score - a.score);

    // NEW: Grab unique player names and build the dropdown
    const uniquePlayers = [...new Set(DB_LEADERBOARD.map(item => item.player))].sort();
    filterPlayer.innerHTML = '<option value="">All Players</option>';
    
    uniquePlayers.forEach(player => {
      if (player) {
        const opt = document.createElement('option');
        opt.value = player;
        opt.textContent = player;
        filterPlayer.appendChild(opt);
      }
    });

    filterLeaderboardList();
    
  } catch (error) {
    console.error("Error loading scores:", error);
    leaderboardList.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--accent);">Offline: Cannot load leaderboard right now.</p>';
  }
}

function filterLeaderboardList() {
  const selectedCat = filterCategory.value;
  const searchName = filterPlayer.value; // Exact match now
  
  leaderboardList.innerHTML = '';

  let filtered = selectedCat === 'ALL' 
    ? DB_LEADERBOARD 
    : DB_LEADERBOARD.filter(item => item.category === selectedCat);

  if (searchName !== '') {
    filtered = filtered.filter(item => item.player === searchName);
  }

  filtered = filtered.slice(0, 50);

  if (filtered.length === 0) {
    leaderboardList.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin-top: 40px;">No scores found!</p>`;
    return;
  }

  filtered.forEach(entry => {
    const skipCount = entry.skips ?? entry.passes ?? 0;
    const card = document.createElement('div');
    card.className = 'score-card';
    
    // NEW: Clean, modern Flexbox layout
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
          <span style="font-size: 1.3rem; font-weight: 800; color: #333; line-height: 1;">${entry.player}</span>
          <span style="font-size: 0.85rem; color: #888; font-weight: 500;">${entry.catName}</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right;">
          <span style="font-size: 1.8rem; font-weight: 900; color: #8A2BE2; line-height: 1;">${entry.score}</span>
          <span style="font-size: 0.75rem; color: #aaa;">${entry.date || 'Recent'} • ${skipCount} Skips</span>
        </div>
      </div>
    `;
    leaderboardList.appendChild(card);
  });
}

// ==========================================
// FIREBASE DATA INITIALIZATION
// ==========================================
async function loadCategoriesFromFirebase() {
  try {
    const querySnapshot = await getDocs(collection(db, "categories"));

    if (!querySnapshot.empty) {
      gameData = {};
      
      // Clear both dropdowns
      categorySelect.innerHTML = '<option value="" disabled selected>Choose Category...</option>';
      
      // Keep the "ALL" option at the top of the leaderboard filter
      filterCategory.innerHTML = '<option value="ALL">Showing: All Categories</option>';

      querySnapshot.forEach((doc) => {
        const catData = doc.data();
        gameData[doc.id] = catData.words;

        // 1. Add to the main Lobby dropdown
        const lobbyOpt = document.createElement('option');
        lobbyOpt.value = doc.id;
        lobbyOpt.textContent = catData.name; 
        categorySelect.appendChild(lobbyOpt);
        
        // 2. Add to the Leaderboard Filter dropdown
        const filterOpt = document.createElement('option');
        filterOpt.value = doc.id;
        filterOpt.textContent = catData.name;
        filterCategory.appendChild(filterOpt);
      });
      
      console.log("Successfully loaded categories into both dropdowns!");
    } else {
      console.log("Firebase is empty. Using fallback data.");
    }
  } catch (error) {
    console.warn("Could not connect to Firebase (Offline?). Using fallback data.", error);
  }
}

async function loadPlayersFromFirebase() {
  try {
    const querySnapshot = await getDocs(collection(db, "players"));

    if (!querySnapshot.empty) {
      // Clear the hardcoded options but keep the placeholder and Guest option
      playerSelect.innerHTML = `
        <option value="" disabled selected>Select player...</option>
        <option value="GUEST">➕ Guest (Type Name)...</option>
      `;

      // Target the Guest option so we can insert names alphabetically above it
      const guestOption = playerSelect.querySelector('option[value="GUEST"]');

      querySnapshot.forEach((doc) => {
        const playerData = doc.data();
        
        // Build the new player option
        const opt = document.createElement('option');
        opt.value = playerData.name;
        opt.textContent = playerData.name; 
        
        // Insert it right above the Guest option
        playerSelect.insertBefore(opt, guestOption);
      });
      
      console.log("Successfully loaded players from Firebase!");
    }
  } catch (error) {
    console.warn("Could not connect to Firebase for players.", error);
  }
}

// ==========================================
// 8. EVENT LISTENERS
// ==========================================
startBtn.addEventListener('click', initStage);
startTimerBtn.addEventListener('click', handleCountdownRequest);

skipBtn.addEventListener('click', () => {
  currentSkips++;
  drawNextCard();
});

correctBtn.addEventListener('click', () => {
  currentScore++;
  if (scoreValue) scoreValue.textContent = currentScore; // CRITICAL GUARD
  drawNextCard();
});

playAgainBtn.addEventListener('click', initStage);
changeModeBtn.addEventListener('click', () => {
  setView('lobby');
  playerSelect.value = ""; // Forces dropdown back to "Select player..."
  guestNameInput.value = ""; // Clears any previously typed guest name
  guestNameInput.classList.add('hidden'); // Hides the guest box
});

viewLeaderboardBtn.addEventListener('click', renderLeaderboard);
backToLobbyBtn.addEventListener('click', () => {
  setView('lobby');
  playerSelect.value = ""; 
  guestNameInput.value = ""; 
  guestNameInput.classList.add('hidden'); 
});

filterCategory.addEventListener('change', filterLeaderboardList);
filterPlayer.addEventListener('change', filterLeaderboardList);

window.addEventListener('DOMContentLoaded', async () => {
  await loadCategoriesFromFirebase();
  await loadPlayersFromFirebase();
});

const saveNameBtn = document.getElementById('saveNameBtn');
if (saveNameBtn) {
  saveNameBtn.addEventListener('click', async () => {
    saveNameBtn.disabled = true;
    saveNameBtn.textContent = "Saving...";
    
    try {
      // Create a unique document ID by removing spaces and making it lowercase
      const safeId = currentPlayerName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      // Save to the "players" collection
      await setDoc(doc(db, "players", safeId), { name: currentPlayerName });
      
      saveNameBtn.textContent = "Saved! 🎉";
      isGuestPlayer = false; // Prevent showing it again next round
      
      // Re-fetch players so they appear in the main dropdown immediately
      loadPlayersFromFirebase();
    } catch (error) {
      console.error("Error saving name:", error);
      saveNameBtn.textContent = "Error saving";
      saveNameBtn.disabled = false;
    }
  });
}
