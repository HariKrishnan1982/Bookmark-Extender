const THEMES = [
  { key: 'obsidian-gold',  name: 'Obsidian Gold',  dot: 'linear-gradient(135deg,#1a1408,#c9a84c)',  accent: '#c9a84c', bg: 'linear-gradient(145deg,#0f0c07,#1c1608,#201c0a)' },
  { key: 'midnight-rose',  name: 'Midnight Rose',  dot: 'linear-gradient(135deg,#0d080f,#e879a0)',  accent: '#e879a0', bg: 'linear-gradient(145deg,#0d080f,#180d1a,#1e1222)' },
  { key: 'ocean-depths',   name: 'Ocean Depths',   dot: 'linear-gradient(135deg,#060d14,#38bdf8)',  accent: '#38bdf8', bg: 'linear-gradient(145deg,#06090e,#0a1420,#0e1d2e)' },
  { key: 'forest-ember',   name: 'Forest Ember',   dot: 'linear-gradient(135deg,#080f09,#86efac)',  accent: '#86efac', bg: 'linear-gradient(145deg,#080f09,#0d160e,#121e13)' },
  { key: 'arctic-white',   name: 'Arctic White',   dot: 'linear-gradient(135deg,#e8eaf4,#6366f1)',  accent: '#6366f1', bg: 'linear-gradient(145deg,#f0f1f8,#f8f9fc,#eef0f8)', text: '#1e1e2e' },
  { key: 'crimson-noir',   name: 'Crimson Noir',   dot: 'linear-gradient(135deg,#0f0608,#f87171)',  accent: '#f87171', bg: 'linear-gradient(145deg,#0f0608,#17090c,#201012)' },
  { key: 'neon-synthwave', name: 'Neon Synthwave',  dot: 'linear-gradient(135deg,#09050f,#c084fc)',  accent: '#c084fc', bg: 'linear-gradient(145deg,#09050f,#12091e,#1a1028)' },
];

const CATEGORY_COLORS = {
  tech:    { cls: 'bke-tag-tech',    icon: '💻', color: '#818cf8' },
  design:  { cls: 'bke-tag-design',  icon: '🎨', color: '#f472b6' },
  videos:  { cls: 'bke-tag-videos',  icon: '🎥', color: '#f87171' },
  reading: { cls: 'bke-tag-reading', icon: '📖', color: '#fbbf24' },
  news:    { cls: 'bke-tag-news',    icon: '📰', color: '#34d399' },
  social:  { cls: 'bke-tag-social',  icon: '💬', color: '#22d3ee' },
  other:   { cls: 'bke-tag-other',   icon: '🔖', color: '#a78bfa' },
};

