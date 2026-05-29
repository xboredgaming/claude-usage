function fmtCost(n) {
  return '$' + (n || 0).toFixed(2);
}

function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
}

function shortModel(name) {
  if (name.includes('haiku')) return 'Haiku';
  if (name.includes('sonnet')) return 'Sonnet';
  if (name.includes('opus')) return 'Opus';
  return name.split('-').slice(-1)[0];
}

function modelClass(name) {
  if (name.includes('haiku')) return 'haiku';
  if (name.includes('opus')) return 'opus';
  return '';
}

function costColor(cost) {
  if (cost < 5) return 'green';
  if (cost < 20) return 'amber';
  return 'red';
}

// Default plan limits (output tokens). User can override via tap → prompt.
// Session: 300K based on observed maximums. Weekly: 2M based on heaviest week.
const DEFAULT_SESSION_LIMIT = 300000;
const DEFAULT_WEEKLY_LIMIT  = 2000000;

function getLimit(key, def) {
  const v = localStorage.getItem(key);
  return v ? parseInt(v, 10) : def;
}
function setLimit(key, val) { localStorage.setItem(key, String(val)); }

function editLimit(key, def, label) {
  const current = getLimit(key, def);
  const raw = prompt(`Set ${label} (output tokens).\nCurrent: ${current.toLocaleString()}`, current);
  if (raw === null) return;
  const n = parseInt(raw.replace(/,/g, ''), 10);
  if (!isNaN(n) && n > 0) { setLimit(key, n); doRefresh(); }
}

function fmtDuration(ms) {
  if (ms <= 0) return 'ended';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function limitBar(used, limit, color) {
  const pct = Math.min((used / limit) * 100, 100);
  const barColor = pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : color;
  return { pct: pct.toFixed(0), barColor };
}

function renderSessionBlock(block, weeklyOutputTokens) {
  const sessionLimit = getLimit('sessionLimit', DEFAULT_SESSION_LIMIT);
  const weeklyLimit  = getLimit('weeklyLimit',  DEFAULT_WEEKLY_LIMIT);

  // Session block
  const sessionHtml = (() => {
    if (!block) return `
      <p class="section-title">Current Session</p>
      <div class="card" style="color:#444;font-size:13px">No active session block</div>`;

    const now = Date.now();
    const remaining = new Date(block.endTime).getTime() - now;
    const { pct, barColor } = limitBar(block.outputTokens, sessionLimit, '#3b82f6');

    const burnRow = block.burnRatePerHour > 0
      ? `<div class="token-row"><span class="token-label">Burn rate</span><span class="token-value">${fmtCost(block.burnRatePerHour)}/hr</span></div>`
      : '';
    const projRow = block.projectedCost
      ? `<div class="token-row"><span class="token-label">Projected</span><span class="token-value">${fmtCost(block.projectedCost)}</span></div>`
      : '';

    return `
      <p class="section-title">Current Session &nbsp;<span class="reset-label">resets in ${fmtDuration(remaining)}</span></p>
      <div class="card">
        <div class="limit-header">
          <span class="limit-pct">${pct}% used</span>
          <button class="limit-edit" onclick="editLimit('sessionLimit',${DEFAULT_SESSION_LIMIT},'session limit')">Edit limit</button>
        </div>
        <div class="bar-track" style="height:7px;margin-bottom:14px">
          <div class="bar-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div class="token-row">
          <span class="token-label">Output tokens</span>
          <span class="token-value">${fmtTokens(block.outputTokens)} / ${fmtTokens(sessionLimit)}</span>
        </div>
        <div class="token-row">
          <span class="token-label">Session cost</span>
          <span class="token-value ${costColor(block.cost)}">${fmtCost(block.cost)}</span>
        </div>
        ${burnRow}${projRow}
      </div>`;
  })();

  // Weekly block
  const { pct: wPct, barColor: wColor } = limitBar(weeklyOutputTokens, weeklyLimit, '#3b82f6');
  const weeklyHtml = `
    <p class="section-title">Weekly Usage &nbsp;<span class="reset-label">resets Mon</span></p>
    <div class="card">
      <div class="limit-header">
        <span class="limit-pct">${wPct}% used</span>
        <button class="limit-edit" onclick="editLimit('weeklyLimit',${DEFAULT_WEEKLY_LIMIT},'weekly limit')">Edit limit</button>
      </div>
      <div class="bar-track" style="height:7px;margin-bottom:14px">
        <div class="bar-fill" style="width:${wPct}%;background:${wColor}"></div>
      </div>
      <div class="token-row">
        <span class="token-label">Output tokens</span>
        <span class="token-value">${fmtTokens(weeklyOutputTokens)} / ${fmtTokens(weeklyLimit)}</span>
      </div>
    </div>`;

  return sessionHtml + weeklyHtml;
}

function renderDashboard(d, offline) {
  const totalModelCost = Object.values(d.models).reduce((s, m) => s + m.cost, 0);

  const cacheTotal = d.allTime.cacheReadTokens + d.allTime.inputTokens + d.allTime.outputTokens;
  const cacheEff = cacheTotal > 0
    ? ((d.allTime.cacheReadTokens / cacheTotal) * 100).toFixed(0)
    : '0';

  const modelBarsHtml = Object.entries(d.models)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([name, stats]) => {
      const pct = totalModelCost > 0 ? (stats.cost / totalModelCost * 100) : 0;
      return `
        <div class="model-bar">
          <div class="model-name">
            <span>${shortModel(name)}</span>
            <span>${fmtCost(stats.cost)} &nbsp;${pct.toFixed(0)}%</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill ${modelClass(name)}" style="width:${pct}%"></div>
          </div>
        </div>`;
    }).join('');

  const maxCost = Math.max(...d.last7.map(x => x.cost), 0.01);
  const todayDate = new Date().toISOString().split('T')[0];
  const sparkBars = d.last7.map(x => {
    const h = Math.max((x.cost / maxCost) * 100, 3).toFixed(0);
    const cls = x.date === todayDate ? 'today' : '';
    return `<div class="spark-bar ${cls}" style="height:${h}%" title="${x.date}: ${fmtCost(x.cost)}"></div>`;
  }).join('');

  const sourceLabel = d._source === 'cloud' ? 'cloud sync' : d._source === 'local' ? 'live' : '';
  const updatedAt = offline
    ? `cached`
    : `${new Date(d.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${sourceLabel ? `· ${sourceLabel}` : ''}`;

  document.getElementById('root').innerHTML = `
    <header>
      <h1>Claude Usage ${offline ? '<span class="offline-badge">offline</span>' : ''}</h1>
      <button class="refresh-btn" onclick="doRefresh()">Refresh</button>
    </header>

    ${renderSessionBlock(d.currentBlock, d.weeklyOutputTokens || 0)}

    <div class="grid">
      <div class="card wide">
        <div class="card-label">Today</div>
        <div class="card-value ${costColor(d.today.cost)}">${fmtCost(d.today.cost)}</div>
        <div class="card-sub">${fmtTokens(d.today.outputTokens)} output tokens</div>
      </div>
      <div class="card">
        <div class="card-label">This Month</div>
        <div class="card-value">${fmtCost(d.thisMonthCost)}</div>
      </div>
      <div class="card">
        <div class="card-label">All Time</div>
        <div class="card-value">${fmtCost(d.allTime.cost)}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-label">Last 7 Days</div>
      <div class="sparkline">${sparkBars}</div>
    </div>

    <p class="section-title">Tokens (all time)</p>
    <div class="card">
      <div class="token-row">
        <span class="token-label">Output</span>
        <span class="token-value">${fmtTokens(d.allTime.outputTokens)}</span>
      </div>
      <div class="token-row">
        <span class="token-label">Cache Read</span>
        <span class="token-value">${fmtTokens(d.allTime.cacheReadTokens)}</span>
      </div>
      <div class="token-row">
        <span class="token-label">Cache Write</span>
        <span class="token-value">${fmtTokens(d.allTime.cacheCreationTokens)}</span>
      </div>
      <div class="token-row">
        <span class="token-label">Direct Input</span>
        <span class="token-value">${fmtTokens(d.allTime.inputTokens)}</span>
      </div>
      <div class="token-row">
        <span class="token-label">Cache Efficiency</span>
        <span class="token-value highlight">${cacheEff}%</span>
      </div>
    </div>

    <p class="section-title">Models</p>
    <div class="card">${modelBarsHtml || '<span style="color:#444;font-size:13px">No data</span>'}</div>

    <footer>
      Updated ${offline ? 'from cache' : updatedAt}${d.lastActivity ? ' &nbsp;·&nbsp; Last active: ' + d.lastActivity : ''}
    </footer>
  `;
}

