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
const database   = firebase.database();
const historyRef = database.ref('sensors/history');

// ==================== GLOBALS ====================
let tempTrendChart, humHistogram, peopleChart, motionPieChart;
let allHistory = [];
let selectedDate = new Date().toISOString().slice(0, 10); // today

// ==================== HELPERS ====================
function getInitials(name) {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
}

function toSeconds(ts) {
    if (typeof ts !== 'number') return null;
    if (ts > 1e11) return ts / 1000;
    return ts;
}

function isValidTimestamp(ts) {
    const seconds = toSeconds(ts);
    if (!seconds) return false;
    return seconds > 1577836800 && seconds < 1893456000;
}

function groupBy2Hours(history, field) {
    const map = {};
    history.forEach(d => {
        if (d[field] == null || !d.timestamp) return;
        const seconds = toSeconds(d.timestamp);
        if (!seconds) return;
        const hour = new Date(seconds * 1000).getHours();
        const block = Math.floor(hour / 2);
        if (!map[block]) map[block] = [];
        map[block].push(d[field]);
    });
    const blocks = Object.keys(map).map(Number).sort((a, b) => a - b);
    const labels = blocks.map(b => {
        const start = b * 2;
        const end = start + 2;
        return `${String(start).padStart(2, '0')}:00 – ${String(end).padStart(2, '0')}:00`;
    });
    const values = blocks.map(b => +(map[b].reduce((a, c) => a + c, 0) / map[b].length).toFixed(1));
    return { labels, values };
}

// ==================== LOAD USER INFO ====================
async function loadUserInfo() {
    try {
        const res  = await fetch('/api/check-session', { credentials: 'include' });
        const data = await res.json();
        const name = data.user_name || data.user_email?.split('@')[0] || 'User';
        const init = getInitials(data.user_name || data.user_email);
        const role = data.role === 'admin' ? 'Administrator' : 'User';
        const sn = document.getElementById('sideUserName'); if (sn) sn.textContent = name;
        const sr = document.getElementById('sideUserRole'); if (sr) sr.textContent = role;
        const sa = document.getElementById('sideAvatar');   if (sa) sa.textContent = init;
        const an = document.getElementById('adminNav');     if (an) an.style.display = data.role === 'admin' ? 'block' : 'none';
    } catch (e) { console.error(e); }
}

// ==================== DATE PICKER SETUP ====================
function setupDatePicker() {
    const picker = document.getElementById('datePicker');
    const todayBtn = document.getElementById('todayBtn');
    if (!picker) return;
    // Set today's date as default
    picker.value = selectedDate;
    picker.addEventListener('change', () => {
        selectedDate = picker.value;
        renderForDate(selectedDate);
    });
    todayBtn.addEventListener('click', () => {
        const today = new Date().toISOString().slice(0, 10);
        picker.value = today;
        selectedDate = today;
        renderForDate(today);
    });
}

// ==================== CHART INIT ====================
function initCharts() {
    const g = 'rgba(255,255,255,0.05)';
    const t = '#8899bb';

    tempTrendChart = new Chart(document.getElementById('tempTrendChart'), {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.10)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { grid:{color:g}, ticks:{color:t,font:{size:10},maxRotation:30} }, y: { grid:{color:g}, ticks:{color:t,font:{size:10},callback:v=>v+'°C'} } } }
    });

    motionPieChart = new Chart(document.getElementById('motionPieChart'), {
        type: 'doughnut',
        data: { labels: ['Motion', 'No Motion'], datasets: [{ data: [0, 0], backgroundColor: ['#ff6b35', '#2ecc71'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: { legend: { position: 'bottom', labels: { color: t, font: { size: 11 } } } } }
    });

    humHistogram = new Chart(document.getElementById('humHistogram'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: '#4fc3f7', borderRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { grid:{color:g}, ticks:{color:t,font:{size:10}} }, y: { grid:{color:g}, ticks:{color:t,font:{size:10},callback:v=>v+'%'} } } }
    });

    peopleChart = new Chart(document.getElementById('peopleChart'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: '#feca57', borderRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { grid:{color:g}, ticks:{color:t,font:{size:10}} }, y: { grid:{color:g}, ticks:{color:t,font:{size:10},stepSize:1} } } }
    });
}

