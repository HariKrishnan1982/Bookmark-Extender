// Shared pure utility functions used by bookmarks-bar.js.
// Kept dependency-free so it can also be required from a test file later.

const Utils = (() => {
  "use strict";

  const BOOKMARKS_BAR_TITLES = [
    "Bookmarks bar",
    "Bookmarks Bar",
    "Bookmarks Toolbar",
    "Favorites bar",
    "Favorites Bar",
    "Bookmarks",
  ];

  // The bookmarks-bar folder is always the first child of the root node
  // returned by chrome.bookmarks.getTree(), but its title varies by
  // browser/locale, so match against a known list rather than assuming
  // English.
  function findBookmarksBarFolder(tree) {
    const root = tree && tree[0];
    if (!root || !root.children) return null;
    return root.children.find((c) => BOOKMARKS_BAR_TITLES.includes(c.title)) || root.children[0] || null;
  }

  function isValidUrl(str) {
    return /^https?:\/\/.+/i.test(str);
  }

  function faviconUrl(pageUrl, extensionId) {
    try {
      new URL(pageUrl);
    } catch {
      return null;
    }
    const base = `chrome-extension://${extensionId}/_favicon/?pageUrl=`;
    return base + encodeURIComponent(pageUrl) + "&size=32";
  }

  return {
    BOOKMARKS_BAR_TITLES,
    findBookmarksBarFolder,
    isValidUrl,
    faviconUrl,
  };
})();

if (typeof module !== "undefined") {
  module.exports = Utils;
}
