// Firebase configuration
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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// DOM Elements
const messageDiv = document.getElementById('message');
const signupForm = document.getElementById('signupForm');
const signupBtn = document.getElementById('signupBtn');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirmPassword');
const roleSelect = document.getElementById('role');
const passwordStrength = document.getElementById('passwordStrength');
const passwordMatch = document.getElementById('passwordMatch');
const serverStatus = document.getElementById('serverStatus');
const verificationNote = document.getElementById('verificationNote');

// Get the current host for redirects
const redirectUrl = window.location.origin + '/dashboard';

// Helper function to get initials
function getInitials(name) {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

// Show message function
function showMessage(text, type) {
    messageDiv.className = `message ${type}-message`;
    messageDiv.textContent = text;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

// Check server status
async function checkServerStatus() {
    try {
        const response = await fetch('/api/status');
        if (response.ok) {
            serverStatus.innerHTML = `
                <div class="status-dot" style="background: #4caf50;"></div>
                <span>✅ Connected to server</span>
            `;
        } else {
            throw new Error('Server not responding');
        }
    } catch (error) {
        serverStatus.innerHTML = `
            <div class="status-dot" style="background: #f44336;"></div>
            <span>❌ Cannot connect to server</span>
        `;
    }
}

// Check password strength
function checkPasswordStrength(password) {
    if (!password) {
        passwordStrength.innerHTML = '';
        return;
    }
    
    let strength = 0;
    
    if (password.length >= 8) strength += 1;
    if (/\d/.test(password)) strength += 1;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    
    let strengthText = '';
    let strengthClass = '';
    
    if (password.length < 6) {
        strengthText = '❌ Password too short (min. 6 characters)';
        strengthClass = 'strength-weak';
    } else if (strength < 2) {
        strengthText = '⚠️ Weak password';
        strengthClass = 'strength-weak';
    } else if (strength < 3) {
        strengthText = '📊 Medium password';
        strengthClass = 'strength-medium';
    } else {
        strengthText = '✅ Strong password';
        strengthClass = 'strength-strong';
    }
    
    passwordStrength.innerHTML = strengthText;
    passwordStrength.className = `password-strength ${strengthClass}`;
}

// Check password match
function checkPasswordMatch() {
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    
    if (!confirm) {
        passwordMatch.innerHTML = '';
        return;
    }
    
    if (password === confirm) {
        passwordMatch.innerHTML = '✅ Passwords match';
        passwordMatch.className = 'password-match match-success';
    } else {
        passwordMatch.innerHTML = '❌ Passwords do not match';
        passwordMatch.className = 'password-match match-error';
    }
}

// Send verification email
async function sendVerificationEmail(user) {
    try {
        const actionCodeSettings = {
            url: redirectUrl,
            handleCodeInApp: true
        };
        await user.sendEmailVerification(actionCodeSettings);
        console.log('Verification email sent to:', user.email);
        return true;
    } catch (error) {
        console.error('Error sending verification email:', error);
        throw error;
    }
}

// Signup form handler
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    const role = roleSelect.value;

    // Validation
    if (!name || !email || !password || !confirm) {
        showMessage('Please fill in all fields', 'error');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }

    if (password.length < 6) {
        showMessage('Password must be at least 6 characters', 'error');
        return;
    }

    if (password !== confirm) {
        showMessage('Passwords do not match!', 'error');
        return;
    }

    try {
        signupBtn.disabled = true;
        signupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';

        // Create user with email and password
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        console.log('User created:', user.uid);

        // Update profile with name
        await user.updateProfile({ displayName: name });
        console.log('Profile updated with name:', name);

        // Save user data to Firebase Database including password
        await database.ref('users/' + user.uid).set({
            name: name,
            email: email,
            password: password,
            role: role,
            avatar: getInitials(name),
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            lastLogin: firebase.database.ServerValue.TIMESTAMP,
            verified: false
        });
        console.log('User data saved to database');

        // Send verification email
        await sendVerificationEmail(user);

        if (verificationNote) {
            verificationNote.style.display = 'flex';
        }
        showMessage('Account created! Please check your email to verify.', 'success');
        signupBtn.innerHTML = '<i class="fas fa-check"></i> Verification Sent';

        setTimeout(() => {
            window.location.href = '/login';
        }, 3000);

    } catch (error) {
        console.error('Signup error:', error);

        let errorMessage = error.message;

        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered. Please login instead.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak. Please use a stronger password.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = 'Network error. Please check your connection.';
        }

        showMessage('Error: ' + errorMessage, 'error');

        signupBtn.disabled = false;
        signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Sign Up';
    }
});

// Event listeners for password validation
if (passwordInput) {
    passwordInput.addEventListener('input', () => {
        checkPasswordStrength(passwordInput.value);
        checkPasswordMatch();
    });
}

if (confirmInput) {
    confirmInput.addEventListener('input', checkPasswordMatch);
}

// Check server status on load
checkServerStatus();

// Check if user is already logged in
auth.onAuthStateChanged(async (user) => {
    if (user) {
        console.log('Already logged in as:', user.email);
        if (user.emailVerified) {
            try {
                const response = await fetch('/api/check-session', {
                    credentials: 'include'
                });
                const data = await response.json();
                if (data.authenticated) {
                    window.location.href = '/dashboard';
                }
            } catch (error) {
                console.log('Session check failed:', error);
            }
        }
    }
});

console.log('Signup page initialized');