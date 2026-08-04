import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
const config={apiKey:process.env.VITE_FIREBASE_API_KEY,authDomain:process.env.VITE_FIREBASE_AUTH_DOMAIN,projectId:process.env.VITE_FIREBASE_PROJECT_ID,storageBucket:process.env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:process.env.VITE_FIREBASE_APP_ID};
export const firebaseConfigured=Boolean(config.apiKey&&config.projectId);
export const firebaseApp=firebaseConfigured?(getApps()[0]??initializeApp(config)):null;
export const auth=firebaseApp?getAuth(firebaseApp):null;
export const db=firebaseApp?getFirestore(firebaseApp):null;
