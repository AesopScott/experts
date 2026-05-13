import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMMMdI12N9scrGrV0CrbIE3Huk04g8vfw",
  authDomain: "experts-d7c3d.firebaseapp.com",
  projectId: "experts-d7c3d",
  storageBucket: "experts-d7c3d.firebasestorage.app",
  messagingSenderId: "446471180821",
  appId: "1:446471180821:web:164e49c74e7ac35e65741c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
