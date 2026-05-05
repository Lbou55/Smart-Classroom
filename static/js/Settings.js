// ==================== FIREBASE (database only, no Auth) ====================
const firebaseConfig = {
  apiKey: "AIzaSyAfLQyZ4gl79lovhi5DcRKgxoqfq1SlB8s",
  authDomain: "smart-classroom-e57a3.firebaseapp.com",
  databaseURL: "https://smart-classroom-e57a3-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "smart-classroom-e57a3",
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ==================== STATE ====================
let currentEditUser = null;
let currentUserId   = null;
let allUsers = [];           // store full user list for filtering

// ==================== UTILS ====================
function getInitials(name) {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

// ==================== LOAD USER INFO FROM FLASK SESSION ====================
async function loadUserInfo() {
    try {
        const res  = await fetch('/api/check-session', { credentials: 'include' });
        const data = await res.json();
        currentUserId = data.user_id;
        document.getElementById('userName').textContent = data.user_name || data.user_email?.split('@')[0] || 'Admin';
        document.getElementById('avatar').textContent   = getInitials(data.user_name || data.user_email);
    } catch (e) {
        console.error('Could not load user info:', e);
    }
}

// ==================== STATS ====================
async function updateStats() {
    try {
        const snapshot = await database.ref('users').once('value');
        const users = snapshot.val() || {};
        let total = 0, admins = 0, regular = 0;
        for (const uid in users) {
            total++;
            users[uid].role === 'admin' ? admins++ : regular++;
        }
        document.getElementById('totalUsers').textContent     = total;
        document.getElementById('totalAdmins').textContent    = admins;
        document.getElementById('totalUsersCount').textContent = regular;
    } catch (err) {
        console.error('Stats error:', err);
    }
}

// ==================== LOAD USERS (store in allUsers) ====================
window.loadAllUsers = async function () {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';

    try {
        const snapshot = await database.ref('users').once('value');
        const users    = snapshot.val() || {};
        allUsers = Object.entries(users).map(([uid, u]) => ({
            uid,
            name:  u.name  || 'No name',
            email: u.email || 'No email',
            role:  u.role  || 'user'
        }));

        // Apply current filter
        filterUsers();
        await updateStats();
    } catch (err) {
        console.error('Load users error:', err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#c33;">Error loading users — check Firebase rules</td></tr>';
        showMessage('Failed to load users: ' + err.message, 'error');
    }
};

// ==================== FILTER USERS ====================
window.filterUsers = function() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const filtered = allUsers.filter(user => 
        user.name.toLowerCase().includes(searchTerm) || 
        user.email.toLowerCase().includes(searchTerm)
    );
    renderUserTable(filtered);
};

function renderUserTable(users) {
    const tbody = document.getElementById('userTableBody');
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-3);">No users match your search</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    users.forEach(user => {
        const isMe = user.uid === currentUserId;
        const row  = tbody.insertRow();

        // Name + YOU badge
        const nameCell = row.insertCell(0);
        nameCell.textContent = user.name;
        if (isMe) {
            const badge = document.createElement('span');
            badge.className   = 'you-badge';
            badge.textContent = 'YOU';
            nameCell.appendChild(badge);
        }

        // Email
        row.insertCell(1).textContent = user.email;

        // Role
        const roleCell  = row.insertCell(2);
        const roleBadge = document.createElement('span');
        roleBadge.className   = `badge ${user.role === 'admin' ? 'badge-accent' : 'badge-green'}`;
        roleBadge.textContent = user.role === 'admin' ? 'Admin' : 'User';
        roleCell.appendChild(roleBadge);

        // Actions
        const actionsCell = row.insertCell(3);
        const editBtn = document.createElement('button');
        editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
        editBtn.className = 'action-btn action-btn-edit';
        if (isMe) {
            editBtn.disabled = true;
            editBtn.style.opacity = '0.5';
            editBtn.style.cursor  = 'not-allowed';
            editBtn.title = 'Cannot edit your own account';
        } else {
            editBtn.onclick = () => openEditModal(user);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
        deleteBtn.className = 'action-btn action-btn-delete';
        if (isMe) {
            deleteBtn.disabled = true;
            deleteBtn.style.opacity = '0.5';
            deleteBtn.style.cursor  = 'not-allowed';
            deleteBtn.title = 'Cannot delete your own account';
        } else {
            deleteBtn.onclick = () => deleteUser(user.uid, user.name);
        }

        actionsCell.appendChild(editBtn);
        actionsCell.appendChild(deleteBtn);
    });
}

// ==================== EDIT MODAL ====================
function openEditModal(user) {
    if (user.uid === currentUserId) { showMessage('Cannot edit your own account', 'error'); return; }
    currentEditUser = { ...user };
    document.getElementById('editName').value     = user.name;
    document.getElementById('editEmail').value    = user.email;
    document.getElementById('editRole').value     = user.role;
    document.getElementById('editPassword').value = '';
    document.getElementById('editModal').style.display = 'block';
    document.getElementById('editModal').scrollIntoView({ behavior: 'smooth' });
}

window.closeEditModal = function () {
    document.getElementById('editModal').style.display = 'none';
    currentEditUser = null;
    document.getElementById('editPassword').value = '';
};

window.saveUserChanges = async function () {
    if (!currentEditUser?.uid) { showMessage('No user selected', 'error'); return; }
    if (currentEditUser.uid === currentUserId) { showMessage('Cannot modify your own account', 'error'); return; }

    const newName     = document.getElementById('editName').value.trim();
    const newEmail    = document.getElementById('editEmail').value.trim();
    const newRole     = document.getElementById('editRole').value;
    const newPassword = document.getElementById('editPassword').value;

    if (!newName)  { showMessage('Name cannot be empty', 'error');  return; }
    if (!newEmail) { showMessage('Email cannot be empty', 'error'); return; }
    if (newPassword && newPassword.length < 6) {
        showMessage('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        const updates = { name: newName, email: newEmail, role: newRole };
        if (newPassword) updates.password = newPassword;

        await database.ref(`users/${currentEditUser.uid}`).update(updates);

        showMessage(`User "${newEmail}" updated successfully!`, 'success');
        closeEditModal();
        await loadAllUsers();
    } catch (err) {
        showMessage('Update failed: ' + err.message, 'error');
    }
};

// ==================== DELETE ====================
window.deleteUser = async function (uid, userName) {
    if (uid === currentUserId) { showMessage('Cannot delete your own account', 'error'); return; }
    if (!confirm(`⚠️ Delete "${userName}"? This cannot be undone.`)) return;

    try {
        await database.ref(`users/${uid}`).remove();
        showMessage(`User "${userName}" deleted.`, 'success');
        await loadAllUsers();
    } catch (err) {
        showMessage('Delete failed: ' + err.message, 'error');
    }
};

window.deleteCurrentUser = async function () {
    if (currentEditUser) {
        await deleteUser(currentEditUser.uid, currentEditUser.name);
        closeEditModal();
    }
};

// ==================== LOGOUT ====================
window.logout = async function () {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch {}
    window.location.href = '/login';
};

// ==================== INIT ====================
(async function() {
    await loadUserInfo();
    await loadAllUsers();
})();