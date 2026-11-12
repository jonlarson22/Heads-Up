import { db } from './firebase-init.js';
import { collection, getDocs, addDoc, setDoc, doc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ==========================================
// 1. GAME DEFINITIONS & STATE
// ==========================================
// Categories come from Firestore (cached to localStorage for offline).
// There is no hardcoded fallback: the game needs at least one online
// visit to cache the real categories.

let gameData = {}; 
let shuffledBag = [];
let currentCategory = '';
let currentCategoryName = '';
let currentPlayerName = '';
let isGuestPlayer = false;

const ROUND_DURATION = 60;
let timeLeft = 60;
let currentScore = 0;
let currentSkips = 0;
let currentWord = null; // word currently on the card (not yet answered)
let roundHistory = [];  // [{ word, result: 'correct' | 'pass' }] in play order
let timerInterval = null;
let isWaitingForRotation = false;
let countdownRunning = false; // guards against double-tap starting two timers

// Tilt state (gravity-vector engine, see section 9)
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
const flashcardEl = document.getElementById('flashcard');
const progressBar = document.getElementById('progressBar');
const controlsPreStart = document.getElementById('controlsPreStart');
const controlsActive = document.getElementById('controlsActive');
const startTimerBtn = document.getElementById('startTimerBtn');
const stageBackBtn = document.getElementById('stageBackBtn');
const skipBtn = document.getElementById('skipBtn');
const correctBtn = document.getElementById('correctBtn');

const recapPlayerName = document.getElementById('recapPlayerName');
const recapScoreValue = document.getElementById('recapScoreValue');
const recapPassStats = document.getElementById('recapPassStats');
const recapWords = document.getElementById('recapWords');
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
  currentWord = nextWord;

  // 1. Calculate dynamic font size based on character count
  let fontSize = "3.8rem"; // Default for short titles (e.g., "Frozen", "Up")
  
  if (nextWord.length > 22) {
    fontSize = "2.2rem"; // Long titles (e.g., "Pirates of the Caribbean")
  } else if (nextWord.length > 13) {
    fontSize = "2.8rem"; // Medium titles (e.g., "Dancing with the Stars")
  }

  // 2. Inject word with dynamic sizing, tight line-height, and zero margins
  cardContent.innerHTML = `
    <h2 class="game-word" style="font-size: ${fontSize}; line-height: 1.15; margin: 0; padding: 0; transition: font-size 0.2s ease;">
      ${nextWord}
    </h2>
  `;
}

// ==========================================
// 5b. ACTION FEEDBACK (haptics / sound / flash)
// The holder can't see the screen, so every score/pass needs feedback on
// another channel. iOS Safari has NO Vibration API, so buzz alone leaves
// iPhone holders with nothing — hence also distinct sounds (WebAudio
// synth, no files to cache) and a card flash the clue-givers can see.
// ==========================================
function buzz(pattern) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* unsupported */ }
}

let audioCtx = null;
function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* audio unavailable */ }
}

function tone(freq, delaySec, durSec, type = 'sine', peak = 0.18) {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime + delaySec;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.05);
  } catch (e) { /* ignore */ }
}

// Bright rising ding = correct; softer falling tones = pass
function playCorrectSound() { tone(880, 0, 0.12); tone(1318.5, 0.09, 0.18); }
function playPassSound() { tone(392, 0, 0.12, 'triangle', 0.15); tone(261.6, 0.09, 0.2, 'triangle', 0.15); }

let flashTimeout = null;
function flashCard(kind) {
  if (!flashcardEl) return;
  flashcardEl.classList.remove('flash-correct', 'flash-pass');
  void flashcardEl.offsetWidth; // restart the flash on rapid repeats
  flashcardEl.classList.add(kind === 'correct' ? 'flash-correct' : 'flash-pass');
  clearTimeout(flashTimeout);
  flashTimeout = setTimeout(() => flashcardEl.classList.remove('flash-correct', 'flash-pass'), 300);
}

// Abstracted actions for buttons and tilt to share
function handleSkipAction() {
  if (currentWord !== null) roundHistory.push({ word: currentWord, result: 'pass' });
  currentSkips++;
  buzz([70, 60, 70]); // double-buzz (Android; iOS ignores)
  playPassSound();
  flashCard('pass');
  drawNextCard();
}

