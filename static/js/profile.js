const firebaseConfig = {
  apiKey: "AIzaSyAfLQyZ4gl79lovhi5DcRKgxoqfq1SlB8s",
  authDomain: "smart-classroom-e57a3.firebaseapp.com",
  databaseURL: "https://smart-classroom-e57a3-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "smart-classroom-e57a3",
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentUserId = null, currentUserEmail = null, currentUserName = null;

function getInitials(name) { if (!name) return 'U'; return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2); }
function showMessage(text, type) {
  const el = document.getElementById('messageContainer');
  el.textContent = text;
  el.className = `msg-bar show ${type === 'success' ? 'success' : 'error'}`;
  setTimeout(() => el.classList.remove('show'), 4000);
}

async function loadCurrentUser() {
  try {
    const res = await fetch('/api/check-session', { credentials: 'include' });
    const data = await res.json();
    currentUserId = data.user_id; currentUserEmail = data.user_email;
    currentUserName = data.user_name || data.user_email?.split('@')[0] || 'User';
    document.getElementById('sideUserName').textContent = currentUserName;
    document.getElementById('sideAvatar').textContent = getInitials(currentUserName);
    document.getElementById('sideUserRole').textContent = data.role === 'admin' ? 'Administrator' : 'User';
    if (data.role === 'admin') document.getElementById('adminNav').style.display = 'block';
    document.getElementById('profileName').value = currentUserName;
    document.getElementById('profileEmail').value = currentUserEmail;
  } catch(e) { console.error(e); }
}

async function updateProfile() {
  const newName = document.getElementById('profileName').value.trim();
  const newEmail = document.getElementById('profileEmail').value.trim();
  if (!newName || !newEmail) { showMessage('Name and email cannot be empty', 'error'); return; }
  try {
    await database.ref(`users/${currentUserId}`).update({ name: newName, email: newEmail });
    await fetch('/api/update-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name: newName, email: newEmail }) });
    currentUserName = newName; currentUserEmail = newEmail;
    document.getElementById('sideUserName').textContent = currentUserName;
    document.getElementById('sideAvatar').textContent = getInitials(currentUserName);
    showMessage('Profile updated successfully', 'success');
  } catch(e) { showMessage('Error updating profile: ' + e.message, 'error'); }
}

async function updatePassword() {
  const oldPass = document.getElementById('oldPassword').value;
  const newPass = document.getElementById('newPassword').value;
  const confirmPass = document.getElementById('confirmNewPassword').value;
  if (!oldPass || !newPass) { showMessage('Please enter current and new password', 'error'); return; }
  if (newPass !== confirmPass) { showMessage('New passwords do not match', 'error'); return; }
  if (newPass.length < 6) { showMessage('New password must be at least 6 characters', 'error'); return; }
  try {
    const verifyRes = await fetch('/api/login-local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email: currentUserEmail, password: oldPass }) });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) { showMessage('Current password is incorrect', 'error'); return; }
    await database.ref(`users/${currentUserId}`).update({ password: newPass });
    showMessage('Password updated successfully', 'success');
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
  } catch(e) { showMessage('Error updating password: ' + e.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', () => {
  loadCurrentUser();
  document.getElementById('updateProfileBtn').addEventListener('click', updateProfile);
  document.getElementById('updatePasswordBtn').addEventListener('click', updatePassword);
});