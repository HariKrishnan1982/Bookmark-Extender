(() => {
  "use strict";

  // Never inject into internal pages or PDFs.
  if (
    window.location.protocol === "chrome-extension:" ||
    window.location.protocol === "edge:" ||
    window.location.protocol === "chrome:" ||
    window.location.protocol === "about:" ||
    document.contentType === "application/pdf"
  ) return;

  if (document.getElementById("bex-host")) return;

  const extId = chrome.runtime.id;
  let dragSrcId = null;
  let barRootId = null;

  // ─── Shadow DOM host ───────────────────────────────────────────
  // Everything we render lives inside this shadow root. This is the
  // isolation boundary: page CSS selectors cannot match anything in here,
  // and our CSS cannot leak out to affect the page. Only the light-DOM
  // <html> element is intentionally touched outside this boundary, to
  // push the page's own content down (see applyPushDown below).
  const host = document.createElement("div");
  host.id = "bex-host";
  const shadowRoot = host.attachShadow({ mode: "open" });

  const styleLink = document.createElement("link");
  styleLink.rel = "stylesheet";
  styleLink.href = chrome.runtime.getURL("src/bookmarks-bar.css");
  shadowRoot.appendChild(styleLink);

  const bar = document.createElement("div");
  bar.id = "bex-bar";
  shadowRoot.appendChild(bar);

  // ─── Theme (follows OS/browser light-dark preference) ────────────
  function applyTheme() {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    bar.classList.toggle("bex-dark", isDark);
    bar.style.setProperty("--bex-bg", isDark ? "#3b3b3f" : "#f1f3f5");
    bar.style.setProperty("--bex-border", isDark ? "#2a2a2d" : "#ddd");
    bar.style.setProperty("--bex-text", isDark ? "#f1f1f1" : "#202124");
  }
  applyTheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

  // ─── Keep the page pushed down to match the bar's real height ────
  // flex-wrap already reflows the bar itself on any width change with no
  // JS needed; this observer just keeps --bex-height in sync so the page
  // content never overlaps or leaves a gap when the row count changes —
  // whether that's from a resize, a bookmark being renamed, added, or
  // removed, or a folder dropdown affecting the bar's own box (it won't,
  // since dropdowns are absolutely positioned and correctly don't count
  // toward the bar's own height).
  function applyPushDown(h) {
    document.documentElement.style.setProperty("--bex-height", `${h}px`);
    document.documentElement.classList.add("bex-active");
  }

  let pushDownFrame = null;
  const rowResizeObserver = new ResizeObserver(() => {
    if (pushDownFrame) return;
    pushDownFrame = requestAnimationFrame(() => {
      pushDownFrame = null;
      const h = bar.getBoundingClientRect().height;
      if (h > 0) applyPushDown(h);
    });
  });

  // ─── Enable/disable toggle (Settings page) ────────────────────
  // The bar is only ever attached to the page while `mounted` is true, so
  // disabling the setting fully removes it — no leftover margin, no
  // leftover observer — rather than just hiding it visually.
  let mounted = false;

  function mount() {
    if (mounted) return;
    mounted = true;
    if (!host.isConnected) document.documentElement.appendChild(host);
    rowResizeObserver.observe(bar);
    loadBookmarks();
  }

  function unmount() {
    if (!mounted) return;
    mounted = false;
    rowResizeObserver.unobserve(bar);
    if (host.isConnected) host.remove();
    document.documentElement.classList.remove("bex-active");
    document.documentElement.style.removeProperty("--bex-height");
  }

  chrome.storage.sync.get({ enabled: true }, (settings) => {
    if (settings.enabled) mount();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.enabled) return;
    if (changes.enabled.newValue) mount();
    else unmount();
  });

  // ─── Helpers ───────────────────────────────────────────────────
  function faviconUrl(url) {
    return Utils.faviconUrl(url, extId);
  }

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[Bookmark Extender]", chrome.runtime.lastError.message);
          resolve({ success: false });
          return;
        }
        resolve(response || { success: false });
      });
    });
  }

  function loadBookmarks() {
    sendMessage({ type: "GET_BOOKMARKS" }).then((res) => {
      if (res.success && res.tree) render(res.tree);
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "BOOKMARKS_CHANGED" && mounted) loadBookmarks();
  });

  // ─── Drag to reorder ───────────────────────────────────────────
  function getDraggableWrapper(el, nodeId) {
    const wrapper = document.createElement("div");
    wrapper.className = "bex-drag-wrapper";
    wrapper.draggable = true;
    wrapper.dataset.bookmarkId = nodeId;
    wrapper.appendChild(el);

    wrapper.addEventListener("dragstart", (e) => {
      dragSrcId = nodeId;
      wrapper.classList.add("bex-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", nodeId);
    });

    wrapper.addEventListener("dragend", () => {
      wrapper.classList.remove("bex-dragging");
      bar.querySelectorAll(".bex-drag-over, .bex-drag-over-right").forEach((el) =>
        el.classList.remove("bex-drag-over", "bex-drag-over-right")
      );
      dragSrcId = null;
    });

    return wrapper;
  }

  bar.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragSrcId) return;

    bar.querySelectorAll(".bex-drag-over, .bex-drag-over-right").forEach((el) => {
      el.classList.remove("bex-drag-over", "bex-drag-over-right");
    });

    const wrappers = [...bar.querySelectorAll(".bex-drag-wrapper")];
    let closest = null;
    let closestDist = Infinity;
    let closestRight = false;

    for (const w of wrappers) {
      if (w.dataset.bookmarkId === dragSrcId) continue;
      const rect = w.getBoundingClientRect();
      if (e.clientY < rect.top || e.clientY > rect.bottom) continue; // same row only
      const midX = rect.left + rect.width / 2;
      const dist = Math.abs(e.clientX - midX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = w;
        closestRight = e.clientX > midX;
      }
    }

    if (closest) {
      closest.classList.toggle("bex-drag-over", !closestRight);
      closest.classList.toggle("bex-drag-over-right", closestRight);
    }
  });

  bar.addEventListener("drop", (e) => {
    e.preventDefault();
    const target = bar.querySelector(".bex-drag-over, .bex-drag-over-right");
    if (!target) return;
    const isRight = target.classList.contains("bex-drag-over-right");
    const targetId = target.dataset.bookmarkId;
    target.classList.remove("bex-drag-over", "bex-drag-over-right");
    const srcId = dragSrcId;
    if (srcId && srcId !== targetId) {
      sendMessage({ type: "MOVE_BOOKMARK", sourceId: srcId, targetId, after: isRight }).then(
        (res) => { if (res.success) loadBookmarks(); }
      );
    }
  });

  bar.addEventListener("contextmenu", (e) => {
    if (e.target === bar) showContextMenu(e, null);
  });

  // ─── Rendering ─────────────────────────────────────────────────
  function createBookmarkEl(node) {
    if (node.url) {
      const a = document.createElement("a");
      a.className = "bex-item";
      a.href = node.url;
      a.title = node.title || node.url;
      a.draggable = false;
      a.addEventListener("dragstart", (e) => e.preventDefault());

      const fav = faviconUrl(node.url);
      if (fav) {
        const img = document.createElement("img");
        img.className = "bex-favicon";
        img.src = fav;
        img.alt = "";
        img.loading = "lazy";
        img.draggable = false;
        img.onerror = () => {
          const ph = document.createElement("span");
          ph.className = "bex-favicon-placeholder";
          ph.textContent = (node.title || "?")[0].toUpperCase();
          img.replaceWith(ph);
        };
        a.appendChild(img);
      }

      if (node.title) {
        const label = document.createElement("span");
        label.className = "bex-label";
        label.textContent = node.title;
        a.appendChild(label);
      }

      a.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          window.open(node.url, "_blank", "noopener");
        }
      });

      a.addEventListener("contextmenu", (e) => showContextMenu(e, node));

      return getDraggableWrapper(a, node.id);
    }

    if (node.children) {
      const folder = document.createElement("div");
      folder.className = "bex-folder";

      const trigger = document.createElement("div");
      trigger.className = "bex-item";
      trigger.title = node.title || "Folder";

      const ph = document.createElement("span");
      ph.className = "bex-favicon-placeholder";
      ph.textContent = "\uD83D\uDCC1"; // 📁, simple and dependency-free
      ph.style.background = "transparent";
      ph.style.fontSize = "12px";
      trigger.appendChild(ph);

      if (node.title) {
        const label = document.createElement("span");
        label.className = "bex-label";
        label.textContent = node.title;
        trigger.appendChild(label);
      }

      trigger.addEventListener("contextmenu", (e) => showContextMenu(e, node));
      folder.appendChild(trigger);

      const dropdown = document.createElement("div");
      dropdown.className = "bex-dropdown";

      node.children.forEach((child) => {
        if (!child.url && !child.children) {
          const sep = document.createElement("div");
          sep.className = "bex-separator";
          dropdown.appendChild(sep);
        } else {
          const el = createBookmarkEl(child);
          if (el) dropdown.appendChild(el);
        }
      });

      folder.addEventListener("mouseenter", () => {
        const parentDropdown = folder.closest(".bex-dropdown");
        if (parentDropdown) {
          const rect = folder.getBoundingClientRect();
          dropdown.style.position = "fixed";
          dropdown.style.left = rect.right + 2 + "px";
          dropdown.style.top = rect.top + "px";
          requestAnimationFrame(() => {
            const dr = dropdown.getBoundingClientRect();
            if (dr.right > window.innerWidth) {
              dropdown.style.left = rect.left - dr.width - 2 + "px";
            }
            if (dr.bottom > window.innerHeight) {
              dropdown.style.top = Math.max(0, window.innerHeight - dr.height) + "px";
            }
          });
        } else {
          dropdown.style.left = "";
          dropdown.style.right = "";
          requestAnimationFrame(() => {
            const dr = dropdown.getBoundingClientRect();
            if (dr.right > window.innerWidth) {
              dropdown.style.left = "auto";
              dropdown.style.right = "0";
            } else {
              dropdown.style.left = "0";
              dropdown.style.right = "auto";
            }
            if (dr.bottom > window.innerHeight) {
              dropdown.style.maxHeight = (window.innerHeight - dr.top - 8) + "px";
            }
          });
        }
      });

      folder.appendChild(dropdown);
      return getDraggableWrapper(folder, node.id);
    }

    return null;
  }

  function render(bookmarks) {
    clearChildren(bar);

    const bookmarksBar = Utils.findBookmarksBarFolder(bookmarks);
    if (!bookmarksBar || !bookmarksBar.children) return;
    barRootId = bookmarksBar.id;

    bookmarksBar.children.forEach((node) => {
      const el = createBookmarkEl(node);
      if (el) bar.appendChild(el);
    });

    requestAnimationFrame(() => {
      const h = bar.getBoundingClientRect().height;
      if (h > 0) applyPushDown(h);
    });
  }

  // A click that originates inside the shadow tree retargets to `host` when
  // observed from the light document, so `e.target` alone can't tell us
  // whether the click landed on the bar — composedPath() sees the real path.
  document.addEventListener("click", (e) => {
    const path = e.composedPath();
    if (!path.includes(bar)) {
      bar.querySelectorAll(".bex-dropdown.bex-open").forEach((d) => d.classList.remove("bex-open"));
    }
    const menu = shadowRoot.getElementById("bex-context-menu");
    if (menu) menu.remove();
  });

  // ─── Context menu ──────────────────────────────────────────────
  function showContextMenu(e, node) {
    e.preventDefault();
    e.stopPropagation();

    const old = shadowRoot.getElementById("bex-context-menu");
    if (old) old.remove();

    const menu = document.createElement("div");
    menu.id = "bex-context-menu";
    menu.style.setProperty("--bex-bg", getComputedStyle(bar).getPropertyValue("--bex-bg"));
    menu.style.setProperty("--bex-border", getComputedStyle(bar).getPropertyValue("--bex-border"));
    menu.style.setProperty("--bex-text", getComputedStyle(bar).getPropertyValue("--bex-text"));

    const items = [];

    if (node && node.url) {
      items.push({ label: "Open in new tab", action: () => window.open(node.url, "_blank", "noopener") });
      items.push({ type: "separator" });
      items.push({ label: "Rename...", action: () => renameBookmark(node) });
      items.push({ label: "Edit URL...", action: () => editBookmarkUrl(node) });
      items.push({ label: "Delete", action: () => sendMessage({ type: "DELETE_BOOKMARK", id: node.id }).then(loadBookmarks) });
    } else if (node && node.children) {
      items.push({
        label: "Open all in tabs",
        action: () => node.children.filter((c) => c.url).forEach((c) => window.open(c.url, "_blank", "noopener")),
      });
      items.push({ type: "separator" });
      items.push({ label: "Rename...", action: () => renameBookmark(node) });
      items.push({ label: "Delete folder", action: () => sendMessage({ type: "DELETE_BOOKMARK", id: node.id }).then(loadBookmarks) });
    }

    if (node) items.push({ type: "separator" });
    items.push({ label: "Add bookmark...", action: () => addBookmark(node) });
    items.push({ label: "Add folder...", action: () => addFolder(node) });
    items.push({ type: "separator" });
    items.push({ label: "Bookmark manager", action: () => sendMessage({ type: "OPEN_BOOKMARK_MANAGER" }) });

    items.forEach((item) => {
      if (item.type === "separator") {
        const sep = document.createElement("div");
        sep.className = "bex-ctx-sep";
        menu.appendChild(sep);
      } else {
        const btn = document.createElement("div");
        btn.className = "bex-ctx-item";
        btn.textContent = item.label;
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          menu.remove();
          item.action();
        });
        menu.appendChild(btn);
      }
    });

    shadowRoot.appendChild(menu);
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 10);
    menu.style.left = x + "px";
    menu.style.top = y + "px";
  }

  function renameBookmark(node) {
    showDialog({
      title: node.url ? "Rename bookmark" : "Rename folder",
      fields: [{ key: "title", label: "Name", value: node.title || "" }],
      onSave: ({ title }) => sendMessage({ type: "EDIT_BOOKMARK", id: node.id, title }).then(loadBookmarks),
    });
  }

  function editBookmarkUrl(node) {
    showDialog({
      title: "Edit URL",
      fields: [{ key: "url", label: "URL", value: node.url || "" }],
      onSave: ({ url }) => sendMessage({ type: "EDIT_BOOKMARK", id: node.id, url }).then(loadBookmarks),
    });
  }

  function addBookmark(node) {
    const parentId = node ? (node.children ? node.id : node.parentId) : barRootId;
    showDialog({
      title: "Add bookmark",
      fields: [
        { key: "title", label: "Name", placeholder: "Bookmark name" },
        { key: "url", label: "URL", placeholder: "https://" },
      ],
      onSave: ({ title, url }) => sendMessage({ type: "ADD_BOOKMARK", parentId, title, url }).then(loadBookmarks),
    });
  }

  function addFolder(node) {
    const parentId = node ? (node.children ? node.id : node.parentId) : barRootId;
    showDialog({
      title: "Add folder",
      fields: [{ key: "title", label: "Name", placeholder: "Folder name" }],
      onSave: ({ title }) => sendMessage({ type: "ADD_FOLDER", parentId, title }).then(loadBookmarks),
    });
  }

  // ─── Add/Edit dialog ───────────────────────────────────────────
  function showDialog({ title: dlgTitle, fields, onSave }) {
    const overlay = document.createElement("div");
    overlay.className = "bex-dialog-overlay";

    const dialog = document.createElement("div");
    dialog.className = "bex-dialog";
    dialog.style.setProperty("--bex-bg", getComputedStyle(bar).getPropertyValue("--bex-bg"));
    dialog.style.setProperty("--bex-border", getComputedStyle(bar).getPropertyValue("--bex-border"));
    dialog.style.setProperty("--bex-text", getComputedStyle(bar).getPropertyValue("--bex-text"));

    const heading = document.createElement("div");
    heading.className = "bex-dialog-title";
    heading.textContent = dlgTitle;
    dialog.appendChild(heading);

    const inputs = {};
    fields.forEach(({ key, label, placeholder, value }) => {
      const lbl = document.createElement("label");
      lbl.textContent = label;
      dialog.appendChild(lbl);
      const inp = document.createElement("input");
      inp.type = "text";
      inp.placeholder = placeholder || "";
      if (value) inp.value = value;
      dialog.appendChild(inp);
      inputs[key] = inp;
    });

    const btnRow = document.createElement("div");
    btnRow.className = "bex-dialog-buttons";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    const saveBtn = document.createElement("button");
    saveBtn.className = "bex-btn-primary";
    saveBtn.textContent = "Save";
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);

    const close = () => overlay.remove();
    const clearErrors = () => {
      dialog.querySelectorAll(".bex-input-error").forEach((el) => el.classList.remove("bex-input-error"));
      dialog.querySelectorAll(".bex-error-msg").forEach((el) => el.remove());
    };
    const showError = (inp, msg) => {
      inp.classList.add("bex-input-error");
      const err = document.createElement("div");
      err.className = "bex-error-msg";
      err.textContent = msg;
      inp.parentNode.insertBefore(err, inp.nextSibling);
    };
    const save = () => {
      clearErrors();
      let valid = true;
      const values = {};
      fields.forEach(({ key }) => {
        const val = inputs[key].value.trim();
        values[key] = val;
        if (!val) {
          showError(inputs[key], "This field is required");
          valid = false;
        } else if (key === "url" && !Utils.isValidUrl(val)) {
          showError(inputs[key], "Enter a valid URL (https://...)");
          valid = false;
        }
      });
      if (!valid) return;
      onSave(values);
      close();
    };

    Object.values(inputs).forEach((inp) => {
      inp.addEventListener("input", () => {
        inp.classList.remove("bex-input-error");
        const err = inp.nextElementSibling;
        if (err && err.classList.contains("bex-error-msg")) err.remove();
      });
    });

    cancelBtn.addEventListener("click", close);
    saveBtn.addEventListener("click", save);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter") save();
    });

    shadowRoot.appendChild(overlay);
    const firstInput = Object.values(inputs)[0];
    if (firstInput) firstInput.focus();
  }

})();
