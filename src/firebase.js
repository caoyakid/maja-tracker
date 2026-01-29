// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDZsjsxJhe4JFLHGwiArfH6ItV-k-AzjHg",
  authDomain: "maja-tracker.firebaseapp.com",
  projectId: "maja-tracker",
  storageBucket: "maja-tracker.firebasestorage.app",
  messagingSenderId: "648492219937",
  appId: "1:648492219937:web:aa9710b7d982ace148ad60",
  measurementId: "G-X0GECDXYS8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);