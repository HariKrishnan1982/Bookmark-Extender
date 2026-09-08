chrome.runtime.onInstalled.addListener(() => {
    console.log("Bookmark Extender installed.");
});

chrome.runtime.onStartup.addListener(() => {
    console.log("Bookmark Extender started.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "GET_BOOKMARKS") {
        return;
    }

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
});