// ==================== FETCH FROM FIREBASE ====================
async function fetchAndRender() {
    try {
        const snapshot = await historyRef.once('value');
        const raw      = snapshot.val();
        allHistory = raw ? Object.values(raw).filter(d => isValidTimestamp(d.timestamp)) : [];
        renderForDate(selectedDate);
    } catch (e) {
        console.error('Firebase fetch error:', e);
    }
}

// ==================== RENDER FOR SELECTED DATE ====================
function renderForDate(date) {
    const history = allHistory.filter(d => {
        if (!isValidTimestamp(d.timestamp)) return false;
        const seconds = toSeconds(d.timestamp);
        const dStr = new Date(seconds * 1000).toISOString().slice(0, 10);
        return dStr === date;
    });

    const countEl = document.getElementById('readingCount');
    if (countEl) countEl.textContent = `${history.length} reading${history.length !== 1 ? 's' : ''}`;

    if (history.length === 0) {
        // Show empty state
        clearStatsAndCharts();
        document.getElementById('hourlySummary').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-3);" data-i18n="no_data_for_day">No data for this day — try another date or run the simulator!</td></tr>';
        document.getElementById('acUptimeValue').textContent = 'No data';
        return;
    }

    updateOverallStats(history);
    updateCharts(history);
    updateTable(history);
    updateACUptime(history);
}

function clearStatsAndCharts() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('avgTemp', '--'); set('maxTemp', '--'); set('minTemp', '--');
    set('avgHum', '--'); set('totalReadings', '--'); set('motionEvents', '--');
    if (tempTrendChart) { tempTrendChart.data.labels = []; tempTrendChart.data.datasets[0].data = []; tempTrendChart.update(); }
    if (motionPieChart) { motionPieChart.data.datasets[0].data = [0, 0]; motionPieChart.update(); }
    if (humHistogram) { humHistogram.data.labels = []; humHistogram.data.datasets[0].data = []; humHistogram.update(); }
    if (peopleChart) { peopleChart.data.labels = []; peopleChart.data.datasets[0].data = []; peopleChart.update(); }
}

