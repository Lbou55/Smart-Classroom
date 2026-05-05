// ================== FIREBASE CONFIG ==================
const firebaseConfig = {
  apiKey: "AIzaSyAfLQyZ4gl79lovhi5DcRKgxoqfq1SlB8s",
  authDomain: "smart-classroom-e57a3.firebaseapp.com",
  databaseURL: "https://smart-classroom-e57a3-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "smart-classroom-e57a3",
  storageBucket: "smart-classroom-e57a3.firebasestorage.app",
  messagingSenderId: "251403298724",
  appId: "1:251403298724:web:7b3472fc5b68dc9de6c331",
  measurementId: "G-WBCFH6SM8H"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }

const database = firebase.database();
const auth = firebase.auth();

let currentUserId = null;

function showMessage(text, type) {
    const msg = document.getElementById('message');
    if (!msg) return;
    msg.textContent = text;
    msg.className = `msg-bar show ${type === 'success' ? 'success' : 'error'}`;
    setTimeout(() => msg.classList.remove('show'), 3000);
}

// Logout
window.logout = async function() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(()=>{});
    window.location.href = '/login';
};

console.log("✅ Admin panel ready (no invite, no user table)");