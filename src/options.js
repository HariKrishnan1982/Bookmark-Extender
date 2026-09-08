const enabledToggle = document.getElementById("enabledToggle");
const savedMsg = document.getElementById("savedMsg");

function showSaved() {
    savedMsg.classList.add("show");
    setTimeout(() => savedMsg.classList.remove("show"), 1500);
}

chrome.storage.sync.get({ enabled: true }, (settings) => {
    enabledToggle.checked = settings.enabled;
});

enabledToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: enabledToggle.checked }, showSaved);
});