function renderError(msg) {
  document.getElementById('root').innerHTML = `
    <header>
      <h1>Claude Usage</h1>
      <button class="refresh-btn" onclick="doRefresh()">Retry</button>
    </header>
    <div class="error">
      <strong>Could not load data</strong><br><br>
      ${msg}<br><br>
      <span style="color:#555">Data syncs hourly when your PC is on. Open the app after your PC has been online to see fresh data.</span>
    </div>
  `;
}

const GITHUB_DATA = 'https://raw.githubusercontent.com/xboredgaming/claude-usage/main/data.json';
const LOCAL_API = '/api/usage';

async function fetchUsage() {
  // Try GitHub first — works from anywhere without the PC
  try {
    const res = await fetch(GITHUB_DATA + '?_=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      return { ...data, _source: 'cloud' };
    }
  } catch {}

  // Fall back to local server — works on same WiFi when PC is on
  const res = await fetch(LOCAL_API);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { ...data, _source: 'local' };
}

async function doRefresh() {
  document.getElementById('root').innerHTML = '<div class="loading">Loading...</div>';
  try {
    const data = await fetchUsage();
    localStorage.setItem('lastUsage', JSON.stringify(data));
    renderDashboard(data, false);
  } catch (err) {
    const cached = localStorage.getItem('lastUsage');
    if (cached) {
      renderDashboard(JSON.parse(cached), true);
    } else {
      renderError(err.message);
    }
  }
}

// Boot
doRefresh();

// Auto-refresh every 5 minutes
setInterval(doRefresh, 5 * 60 * 1000);
