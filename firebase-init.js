import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDj3_AxBIvy8Tg-M2AfzOSSDbSU0XdwWAU",
  authDomain: "headsup-919b2.firebaseapp.com",
  projectId: "headsup-919b2",
  storageBucket: "headsup-919b2.appspot.com",
  messagingSenderId: "94397181934",
  appId: "1:94397181934:web:cd4426f3d92f482c3828ff"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Offline persistence error:", err.code);
});

export { db };