function handleCorrectAction() {
  if (currentWord !== null) roundHistory.push({ word: currentWord, result: 'correct' });
  currentScore++;
  if (scoreValue) scoreValue.textContent = currentScore;
  buzz(90); // one solid buzz (Android; iOS ignores)
  playCorrectSound();
  flashCard('correct');
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

  if (!gameData[currentCategory] || gameData[currentCategory].length === 0) {
    alert("No words loaded for that category yet. Connect to the internet once so the categories can download, then try again.");
    return;
  }

  localStorage.setItem('last_player', playerSelect.value);

  shuffledBag = [];
  clearInterval(timerInterval);
  countdownRunning = false;
  isWaitingForRotation = false;
  isGameActive = false; // Ensure tilt is disabled until countdown finishes

  // Recalibrate the tilt engine for whoever is holding the phone now
  baselineGx = null;
  baselineGz = null;
  tiltArmed = true;
  lastTiltAt = 0;
  neutralSince = null;
  
  progressBar.style.width = '100%';
  progressBar.classList.remove('warning');
  currentScore = 0;
  currentSkips = 0;
  currentWord = null;
  roundHistory = [];
  
  if (scoreValue) scoreValue.textContent = '0';
  
  cardContent.innerHTML = `<h2 class="game-word">Place on forehead!</h2>`;
  controlsPreStart.classList.remove('hidden');
  controlsActive.classList.add('hidden');

  setView('stage'); 
}

function handleCountdownRequest() {
  ensureAudio(); // user gesture: unlock WebAudio for the feedback sounds
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
  if (countdownRunning) return; // ignore double-taps
  countdownRunning = true;

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
      countdownRunning = false;
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
      buzz([150, 80, 150]); // long double-buzz: round over (Android)

      setTimeout(() => triggerRecap(), 1000);
    }
  }, 1000);
}

// Release the landscape lock from Tap to Begin. Called at Time's Up and
// on every exit path (back to lobby, page closing) so the app can never
// strand the phone sideways — the manifest no longer locks orientation
// app-wide; the lock belongs to the round only.
function unlockOrientation() {
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch (e) { /* not locked / unsupported */ }
}

