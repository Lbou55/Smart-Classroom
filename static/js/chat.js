const firebaseConfig = {
  apiKey: "AIzaSyAfLQyZ4gl79lovhi5DcRKgxoqfq1SlB8s",
  authDomain: "smart-classroom-e57a3.firebaseapp.com",
  databaseURL: "https://smart-classroom-e57a3-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "smart-classroom-e57a3",
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentUserId = null, currentUserEmail = null, currentUserName = null;
let allUsers = [], conversations = {}, currentChatId = null, messagesListener = null;

function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
}

async function loadCurrentUser() {
  try {
    const res = await fetch('/api/check-session', { credentials: 'include' });
    const data = await res.json();
    currentUserId = data.user_id;
    currentUserEmail = data.user_email;
    currentUserName = data.user_name || data.user_email?.split('@')[0] || 'User';
    document.getElementById('sideUserName').textContent = currentUserName;
    document.getElementById('sideAvatar').textContent = getInitials(currentUserName);
    const role = data.role;
    document.getElementById('sideUserRole').textContent = role === 'admin' ? 'Administrator' : 'User';
    if (role === 'admin') document.getElementById('adminNav').style.display = 'block';
    await loadAllUsers();
    await loadConversations();
  } catch(e) { console.error(e); }
}

async function loadAllUsers() {
  try {
    const snapshot = await database.ref('users').once('value');
    const users = snapshot.val() || {};
    allUsers = Object.entries(users).map(([uid, u]) => ({
      uid: uid,
      name: u.name || 'No name',
      email: u.email || 'No email'
    })).filter(u => u.uid !== currentUserId);
  } catch(e) { console.error(e); }
}

function setupUserSearch() {
  const input = document.getElementById('userSearchInput');
  const resultsDiv = document.getElementById('searchResults');
  input.addEventListener('input', function() {
    const query = this.value.toLowerCase().trim();
    if (query.length < 2) { resultsDiv.style.display = 'none'; return; }
    const filtered = allUsers.filter(u => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query));
    if (filtered.length === 0) { resultsDiv.style.display = 'none'; return; }
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = filtered.map(u => `<div class="search-result-item" data-uid="${u.uid}" data-name="${u.name}" data-email="${u.email}"><strong>${u.name}</strong><br><small>${u.email}</small></div>`).join('');
    document.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const otherUid = el.dataset.uid;
        const otherName = el.dataset.name;
        startNewChat(otherUid, otherName);
        input.value = '';
        resultsDiv.style.display = 'none';
      });
    });
  });
}

async function startNewChat(otherUid, otherName) {
  const ids = [currentUserId, otherUid].sort();
  const chatId = ids.join('_');
  currentChatId = chatId;
  
  // Create conversation entry in Firebase if it doesn't exist
  const chatRef = database.ref(`chats/${chatId}`);
  const snapshot = await chatRef.once('value');
  if (!snapshot.exists()) {
    // Initialize empty chat structure
    await chatRef.set({
      createdAt: Date.now(),
      participants: [currentUserId, otherUid],
      lastMessage: { text: 'No messages yet', timestamp: Date.now(), senderId: null }
    });
  }
  
  if (messagesListener) messagesListener();
  loadMessages(chatId);
  document.getElementById('chatHeader').style.display = 'flex';
  document.getElementById('chatInputArea').style.display = 'flex';
  document.getElementById('chatUserName').textContent = otherName;
  document.getElementById('chatAvatar').textContent = getInitials(otherName);
  markConversationRead(chatId);
  
  // Reload conversations to show this new one
  await loadConversations();
  highlightConversation(chatId);
}

function highlightConversation(chatId) {
  document.querySelectorAll('.conv-item').forEach(el => {
    el.classList.toggle('active', el.dataset.chatId === chatId);
  });
}

function markConversationRead(chatId) {
  if (!currentUserId) return;
  database.ref(`users/${currentUserId}/unread/${chatId}`).remove();
  if (conversations[chatId]) {
    conversations[chatId].unreadCount = 0;
    updateConversationList();
  }
}

