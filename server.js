const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const PIN = process.env.PIN || '1234';
const DATA_FILE = path.join(__dirname, 'data.json');
const SESSION_COOKIE = 'tracker_session';
const sessions = new Set();

function loadHikes() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveHikes(hikes) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(hikes, null, 2));
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(p => {
    const [k, ...v] = p.trim().split('=');
    if (k) out[k] = v.join('=');
  });
  return out;
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const params = {};
      body.split('&').forEach(p => {
        const [k, v] = p.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
      });
      resolve(params);
    });
  });
}

function isAuthed(req) {
  const c = parseCookies(req);
  return c[SESSION_COOKIE] && sessions.has(c[SESSION_COOKIE]);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; background: #f5f5f0; color: #222; }
  h1 { border-bottom: 2px solid #3a6b35; padding-bottom: 0.5rem; color: #3a6b35; }
  form { background: #fff; padding: 1.25rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 1.5rem; }
  label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; font-size: 0.9rem; }
  input[type=text], input[type=number], input[type=date], textarea { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
  textarea { min-height: 60px; resize: vertical; }
  .row { display: flex; gap: 1rem; align-items: center; margin-top: 0.75rem; }
  button { background: #3a6b35; color: white; border: 0; padding: 0.6rem 1.2rem; border-radius: 4px; font-size: 1rem; cursor: pointer; margin-top: 1rem; }
  button:hover { background: #2d5429; }
  .hike { background: #fff; padding: 1rem; border-radius: 8px; margin-bottom: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .hike-header { display: flex; justify-content: space-between; align-items: baseline; }
  .hike-trail { font-weight: 600; font-size: 1.1rem; }
  .hike-date { color: #888; font-size: 0.85rem; }
  .hike-meta { color: #555; font-size: 0.9rem; margin-top: 0.25rem; }
  .hike-note { margin-top: 0.5rem; color: #444; font-style: italic; }
  .empty { text-align: center; color: #888; padding: 2rem; }
  .logout { float: right; font-size: 0.85rem; color: #888; }
`;

function renderLogin(error) {
  return `<!doctype html><html><head><title>Hike Tracker</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>${STYLES}</style></head>
<body><h1>Hike Tracker</h1>
<form method="POST" action="/login">
  <label>PIN</label>
  <input type="password" name="pin" autofocus required>
  ${error ? `<p style="color:#c33">${escapeHtml(error)}</p>` : ''}
  <button type="submit">Unlock</button>
</form></body></html>`;
}

function renderHome(hikes) {
  const today = new Date().toISOString().slice(0, 10);
  const list = hikes.length === 0
    ? '<div class="empty">No hikes logged yet. Record your first one above!</div>'
    : hikes.slice().reverse().map(h => `
      <div class="hike">
        <div class="hike-header">
          <span class="hike-trail">${escapeHtml(h.trail)} ${'★'.repeat(h.rating)}${'☆'.repeat(5 - h.rating)}</span>
          <span class="hike-date">${escapeHtml(h.date)}</span>
        </div>
        <div class="hike-meta">${escapeHtml(h.miles)} mi · ${h.dogFriendly ? '🐕 dog-friendly' : 'no dogs'}</div>
        ${h.note ? `<div class="hike-note">${escapeHtml(h.note)}</div>` : ''}
      </div>`).join('');

  return `<!doctype html><html><head><title>Hike Tracker</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>${STYLES}</style></head>
<body>
<h1>Hike Tracker <a class="logout" href="/logout">logout</a></h1>
<form method="POST" action="/hikes">
  <label>Trail</label>
  <input type="text" name="trail" required>
  <div class="row" style="gap:1rem">
    <div style="flex:1"><label>Miles</label><input type="number" step="0.1" min="0" name="miles" required></div>
    <div style="flex:1"><label>Rating (1-5)</label><input type="number" min="1" max="5" name="rating" value="3" required></div>
  </div>
  <label>Date</label>
  <input type="date" name="date" value="${today}">
  <div class="row"><input type="checkbox" name="dogFriendly" id="dog" style="width:auto"><label for="dog" style="margin:0">Dog friendly</label></div>
  <label>Note (optional)</label>
  <textarea name="note"></textarea>
  <button type="submit">Log Hike</button>
</form>
<h2>Previous Hikes</h2>
${list}
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/login') {
    const body = await parseBody(req);
    if (body.pin === PIN) {
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.add(sid);
      res.writeHead(302, {
        'Set-Cookie': `${SESSION_COOKIE}=${sid}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`,
        Location: '/'
      });
      return res.end();
    }
    res.writeHead(401, { 'Content-Type': 'text/html' });
    return res.end(renderLogin('Incorrect PIN'));
  }

  if (url.pathname === '/logout') {
    const c = parseCookies(req);
    if (c[SESSION_COOKIE]) sessions.delete(c[SESSION_COOKIE]);
    res.writeHead(302, { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0`, Location: '/' });
    return res.end();
  }

  if (!isAuthed(req)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(renderLogin());
  }

  if (req.method === 'POST' && url.pathname === '/hikes') {
    const body = await parseBody(req);
    const hikes = loadHikes();
    hikes.push({
      trail: body.trail || 'Unnamed',
      miles: parseFloat(body.miles) || 0,
      rating: Math.max(1, Math.min(5, parseInt(body.rating) || 3)),
      dogFriendly: body.dogFriendly === 'on',
      date: body.date || new Date().toISOString().slice(0, 10),
      note: body.note || '',
      createdAt: new Date().toISOString()
    });
    saveHikes(hikes);
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(renderHome(loadHikes()));
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`Tracker on http://${HOST}:${PORT} (PIN=${PIN})`);
});
