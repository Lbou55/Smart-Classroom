// ==================== FIREBASE CONFIGURATION ====================
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
const database = firebase.database();

// ==================== GLOBALS ====================
let tempChart = null;
const tempHistory = [];
const timeLabels = [];

// ==================== HELPERS ====================
function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

// ==================== LOAD USER INFO ====================
async function loadUserInfo() {
  try {
    const res = await fetch('/api/check-session', { credentials: 'include' });
    const data = await res.json();
    document.getElementById('sideUserName').textContent = data.user_name || data.user_email?.split('@')[0] || 'User';
    document.getElementById('sideUserRole').textContent = data.role === 'admin' ? 'Administrator' : 'User';
    document.getElementById('sideAvatar').textContent = getInitials(data.user_name || data.user_email);
    if (data.role === 'admin') document.getElementById('adminNav').style.display = 'block';
  } catch (e) { console.error(e); }
}

// ==================== UI UPDATE WITH CHART (FIXED ROUNDING) ====================
function updateUI(data) {
  document.getElementById('temp').textContent = data.temp?.toFixed(1) ?? '--';
  document.getElementById('hum').textContent = data.hum?.toFixed(1) ?? '--';
  document.getElementById('count').textContent = data.taux_occupation ?? '--';
  document.getElementById('pred').textContent = data.predicted_temp?.toFixed(1) ?? '--';
  document.getElementById('pir').textContent = data.pir === 1 ? '🏃 Motion' : (data.pir === 0 ? '🛑 None' : '--');
  document.getElementById('lastUpdated').textContent = 'Updated: ' + new Date().toLocaleTimeString();
  document.getElementById('connDot').className = 'status-dot online';
  document.getElementById('connText').textContent = 'Live data';

  if (data.ac_status) {
    const isOn = data.ac_status === 'ON';
    document.getElementById('acStatus').textContent = data.ac_status;
    document.getElementById('acStatus').className = `badge ${isOn ? 'badge-green' : 'badge-red'}`;
    document.getElementById('acStatusSide').textContent = data.ac_status;
    document.getElementById('acMode').textContent = data.ac_mode || '--';
    document.getElementById('acBadge').textContent = data.ac_mode || '--';
    document.getElementById('acBadge').className = `badge ${data.ac_mode === 'AUTO' ? 'badge-blue' : 'badge-yellow'}`;
    document.getElementById('acThreshold').textContent = (data.threshold ?? '--') + '°C';
  }

  // Chart update with rounded values and y‑axis formatting
  if (data.temp !== undefined && data.temp !== null) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    // Round the temperature to 1 decimal to avoid floating point artifacts
    const roundedTemp = Math.round(data.temp * 10) / 10;
    tempHistory.push(roundedTemp);
    timeLabels.push(timeStr);
    if (tempHistory.length > 30) { tempHistory.shift(); timeLabels.shift(); }

    if (!tempChart) {
      const ctx = document.getElementById('tempChart').getContext('2d');
      tempChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: timeLabels,
          datasets: [{
            data: tempHistory,
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff6b35',
            backgroundColor: 'rgba(255,107,53,0.08)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: '#ff6b35',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (context) => `${context.raw.toFixed(1)}°C at ${context.label}`
              }
            },
            legend: { display: false }
          },
          scales: {
            x: {
              ticks: { color: '#8899bb', font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 6 },
              grid: { display: false }
            },
            y: {
              ticks: {
                color: '#8899bb',
                font: { size: 10 },
                callback: function(val) {
                  return val.toFixed(1) + '°C';
                }
              },
              grid: { color: 'rgba(255,255,255,0.05)' }
            }
          }
        }
      });
    } else {
      tempChart.data.labels = timeLabels;
      tempChart.data.datasets[0].data = tempHistory;
      tempChart.update('none');
    }
  }
}

// ==================== POLL LATEST ====================
async function pollLatest() {
  try {
    const res = await fetch('/api/latest', { credentials: 'include' });
    const data = await res.json();
    updateUI(data);
  } catch (e) {
    document.getElementById('connDot').className = 'status-dot offline';
    document.getElementById('connText').textContent = 'No data';
  }
}

// ==================== LOGOUT ====================
window.logout = async function () {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  window.location.href = '/login';
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  pollLatest();
  setInterval(pollLatest, 5000);
});