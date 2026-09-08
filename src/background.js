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
                    tree
                });
            })
            .catch((error) => {
                console.error("Failed to read bookmarks:", error);

                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }
});