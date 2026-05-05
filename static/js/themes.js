/**
 * themes.js + Language switcher (no flag emojis, only EN/FR)
 */

const THEMES = [
  { id: 'thermal-dark', label: 'Thermal',  swatch: '#ff6b35', dark: true  },
  { id: 'thermal-light',label: 'Light',    swatch: '#e85d24', dark: false },
  { id: 'arctic',       label: 'Arctic',   swatch: '#4fc3f7', dark: true  },
  { id: 'jungle',       label: 'Jungle',   swatch: '#4caf50', dark: true  },
  { id: 'volcanic',     label: 'Volcanic', swatch: '#ff5733', dark: true  },
  { id: 'sunset',       label: 'Sunset',   swatch: '#c878f0', dark: true  },
  { id: 'sand',         label: 'Sand',     swatch: '#b8860b', dark: false },
  { id: 'obsidian',     label: 'Obsidian', swatch: '#ffffff', dark: true  },
];

let currentTheme = localStorage.getItem('sc-theme') || 'thermal-dark';

function applyTheme(id) {
  currentTheme = id;
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('sc-theme', id);
  document.querySelectorAll('.theme-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === id);
  });
}

function buildThemePicker() {
  const fab = document.createElement('div');
  fab.className = 'theme-fab';
  fab.innerHTML = `
    <div class="theme-panel" id="themePanel">
      <div class="theme-panel-title">🎨 Choose Theme</div>
      <div class="theme-grid">
        ${THEMES.map(t => `
          <div class="theme-chip${t.id === currentTheme ? ' active' : ''}"
               data-theme="${t.id}"
               onclick="applyTheme('${t.id}')">
            <span class="theme-swatch" style="background:${t.swatch}"></span>
            ${t.label}
          </div>
        `).join('')}
      </div>
      <div class="divider" style="margin:10px 0;"></div>
      <div class="theme-panel-title">🌐 Language</div>
      <div class="theme-grid">
        <div class="theme-chip ${localStorage.getItem('sc-lang') === 'en' ? 'active' : ''}" onclick="setLanguage('en')">EN</div>
        <div class="theme-chip ${localStorage.getItem('sc-lang') === 'fr' ? 'active' : ''}" onclick="setLanguage('fr')">FR</div>
      </div>
    </div>
    <button class="theme-fab-btn" onclick="toggleThemePanel()" title="Theme & Language">
      <i class="fas fa-palette"></i>
    </button>
  `;
  document.body.appendChild(fab);

  document.addEventListener('click', e => {
    if (!fab.contains(e.target)) closeThemePanel();
  });
}

function toggleThemePanel() {
  document.getElementById('themePanel')?.classList.toggle('open');
}
function closeThemePanel() {
  document.getElementById('themePanel')?.classList.remove('open');
}

applyTheme(currentTheme);
document.addEventListener('DOMContentLoaded', buildThemePicker);