function detectCategory(url, title) {
  const u = (url || '').toLowerCase();
  const t = (title || '').toLowerCase();
  if (/youtube|vimeo|twitch/.test(u)) return 'videos';
  if (/twitter|x\.com|linkedin|instagram|facebook|reddit/.test(u)) return 'social';
  if (/github|stackoverflow|dev\.to|hackernews/.test(u)) return 'tech';
  if (/dribbble|behance|figma|awwwards/.test(u)) return 'design';
  if (/news|bbc|cnn|reuters/.test(u)) return 'news';
  if (/read|article|blog|substack/.test(u + t)) return 'reading';
  return 'other';
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function getBookmarks() {
  return new Promise(r => {
    chrome.storage.local.get(['bke_bookmarks'], res => r(res.bke_bookmarks || []));
  });
}

async function saveBookmarks(bookmarks) {
  return new Promise(r => chrome.storage.local.set({ bke_bookmarks: bookmarks }, r));
}

let currentPopupTheme = 'obsidian-gold';

function applyPopupTheme(key) {
  const t = THEMES.find(x => x.key === key) || THEMES[0];
  currentPopupTheme = key;

  
  document.documentElement.style.setProperty('--pp-accent', t.accent);
  document.documentElement.style.setProperty('--pp-bg',     t.bg);
  document.documentElement.style.setProperty('--pp-text',   t.text || '#e2d9ff');

  
  const badge = document.getElementById('total-count');
  if (badge) {
    badge.style.background = t.accent + '22';
    badge.style.color      = t.accent;
    badge.style.borderColor = t.accent + '44';
  }

  
  const primaryBtn = document.getElementById('btn-save-page');
  if (primaryBtn) {
    primaryBtn.style.background = `linear-gradient(135deg, ${t.accent}cc, ${t.accent}88)`;
    primaryBtn.style.boxShadow = `0 4px 14px ${t.accent}40`;
  }

  
  document.querySelectorAll('.stat-num').forEach(el => { el.style.color = t.accent; });

  
  document.querySelectorAll('.popup-theme-dot').forEach(dot => {
    const isActive = dot.dataset.theme === key;
    dot.classList.toggle('active', isActive);
    dot.style.setProperty('--dot-color', t.accent + '88');
  });
}

function renderThemeSwatches(activeKey) {
  const wrap = document.getElementById('theme-swatches');
  if (!wrap) return;
  wrap.innerHTML = THEMES.map(t => `
    <div class="popup-theme-dot ${activeKey === t.key ? 'active' : ''}"
         data-theme="${t.key}"
         title="${t.name}"
         style="background:${t.dot};--dot-color:${t.accent}88">
    </div>
  `).join('');

  wrap.querySelectorAll('.popup-theme-dot').forEach(dot => {
    dot.addEventListener('click', async () => {
      const key = dot.dataset.theme;
      await new Promise(r => chrome.storage.local.set({ bke_theme: key }, r));
      applyPopupTheme(key);
    });
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function render() {
  const bookmarks = await getBookmarks();
  const today = new Date().toDateString();

  
  document.getElementById('total-count').textContent = bookmarks.length;
  document.getElementById('stat-total').textContent = bookmarks.length;
  const usedCats = new Set(bookmarks.map(b => b.category)).size;
  document.getElementById('stat-cats').textContent = usedCats;
  const todayCount = bookmarks.filter(b => new Date(b.createdAt).toDateString() === today).length;
  document.getElementById('stat-today').textContent = todayCount;

  
  const recentEl = document.getElementById('recent-list');
  const recent = [...bookmarks].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);

  if (recent.length === 0) {
    recentEl.innerHTML = '<div class="empty-recent">No bookmarks saved yet 📌<br>Hit "Save Page" to start!</div>';
    return;
  }

  recentEl.innerHTML = recent.map(bk => {
    const catInfo = CATEGORY_COLORS[bk.category] || CATEGORY_COLORS.other;
    const domain = (() => { try { return new URL(bk.url).hostname; } catch { return bk.url; } })();
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    return `
      <div class="recent-item" data-url="${escHtml(bk.url)}">
        <div class="recent-favicon">
          <img src="${faviconUrl}" alt="" onerror="this.style.display='none';this.parentNode.textContent='${catInfo.icon}'"/>
        </div>
        <div class="recent-info">
          <div class="recent-title">${escHtml(bk.title)}</div>
          <div class="recent-domain">${escHtml(domain)}</div>
        </div>
        <span class="recent-tag" style="background:${catInfo.color}22;color:${catInfo.color};border:1px solid ${catInfo.color}33">
          ${catInfo.icon}
        </span>
      </div>
    `;
  }).join('');

  recentEl.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', () => {
      chrome.tabs.create({ url: item.dataset.url });
    });
  });
}

document.getElementById('btn-save-page').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const bookmarks = await getBookmarks();
  const exists = bookmarks.find(b => b.url === tab.url);
  if (exists) {
    document.getElementById('btn-save-page').textContent = '✅ Already saved!';
    setTimeout(() => { document.getElementById('btn-save-page').innerHTML = '➕ Save Page'; }, 1500);
    return;
  }

  const cat = detectCategory(tab.url, tab.title);
  bookmarks.unshift({
    id: uid(),
    title: tab.title || tab.url,
    url: tab.url,
    category: cat,
    createdAt: Date.now(),
  });

  await saveBookmarks(bookmarks);
  document.getElementById('btn-save-page').textContent = '✅ Saved!';
  setTimeout(() => { document.getElementById('btn-save-page').innerHTML = '➕ Save Page'; }, 1500);
  await render();
});

document.getElementById('btn-open-panel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'BKE_OPEN_PANEL' }).catch(() => {});
    window.close();
  }
});

chrome.storage.local.get(['bke_theme'], async res => {
  const key = res.bke_theme || 'obsidian-gold';
  renderThemeSwatches(key);
  await render();
  applyPopupTheme(key);
});