function loadMessages(chatId) {
  const messagesDiv = document.getElementById('chatMessages');
  messagesDiv.innerHTML = '<div style="text-align:center;padding:20px;">Loading messages...</div>';
  const messagesRef = database.ref(`chats/${chatId}/messages`);
  if (messagesListener) messagesListener();
  messagesListener = messagesRef.orderByChild('timestamp').on('value', (snapshot) => {
    const messages = snapshot.val() || {};
    const messagesArray = Object.values(messages).sort((a,b) => a.timestamp - b.timestamp);
    if (messagesArray.length === 0) {
      messagesDiv.innerHTML = '<div class="empty-chat"><i class="fas fa-comment-dots"></i><p data-i18n="no_messages_yet">No messages yet. Send a message to start the conversation.</p></div>';
      if (typeof translatePage === 'function') translatePage();
      return;
    }
    let html = '';
    for (let msg of messagesArray) {
      const isOutgoing = msg.senderId === currentUserId;
      const time = new Date(msg.timestamp).toLocaleTimeString();
      html += `<div class="message ${isOutgoing ? 'message-outgoing' : 'message-incoming'}">
        <div>${escapeHtml(msg.text)}</div>
        <div class="message-time">${time}</div>
      </div>`;
    }
    messagesDiv.innerHTML = html;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

async function sendMessage() {
  if (!currentChatId) return;
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return;
  
  const message = {
    text: text,
    senderId: currentUserId,
    senderName: currentUserName,
    timestamp: Date.now()
  };
  
  const messagesRef = database.ref(`chats/${currentChatId}/messages`);
  await messagesRef.push(message);
  
  // Update last message
  await database.ref(`chats/${currentChatId}/lastMessage`).set({
    text: text,
    timestamp: Date.now(),
    senderId: currentUserId
  });
  
  // Increment unread count for the other user
  const otherUid = currentChatId.split('_').find(uid => uid !== currentUserId);
  if (otherUid) {
    const unreadRef = database.ref(`users/${otherUid}/unread/${currentChatId}`);
    unreadRef.transaction((current) => (current || 0) + 1);
  }
  
  input.value = '';
  input.focus();
}

async function loadConversations() {
  // Listen to unread counts
  const userRef = database.ref(`users/${currentUserId}/unread`);
  userRef.on('value', async (snapshot) => {
    const unreadData = snapshot.val() || {};
    
    // Get all chats where current user is participant
    const chatsSnapshot = await database.ref('chats').once('value');
    const allChats = chatsSnapshot.val() || {};
    
    const relevantChats = {};
    for (let [chatId, chatData] of Object.entries(allChats)) {
      if (chatId.includes(currentUserId)) {
        const otherUid = chatId.split('_').find(uid => uid !== currentUserId);
        const otherUserSnapshot = await database.ref(`users/${otherUid}`).once('value');
        const otherUser = otherUserSnapshot.val();
        if (otherUser) {
          const lastMsg = chatData.lastMessage ? chatData.lastMessage.text : 'No messages yet';
          const lastTime = chatData.lastMessage ? chatData.lastMessage.timestamp : 0;
          const unreadCount = unreadData[chatId] || 0;
          relevantChats[chatId] = {
            chatId: chatId,
            otherUserId: otherUid,
            otherUserName: otherUser.name || otherUser.email,
            lastMessage: lastMsg,
            lastTimestamp: lastTime,
            unreadCount: unreadCount
          };
        }
      }
    }
    
    // Sort by lastTimestamp descending
    const sorted = Object.values(relevantChats).sort((a,b) => b.lastTimestamp - a.lastTimestamp);
    conversations = sorted.reduce((acc, c) => { acc[c.chatId] = c; return acc; }, {});
    updateConversationList();
  });
}

function updateConversationList() {
  const listDiv = document.getElementById('conversationsList');
  if (Object.keys(conversations).length === 0) {
    listDiv.innerHTML = '<div style="padding:16px;color:var(--text-3);text-align:center;" data-i18n="no_conversations">No conversations yet. Search for a user to start chatting.</div>';
    if (typeof translatePage === 'function') translatePage();
    return;
  }
  
  let html = '';
  for (let chatId in conversations) {
    const conv = conversations[chatId];
    const isActive = (chatId === currentChatId);
    const unreadBadge = conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : '';
    html += `
      <div class="conv-item ${isActive ? 'active' : ''}" data-chat-id="${chatId}" data-other-uid="${conv.otherUserId}" data-other-name="${conv.otherUserName}">
        <div class="conv-avatar">${getInitials(conv.otherUserName)}</div>
        <div class="conv-info">
          <div class="conv-name">${escapeHtml(conv.otherUserName)}</div>
          <div class="conv-last-msg">${escapeHtml(conv.lastMessage)}</div>
        </div>
        ${unreadBadge}
      </div>
    `;
  }
  listDiv.innerHTML = html;
  
  document.querySelectorAll('.conv-item').forEach(el => {
    el.addEventListener('click', () => {
      const chatId = el.dataset.chatId;
      const otherName = el.dataset.otherName;
      currentChatId = chatId;
      if (messagesListener) messagesListener();
      loadMessages(chatId);
      document.getElementById('chatHeader').style.display = 'flex';
      document.getElementById('chatInputArea').style.display = 'flex';
      document.getElementById('chatUserName').textContent = otherName;
      document.getElementById('chatAvatar').textContent = getInitials(otherName);
      markConversationRead(chatId);
      highlightConversation(chatId);
    });
  });
  
  if (typeof translatePage === 'function') translatePage();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentUser();
  setupUserSearch();
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
});