function triggerRecap() {
  unlockOrientation();

  recapPlayerName.textContent = `${currentPlayerName}'s Round`;
  recapScoreValue.textContent = currentScore;
  recapPassStats.textContent = `${currentScore} Correct • ${currentSkips} Skips`;
  renderRecapWords();

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

// End-of-round word list: every answered word, grouped Correct / Passed,
// each group in the order the words were played. The word still on the
// card when time expired was never answered, so it isn't listed.
function renderRecapWords() {
  if (!recapWords) return;
  if (roundHistory.length === 0) {
    recapWords.classList.add('hidden');
    recapWords.innerHTML = '';
    return;
  }
  const group = (title, cls, items) => `
    <div class="words-group">
      <h4 class="${cls}">${title} (${items.length})</h4>
      <ul>${items.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
    </div>`;
  const correct = roundHistory.filter(r => r.result === 'correct').map(r => r.word);
  const passed = roundHistory.filter(r => r.result === 'pass').map(r => r.word);
  recapWords.innerHTML = `<h3>Words this round</h3>`
    + (correct.length ? group('✓ Got it', 'words-correct', correct) : '')
    + (passed.length ? group('↷ Passed', 'words-pass', passed) : '');
  recapWords.classList.remove('hidden');
}

const SCORE_OUTBOX_KEY = 'score_outbox';
const SCORE_OUTBOX_MAX = 200;

function queueScoreOffline(record) {
  try {
    const box = JSON.parse(localStorage.getItem(SCORE_OUTBOX_KEY) || '[]');
    box.push(record);
    localStorage.setItem(SCORE_OUTBOX_KEY, JSON.stringify(box.slice(-SCORE_OUTBOX_MAX)));
  } catch (e) {
    console.warn('Could not queue score offline:', e);
  }
}

async function flushScoreOutbox() {
  let box = [];
  try {
    box = JSON.parse(localStorage.getItem(SCORE_OUTBOX_KEY) || '[]');
  } catch (e) {
    return;
  }
  if (!box.length) return;

  const remaining = [];
  for (const record of box) {
    try {
      await addDoc(collection(db, "scores"), record);
    } catch (e) {
      // Still offline: keep the rest queued, try again next time
      remaining.push(record);
      break;
    }
  }
  try {
    localStorage.setItem(SCORE_OUTBOX_KEY, JSON.stringify(remaining));
  } catch (e) { /* storage full; drop it */ }
  if (box.length !== remaining.length) {
    console.log(`Uploaded ${box.length - remaining.length} queued score(s) to Firebase.`);
  }
}

async function saveScoreRecord(record) {
  try {
    await addDoc(collection(db, "scores"), record);
    console.log("Score saved to Firebase!");
    flushScoreOutbox(); // piggyback: we're online, drain anything queued
  } catch (error) {
    console.warn("Offline: queuing score for later upload.", error);
    queueScoreOffline(record);
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
    
    // Player names are user input: escape before injecting into HTML
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
          <span style="font-size: 1.3rem; font-weight: 800; color: #333; line-height: 1;">${esc(entry.player)}</span>
          <span style="font-size: 0.85rem; color: #888; font-weight: 500;">${esc(entry.catName)}</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right;">
          <span style="font-size: 1.8rem; font-weight: 900; color: #8A2BE2; line-height: 1;">${Number(entry.score) || 0}</span>
          <span style="font-size: 0.75rem; color: #aaa;">${esc(entry.date) || 'Recent'} • ${Number(skipCount) || 0} Skips</span>
        </div>
      </div>
    `;
    leaderboardList.appendChild(card);
  });
}

// Escape user-supplied text before injecting into innerHTML
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
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
      localStorage.setItem('select_options_cache', categorySelect.innerHTML);

      flushScoreOutbox(); // we're online: upload any scores queued while offline
      
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

// Loads categories from the offline cache. There is no hardcoded fallback:
// the game needs at least one online visit to download the real categories.
function loadFallbackCategories() {
  const cachedData = localStorage.getItem('cached_game_data');
  const cachedOptions = localStorage.getItem('select_options_cache');

  if (cachedData && cachedOptions) {
    // We have previously downloaded Firebase data! Use it!
    gameData = JSON.parse(cachedData);
    categorySelect.innerHTML = cachedOptions;
    console.log("Loaded categories from Offline LocalStorage!");
  } else {
    // First run ever and offline: nothing to play with yet.
    gameData = {};
    categorySelect.innerHTML = '<option value="" disabled selected>Choose Category...</option>'
      + '<option value="" disabled>Offline: connect to the internet once to download categories</option>';
    console.log("No local cache found and offline. Categories will load on next online visit.");
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
// 9. TILT CONTROLS ENGINE (gravity vector)
//
// The old gamma-threshold engine could not work: in landscape the phone
// sits at the deviceorientation gimbal-lock singularity (gamma ≈ ±90),
// so a nod-down and a nod-up produce identical gamma readings and the
// direction check was dead logic (pass was unreachable in normal play).
//
// This engine uses devicemotion's gravity vector instead. A nod rotates
// the phone about its top-to-bottom axis, which swings the device-Z
// gravity component (gz) one way or the other. We compare gz against a
// slow-moving baseline (adapts to grip/lean, frozen mid-gesture) and use
// the baseline gx sign so "down" is correct no matter which way the
// player faces or which landscape direction the phone is in.
// ==========================================
const TILT_TRIGGER = 0.45;    // nod depth (fraction of g) that scores
const TILT_REARM = 0.22;      // must return this close to baseline to re-arm
const TILT_LOCKOUT_MS = 900;  // no new score at all for this long after one fires
const NEUTRAL_DWELL_MS = 250; // must STAY near neutral this long to re-arm
const VERTICAL_MIN = 0.45;    // |gx|/g must exceed this (phone roughly upright)

let motionListenerAttached = false;
let baselineGx = null;
let baselineGz = null;
let tiltArmed = true;
let lastTiltAt = 0;
let neutralSince = null; // when the phone entered the neutral band (null = not in band)

function requestMotionPermission(callback) {
  const done = () => {
    ensureAudio(); // we're inside the Start tap: unlock WebAudio too
    attachMotionListener();
    callback();
  };
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS 13+: motion needs an explicit gesture-triggered grant
    DeviceMotionEvent.requestPermission()
      .then(state => {
        if (state !== 'granted') console.log('Motion permission denied. Tilt controls disabled.');
        done();
      })
      .catch(err => {
        console.error('Motion permission error:', err);
        done(); // Launch game anyway
      });
  } else {
    // Android / desktop: no permission API, just listen
    done();
  }
}

function attachMotionListener() {
  if (motionListenerAttached) return; // attach once; isGameActive gates scoring
  motionListenerAttached = true;
  window.addEventListener('devicemotion', handleMotion);
}

function handleMotion(event) {
  if (!isGameActive) return; // Only score while the game clock is running

  const acc = event.accelerationIncludingGravity;
  if (!acc || acc.x === null || acc.z === null) return;

  const gx = acc.x;
  const gz = acc.z;
  const gEst = Math.hypot(gx, acc.y || 0, gz) || 9.81;

  if (baselineGx === null) {
    baselineGx = gx;
    baselineGz = gz;
  }

  // Adapt the baseline only while armed (near neutral). Freezing it
  // mid-gesture means holding a tilt can't re-baseline and then
  // misfire the opposite action on the way back.
  if (tiltArmed) {
    const adapt = 0.02;
    baselineGx += (gx - baselineGx) * adapt;
    baselineGz += (gz - baselineGz) * adapt;
  }

  const dz = (gz - baselineGz) / gEst;
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  if (tiltArmed
      && Math.abs(dz) > TILT_TRIGGER
      && Math.abs(gx) / gEst > VERTICAL_MIN
      && now - lastTiltAt > TILT_LOCKOUT_MS) {
    // Nod-down swings gz opposite to the baseline gx side.
    const isDown = dz * baselineGx < 0;
    tiltArmed = false;
    neutralSince = null;
    lastTiltAt = now;
    if (isDown) handleCorrectAction();
    else handleSkipAction();
  } else if (!tiltArmed) {
    // Re-arm only once the gesture has genuinely settled: the phone must
    // stay inside the neutral band continuously for NEUTRAL_DWELL_MS and
    // the post-score lockout must have expired. The old logic re-armed on
    // a single sample crossing neutral, so the recoil of one nod (or a
    // jitter spike while walking) could fire a second word — players
    // reported rounds skipping 2 words per tilt.
    if (Math.abs(dz) < TILT_REARM) {
      if (neutralSince === null) neutralSince = now;
      if (now - neutralSince >= NEUTRAL_DWELL_MS && now - lastTiltAt >= TILT_LOCKOUT_MS) {
        tiltArmed = true;
        neutralSince = null;
      }
    } else {
      neutralSince = null;
    }
  }
}

// ==========================================
// 10. EVENT LISTENERS
// ==========================================
// Wrap start buttons in the motion permission request
startBtn.addEventListener('click', () => requestMotionPermission(initStage));
playAgainBtn.addEventListener('click', () => requestMotionPermission(initStage));

startTimerBtn.addEventListener('click', handleCountdownRequest);

// Back out of the stage before the countdown starts (wrong player/category picked)
if (stageBackBtn) stageBackBtn.addEventListener('click', () => {
  isWaitingForRotation = false;
  countdownRunning = false;
  unlockOrientation();
  setView('lobby');
});
if (skipBtn) skipBtn.addEventListener('click', handleSkipAction);
if (correctBtn) correctBtn.addEventListener('click', handleCorrectAction);

changeModeBtn.addEventListener('click', () => {
  unlockOrientation();
  setView('lobby');
  playerSelect.value = "";
  guestNameInput.value = "";
  guestNameInput.classList.add('hidden');
});

viewLeaderboardBtn.addEventListener('click', renderLeaderboard);
backToLobbyBtn.addEventListener('click', () => {
  unlockOrientation();
  setView('lobby');
  playerSelect.value = "";
  guestNameInput.value = "";
  guestNameInput.classList.add('hidden');
});

// If the page is closed or backgrounded mid-round, drop the lock too
window.addEventListener('pagehide', unlockOrientation);

filterCategory.addEventListener('change', filterLeaderboardList);
filterPlayer.addEventListener('change', filterLeaderboardList);

window.addEventListener('DOMContentLoaded', async () => {
  await loadCategoriesFromFirebase();
  await loadPlayersFromFirebase();
  restoreLastPlayer();
});

// Pre-select whoever played last, if they're still in the list
function restoreLastPlayer() {
  const last = localStorage.getItem('last_player');
  if (!last) return;
  const match = [...playerSelect.options].some(opt => opt.value === last);
  if (match) {
    playerSelect.value = last;
    if (last === 'GUEST') guestNameInput.classList.remove('hidden');
  }
}

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
