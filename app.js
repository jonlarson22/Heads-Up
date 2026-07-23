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

// Tilt Variables
let tiltState = 'neutral';
let isGameActive = false;

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

// Abstracted actions for buttons and tilt to share
function handleSkipAction() {
  currentSkips++;
  drawNextCard();
}

function handleCorrectAction() {
  currentScore++;
  if (scoreValue) scoreValue.textContent = currentScore;
  drawNextCard();
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
  isGameActive = false; // Ensure tilt is disabled until countdown finishes
  
  progressBar.style.width = '100%';
  progressBar.classList.remove('warning');
  currentScore = 0;
  currentSkips = 0;
  
  if (scoreValue) scoreValue.textContent = '0';
  
  cardContent.innerHTML = `<h2 class="game-word">Place on forehead!</h2>`;
  controlsPreStart.classList.remove('hidden');
  controlsActive.classList.add('hidden');

  setView('stage'); 
}

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
  isGameActive = true; // Enable tilt controls
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
      isGameActive = false; // Disable tilt controls
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

async function saveScoreRecord(record) {
  try {
    await addDoc(collection(db, "scores"), record);
    console.log("Score queued for Firebase!");
  } catch (error) {
    console.error("Error saving score:", error);
  }
}

// ==========================================
// 7. LEADERBOARD ENGINE
// ==========================================
let DB_LEADERBOARD = []; 

async function renderLeaderboard() {
  setView('leaderboard');
  leaderboardList.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-muted);">Fetching live scores...</p>';
  
  try {
    const querySnapshot = await getDocs(collection(db, "scores"));
    DB_LEADERBOARD = [];
    
    querySnapshot.forEach((doc) => {
      DB_LEADERBOARD.push(doc.data());
    });
    
    DB_LEADERBOARD.sort((a, b) => b.score - a.score);

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
  const searchName = filterPlayer.value; 
  
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
// 8. FIREBASE DATA INITIALIZATION (UPDATED FOR OFFLINE)
// ==========================================
async function loadCategoriesFromFirebase() {
  try {
    const querySnapshot = await getDocs(collection(db, "categories"));

    if (!querySnapshot.empty) {
      gameData = {};
      categorySelect.innerHTML = '<option value="" disabled selected>Choose Category...</option>';
      filterCategory.innerHTML = '<option value="ALL">Showing: All Categories</option>';

      querySnapshot.forEach((doc) => {
        const catData = doc.data();
        gameData[doc.id] = catData.words;

        const lobbyOpt = document.createElement('option');
        lobbyOpt.value = doc.id;
        lobbyOpt.textContent = catData.name; 
        categorySelect.appendChild(lobbyOpt);
        
        const filterOpt = document.createElement('option');
        filterOpt.value = doc.id;
        filterOpt.textContent = catData.name;
        filterCategory.appendChild(filterOpt);
      });
      
      // 1. SAVE TO LOCALSTORAGE FOR OFFLINE USE
      localStorage.setItem('cached_game_data', JSON.stringify(gameData));
      localStorage.select_options_cache = categorySelect.innerHTML;
      
      console.log("Successfully loaded categories from Firebase and cached locally!");
    } else {
      console.log("Firebase is empty. Checking local cache or fallback.");
      loadFallbackCategories();
    }
  } catch (error) {
    console.warn("Offline! Could not connect to Firebase. Loading from local cache...", error);
    loadFallbackCategories();
  }
}

// Helper function to handle offline fallback gracefully
function loadFallbackCategories() {
  const cachedData = localStorage.getItem('cached_game_data');
  const cachedOptions = localStorage.getItem('select_options_cache');

  if (cachedData && cachedOptions) {
    // We have previously downloaded Firebase data! Use it!
    gameData = JSON.parse(cachedData);
    categorySelect.innerHTML = cachedOptions;
    console.log("Loaded categories from Offline LocalStorage!");
  } else {
    // First time ever opening app and offline? Use the hardcoded FALLBACK_DATA
    gameData = FALLBACK_DATA;
    console.log("No local cache found. Using hardcoded FALLBACK_DATA.");
  }
}

async function loadPlayersFromFirebase() {
  try {
    const querySnapshot = await getDocs(collection(db, "players"));

    if (!querySnapshot.empty) {
      playerSelect.innerHTML = `
        <option value="" disabled selected>Select player...</option>
        <option value="GUEST">➕ Guest (Type Name)...</option>
      `;

      const guestOption = playerSelect.querySelector('option[value="GUEST"]');
      const playerNames = [];

      querySnapshot.forEach((doc) => {
        const playerData = doc.data();
        playerNames.push(playerData.name);
        
        const opt = document.createElement('option');
        opt.value = playerData.name;
        opt.textContent = playerData.name; 
        
        playerSelect.insertBefore(opt, guestOption);
      });
      
      // Save player list to offline cache
      localStorage.setItem('cached_players', JSON.stringify(playerNames));
      console.log("Successfully loaded players and cached locally!");
    }
  } catch (error) {
    console.warn("Offline! Loading players from local cache...", error);
    const cachedPlayers = localStorage.getItem('cached_players');
    if (cachedPlayers) {
      const names = JSON.parse(cachedPlayers);
      const guestOption = playerSelect.querySelector('option[value="GUEST"]');
      names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        playerSelect.insertBefore(opt, guestOption);
      });
    }
  }
}

