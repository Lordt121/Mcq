// Import the core Firebase functions we need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Your Firebase project's unique config
const firebaseConfig = {
  apiKey: "AIzaSyAFLuyYmbWm2mF6VGcOe7-9g8z6XA33TzE",
  authDomain: "mcq-grading-89a51.firebaseapp.com",
  projectId: "mcq-grading-89a51",
  storageBucket: "mcq-grading-89a51.firebasestorage.app",
  messagingSenderId: "571991617187",
  appId: "1:571991617187:web:bd08c0ee80e6a492085916"
};

// Boot up Firebase
const app = initializeApp(firebaseConfig);

// Export the database and auth so other files can use them
export const db = getFirestore(app);
export const auth = getAuth(app);
