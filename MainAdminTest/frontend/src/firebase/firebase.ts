import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD00BYF8gdD8WpoD303b9jCPj_ItziQO8Y",
  authDomain: "iconic-fountain-460011-t3.firebaseapp.com",
  projectId: "iconic-fountain-460011-t3",
  storageBucket: "iconic-fountain-460011-t3.firebasestorage.app",
  messagingSenderId: "196002618557",
  appId: "1:196002618557:web:70ee289dd13dfd3c4d2bd4",
  measurementId: "G-8WQZ0XQJP1",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
