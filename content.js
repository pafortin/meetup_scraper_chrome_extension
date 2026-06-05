// Variable globale pour éviter les lancements multiples
let isRunning = false;

// Écoute le message venant du popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_SCRAPE" && !isRunning) {
    isRunning = true;
    runScraper();
  }
});

// --- DÉBUT DU CODE DU SCRAPER (Adapté du Fix 2.0) ---

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[MEETUP EXT]', ...a);

// Blocage des requêtes parasites (Sentry, etc.)
(() => {
  const block = [/sentry\.io/i, /ingest\./i, /analytics/i];
  const orig = window.fetch;
  if (!orig) return;
  window.fetch = async (...args) => {
    try {
      const u = String(args[0]?.url || args[0] || '');
      if (block.some(rx => rx.test(u))) return new Response(null, { status: 204 });
    } catch {}
    return orig(...args);
  };
})();

async function fetchRetry(url, opts, tries = 5) {
  for (let i = 0; i <= tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429 && i < tries) {
        const ra = parseInt(res.headers.get('Retry-After') || '2', 10);
        await sleep(1000 * Math.min(ra, 10));
        continue;
      }
      if (!res.ok && i < tries) {
        await sleep(1000 * Math.pow(2, i));
        continue;
      }
      return res;
    } catch (err) {
      if (i === tries) throw err;
      await sleep(1000 * Math.pow(2, i));
    }
  }
}

function makeUI() {
  const existed = document.getElementById('meetupScraperUI');
  if (existed) existed.remove();
  
  const wrap = document.createElement('div');
  wrap.id = 'meetupScraperUI';
  wrap.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;background:#1a1a1a;color:#fff;padding:16px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);font:13px -apple-system,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;min-width:340px;max-width:440px';
  
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px';
  
  const title = document.createElement('div');
  title.textContent = '🎯 Meetup Scraper (Extension)';
  title.style.cssText = 'font-weight:600;font-size:15px';
  
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = 'background:#333;border:none;color:#aaa;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:16px';
  close.onclick = () => { wrap.remove(); isRunning = false; };
  
  header.append(title, close);
  
  const stage = document.createElement('div');
  stage.id = 'scraperStage';
  stage.style.cssText = 'margin:8px 0;color:#ddd;font-size:13px';
  
  const barOuter = document.createElement('div');
  barOuter.style.cssText = 'height:8px;background:#333;border-radius:4px;overflow:hidden;margin:10px 0';
  
  const bar = document.createElement('div');
  bar.id = 'scraperBar';
  bar.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#0078ff,#00c4ff);transition:width .3s ease';
  barOuter.append(bar);
  
  const details = document.createElement('div');
  details.id = 'scraperDetails';
  details.style.cssText = 'margin-top:8px;color:#999;font-size:12px;min-height:18px';
  
  const pause = document.createElement('button');
  pause.textContent = '⏸️ Pause';
  pause.id = 'pauseBtn';
  pause.style.cssText = 'margin-top:10px;width:100%;background:#333;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-size:12px';
  pause.onclick = () => {
    window.pauseScroll = !window.pauseScroll;
    pause.textContent = window.pauseScroll ? '▶️ Resume' : '⏸️ Pause';
  };
  
  wrap.append(header, stage, barOuter, details, pause);
  document.body.appendChild(wrap);
}

function updateUI(stageTxt, pct, detail = '') {
  const s = document.getElementById('scraperStage'),
        b = document.getElementById('scraperBar'),
        d = document.getElementById('scraperDetails');
  if (s) s.textContent = stageTxt;
  if (b) b.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  if (d) d.textContent = detail;
}

function getGroupUrlname() {
  const m = window.location.pathname.match(/^\/([^\/]+)\/(?:[a-z]{2}-[A-Z]{2}\/)?([^\/]+)\//);
  if (m) return (m[1] === 'fr-FR' || m[1] === 'en-US') ? m[2] : m[1];
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[0] || 'UnknownGroup';
}

function extractEventIds(group) {
  const set = new Set();
  log('🔍 Extracting events (loose mode)...');
  const rx = /\/events\/(\d+)/;
  document.querySelectorAll('a[href*="/events/"]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const m = href.match(rx);
    if (m && m[1]) set.add(m[1]);
  });
  return [...set];
}