// ==================== UPDATE CHARTS ====================
function updateCharts(history) {
    history.sort((a, b) => (toSeconds(a.timestamp) || 0) - (toSeconds(b.timestamp) || 0));
    const temps = history.map(d => d.temp).filter(t => t != null);
    const times = history.map(d => {
        const sec = toSeconds(d.timestamp);
        return sec ? new Date(sec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    });
    if (tempTrendChart) {
        tempTrendChart.data.labels = times;
        tempTrendChart.data.datasets[0].data = temps;
        tempTrendChart.update();
    }
    if (motionPieChart) {
        motionPieChart.data.datasets[0].data = [
            history.filter(d => d.pir === 1).length,
            history.filter(d => d.pir === 0).length
        ];
        motionPieChart.update();
    }
    const humByBlock = groupBy2Hours(history, 'hum');
    if (humHistogram) {
        humHistogram.data.labels = humByBlock.labels;
        humHistogram.data.datasets[0].data = humByBlock.values;
        humHistogram.update();
    }
    const pplByBlock = groupBy2Hours(history, 'taux_occupation');
    if (peopleChart) {
        peopleChart.data.labels = pplByBlock.labels;
        peopleChart.data.datasets[0].data = pplByBlock.values;
        peopleChart.update();
    }
}

// ==================== OVERALL STATS ====================
function updateOverallStats(history) {
    const temps = history.map(d => d.temp).filter(t => t != null);
    const hums  = history.map(d => d.hum).filter(h => h != null);
    const pirs  = history.map(d => d.pir).filter(p => p != null);
    const set   = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('avgTemp',      temps.length ? (temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1) : '--');
    set('maxTemp',      temps.length ? Math.max(...temps).toFixed(1) : '--');
    set('minTemp',      temps.length ? Math.min(...temps).toFixed(1) : '--');
    set('avgHum',       hums.length  ? (hums.reduce((a,b)=>a+b,0)/hums.length).toFixed(1)  : '--');
    set('totalReadings', history.length);
    set('motionEvents', pirs.filter(p => p === 1).length);
}

function updateACUptime(history) {
    const el = document.getElementById('acUptimeValue');
    if (!el) return;
    if (!history.length) { el.textContent = 'No data'; return; }
    const INTERVAL_SEC  = 5 * 60; // 5 minutes (mock interval)
    const totalSec      = history.length * INTERVAL_SEC;
    const onReadings    = history.filter(d => d.ac_status === 'ON').length;
    const onSec         = onReadings * INTERVAL_SEC;
    const pct           = Math.round((onReadings / history.length) * 100);
    const fmt = secs => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        if (h > 0)  return `${h}h ${m}m`;
        if (m > 0)  return `${m}m`;
        return `${secs}s`;
    };
    if (onReadings === 0) {
        el.textContent = `OFF — tracked ${fmt(totalSec)}`;
        el.style.color = 'var(--text-3)';
    } else {
        el.textContent = `${fmt(onSec)} ON  ·  ${pct}%  ·  Total tracked: ${fmt(totalSec)}`;
        el.style.color = 'var(--green)';
    }
}

function updateTable(history) {
    const tbody = document.getElementById('hourlySummary');
    if (!tbody) return;
    if (!history.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-3);" data-i18n="no_data_for_day">No data for this day — try another date or run the simulator!</td></tr>';
        return;
    }
    const blocks = {};
    history.forEach(d => {
        if (!isValidTimestamp(d.timestamp)) return;
        const seconds = toSeconds(d.timestamp);
        const hour = new Date(seconds * 1000).getHours();
        const block = Math.floor(hour / 2);
        if (!blocks[block]) blocks[block] = [];
        blocks[block].push(d);
    });
    const blockIndices = Object.keys(blocks).map(Number).sort((a,b) => a-b);
    tbody.innerHTML = '';
    blockIndices.forEach(block => {
        const blockData = blocks[block];
        const start = block * 2;
        const end = start + 2;
        const label = `${String(start).padStart(2,'0')}:00 – ${String(end).padStart(2,'0')}:00`;
        const temps = blockData.map(d => d.temp).filter(t => t != null);
        const hums = blockData.map(d => d.hum).filter(h => h != null);
        const people = blockData.map(d => d.taux_occupation).filter(p => p != null);
        const motion = blockData.filter(d => d.pir === 1).length;
        const row = tbody.insertRow();
        row.insertCell(0).innerHTML = `<strong>${label}</strong>`;
        row.insertCell(1).textContent = blockData.length;
        row.insertCell(2).textContent = temps.length ? (temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1) + '°C' : '--';
        row.insertCell(3).textContent = hums.length  ? (hums.reduce((a,b)=>a+b,0)/hums.length).toFixed(1) + '%'   : '--';
        row.insertCell(4).textContent = motion;
        row.insertCell(5).textContent = people.length ? (people.reduce((a,b)=>a+b,0)/people.length).toFixed(0)   : '--';
    });
}

// ==================== LOGOUT & INIT ====================
window.logout = async function () {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch {}
    window.location.href = '/login';
};

(async function () {
    await loadUserInfo();
    initCharts();
    setupDatePicker();
    await fetchAndRender();
    setInterval(fetchAndRender, 15000);
    console.log('✅ Statistics ready (calendar date picker)');
})();