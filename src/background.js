chrome.runtime.onInstalled.addListener(() => {
    console.log("Bookmark Extender installed.");
});

chrome.runtime.onStartup.addListener(() => {
    console.log("Bookmark Extender started.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_BOOKMARKS") {
        chrome.bookmarks.getTree()
            .then((tree) => {
                sendResponse({
                    success: true,
                    tree: tree
                });
            })
            .catch((error) => {
                console.error("Bookmark error:", error);

                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    if (message.type === "ADD_BOOKMARK") {
        chrome.bookmarks.create({
            parentId: message.parentId,
            title: message.title,
            url: message.url
        })
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));

        return true;
    }

    if (message.type === "ADD_FOLDER") {
        chrome.bookmarks.create({
            parentId: message.parentId,
            title: message.title
        })
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));

        return true;
    }

    if (message.type === "EDIT_BOOKMARK") {
        const changes = {};
        if (message.title !== undefined) changes.title = message.title;
        if (message.url !== undefined) changes.url = message.url;

        chrome.bookmarks.update(message.id, changes)
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));

        return true;
    }

    if (message.type === "DELETE_BOOKMARK") {
        // removeTree works for both a single bookmark and a folder with
        // children; fall back to remove() for a plain leaf node.
        chrome.bookmarks.removeTree(message.id)
            .catch(() => chrome.bookmarks.remove(message.id))
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));

        return true;
    }

    if (message.type === "MOVE_BOOKMARK") {
        chrome.bookmarks.get(String(message.targetId))
            .then(([target]) => {
                const index = message.after ? target.index + 1 : target.index;
                return chrome.bookmarks.move(String(message.sourceId), {
                    parentId: String(target.parentId),
                    index: Number(index)
                });
            })
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));

        return true;
    }

    if (message.type === "OPEN_BOOKMARK_MANAGER") {
        chrome.tabs.create({ url: "edge://favorites" });
        return;
    }
});

// Tell every open tab's content script to reload its bookmarks whenever the
// underlying bookmark tree changes, so the bar stays live without polling.
// chrome.tabs.query({}) works without the "tabs" permission as long as we
// only touch tab ids (not url/title/favIconUrl), which is all we need here.
function notifyTabs() {
    chrome.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
            if (tab.id === undefined) continue;
            chrome.tabs.sendMessage(tab.id, { type: "BOOKMARKS_CHANGED" }).catch(() => {
                // No content script in this tab (e.g. an internal edge:// page) — ignore.
            });
        }
    });
}

chrome.bookmarks.onCreated.addListener(notifyTabs);
chrome.bookmarks.onRemoved.addListener(notifyTabs);
chrome.bookmarks.onChanged.addListener(notifyTabs);
chrome.bookmarks.onMoved.addListener(notifyTabs);