async function fetchEventPage(eventId, after = null) {
  const query = `query getAttendees($eventId: ID!, $after: String) { event(id: $eventId) { id rsvps(first: 100, after: $after, filter: {rsvpStatus: [YES, ATTENDED]}) { pageInfo { hasNextPage endCursor } edges { node { status guestsCount member { id name eventsAttended noShowCount isFamiliarFace } membership { role status } } } } } }`;
  const variables = { eventId, after };
  const body = { operationName: 'getAttendees', variables, query };
  
  const res = await fetchRetry('https://www.meetup.com/gql2', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }, 5);
  
  if (res && res.ok) return res.json();
  return null;
}

async function fetchAttendees(eventId, idx, total) {
  const out = [];
  let cursor = null;
  for (updateUI('Fetching Attendees...', 35 + Math.round(idx / total * 60), `Processing Event ${idx + 1}/${total} (ID: ${eventId})`); cursor !== undefined;) {
    if (window.pauseScroll) { await sleep(500); continue; } // Gestion de la pause
    
    const data = await fetchEventPage(eventId, cursor);
    if (!data?.data?.event) break;
    const ev = data.data.event;
    (ev.rsvps?.edges || []).forEach(ed => {
      const node = ed.node || {};
      const mem = node.member || {};
      const memship = node.membership || {};
      out.push({
        eventId,
        memberName: mem.name || 'Unknown',
        memberId: mem.id || '',
        status: node.status || '',
        guests: node.guestsCount || 0,
        eventsAttended: mem.eventsAttended || 0,
        noShowCount: mem.noShowCount || 0,
        memberRole: memship.role || 'MEMBER',
        memberStatus: memship.status || 'ACTIVE',
        isFamiliarFace: mem.isFamiliarFace ? 1 : 0
      });
    });
    const hasNext = ev.rsvps?.pageInfo?.hasNextPage;
    cursor = hasNext ? ev.rsvps.pageInfo.endCursor : undefined;
    await sleep(50);
  }
  log(`✅ Event ${eventId}: ${out.length} attendees`);
  updateUI('Fetching Attendees...', 35 + Math.round((idx + 1) / total * 60), `✅ Event ${idx + 1}/${total} (ID: ${eventId}) fetched: ${out.length} attendees.`);
  return out;
}

async function runScraper() {
  try {
    makeUI();
    updateUI('Init...', 0);
    const group = getGroupUrlname();
    log('📍 Group detected:', group);
    updateUI(`Group: ${group}`, 5);
    
    await sleep(800);
    updateUI('Extracting Event IDs...', 32, 'Please scroll the page manually to load all events first.');
    
    const ids = extractEventIds(group);
    if (ids.length === 0) {
      updateUI('❌ 0 events found', 100);
      log('❌ No events');
      isRunning = false;
      return;
    }
    
    log(`✅ Extracted ${ids.length} unique event IDs`);
    updateUI(`Found ${ids.length} Events`, 35, 'Starting attendee fetch.');
    
    const rows = [];
    const total = ids.length;
    const batchSize = Math.min(5, total);
    
    for (let i = 0; i < total; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      const results = await Promise.all(chunk.map((id, idx) => fetchAttendees(id, i + idx, total).catch(err => {
        log(`❌ ${id}:`, err?.message || err);
        updateUI('Fetching Attendees...', 35 + Math.round((i + idx + 1) / total * 60), `❌ Event ${i + idx + 1}/${total} (ID: ${id}) failed.`);
        return [];
      })));
      rows.push(...results.flat());
      await sleep(120);
    }
    
    updateUI('Generating CSV...', 96);
    if (rows.length === 0) {
      updateUI('⚠️ 0 attendees found', 100);
      log('⚠️ No attendees');
      isRunning = false;
      return;
    }
    
    const headers = ['eventId', 'memberName', 'memberId', 'status', 'guests', 'eventsAttended', 'noShowCount', 'memberRole', 'memberStatus', 'isFamiliarFace'];
    const csv = [headers.join(',')];
    rows.forEach(r => {
      csv.push(headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
    });
    
    const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `meetup_${group}_enriched_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    updateUI('✅ Done!', 100, `${ids.length} events | ${rows.length} attendees`);
    const btn = document.getElementById('pauseBtn');
    if (btn) {
      btn.textContent = '✅ OK';
      btn.disabled = true;
      btn.style.opacity = '0.5';
    }
    isRunning = false;
    
  } catch (err) {
    log('❌ ERROR:', err);
    updateUI('❌ Error', 100, err?.message || String(err));
    console.error(err);
    isRunning = false;
  }
}