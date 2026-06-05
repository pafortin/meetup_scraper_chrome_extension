document.getElementById('startBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tab) {
    // Envoie un message au script de contenu (content.js)
    chrome.tabs.sendMessage(tab.id, { action: "START_SCRAPE" });
    // Ferme la petite fenêtre popup après le clic
    window.close();
  }
});