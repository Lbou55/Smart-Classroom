const firebaseConfig = {
  apiKey: "AIzaSyAfLQyZ4gl79lovhi5DcRKgxoqfq1SlB8s",
  authDomain: "smart-classroom-e57a3.firebaseapp.com",
  databaseURL: "https://smart-classroom-e57a3-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "smart-classroom-e57a3",
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let allChats = [], currentChatId = null, messagesListener = null;

async function getUserName(uid) {
  const snapshot = await database.ref(`users/${uid}/name`).once('value');
  return snapshot.val() || uid.slice(0,8);
}

async function loadConversations() {
  const convListDiv = document.getElementById('convList');
  convListDiv.innerHTML = '<div class="empty-state" data-i18n="loading">Loading...</div>';
  try {
    const chatsSnapshot = await database.ref('chats').once('value');
    const chats = chatsSnapshot.val() || {};
    allChats = [];
    for (let [chatId, chatData] of Object.entries(chats)) {
      const participants = chatId.split('_');
      const user1 = await getUserName(participants[0]);
      const user2 = await getUserName(participants[1]);
      const lastMsg = chatData.lastMessage ? chatData.lastMessage.text : 'No messages';
      const lastTimestamp = chatData.lastMessage ? chatData.lastMessage.timestamp : 0;
      allChats.push({ chatId, participants, participantNames: [user1, user2], lastMessage: lastMsg, lastTimestamp });
    }
    allChats.sort((a,b) => b.lastTimestamp - a.lastTimestamp);
    renderConversationList();
  } catch(e) { console.error(e); convListDiv.innerHTML = '<div class="empty-state" data-i18n="error">Error loading conversations</div>'; }
}

function renderConversationList() {
  const div = document.getElementById('convList');
  if (allChats.length === 0) { div.innerHTML = '<div class="empty-state" data-i18n="no_conversations">No conversations found</div>'; return; }
  div.innerHTML = allChats.map(chat => `<div class="conv-list-item" data-chat-id="${chat.chatId}"><div class="conv-participants">${chat.participantNames.join(' ↔ ')}</div><div class="conv-last-msg">${escapeHtml(chat.lastMessage)}</div></div>`).join('');
  document.querySelectorAll('.conv-list-item').forEach(el => {
    el.addEventListener('click', () => { loadMessages(el.dataset.chatId); document.querySelectorAll('.conv-list-item').forEach(i => i.classList.remove('active')); el.classList.add('active'); });
  });
}

function loadMessages(chatId) {
  currentChatId = chatId;
  if (messagesListener) messagesListener();
  const messagesRef = database.ref(`chats/${chatId}/messages`);
  messagesListener = messagesRef.orderByChild('timestamp').on('value', async (snapshot) => {
    const messages = snapshot.val() || {};
    const messagesArray = Object.values(messages).sort((a,b) => a.timestamp - b.timestamp);
    await renderMessages(chatId, messagesArray);
  });
}

async function renderMessages(chatId, messages) {
  const panel = document.getElementById('messagesPanel');
  if (messages.length === 0) { panel.innerHTML = '<div class="empty-state" data-i18n="no_messages_yet">No messages in this conversation</div>'; return; }
  const parts = chatId.split('_');
  const user1Name = await getUserName(parts[0]);
  const user2Name = await getUserName(parts[1]);
  let html = `<div class="messages-header"><strong>${user1Name}</strong> ↔ <strong>${user2Name}</strong></div><div class="messages-area" id="messagesArea">`;
  for (let msg of messages) {
    const senderName = msg.senderId === parts[0] ? user1Name : user2Name;
    const time = new Date(msg.timestamp).toLocaleString();
    html += `<div class="message-bubble"><div><strong>${escapeHtml(senderName)}</strong>: ${escapeHtml(msg.text)}</div><div class="message-meta">${time}</div></div>`;
  }
  html += `</div>`;
  panel.innerHTML = html;
  const area = document.getElementById('messagesArea');
  if (area) area.scrollTop = area.scrollHeight;
}

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m] || m)); }

document.addEventListener('DOMContentLoaded', () => { loadConversations(); });