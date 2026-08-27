(function () {
  'use strict';
  if (document.getElementById('bke-trigger-bar')) return;

  
  const BAR_H = 38; 

  let isOpen      = false;
  let currentCat  = 'all';
  let searchQuery = '';
  let bookmarks   = [];
  let categories  = [];
  let ctxMenu     = null;
  let currentTheme = 'obsidian-gold';
  let themeOpen    = false;

  
  const DOM = {};

  
  let isDragging  = false;
  let dragStartX  = 0;
  let dragStartY  = 0;
  let panelStartX = 0;
  let panelStartY = 0;
  let hasDragged  = false;

  const CAT_META = {
    tech:    { cls: 'bke-tag-tech',    icon: '◈',  label: 'Tech'    },
    design:  { cls: 'bke-tag-design',  icon: '◉',  label: 'Design'  },
    videos:  { cls: 'bke-tag-videos',  icon: '▶',  label: 'Videos'  },
    reading: { cls: 'bke-tag-reading', icon: '❧',  label: 'Reading' },
    news:    { cls: 'bke-tag-news',    icon: '⊞',  label: 'News'    },
    social:  { cls: 'bke-tag-social',  icon: '◎',  label: 'Social'  },
    other:   { cls: 'bke-tag-other',   icon: '○',  label: 'Other'   },
  };

  
  const THEMES = [
    { key: 'obsidian-gold',  name: 'Obsidian',   dot: 'linear-gradient(135deg,#0d0d0f,#c9a84c)' },
    { key: 'midnight-rose',  name: 'Rose',       dot: 'linear-gradient(135deg,#0d080f,#e879a0)' },
    { key: 'ocean-depths',   name: 'Ocean',      dot: 'linear-gradient(135deg,#060d14,#38bdf8)' },
    { key: 'forest-ember',   name: 'Forest',     dot: 'linear-gradient(135deg,#080f09,#86efac)' },
    { key: 'arctic-white',   name: 'Arctic',     dot: 'linear-gradient(135deg,#f8f9fc,#6366f1)' },
    { key: 'crimson-noir',   name: 'Crimson',    dot: 'linear-gradient(135deg,#0f0608,#f87171)' },
    { key: 'neon-synthwave', name: 'Synthwave',  dot: 'linear-gradient(135deg,#09050f,#c084fc)' },
  ];

  
  function applyBodyPadding() {
    const curr = parseInt(getComputedStyle(document.body).paddingBottom, 10) || 0;
    if (curr < BAR_H) document.body.style.paddingBottom = BAR_H + 'px';
  }

  
  function detectCategory(url, title) {
    const u = (url   || '').toLowerCase();
    const t = (title || '').toLowerCase();
    if (/youtube|vimeo|twitch|dailymotion/.test(u))                    return 'videos';
    if (/twitter|x\.com|linkedin|instagram|facebook|reddit/.test(u))  return 'social';
    if (/github|stackoverflow|dev\.to|hackernews|ycombinator/.test(u)) return 'tech';
    if (/dribbble|behance|figma|awwwards|css-tricks|smashing/.test(u)) return 'design';
    if (/news|bbc|cnn|reuters|guardian|nytimes|thehindu/.test(u))      return 'news';
    if (/read|article|blog|substack|notion|docs/.test(u + t))          return 'reading';
    return 'other';
  }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function domain(url) {
    try { return new URL(url).hostname; } catch { return url; }
  }

  
  function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  
  function loadBookmarks() {
    return new Promise(resolve => {
      chrome.storage.local.get(['bke_bookmarks', 'bke_categories', 'bke_theme'], res => {
        bookmarks  = res.bke_bookmarks  || [];
        categories = res.bke_categories || ['tech','design','videos','reading','news','social','other'];
        if (res.bke_theme) { currentTheme = res.bke_theme; applyTheme(res.bke_theme); }
        resolve();
      });
    });
  }

  function loadTheme() {
    return new Promise(resolve => {
      chrome.storage.local.get(['bke_theme'], res => {
        const t = res.bke_theme || 'obsidian-gold';
        currentTheme = t;
        applyTheme(t);
        resolve();
      });
    });
  }

  function applyTheme(key) {
    currentTheme = key;
    if (key === 'obsidian-gold') {
      document.documentElement.removeAttribute('data-bke-theme');
    } else {
      document.documentElement.setAttribute('data-bke-theme', key);
    }
    
    const btn = document.getElementById('bke-theme-btn');
    if (btn) btn.classList.toggle('theme-active', key !== 'obsidian-gold');
    
    document.querySelectorAll('.bke-theme-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.theme === key);
    });
  }

  async function saveTheme(key) {
    applyTheme(key);
    await new Promise(r => chrome.storage.local.set({ bke_theme: key }, r));
    showToast('Theme: ' + (THEMES.find(t => t.key === key)?.name || key));
  }

  function saveBookmarks() {
    return new Promise(resolve => {
      chrome.storage.local.set({ bke_bookmarks: bookmarks, bke_categories: categories }, resolve);
    });
  }

  
  function buildUI() {

    
    const bar = el('div', { id: 'bke-trigger-bar', title: 'Alt+B to toggle' }, `
      <span class="bke-bar-dot"></span>
      <span>Bookmarks</span>
      <span class="bke-bar-shortcut">Alt+B</span>
      <span class="bke-bar-chevron">▲</span>
    `);
    bar.addEventListener('click', togglePanel);
    document.body.appendChild(bar);

    
    const overlay = el('div', { id: 'bke-overlay' });
    overlay.addEventListener('click', closePanel);
    document.body.appendChild(overlay);

    
    const panel = el('div', { id: 'bke-panel' }, `
      <div class="bke-drag-handle" id="bke-drag-handle"></div>

      <div class="bke-header">
        <div class="bke-header-left">
          <div class="bke-header-icon">📚</div>
          <div>
            <div class="bke-header-title">Bookmark Extender</div>
            <div class="bke-header-sub">Your personal reading library</div>
          </div>
        </div>
        <div class="bke-header-right">
          <div class="bke-icon-btn" id="bke-theme-btn"   title="Change theme">🎨</div>
          <div class="bke-icon-btn" id="bke-add-btn"    title="Add current page (Alt+S)">＋</div>
          <div class="bke-icon-btn" id="bke-sort-btn"   title="Sort">⇅</div>
          <div class="bke-icon-btn" id="bke-close-btn"  title="Close (Alt+B)">✕</div>
        </div>
      </div>

      <div class="bke-divider"></div>

      <div class="bke-search-wrap">
        <span class="bke-search-icon">⌕</span>
        <input
          type="text"
          class="bke-search"
          id="bke-search"
          placeholder="Search bookmarks…"
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="bke-cats" id="bke-cats"></div>

      <div class="bke-grid" id="bke-grid"></div>
    `);
    document.body.appendChild(panel);

    
    const fab = el('button', { id: 'bke-fab', title: 'Add current page (Alt+S)' }, '＋');
    fab.addEventListener('click', () => openModal(null, true));
    document.body.appendChild(fab);

    
    document.body.appendChild(el('div', { id: 'bke-toast' }));

    
    DOM.bar     = bar;
    DOM.panel   = panel;
    DOM.overlay = overlay;
    DOM.fab     = fab;
    DOM.grid    = document.getElementById('bke-grid');
    DOM.cats    = document.getElementById('bke-cats');
    DOM.search  = document.getElementById('bke-search');
    DOM.toast   = document.getElementById('bke-toast');

    
    document.getElementById('bke-close-btn').addEventListener('click', closePanel);
    document.getElementById('bke-add-btn').addEventListener('click', () => openModal(null, true));
    document.getElementById('bke-sort-btn').addEventListener('click', handleSort);
    document.getElementById('bke-theme-btn').addEventListener('click', toggleThemePanel);
    DOM.search.addEventListener('input', debounce(e => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderGrid();
    }, 120));

    
    initDrag();

    
    document.addEventListener('click', dismissCtx);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closePanel(); dismissCtx(); }
    });
  }

  
  function el(tag, attrs, html) {
    const node = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => node[k] = v);
    if (html) node.innerHTML = html;
    return node;
  }

  
  function initDrag() {
    const panel  = DOM.panel;
    const handle = document.getElementById('bke-drag-handle');

    handle.addEventListener('mousedown', onDragStart);

    function onDragStart(e) {
      if (!isOpen) return;
      e.preventDefault();
      isDragging = true;
      hasDragged = false;

      const rect = panel.getBoundingClientRect();
      dragStartX  = e.clientX;
      dragStartY  = e.clientY;
      panelStartX = rect.left;
      panelStartY = rect.top;

      panel.classList.add('dragging');

      
      panel.style.left      = rect.left + 'px';
      panel.style.bottom    = '';
      panel.style.top       = rect.top  + 'px';
      panel.style.transform = 'none';
      panel.classList.add('dragged');

      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup',   onDragEnd);
    }

    function onDragMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged = true;

      const newLeft = Math.max(0, Math.min(window.innerWidth  - panel.offsetWidth,  panelStartX + dx));
      const newTop  = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, panelStartY + dy));

      panel.style.left = newLeft + 'px';
      panel.style.top  = newTop  + 'px';
    }

    function onDragEnd() {
      isDragging = false;
      panel.classList.remove('dragging');
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup',   onDragEnd);
    }
  }

  
  function togglePanel() { isOpen ? closePanel() : openPanel(); }

  async function openPanel() {
    isOpen = true;
    await loadBookmarks();
    renderCategories();
    renderGrid();

    
    DOM.panel.classList.remove('dragged', 'dragging');
    DOM.panel.style.left = DOM.panel.style.top = DOM.panel.style.transform = '';

    DOM.bar.classList.add('open');
    DOM.panel.classList.add('open');
    DOM.overlay.classList.add('visible');
    DOM.fab.classList.add('visible');

    
    const btn = document.getElementById('bke-theme-btn');
    if (btn) btn.classList.toggle('theme-active', currentTheme !== 'obsidian-gold');

    setTimeout(() => DOM.search?.focus(), 440);
  }

  function closePanel() {
    isOpen = false;
    closeThemePanel();

    DOM.bar?.classList.remove('open');
    DOM.overlay?.classList.remove('visible');
    DOM.fab?.classList.remove('visible');

    
    if (DOM.panel?.classList.contains('dragged')) {
      DOM.panel.style.left = DOM.panel.style.top = DOM.panel.style.transform = '';
      DOM.panel.classList.remove('dragged');
    }
    DOM.panel?.classList.remove('open');
    dismissCtx();
  }

  
  function toggleThemePanel() {
    themeOpen ? closeThemePanel() : openThemePanel();
  }

  function openThemePanel() {
    themeOpen = true;
    const btn = document.getElementById('bke-theme-btn');
    if (btn) btn.classList.add('theme-active');

    
    closeThemePanel(true);

    const panel = el('div', { className: 'bke-theme-panel', id: 'bke-theme-panel' });
    panel.innerHTML = `
      <div class="bke-theme-panel-title">🎨 Choose Theme</div>
      <div class="bke-theme-swatches">
        ${THEMES.map(t => `
          <div class="bke-theme-swatch ${currentTheme === t.key ? 'active' : ''}" data-theme="${t.key}">
            <div class="bke-theme-dot" style="background:${t.dot}"></div>
            <span class="bke-theme-name">${t.name}</span>
          </div>
        `).join('')}
      </div>
    `;

    
    const grid = document.getElementById('bke-grid');
    DOM.panel.insertBefore(panel, grid);

    panel.querySelectorAll('.bke-theme-swatch').forEach(s => {
      s.addEventListener('click', () => saveTheme(s.dataset.theme));
    });
  }

  function closeThemePanel(silent = false) {
    const existing = document.getElementById('bke-theme-panel');
    if (existing) existing.remove();
    if (!silent) {
      themeOpen = false;
      const btn = document.getElementById('bke-theme-btn');
      if (btn) btn.classList.toggle('theme-active', currentTheme !== 'obsidian-gold');
    }
  }

  
  function renderCategories() {
    const wrap = DOM.cats;
    if (!wrap) return;

    
    const counts = {};
    for (const bk of bookmarks) {
      counts[bk.category] = (counts[bk.category] || 0) + 1;
    }

    const all = [
      { id: 'all', icon: '✦', label: 'All', count: bookmarks.length },
      ...categories.map(c => ({
        id: c, icon: CAT_META[c]?.icon || '○',
        label: CAT_META[c]?.label || c,
        count: counts[c] || 0,
      })),
    ];

    wrap.innerHTML = all.map(c => `
      <div class="bke-cat ${currentCat === c.id ? 'active' : ''}" data-cat="${c.id}">
        <span>${c.icon}</span>
        <span>${c.label}</span>
        <span class="bke-cat-count">${c.count}</span>
      </div>
    `).join('');

    wrap.querySelectorAll('.bke-cat').forEach(node => {
      node.addEventListener('click', () => {
        currentCat = node.dataset.cat;
        renderCategories();
        renderGrid();
      });
    });
  }

  
  function renderGrid() {
    const grid = DOM.grid;
    if (!grid) return;

    
    let list = bookmarks;
    if (currentCat !== 'all') list = list.filter(b => b.category === currentCat);
    if (searchQuery) {
      const q = searchQuery; 
      list = list.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        (b.category || '').toLowerCase().includes(q)
      );
    }

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="bke-empty">
          <div class="bke-empty-icon">${searchQuery ? '⌕' : '○'}</div>
          <div class="bke-empty-title">${searchQuery ? 'No results' : 'No bookmarks yet'}</div>
          <div class="bke-empty-sub">${searchQuery ? 'Try another keyword' : 'Press ＋ to save a page'}</div>
        </div>`;
      return;
    }

    
    const frag = document.createDocumentFragment();
    list.forEach((bk, i) => {
      const meta = CAT_META[bk.category] || CAT_META.other;
      const dm   = domain(bk.url);
      const fav  = `https://www.google.com/s2/favicons?domain=${dm}&sz=64`;

      const card = el('div', { className: 'bke-card', dataset: {} });
      card.dataset.id = bk.id;
      card.style.animationDelay = (i * 0.03) + 's';
      card.innerHTML = `
        <div class="bke-card-top">
          <div class="bke-favicon">
            <img src="${fav}" alt=""
              onerror="this.style.display='none';this.parentNode.textContent='${meta.icon}'"/>
          </div>
          <div class="bke-card-info">
            <div class="bke-card-title">${esc(bk.title)}</div>
            <div class="bke-card-url">${esc(dm)}</div>
          </div>
        </div>
        <div class="bke-card-footer">
          <span class="bke-tag ${meta.cls}">${meta.icon} ${meta.label}</span>
          <div class="bke-card-menu" data-menu="${bk.id}">⋯</div>
        </div>`;

      card.addEventListener('click', e => {
        if (e.target.closest('.bke-card-menu')) return;
        const found = bookmarks.find(b => b.id === bk.id);
        if (found) window.open(found.url, '_blank');
      });

      card.querySelector('.bke-card-menu').addEventListener('click', e => {
        e.stopPropagation();
        showCtx(e, bk.id);
      });

      frag.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(frag);
  }

  
  let sortMode = 'newest';
  const sortCycle = ['newest','oldest','az','za'];
  const sortLabel = { newest:'Newest first', oldest:'Oldest first', az:'A → Z', za:'Z → A' };

  function handleSort() {
    sortMode = sortCycle[(sortCycle.indexOf(sortMode) + 1) % sortCycle.length];
    if (sortMode === 'newest') bookmarks.sort((a, b) => b.createdAt - a.createdAt);
    if (sortMode === 'oldest') bookmarks.sort((a, b) => a.createdAt - b.createdAt);
    if (sortMode === 'az')     bookmarks.sort((a, b) => a.title.localeCompare(b.title));
    if (sortMode === 'za')     bookmarks.sort((a, b) => b.title.localeCompare(a.title));
    showToast('Sorted: ' + sortLabel[sortMode]);
    renderGrid();
  }

  
  function showCtx(e, id) {
    dismissCtx();
    const menu = el('div', { className: 'bke-ctx-menu' }, `
      <div class="bke-ctx-item" data-action="open">↗  Open link</div>
      <div class="bke-ctx-item" data-action="copy">⎘  Copy URL</div>
      <div class="bke-ctx-item" data-action="edit">✎  Edit</div>
      <div class="bke-ctx-sep"></div>
      <div class="bke-ctx-item danger" data-action="delete">✕  Delete</div>
    `);
    ctxMenu = menu;

    const x = Math.min(e.clientX, window.innerWidth  - 180);
    const y = Math.min(e.clientY, window.innerHeight - 170);
    menu.style.cssText = `left:${x}px;top:${y}px`;
    document.body.appendChild(menu);

    menu.querySelectorAll('.bke-ctx-item').forEach(item => {
      item.addEventListener('click', ev => {
        ev.stopPropagation();
        const bk = bookmarks.find(b => b.id === id);
        switch (item.dataset.action) {
          case 'open':   if (bk) window.open(bk.url, '_blank'); break;
          case 'copy':   if (bk) { navigator.clipboard.writeText(bk.url); showToast('URL copied'); } break;
          case 'edit':   openModal(id); break;
          case 'delete': deleteBookmark(id); break;
        }
        dismissCtx();
      });
    });
  }

  function dismissCtx() {
    if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
  }

  
  function openModal(id, prefill = false) {
    const bk = id ? bookmarks.find(b => b.id === id) : null;
    let urlVal   = bk?.url      || '';
    let titleVal = bk?.title    || '';
    let catVal   = bk?.category || 'other';

    if (prefill && !bk) {
      urlVal   = window.location.href;
      titleVal = document.title;
      catVal   = detectCategory(urlVal, titleVal);
    }

    const opts = categories.map(c => `
      <option value="${c}" ${catVal === c ? 'selected' : ''}>
        ${CAT_META[c]?.icon || '○'} ${CAT_META[c]?.label || c}
      </option>`).join('');

    const bg = el('div', { className: 'bke-modal-bg' }, `
      <div class="bke-modal">
        <div class="bke-modal-title">${bk ? '✎ Edit Bookmark' : '＋ Add Bookmark'}</div>
        <label>Title</label>
        <input type="text" id="bke-m-title" value="${esc(titleVal)}" placeholder="Page title…" />
        <label>URL</label>
        <input type="url" id="bke-m-url" value="${esc(urlVal)}" placeholder="https://…" />
        <label>Category</label>
        <select id="bke-m-cat">${opts}</select>
        <div class="bke-modal-actions">
          <button class="bke-btn bke-btn-secondary" id="bke-m-cancel">Cancel</button>
          <button class="bke-btn bke-btn-primary"   id="bke-m-save">${bk ? 'Save Changes' : 'Add Bookmark'}</button>
        </div>
      </div>
    `);

    document.body.appendChild(bg);
    document.getElementById('bke-m-title').focus();

    bg.addEventListener('click',  e => { if (e.target === bg) bg.remove(); });
    document.getElementById('bke-m-cancel').addEventListener('click', () => bg.remove());
    document.getElementById('bke-m-save').addEventListener('click', async () => {
      const title = document.getElementById('bke-m-title').value.trim();
      const url   = document.getElementById('bke-m-url').value.trim();
      const cat   = document.getElementById('bke-m-cat').value;
      if (!title || !url) { showToast('Title and URL are required'); return; }

      if (bk) {
        bk.title = title; bk.url = url; bk.category = cat;
        showToast('Bookmark updated');
      } else {
        bookmarks.unshift({ id: uid(), title, url, category: cat, createdAt: Date.now() });
        showToast('Bookmark saved');
      }
      await saveBookmarks();
      renderCategories();
      renderGrid();
      bg.remove();
    });
  }

  
  async function deleteBookmark(id) {
    bookmarks = bookmarks.filter(b => b.id !== id);
    await saveBookmarks();
    renderCategories();
    renderGrid();
    showToast('Bookmark removed');
  }

  
  function showToast(msg) {
    const t = DOM.toast || document.getElementById('bke-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'BKE_OPEN_PANEL') openPanel();
    if (msg.type === 'BKE_TOGGLE')     togglePanel();
    if (msg.type === 'BKE_QUICK_SAVE') { if (!isOpen) openPanel(); openModal(null, true); }
  });

  
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.bke_theme) {
      applyTheme(changes.bke_theme.newValue || 'obsidian-gold');
    }
  });

  
  document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 'b') { e.preventDefault(); togglePanel(); }
  });

  
  applyBodyPadding();
  buildUI();
  loadTheme();

})();
