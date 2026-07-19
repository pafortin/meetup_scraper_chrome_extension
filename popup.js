// Au clic, injecte le scraper (le bookmarklet v3) dans le MONDE PRINCIPAL de
// la page Meetup. Le monde principal donne accès à window.__NEXT_DATA__ et au
// fetch de la page, exactement comme le bookmarklet lancé depuis un favori.

const btn = document.getElementById('startBtn');
const status = document.getElementById('status');

function setStatus(msg) {
  if (status) status.textContent = msg;
}

btn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    setStatus('Aucun onglet actif.');
    return;
  }

  // Garde-fou : on doit être sur meetup.com (l'URL n'est lisible que si
  // l'extension a la permission sur cet hôte ; sinon on laisse passer).
  if (tab.url && !/^https:\/\/(www\.)?meetup\.com\//.test(tab.url)) {
    setStatus('Ouvrez d\'abord la page d\'un groupe Meetup.');
    return;
  }

  try {
    setStatus('Extraction lancée dans la page…');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['scraper.js'],
    });
    window.close();
  } catch (e) {
    setStatus('Erreur : ' + (e && e.message ? e.message : String(e)));
  }
});
