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

firebase.initializeApp(firebaseConfig);

const messageDiv = document.getElementById('message');
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

function showMessage(text, type) {
    messageDiv.className = `message ${type}-message`;
    messageDiv.textContent = text;
    messageDiv.style.display = 'block';
    setTimeout(() => { messageDiv.style.display = 'none'; }, 3000);
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginBtn.disabled) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showMessage('Please enter both email and password', 'error');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';

    try {
        // Step 1: authenticate via backend (creates Flask session cookie)
        const response = await fetch('/api/login-local', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Login failed');
        }

        // Step 2: CRITICAL — verify cookie was actually set before navigating
        const check = await fetch('/api/check-session', {
            credentials: 'include'
        });
        const session = await check.json();

        if (!session.authenticated) {
            throw new Error('Session could not be created. Try refreshing and logging in again.');
        }

        showMessage('Login successful! Redirecting…', 'success');

        // Step 3: navigate (cookie is now set, server will find the session)
        window.location.href = '/dashboard';

    } catch (error) {
        console.error('Login error:', error);
        showMessage(error.message || 'Login failed.', 'error');
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    }
});

console.log('Login script loaded');