// ==========================================
// 9. TILT CONTROLS ENGINE (UPDATED)
// ==========================================
function requestTiltPermission(callback) {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', handleTilt);
        } else {
          console.log("Tilt permissions denied. Falling back to buttons.");
        }
        callback();
      })
      .catch((err) => {
        console.error("Error requesting tilt permission:", err);
        callback(); // Launch game anyway
      });
  } else {
    // Non-iOS 13+ devices
    window.addEventListener('deviceorientation', handleTilt);
    callback();
  }
}

function handleTilt(event) {
  if (!isGameActive) return; // Only trigger if the active game clock is running

  const beta = event.beta;
  const gamma = event.gamma;
  if (beta === null || gamma === null) return;

  // 1. Detect if the phone is currently in Landscape or Portrait
  const isLandscape = window.innerWidth > window.innerHeight;

  if (isLandscape) {
    // --- LANDSCAPE MODE (Heads-Up Style) ---
    // In landscape, front-to-back tilt is tracked by GAMMA.
    // Upright on forehead means Math.abs(gamma) is high (roughly 55° to 90°).
    if (Math.abs(gamma) > 65) {
      tiltState = 'neutral';
    } 
    else if (Math.abs(gamma) < 30 && tiltState === 'neutral') {
      // Check which way the phone is rotated (top pointing left vs right)
      const angle = window.orientation ?? (screen.orientation ? screen.orientation.angle : 90);
      const isTopLeft = angle === 90;

      // If top edge is left, dipping toward floor makes gamma negative (-40 to 0).
      // If top edge is right (angle 270 or -90), dipping toward floor makes gamma positive (0 to 40).
      const isTiltingForward = isTopLeft ? (gamma < 0) : (gamma > 0);

      if (isTiltingForward) {
        tiltState = 'forward';
        handleCorrectAction();
      } else {
        tiltState = 'backward';
        handleSkipAction();
      }
    }
  } else {
    // --- PORTRAIT MODE FALLBACK ---
    // In portrait, front-to-back tilt is tracked by BETA.
    if (beta > 60 && beta < 120) {
      tiltState = 'neutral';
    } else if (beta <= 45 && tiltState === 'neutral') {
      tiltState = 'forward';
      handleCorrectAction();
    } else if (beta >= 135 && tiltState === 'neutral') {
      tiltState = 'backward';
      handleSkipAction();
    }
  }
}

// ==========================================
// 10. EVENT LISTENERS
// ==========================================
// Wrap start buttons in the permission request
startBtn.addEventListener('click', () => requestTiltPermission(initStage));
playAgainBtn.addEventListener('click', () => requestTiltPermission(initStage));

startTimerBtn.addEventListener('click', handleCountdownRequest);
if (skipBtn) skipBtn.addEventListener('click', handleSkipAction);
if (correctBtn) correctBtn.addEventListener('click', handleCorrectAction);

changeModeBtn.addEventListener('click', () => {
  setView('lobby');
  playerSelect.value = ""; 
  guestNameInput.value = ""; 
  guestNameInput.classList.add('hidden'); 
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
      const safeId = currentPlayerName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      await setDoc(doc(db, "players", safeId), { name: currentPlayerName });
      
      saveNameBtn.textContent = "Saved! 🎉";
      isGuestPlayer = false; 
      
      loadPlayersFromFirebase();
    } catch (error) {
      console.error("Error saving name:", error);
      saveNameBtn.textContent = "Error saving";
      saveNameBtn.disabled = false;
    }
  });
}
