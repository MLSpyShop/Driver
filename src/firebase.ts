import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Add Drive scopes
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.setCustomParameters({
    access_type: 'offline',
    prompt: 'consent'
});
