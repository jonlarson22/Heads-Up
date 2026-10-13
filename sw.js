// Bump this version on EVERY static-asset change (CSS/JS/HTML), or phones
// will keep serving stale files from the cache indefinitely.
const CACHE_NAME = 'headsup-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/firebase-init.js',
  '/manifest.json',
  '/sounds/countdown_beep.mp3',
  '/sounds/start_buzzer.mp3',
  '/sounds/final_buzzer.mp3',
  '/logos/logox512.png',
  // Cache the Firebase CDN scripts so the app doesn't freeze offline!
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js'
];

// Install Event - Cache all core assets
self.addEventListener('install', (event) => {
  self.skipWaiting(); // take over as soon as the new worker is ready
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event - Delete old caches so updates actually reach the phone
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch Event - Serve from Cache if Offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached file if found, otherwise fetch from network
      return cachedResponse || fetch(event.request);
    })
  );
});
