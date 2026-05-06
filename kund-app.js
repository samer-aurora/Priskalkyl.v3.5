// ============================================================
// SolarCPQ — Kundportal Application Logic v3.5
// Aurora Energy Group AB
// Kund: Kalmar VVS & Elmontage AB
//
// Beroenden:
// - core.js (DB, Pricing, Utils, BrandConfig)
// - firebase.js (CloudDB, FirebaseAuth) — importeras i kund.html
// ============================================================

/* ════════════════════════════════════════════════════════════
   AUTH MODULE
   Hanterar Firebase Authentication-flödet
════════════════════════════════════════════════════════════ */
window.Auth = {
  currentUser: null,
  _initialAuthChecked: false,

  async init() {
    // Säkerhetstimeout: om Firebase inte svarar inom 5s, visa ändå login-skärmen
    const safetyTimeout = setTimeout(() => {
      if (!Auth._initialAuthChecked) {
        console.warn('Firebase auth timeout — visar login-skärm');
        Auth._initialAuthChecked = true;
        App.onLogout();
      }
    }, 5000);

    FirebaseAuth.onAuthChange(user => {
      Auth._initialAuthChecked = true;
      clearTimeout(safetyTimeout);

      if (user) {
        Auth.currentUser = user;
        App.onLogin(user);
      } else {
        Auth.currentUser = null;
        App.onLogout();
      }
    });
  },

  async login() {
    const email = document.getElementById('login-email').value.trim();
    const pw    = document.getElementById('login-password').value;
    const btn   = document.getElementById('login-btn');

    if (!email || !pw) {
      UI.showError('login-error', 'Ange e-post och lösenord.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Loggar in...';
    document.getElementById('login-error').classList.add('hidden');

    const res = await FirebaseAuth.login(email, pw);
    if (!res.success) {
      let msg = 'Fel e-post eller lösenord.';
      if (res.error === 'auth/too-many-requests')      msg = 'För många försök. Vänta en stund.';
      if (res.error === 'auth/network-request-failed') msg = 'Nätverksfel. Kontrollera anslutning.';
      if (res.error === 'auth/invalid-email')          msg = 'Ogiltig e-postadress.';
      if (res.error === 'auth/invalid-credential')     msg = 'Fel e-post eller lösenord.';
      if (res.error === 'auth/user-not-found')         msg = 'Ingen användare med denna e-post.';
      if (res.error === 'auth/wrong-password')         msg = 'Fel lösenord.';
      UI.showError('login-error', msg);
      btn.disabled = false;
      btn.textContent = 'Logga in';
    }
    // Vid success: onAuthStateChanged triggar App.onLogin
  },

  async logout() {
    if (!confirm('Vill du logga ut?')) return;
    await FirebaseAuth.logout();
  }
};

/* ════════════════════════════════════════════════════════════
   APP MODULE
   Övergripande app-state och vy-hantering
════════════════════════════════════════════════════════════ */
window.App = {
  projects: [],
  filterStatus: 'all',
  filterOwner: 'all',       // Filter på projektägare
  currentUserName: '',      // Inloggad användares namn (auto-sätts på projektägare)
  _unsubProjects: null,

  onLogin(user) {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Visa användarinfo + spara namn globalt för auto-projektägare
    const name = user.displayName || user.email?.split('@')[0] || 'Kund';
    App.currentUserName = name;
    document.getElementById('user-name').textContent = name;
    document.getElementById('user-avatar').textContent = name[0].toUpperCase();

    // Realtime listener för alla projekt
    App._unsubProjects = CloudDB.onProjectsChange(projects => {
      App.projects = projects;
      Dashboard.refresh();
    });

    // Initiera kalkylatorn med produktkatalogen
    CalcUI.init();
  },

  onLogout() {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');

    if (App._unsubProjects) App._unsubProjects();
    App.projects = [];
  },

  showView(view) {
    // Dölj alla vyer
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    ['nav-dashboard','nav-calc','mob-nav-dashboard','mob-nav-calc'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });

    document.getElementById(`view-${view}`)?.classList.add('active');

    if (view === 'dashboard') {
      document.getElementById('nav-dashboard')?.classList.add('active');
      document.getElementById('mob-nav-dashboard')?.classList.add('active');
    } else if (view === 'calculator') {
      document.getElementById('nav-calc')?.classList.add('active');
      document.getElementById('mob-nav-calc')?.classList.add('active');
    }
  },

  showDetail(id) {
    const project = App.projects.find(p => p.projectId === id);
    if (project) {
      DetailView.render(project);
      App.showView('detail');
    }
  },

  async deleteProject(id, name) {
    // Dubbel bekräftelse
    const first = confirm(`Vill du radera projektet "${name}"?\n\nDetta går inte att ångra.`);
    if (!first) return;
    const second = confirm(`⚠️ SISTA VARNINGEN\n\nÄr du helt säker på att du vill radera "${name}" permanent?`);
    if (!second) return;

    const ok = await CloudDB.deleteProject(id);
    if (ok) {
      UI.toast(`"${name}" raderat`, 'success');
      App.showView('dashboard');
    } else {
      UI.toast('Kunde inte radera projektet', 'error');
    }
  }
};

/* ════════════════════════════════════════════════════════════
   DASHBOARD MODULE
   Statistik, filter och projektkort
════════════════════════════════════════════════════════════ */
window.Dashboard = {
  refresh() {
    Dashboard._renderStats();
    Dashboard._renderFilters();
    Dashboard._renderProjects();
  },

  _renderStats() {
    const all  = App.projects;
    const won  = all.filter(p => p.status === 'won');
    const lost = all.filter(p => p.status === 'lost');
    const totalRev    = won.reduce((s, p) => s + (p.financials?.revenueExVat || 0), 0);
    const totalProfit = won.reduce((s, p) => s + (p.customerProfit || 0), 0);
    const avgProfit   = won.length ? Math.round(totalProfit / won.length) : 0;
    const winRate     = (won.length && all.length) ? Math.round(won.length / all.length * 100) : 0;

    document.getElementById('stats-grid').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Totalt</div>
        <div class="stat-value">${all.length}</div>
        <div class="stat-sub">projekt</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Vunna</div>
        <div class="stat-value" style="color:var(--green)">${won.length}</div>
        <div class="stat-sub">${winRate}% vinstrate</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Omsättning</div>
        <div class="stat-value">${UI.fmt(totalRev)}</div>
        <div class="stat-sub">vunna projekt</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Din vinst</div>
        <div class="stat-value" style="color:var(--accent)">${UI.fmt(totalProfit)}</div>
        <div class="stat-sub">~${UI.fmt(avgProfit)} / projekt</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Förlorade</div>
        <div class="stat-value" style="color:var(--red)">${lost.length}</div>
        <div class="stat-sub">projekt</div>
      </div>`;
  },

  _renderFilters() {
    const statuses = [
      { k: 'all',      l: 'Alla' },
      { k: 'draft',    l: 'Skapade' },
      { k: 'sent',     l: 'Skickade' },
      { k: 'won',      l: 'Vunna' },
      { k: 'lost',     l: 'Förlorade' },
      { k: 'archived', l: 'Arkiverade' }
    ];

    // Unika projektägare för filter
    const owners = [...new Set(App.projects.map(p => p.projectOwner).filter(Boolean))].sort();

    document.getElementById('filter-pills').innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:${owners.length > 1 ? '8' : '0'}px">
        ${statuses.map(s => {
          const count = s.k === 'all' ? App.projects.length : App.projects.filter(p => p.status === s.k).length;
          return `<button class="filter-pill ${App.filterStatus === s.k ? 'active' : ''}"
            onclick="App.filterStatus='${s.k}';Dashboard.refresh()">
            ${s.l} <span style="opacity:.6;font-size:10px;margin-left:4px">${count}</span>
          </button>`;
        }).join('')}
      </div>
      ${owners.length > 1 ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px">Säljare:</span>
        <button class="filter-pill ${App.filterOwner === 'all' ? 'active' : ''}"
          onclick="App.filterOwner='all';Dashboard.refresh()">Alla</button>
        ${owners.map(o => `<button class="filter-pill ${App.filterOwner === o ? 'active' : ''}"
          onclick="App.filterOwner='${o}';Dashboard.refresh()">${o}</button>`).join('')}
      </div>` : ''}`;
  },

  _renderProjects() {
    let filtered = App.filterStatus === 'all'
      ? App.projects
      : App.projects.filter(p => p.status === App.filterStatus);

    // Filter på projektägare
    if (App.filterOwner !== 'all') {
      filtered = filtered.filter(p => p.projectOwner === App.filterOwner);
    }

    if (!filtered.length) {
      document.getElementById('projects-grid').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔆</div>
          <h3>Inga projekt ännu</h3>
          <p>Skapa din första offert med knappen ovan.</p>
        </div>`;
      return;
    }

    document.getElementById('projects-grid').innerHTML = filtered.map(p => {
      const si    = UI.statusInfo(p.status);
      const flow  = p.installFlow || {};
      const steps = DetailView._getSteps(p.scenario);
      const done  = steps.filter(s => flow[s]).length;
      const prog  = Math.round(done / steps.length * 100);
      const hasInv  = p.admin?.faktura_skickad;
      const invPaid = p.admin?.faktura_betald;

      return `
      <div class="project-card" onclick="App.showDetail('${p.projectId}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div style="min-width:0;flex:1">
            <div class="project-name">${UI.escape(p.projectName) || 'Namnlöst projekt'}</div>
            <div class="project-customer">${UI.escape(p.customer?.name) || '—'}</div>
            ${p.customer?.address ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">📍 ${UI.escape(p.customer.address)}${p.customer.city ? ', ' + UI.escape(p.customer.city) : ''}</div>` : ''}
            ${p.projectOwner ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:1px">👤 ${UI.escape(p.projectOwner)}</div>` : ''}
          </div>
          <span class="badge badge-${si.cls}" style="margin-left:8px;flex-shrink:0">${si.label}</span>
        </div>
        <div class="project-amount">
          ${UI.fmt(p.financials?.revenueExVat || 0)}
          <span style="font-size:13px;color:var(--text-muted)">ex moms</span>
        </div>
        <div class="project-profit">Din vinst: ${UI.fmt(p.customerProfit || 0)}</div>
        ${p.status === 'won' ? `
        <div style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:11px;color:var(--text-muted)">Installation</span>
            <span style="font-size:11px;color:var(--text-secondary)">${done}/${steps.length}</span>
          </div>
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${prog}%"></div></div>
        </div>` : ''}
        <div class="project-footer">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${p.scenario ? `<span class="badge badge-muted" style="font-size:10px">${Utils.scenarioLabel(p.scenario)}</span>` : ''}
            ${hasInv ? `<span class="invoice-badge ${invPaid ? 'invoice-paid' : 'invoice-pending'}">${invPaid ? '✓ Betald' : '⏳ Faktura'}</span>` : ''}
          </div>
          <span class="project-date">${UI.formatDate(p.updatedAt)}</span>
        </div>
        <div class="project-actions" onclick="event.stopPropagation()">
          <button class="btn btn-secondary btn-sm" onclick="App.showDetail('${p.projectId}')">Detaljer</button>
          <button class="btn btn-secondary btn-sm" onclick="CalcUI.editProject('${p.projectId}')">✏️ Redigera</button>
          <button class="btn btn-secondary btn-sm" style="color:var(--red);border-color:var(--red-border)"
            onclick="App.deleteProject('${p.projectId}','${UI.escape(p.projectName||'Namnlöst')}')">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }
};

/* ════════════════════════════════════════════════════════════
   DETAIL VIEW MODULE
   Projektdetaljvy med auto-spara, installationsflöde, ändringshistorik
════════════════════════════════════════════════════════════ */
window.DetailView = {
  pid: null,
  _saveTimer: null,
  _unsub: null,

  render(project) {
    DetailView.pid = project.projectId;

    // Stoppa tidigare lyssnare
    if (DetailView._unsub) DetailView._unsub();

    // Live-listener för detta projekt
    DetailView._unsub = CloudDB.onProjectChange(project.projectId, updated => {
      DetailView._draw(updated);
    });

    DetailView._draw(project);
  },

  _draw(p) {
    const flow  = p.installFlow || {};
    const admin = p.admin || {};
    const cl    = p.changelog || [];
    const prods = p.products || [];

    const statusOpts = ['draft','sent','won','lost','archived'].map(s => {
      const { label } = UI.statusInfo(s);
      return `<option value="${s}"${p.status === s ? ' selected' : ''}>${label}</option>`;
    }).join('');

    document.getElementById('detail-content').innerHTML = `
    <div class="detail-nav">
      <button class="detail-back-btn" onclick="App.showView('dashboard');Dashboard.refresh()">
        ← Mina projekt
      </button>
      <div style="flex:1">
        <input class="detail-title-input" value="${UI.escape(p.projectName || '')}"
          placeholder="Projektnamn"
          onchange="DetailView.save({projectName:this.value})">
      </div>
      <button class="btn btn-secondary btn-sm" onclick="CalcUI.editProject('${p.projectId}')">
        ✏️ Kalkylator
      </button>
    </div>

    <div class="detail-grid">
      <!-- Vänster kolumn -->
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <div class="card-header"><span class="card-title">👤 Kunduppgifter</span></div>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${DetailView._cf(p, 'customer.name',    'Namn')}
            ${DetailView._cf(p, 'customer.email',   'E-post', 'email')}
            ${DetailView._cf(p, 'customer.phone',   'Telefon', 'tel')}
            ${DetailView._cf(p, 'customer.address', 'Adress')}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              ${DetailView._cf(p, 'customer.zip',  'Postnr')}
              ${DetailView._cf(p, 'customer.city', 'Stad')}
            </div>
            ${DetailView._cf(p, 'customer.ssn1',   'Personnummer ägare 1')}
            ${DetailView._cf(p, 'customer.ssn2',   'Personnummer ägare 2')}
            ${DetailView._cf(p, 'projectOwner',    'Projektägare (säljare)')}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">📋 Projektstatus</span></div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-select" onchange="DetailView.save({status:this.value})">
                ${statusOpts}
              </select>
            </div>
            ${DetailView._df(p, 'wantedDelivery',    'Önskat leveransdatum')}
            ${DetailView._df(p, 'wantedInstallDate', 'UE önskat installationsdatum')}
          </div>
        </div>

        ${prods.length ? `
        <div class="card">
          <div class="card-header"><span class="card-title">📦 Produktsammanfattning</span></div>
          <table class="product-table">
            <thead>
              <tr>
                <th>Produkt</th>
                <th style="text-align:center">Antal</th>
                <th style="text-align:right">Totalt ex moms</th>
              </tr>
            </thead>
            <tbody>
              ${prods.map(pr => `
                <tr>
                  <td>${UI.escape(pr.name)}</td>
                  <td style="text-align:center">${pr.qty}</td>
                  <td class="amount">${UI.fmt(pr.salesPrice * pr.qty)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </div>

      <!-- Höger kolumn -->
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <div class="card-header"><span class="card-title">🔧 Installationsflöde</span></div>
          <div class="install-flow">
            ${DetailView._getSteps(p.scenario).map(k => {
              const done = !!flow[k];
              return `<div class="install-step ${done ? 'done' : ''}" onclick="DetailView.toggleStep('${k}')">
                <div class="install-step-check">${done ? '✓' : ''}</div>
                <span class="install-step-label">${UI.stepLabel(k)}</span>
              </div>`;
            }).join('')}
          </div>
          ${(admin.confirmed_delivery || admin.ue_confirmed || admin.faktura_skickad || admin.faktura_betald) ? `
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px">
            ${admin.confirmed_delivery ? `<div class="info-row"><span class="info-row-label">✅ Bekräftat leverans</span><span style="font-weight:600">${UI.formatDate(admin.confirmed_delivery)}</span></div>` : ''}
            ${admin.ue_confirmed       ? `<div class="info-row"><span class="info-row-label">✅ UE bekräftat</span><span style="font-weight:600">${UI.formatDate(admin.ue_confirmed)}</span></div>` : ''}
            ${admin.faktura_skickad    ? `<div class="info-row"><span class="info-row-label">📄 Faktura skickad</span><span style="font-weight:600">${UI.formatDate(admin.faktura_datum)}</span></div>` : ''}
            ${admin.faktura_betald     ? `<div class="info-row"><span class="info-row-label">✅ Faktura betald</span><span class="info-green">Betald</span></div>` : ''}
          </div>` : ''}
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">💰 Ekonomi</span></div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div class="summary-row">
              <span class="summary-label">Totalt ex moms</span>
              <span class="summary-value">${UI.fmt(p.financials?.revenueExVat || 0)}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Moms 25%</span>
              <span class="summary-value">${UI.fmt((p.financials?.revenueExVat || 0) * 0.25)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
              <span style="font-weight:700;color:var(--text-primary)">Inkl moms</span>
              <span style="font-weight:700;font-size:16px;color:var(--text-primary)">${UI.fmt((p.financials?.revenueExVat || 0) * 1.25)}</span>
            </div>
            <div class="summary-row">
              <span style="color:var(--green)">Din vinst (påslag)</span>
              <span style="color:var(--green);font-weight:700">${UI.fmt(p.customerProfit || 0)}</span>
            </div>
          </div>
        </div>

        ${cl.length ? `
        <div class="card">
          <div class="card-header">
            <span class="card-title">🕐 Ändringshistorik</span>
            <span style="font-size:11px;color:var(--text-muted)">${Math.min(cl.length, 30)} poster</span>
          </div>
          <div class="changelog-list">
            ${cl.slice(0, 30).reverse().map(c => `
              <div class="changelog-item">
                <div class="changelog-dot"></div>
                <span class="changelog-text">${UI.escape(c.action)}</span>
                <span class="changelog-time">${UI.formatDate(c.timestamp)}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>`;
  },

  // Customer field helper
  _cf(p, path, label, type = 'text') {
    const val = path.split('.').reduce((o, k) => o?.[k], p) || '';
    return `<div class="form-group">
      <label class="form-label">${label}</label>
      <input type="${type}" class="form-input" value="${UI.escape(val)}" placeholder="${label}"
        onchange="DetailView.saveNested('${path}', this.value)">
    </div>`;
  },

  // Date field helper
  _df(p, key, label) {
    return `<div class="form-group">
      <label class="form-label">${label}</label>
      <input type="date" class="form-input" value="${p[key] || ''}"
        onchange="DetailView.save({'${key}': this.value})">
    </div>`;
  },

  // Auto-spara med debounce 1.5s (per spec)
  save(changes) {
    clearTimeout(DetailView._saveTimer);
    DetailView._saveTimer = setTimeout(async () => {
      const proj = App.projects.find(p => p.projectId === DetailView.pid);
      const action = `Uppgift uppdaterad: ${Object.keys(changes).join(', ')}`;
      const cl = [
        ...(proj?.changelog || []),
        { action, timestamp: new Date().toISOString() }
      ].slice(-30);

      const ok = await CloudDB.updateProject(DetailView.pid, { ...changes, changelog: cl });
      if (ok) UI.toast('Sparad', 'success');
      else UI.toast('Fel vid sparning', 'error');
    }, 1500);
  },

  // Spara nested fält som customer.name etc.
  saveNested(path, value) {
    const parts = path.split('.');
    if (parts.length === 2) {
      const proj = App.projects.find(p => p.projectId === DetailView.pid);
      const changes = { [parts[0]]: { ...(proj?.[parts[0]] || {}), [parts[1]]: value } };
      DetailView.save(changes);
    } else {
      DetailView.save({ [path]: value });
    }
  },

  // Returnerar rätt steg beroende på scenario
  _getSteps(scenario) {
    const base = ['foranmalan', 'medgivande', 'material_levererat', 'el_installation'];
    if (scenario === 'solar' || scenario === 'hybrid') {
      return [...base, 'sol_installation', 'fardiganmalan', 'driftsattning'];
    }
    return [...base, 'fardiganmalan', 'driftsattning'];
  },

  async toggleStep(key) {
    const proj = App.projects.find(p => p.projectId === DetailView.pid);
    if (!proj) return;
    const flow = { ...(proj.installFlow || {}) };
    flow[key] = !flow[key];
    const cl = [
      ...(proj.changelog || []),
      { action: `${UI.stepLabel(key)} ${flow[key] ? 'ibockad' : 'avbockad'}`, timestamp: new Date().toISOString() }
    ].slice(-30);
    await CloudDB.updateProject(DetailView.pid, { installFlow: flow, changelog: cl });
    UI.toast(`${UI.stepLabel(key)} ${flow[key] ? 'klar' : 'avmarkerad'}`, 'success');
  }
};

/* ════════════════════════════════════════════════════════════
   CALCULATOR UI MODULE
   Hela kalkylatorn med 11 steg, brand/scenario, beräkningar
════════════════════════════════════════════════════════════ */
window.CalcUI = {
  s: null,                  // current state
  cat: null,                // produktkatalog (från core.js)
  activeStep: 1,
  _lastResult: null,        // sparas för saveProject

  // Default state — används vid Ny offert
  _defaultState() {
    return {
      projectId: null,
      projectName: 'Ny offert ' + new Date().toLocaleDateString('sv-SE'),
      projectOwner: App.currentUserName || '',
      customer: {},
      scenario: 'battery',          // battery | solar | hybrid
      brand: 'emaldo',              // emaldo | solis_dyness | enphase | huawei
      // Battery
      emaldoExtraModules: 0,
      enphaseBatteryQty: 1,
      dynessBatteryModules: 3,
      selectedInverter: null,
      // Solar
      panelId: 'pan_001',
      panelQty: 6,
      mountId: 'mnt_001',
      ue: false,
      dcCableExtra: 0,
      gravning: false,
      gravningMeter: 0,
      // Enphase
      useCombinerBox: false,
      pedestalQty: 0,
      // Costs
      eljobb_bat: 0,
      elmaterial_bat: 0,
      eljobb_sol: 0,
      elmaterial_sol: 0,
      // Profit
      profitType: 'percent',
      profitPercent: 15,
      profitFixed: 0,
      // Return
      elspotPrice: 1.9,
      // Gridreward
      gridrewardType: 'rorlig',     // rorlig | fast
      gridrewardElomrade: 'SE3'     // SE3 | SE4
    };
  },

  init() {
    const state = DB.load();
    CalcUI.cat = state.products;
    CalcUI.s = CalcUI._defaultState();
    CalcUI.build();
    CalcUI.compute();
  },

  newProject() {
    CalcUI.s = CalcUI._defaultState();
    CalcUI.activeStep = 1;
    CalcUI.build();
    CalcUI.compute();
  },

  editProject(id) {
    const proj = App.projects.find(p => p.projectId === id);
    if (proj?.calcState) {
      CalcUI.s = { ...proj.calcState };
    } else {
      CalcUI.s = CalcUI._defaultState();
      CalcUI.s.projectId = id;
      if (proj) {
        CalcUI.s.projectName  = proj.projectName  || '';
        CalcUI.s.customer     = proj.customer     || {};
        CalcUI.s.projectOwner = proj.projectOwner || '';
      }
    }
    CalcUI.activeStep = 1;
    CalcUI.build();
    CalcUI.compute();
    App.showView('calculator');
  },

  // ── BUILD STEPS ─────────────────────────────────────────────
  build() {
    const s = CalcUI.s;
    const isBat = s.scenario !== 'solar';
    const isSol = s.scenario !== 'battery';

    const steps = [
      { id: 1, title: 'Systemtyp',         sum: Utils.scenarioLabel(s.scenario),                           html: CalcUI._sScenario() },
      { id: 2, title: 'Systemval',          sum: s.brand ? Utils.brandLabel(s.brand) : '–',                 html: CalcUI._sBrand() },
      isBat && { id: 3, title: 'Batteri',  sum: CalcUI._battSum(),                                         html: CalcUI._sBattery() },
      isSol && { id: 4, title: 'Solceller', sum: `${s.panelQty} paneler`,                                   html: CalcUI._sSolar() },
      { id: 5, title: 'Elkostnader',        sum: UI.fmt((s.eljobb_bat||0)+(s.elmaterial_bat||0)+(s.eljobb_sol||0)+(s.elmaterial_sol||0)), html: CalcUI._sEl() },
      isSol && { id: 6, title: 'Underentreprenad', sum: s.ue ? 'Ja' : 'Nej',                               html: CalcUI._sUE() },
      { id: 7, title: 'Vinstpåslag',        sum: s.profitType === 'percent' ? `${s.profitPercent}%` : UI.fmt(s.profitFixed), html: CalcUI._sProfit() },
      isSol && { id: 8, title: 'Avkastning', sum: `${s.elspotPrice} kr/kWh`,                               html: CalcUI._sAvk() },
      s.brand === 'emaldo'  && { id: 9,  title: 'Gridreward',     sum: s.gridrewardType === 'fast' ? 'Låst 3 år' : 'Rörlig', html: CalcUI._sGridreward() },
      s.brand === 'enphase' && { id: 10, title: 'Enphase tillval', sum: s.useCombinerBox ? 'Combiner Box' : 'Standard',      html: CalcUI._sEnphase() },
      { id: 11, title: 'Projektinfo',       sum: s.customer?.name || '–',                                   html: CalcUI._sInfo() }
    ].filter(Boolean);

    document.getElementById('calc-steps-container').innerHTML = steps.map(st => `
      <div class="calc-step ${CalcUI.activeStep === st.id ? 'active' : ''}">
        <div class="calc-step-header" onclick="CalcUI.toggleStep(${st.id})">
          <div class="step-num">${st.id}</div>
          <div style="flex:1">
            <div class="step-title">${st.title}</div>
            <div class="step-summary">${st.sum}</div>
          </div>
          <span class="step-chevron">›</span>
        </div>
        ${CalcUI.activeStep === st.id ? `<div class="calc-step-body">${st.html}</div>` : ''}
      </div>`).join('');

    // Sidebar header
    document.getElementById('sidebar-project-name').textContent = s.projectName || 'Ny offert';
    document.getElementById('sidebar-customer-name').textContent = s.customer?.name || 'Ingen kund vald';
  },

  toggleStep(id) {
    CalcUI.activeStep = CalcUI.activeStep === id ? null : id;
    CalcUI.build();
  },

  // ── STEP HTML BUILDERS ─────────────────────────────────────
  _sScenario() {
    const s = CalcUI.s;
    const items = [
      ['battery', '🔋', 'Enbart batteri'],
      ['solar',   '☀️', 'Enbart sol'],
      ['hybrid',  '⚡', 'Hybrid']
    ];
    return `<div class="scenario-grid">
      ${items.map(([k, ic, lb]) => `
        <button class="scenario-btn ${s.scenario === k ? 'active' : ''}" onclick="CalcUI.setScenario('${k}')">
          <div class="scenario-icon">${ic}</div>
          <div class="scenario-label">${lb}</div>
        </button>`).join('')}
    </div>`;
  },

  _sBrand() {
    const s = CalcUI.s;
    const brands = BrandConfig.getBrandsForScenario(s.scenario);
    return `<div class="brand-grid">
      ${brands.map(b => `
        <button class="brand-btn ${b.comingSoon ? 'coming-soon' : ''} ${s.brand === b.brand ? `sel-${b.cls}` : ''}"
          onclick="${b.comingSoon ? '' : `CalcUI.setBrand('${b.brand}')`}">
          <div class="brand-name">${b.name}</div>
          <div class="brand-desc">${b.comingSoon ? '🔜 Kommer snart' : b.desc}</div>
        </button>`).join('')}
    </div>`;
  },

  _sBattery() {
    const s = CalcUI.s, cat = CalcUI.cat;
    if (!s.brand) return '<div style="color:var(--text-muted);font-size:13px">Välj ett system först.</div>';

    if (s.brand === 'emaldo') {
      const bid = s.scenario === 'battery' ? 'bat_001' : 'bat_002';
      const b = cat.batteries.find(x => x.id === bid);
      return `
      <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;font-size:13px">
        <div style="font-weight:700;margin-bottom:4px;color:var(--text-primary)">✅ ${b?.name}</div>
        <div style="color:var(--text-secondary);font-size:12px">${b?.description}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Extra tilläggsmoduler (0–2)</label>
        <div class="qty-wrap">
          <button class="qty-btn" onclick="CalcUI.chg('emaldoExtraModules',-1,0,2)" ${s.emaldoExtraModules <= 0 ? 'disabled' : ''}>−</button>
          <div class="qty-val">${s.emaldoExtraModules}</div>
          <button class="qty-btn" onclick="CalcUI.chg('emaldoExtraModules',1,0,2)" ${s.emaldoExtraModules >= 2 ? 'disabled' : ''}>+</button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
          Totalt ${1 + s.emaldoExtraModules} batteri = ${((1 + s.emaldoExtraModules) * 5.12).toFixed(2)} kWh
        </div>
      </div>`;
    }

    if (s.brand === 'enphase') {
      return `<div class="form-group">
        <label class="form-label">Antal IQ Battery 5P (1–9)</label>
        <div class="qty-wrap">
          <button class="qty-btn" onclick="CalcUI.chg('enphaseBatteryQty',-1,1,9)" ${s.enphaseBatteryQty <= 1 ? 'disabled' : ''}>−</button>
          <div class="qty-val">${s.enphaseBatteryQty}</div>
          <button class="qty-btn" onclick="CalcUI.chg('enphaseBatteryQty',1,1,9)" ${s.enphaseBatteryQty >= 9 ? 'disabled' : ''}>+</button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${s.enphaseBatteryQty * 5} kWh totalt</div>
      </div>`;
    }

    if (s.brand === 'solis_dyness') {
      const invs = cat.inverters.filter(i => i.brand === 'solis');
      return `
      <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;font-size:13px">
        <div style="font-weight:700;color:var(--text-primary)">✅ Dyness BDU & Base (1 st, fast)</div>
        <div style="color:var(--text-secondary);font-size:12px">Baskonfiguration</div>
      </div>
      <div class="form-group">
        <label class="form-label">Dyness batterimoduler (3–15)</label>
        <div class="qty-wrap">
          <button class="qty-btn" onclick="CalcUI.chg('dynessBatteryModules',-1,3,15)" ${s.dynessBatteryModules <= 3 ? 'disabled' : ''}>−</button>
          <div class="qty-val">${s.dynessBatteryModules}</div>
          <button class="qty-btn" onclick="CalcUI.chg('dynessBatteryModules',1,3,15)" ${s.dynessBatteryModules >= 15 ? 'disabled' : ''}>+</button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${(s.dynessBatteryModules * 5.12).toFixed(2)} kWh totalt</div>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label class="form-label">Välj Solis-växelriktare</label>
        <div class="inverter-list">
          ${invs.map(inv => `
            <div class="inverter-option ${s.selectedInverter === inv.id ? 'selected' : ''}" onclick="CalcUI.set('selectedInverter','${inv.id}')">
              <div>
                <div class="inv-name">${inv.name}</div>
                <div class="inv-price">${inv.powerKw} kW</div>
              </div>
              <span style="font-weight:700;font-size:13px;color:var(--text-primary)">${UI.fmt(inv.salesPrice)}</span>
            </div>`).join('')}
        </div>
      </div>`;
    }
    return '';
  },

  _sSolar() {
    const s = CalcUI.s, cat = CalcUI.cat;
    const minP = BrandConfig.getMinPanels(s.brand, s.scenario);
    return `
    <div class="form-group">
      <label class="form-label">Solpanel</label>
      <select class="form-select" onchange="CalcUI.set('panelId',this.value)">
        ${cat.solarPanels.map(p => `
          <option value="${p.id}"${s.panelId === p.id ? ' selected' : ''}>${p.name} (${p.watt}W) — ${UI.fmt(p.salesPrice)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label class="form-label">Antal paneler (min ${minP})</label>
      <div class="qty-wrap">
        <button class="qty-btn" onclick="CalcUI.chg('panelQty',-1,${minP},100)" ${s.panelQty <= minP ? 'disabled' : ''}>−</button>
        <div class="qty-val">${s.panelQty}</div>
        <button class="qty-btn" onclick="CalcUI.chg('panelQty',1,${minP},100)">+</button>
      </div>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label class="form-label">Montagetyp</label>
      <select class="form-select" onchange="CalcUI.set('mountId',this.value)">
        ${cat.mounting.map(m => `
          <option value="${m.id}"${s.mountId === m.id ? ' selected' : ''}>${m.name} — ${UI.fmt(m.salesPrice)}/panel</option>`).join('')}
      </select>
    </div>`;
  },

  _sEl() {
    const s = CalcUI.s;
    const isBat = s.scenario !== 'solar';
    const isSol = s.scenario !== 'battery';
    let h = '';
    if (isBat) h += `
      <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">🔋 Batteri</div>
      <div class="form-group">
        <label class="form-label">Eljobb batteri (kr)</label>
        <input type="number" class="form-input" value="${s.eljobb_bat}" onchange="CalcUI.set('eljobb_bat',+this.value)" min="0">
      </div>
      <div class="form-group" style="margin-top:8px">
        <label class="form-label">Elmaterial batteri (kr)</label>
        <input type="number" class="form-input" value="${s.elmaterial_bat}" onchange="CalcUI.set('elmaterial_bat',+this.value)" min="0">
      </div>`;
    if (isSol) h += `
      <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-top:14px;margin-bottom:8px">☀️ Solceller</div>
      <div class="form-group">
        <label class="form-label">Eljobb sol (kr)</label>
        <input type="number" class="form-input" value="${s.eljobb_sol}" onchange="CalcUI.set('eljobb_sol',+this.value)" min="0">
      </div>
      <div class="form-group" style="margin-top:8px">
        <label class="form-label">Elmaterial sol (kr)</label>
        <input type="number" class="form-input" value="${s.elmaterial_sol}" onchange="CalcUI.set('elmaterial_sol',+this.value)" min="0">
      </div>`;
    return h;
  },

  _sUE() {
    const s = CalcUI.s;
    const ue = CalcUI.cat.ue[0];
    return `
    <label class="toggle-wrap">
      <div class="toggle">
        <input type="checkbox" ${s.ue ? 'checked' : ''} onchange="CalcUI.set('ue',this.checked)">
        <div class="toggle-slider"></div>
      </div>
      <span style="font-size:14px;font-weight:600;color:var(--text-primary)">UE solcellsmontage</span>
    </label>
    ${s.ue ? `
    <div style="margin-top:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);font-size:12px;color:var(--text-secondary)">
      ${ue.description}
      <div style="margin-top:8px;font-weight:600;color:var(--text-primary)">${UI.fmt(ue.salesPrice)} / panel</div>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label class="form-label">Extra DC-kabel (meter)</label>
      <input type="number" class="form-input" value="${s.dcCableExtra}" onchange="CalcUI.set('dcCableExtra',+this.value)" min="0">
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Startavgift: ${s.panelQty * 2}m (2m × paneler) ingår automatiskt</div>
    </div>
    <label class="toggle-wrap" style="margin-top:12px">
      <div class="toggle">
        <input type="checkbox" ${s.gravning ? 'checked' : ''} onchange="CalcUI.set('gravning',this.checked)">
        <div class="toggle-slider"></div>
      </div>
      <span style="font-size:13px;color:var(--text-primary)">Grävning (700 kr/m)</span>
    </label>
    ${s.gravning ? `
    <div class="form-group" style="margin-top:8px">
      <label class="form-label">Antal meter grävning</label>
      <input type="number" class="form-input" value="${s.gravningMeter}" onchange="CalcUI.set('gravningMeter',+this.value)" min="0">
    </div>` : ''}
    ` : ''}`;
  },

  _sProfit() {
    const s = CalcUI.s;
    return `
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn ${s.profitType === 'percent' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="CalcUI.set('profitType','percent')">Procent</button>
      <button class="btn ${s.profitType === 'fixed' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="CalcUI.set('profitType','fixed')">Fast summa</button>
    </div>
    ${s.profitType === 'percent' ? `
    <div class="form-group">
      <label class="form-label">Vinstpåslag (%)</label>
      <input type="number" class="form-input" value="${s.profitPercent}" onchange="CalcUI.set('profitPercent',+this.value)" min="0" max="200" step="0.5">
    </div>` : `
    <div class="form-group">
      <label class="form-label">Fast påslag (kr ex moms)</label>
      <input type="number" class="form-input" value="${s.profitFixed}" onchange="CalcUI.set('profitFixed',+this.value)" min="0" step="100">
    </div>`}
    <div style="margin-top:10px;padding:10px;background:var(--bg-input);border-radius:var(--radius-md);font-size:12px;color:var(--text-muted)">
      ℹ️ Påslaget ingår i priserna men visas INTE i PDF-exporten.
    </div>`;
  },

  _sAvk() {
    const s = CalcUI.s;
    return `<div class="form-group">
      <label class="form-label">Elpris (kr/kWh)</label>
      <input type="number" class="form-input" value="${s.elspotPrice}" onchange="CalcUI.set('elspotPrice',+this.value)" min="0.1" max="10" step="0.1">
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Standard: 1,90 kr/kWh (Kalmar)</div>
    </div>`;
  },

  _sGridreward() {
    const s = CalcUI.s;
    const nBat = 1 + s.emaldoExtraModules;
    const monthly = Pricing.emaldoAvkastning(s.gridrewardElomrade, s.gridrewardType, nBat);
    return `<div class="gridreward-panel">
      <div class="gridreward-title">⚡ Emaldo Gridreward</div>
      <div class="gridreward-opts">
        <button class="gridreward-opt ${s.gridrewardType === 'rorlig' ? 'active' : ''}" onclick="CalcUI.set('gridrewardType','rorlig')">Rörlig</button>
        <button class="gridreward-opt ${s.gridrewardType === 'fast' ? 'active' : ''}" onclick="CalcUI.set('gridrewardType','fast')">Låst 3 år</button>
      </div>
      <div class="gridreward-opts">
        <button class="gridreward-opt ${s.gridrewardElomrade === 'SE3' ? 'active' : ''}" onclick="CalcUI.set('gridrewardElomrade','SE3')">SE3</button>
        <button class="gridreward-opt ${s.gridrewardElomrade === 'SE4' ? 'active' : ''}" onclick="CalcUI.set('gridrewardElomrade','SE4')">SE4</button>
      </div>
      ${monthly !== null
        ? `<div class="gridreward-result">
            <div class="gridreward-amount">${UI.fmt(monthly)}/mån</div>
            <div class="gridreward-period">${UI.fmt(monthly * 12)}/år${s.gridrewardType === 'fast' ? ` · ${UI.fmt(monthly * 36)} totalt (3 år)` : ''}</div>
          </div>`
        : `<div style="padding:12px;background:var(--amber-bg);border-radius:var(--radius-md);color:var(--amber);font-size:12px;text-align:center">
            Ej tillgängligt för ${nBat} batteri i ${s.gridrewardElomrade}. Välj Rörligt istället.
          </div>`}
    </div>`;
  },

  _sEnphase() {
    const s = CalcUI.s;
    return `<div style="display:flex;flex-direction:column;gap:12px">
      <label class="toggle-wrap">
        <div class="toggle">
          <input type="checkbox" ${s.useCombinerBox ? 'checked' : ''} onchange="CalcUI.set('useCombinerBox',this.checked)">
          <div class="toggle-slider"></div>
        </div>
        <span style="font-size:14px;font-weight:600;color:var(--text-primary)">IQ Combiner Box</span>
      </label>
      ${s.useCombinerBox ? `
      <div style="padding:10px;background:var(--blue-bg);border-radius:var(--radius-md);font-size:12px;color:var(--text-secondary)">
        Ingår: Gateway, 2× IQ Relay, Comms Kit 2, 6× CT-klämmor, säkringar, jordfelsbrytare. Möjliggör framtida batteriutbyggnad.
      </div>` : ''}
      <div class="form-group">
        <label class="form-label">Pedestal (vid markmontage)</label>
        <div class="qty-wrap">
          <button class="qty-btn" onclick="CalcUI.chg('pedestalQty',-1,0,20)" ${s.pedestalQty <= 0 ? 'disabled' : ''}>−</button>
          <div class="qty-val">${s.pedestalQty}</div>
          <button class="qty-btn" onclick="CalcUI.chg('pedestalQty',1,0,20)">+</button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">En per batterimodul vid markmontage</div>
      </div>
    </div>`;
  },

  _sInfo() {
    const s = CalcUI.s;
    return `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="form-group">
        <label class="form-label">Projektnamn</label>
        <input type="text" class="form-input" value="${UI.escape(s.projectName)}" oninput="CalcUI.set('projectName',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">Projektägare</label>
        <input type="text" class="form-input" value="${UI.escape(s.projectOwner || '')}" oninput="CalcUI.set('projectOwner',this.value)" placeholder="Säljarens namn">
      </div>
      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label">Kundens namn</label>
        <input type="text" class="form-input" value="${UI.escape(s.customer?.name || '')}" oninput="CalcUI.setCustomer('name',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">E-post</label>
        <input type="email" class="form-input" value="${UI.escape(s.customer?.email || '')}" oninput="CalcUI.setCustomer('email',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">Telefon</label>
        <input type="tel" class="form-input" value="${UI.escape(s.customer?.phone || '')}" oninput="CalcUI.setCustomer('phone',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">Adress</label>
        <input type="text" class="form-input" value="${UI.escape(s.customer?.address || '')}" oninput="CalcUI.setCustomer('address',this.value)">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="form-group">
          <label class="form-label">Postnr</label>
          <input type="text" class="form-input" value="${UI.escape(s.customer?.zip || '')}" oninput="CalcUI.setCustomer('zip',this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">Stad</label>
          <input type="text" class="form-input" value="${UI.escape(s.customer?.city || '')}" oninput="CalcUI.setCustomer('city',this.value)">
        </div>
      </div>
      <button class="btn btn-primary w-full mt-3" onclick="CalcUI.saveProject()">💾 Spara projekt</button>
    </div>`;
  },

  _battSum() {
    const s = CalcUI.s;
    if (s.brand === 'emaldo')       return `${1 + s.emaldoExtraModules} batteri(er)`;
    if (s.brand === 'enphase')      return `${s.enphaseBatteryQty} × IQ 5P`;
    if (s.brand === 'solis_dyness') return `${s.dynessBatteryModules} moduler`;
    return '–';
  },

  // ── SETTERS ─────────────────────────────────────────────────
  set(k, v) {
    CalcUI.s[k] = v;
    CalcUI.build();
    CalcUI.compute();
  },

  setCustomer(k, v) {
    CalcUI.s.customer = { ...CalcUI.s.customer, [k]: v };
    CalcUI.build();
  },

  chg(k, delta, min, max) {
    CalcUI.s[k] = Math.max(min, Math.min(max, (CalcUI.s[k] || 0) + delta));
    CalcUI.build();
    CalcUI.compute();
  },

  setScenario(sc) {
    CalcUI.s.scenario = sc;
    CalcUI.s.brand = null;
    CalcUI.s.panelQty = 6;
    CalcUI.activeStep = 2;
    CalcUI.build();
    CalcUI.compute();
  },

  setBrand(brand) {
    CalcUI.s.brand = brand;
    const minP = BrandConfig.getMinPanels(brand, CalcUI.s.scenario);
    if (CalcUI.s.panelQty < minP) CalcUI.s.panelQty = minP;
    if (brand === 'solis_dyness' && !CalcUI.s.selectedInverter) {
      const inv = CalcUI.cat?.inverters?.find(i => i.brand === 'solis');
      if (inv) CalcUI.s.selectedInverter = inv.id;
    }
    CalcUI.activeStep = 3;
    CalcUI.build();
    CalcUI.compute();
  },

  // ── COMPUTE ENGINE ──────────────────────────────────────────
  compute() {
    const s = CalcUI.s, cat = CalcUI.cat;
    if (!cat) return;

    const items = [];
    const add = (name, qty, pp, sp, group) => {
      if (qty <= 0 || sp <= 0) return;
      items.push({ name, qty, purchasePrice: pp || 0, salesPrice: sp, group });
    };

    const isBat = s.scenario === 'battery' || s.scenario === 'hybrid';
    const isSol = s.scenario === 'solar'   || s.scenario === 'hybrid';

    // BATTERI
    if (isBat && s.brand) {
      if (s.brand === 'emaldo') {
        const bid = s.scenario === 'battery' ? 'bat_001' : 'bat_002';
        const b = cat.batteries.find(x => x.id === bid);
        if (b) add(b.name, 1, b.purchasePrice, b.salesPrice, 'battery');
        if (s.emaldoExtraModules > 0) {
          const m = cat.batteries.find(x => x.id === 'bat_005');
          if (m) add(m.name, s.emaldoExtraModules, m.purchasePrice, m.salesPrice, 'battery');
        }
      }

      if (s.brand === 'enphase') {
        const b = cat.batteries.find(x => x.id === 'bat_003');
        if (b) add(b.name, s.enphaseBatteryQty, b.purchasePrice, b.salesPrice, 'battery');
        Pricing.getEnphaseAddons(s.scenario, s.useCombinerBox).forEach(({ id, qty }) => {
          const a = cat.addons.find(x => x.id === id);
          if (a) add(a.name, qty, a.purchasePrice, a.salesPrice, 'addons');
        });
        if (s.pedestalQty > 0) {
          const ped = cat.addons.find(x => x.id === 'add_005');
          if (ped) add(ped.name, s.pedestalQty, ped.purchasePrice, ped.salesPrice, 'addons');
        }
      }

      if (s.brand === 'solis_dyness') {
        const base = cat.batteries.find(x => x.id === 'bat_004_base');
        if (base) add(base.name, 1, base.purchasePrice, base.salesPrice, 'battery');
        const mod = cat.batteries.find(x => x.id === 'bat_004_mod');
        if (mod) add(mod.name, s.dynessBatteryModules, mod.purchasePrice, mod.salesPrice, 'battery');
        if (s.selectedInverter) {
          const inv = cat.inverters.find(x => x.id === s.selectedInverter);
          if (inv) add(inv.name, 1, inv.purchasePrice, inv.salesPrice, 'inverter');
        }
        const sm = cat.addons.find(x => x.id === 'add_006');
        if (sm) add(sm.name, s.scenario === 'battery' ? 2 : 1, sm.purchasePrice, sm.salesPrice, 'addons');
      }

      if (s.eljobb_bat > 0)     add('Eljobb batteri',    1, s.eljobb_bat,     s.eljobb_bat,     'el_bat');
      if (s.elmaterial_bat > 0) add('Elmaterial batteri', 1, s.elmaterial_bat, s.elmaterial_bat, 'el_bat');
    }

    // SOL
    if (isSol && s.panelQty > 0) {
      const pan = cat.solarPanels.find(p => p.id === s.panelId);
      if (pan) add(pan.name, s.panelQty, pan.purchasePrice, pan.salesPrice, 'solar');
      const mnt = cat.mounting.find(m => m.id === s.mountId);
      if (mnt) add(mnt.name, s.panelQty, mnt.purchasePrice, mnt.salesPrice, 'solar');

      if (s.scenario === 'solar') {
        if (s.brand === 'solis_dyness' && s.selectedInverter) {
          const inv = cat.inverters.find(x => x.id === s.selectedInverter);
          if (inv) add(inv.name, 1, inv.purchasePrice, inv.salesPrice, 'inverter');
          const sm = cat.addons.find(x => x.id === 'add_006');
          if (sm) add(sm.name, 1, sm.purchasePrice, sm.salesPrice, 'addons');
        }
        if (s.brand === 'enphase') {
          const micro = cat.inverters.find(x => x.id === 'inv_010');
          if (micro) add(micro.name, s.panelQty, micro.purchasePrice, micro.salesPrice, 'inverter');
          Pricing.getEnphaseAddons('solar', s.useCombinerBox).forEach(({ id, qty }) => {
            const a = cat.addons.find(x => x.id === id);
            if (a) add(a.name, qty, a.purchasePrice, a.salesPrice, 'addons');
          });
        }
      }

      if (s.scenario === 'hybrid' && s.brand === 'enphase') {
        const micro = cat.inverters.find(x => x.id === 'inv_010');
        if (micro) add(micro.name, s.panelQty, micro.purchasePrice, micro.salesPrice, 'inverter');
      }

      if (s.ue) {
        const ue = cat.ue[0];
        if (ue) add(ue.name, s.panelQty, ue.purchasePrice, ue.salesPrice, 'ue');
        const dc = cat.addons.find(x => x.id === 'add_011');
        if (dc) {
          const totalM = (s.panelQty * 2) + (s.dcCableExtra || 0);
          if (totalM > 0) add(dc.name, totalM, dc.purchasePerMeter, dc.pricePerMeter, 'ue');
        }
        if (s.gravning && s.gravningMeter > 0) {
          const g = cat.addons.find(x => x.id === 'add_012');
          if (g) add(g.name, s.gravningMeter, g.purchasePerMeter, g.pricePerMeter, 'ue');
        }
      }

      if (s.eljobb_sol > 0)     add('Eljobb solceller',    1, s.eljobb_sol,     s.eljobb_sol,     'el_sol');
      if (s.elmaterial_sol > 0) add('Elmaterial solceller', 1, s.elmaterial_sol, s.elmaterial_sol, 'el_sol');
    }

    // FRAKT (auto per scenario)
    const fid = s.scenario === 'battery' ? 'add_013' : s.scenario === 'solar' ? 'add_014' : 'add_015';
    const fr = cat.addons.find(x => x.id === fid);
    if (fr) add(fr.name, 1, fr.purchasePrice, fr.salesPrice, 'frakt');

    // PROFIT (kundens påslag)
    const baseRev = items.reduce((a, i) => a + i.salesPrice * i.qty, 0);
    let profit = 0;
    if (s.profitType === 'percent' && s.profitPercent > 0) profit = baseRev * (s.profitPercent / 100);
    else if (s.profitType === 'fixed' && s.profitFixed > 0) profit = s.profitFixed;
    const revenueExVat  = baseRev + profit;
    const revenueIncVat = revenueExVat * 1.25;
    const cost = items.reduce((a, i) => a + i.purchasePrice * i.qty, 0);

    // SOLAR RETURN
    let ret = null;
    if (isSol && s.panelQty > 0) {
      const pan = cat.solarPanels.find(p => p.id === s.panelId);
      if (pan) {
        const kWp = (pan.watt * s.panelQty) / 1000;
        const kWhYear = Pricing.estimateProduction(kWp);
        ret = { kWp, kWhPerYear: kWhYear, krPerYear: Math.round(kWhYear * s.elspotPrice) };
      }
    }

    // Beräkna total batterikapacitet
    let totalBatKwh = 0;
    if (isBat && s.brand) {
      if (s.brand === 'emaldo')       totalBatKwh = (1 + s.emaldoExtraModules) * 5.12;
      if (s.brand === 'enphase')      totalBatKwh = s.enphaseBatteryQty * 5.0;
      if (s.brand === 'solis_dyness') totalBatKwh = s.dynessBatteryModules * 5.12;
    }

    CalcUI._lastResult = {
      lineItems: items, revenueExVat, revenueIncVat, cost,
      customerProfit: profit, solarReturn: ret,
      totalBatKwh, scenario: s.scenario, brand: s.brand
    };

    CalcUI.renderResult(items, revenueExVat, revenueIncVat, profit, ret);
  },

  // ── RENDER RESULT ───────────────────────────────────────────
  renderResult(items, revExVat, revIncVat, profit, ret) {
    const s = CalcUI.s;
    const isBat = s.scenario === 'battery' || s.scenario === 'hybrid';
    const isHyb = s.scenario === 'hybrid';
    const isSol = s.scenario === 'solar';

    const grp = (g) => items.filter(i => i.group === g);
    const tot = (arr) => arr.reduce((a, i) => a + i.salesPrice * i.qty, 0);
    const lines = (arr) => arr.map(i => `
      <div class="result-line">
        <div>
          <div class="result-line-label">${UI.escape(i.name)}</div>
          ${i.qty > 1 ? `<div class="result-line-sub">${i.qty} × ${UI.fmt(i.salesPrice)}</div>` : ''}
        </div>
        <div class="result-line-value">${UI.fmt(i.salesPrice * i.qty)}</div>
      </div>`).join('');

    let html = '';

    if (isHyb) {
      const bTot = tot([...grp('inverter'), ...grp('battery'), ...grp('addons'), ...grp('el_bat')]);
      const sTot = tot([...grp('solar'), ...grp('ue'), ...grp('el_sol')]);
      html += `<div class="result-cols">
        <div class="result-col">
          <div class="result-col-header">🔋 Batteri</div>
          <div class="result-col-body">
            ${lines(grp('inverter'))}${lines(grp('battery'))}${lines(grp('addons'))}
            ${grp('el_bat').length ? `<div class="divider"></div>${lines(grp('el_bat'))}` : ''}
            <div class="result-subtotal"><span>Delsumma batteri</span><span>${UI.fmt(bTot)}</span></div>
          </div>
        </div>
        <div class="result-col">
          <div class="result-col-header">☀️ Solceller</div>
          <div class="result-col-body">
            ${lines(grp('solar'))}
            ${grp('ue').length     ? `<div class="divider"></div>${lines(grp('ue'))}`     : ''}
            ${grp('el_sol').length ? `<div class="divider"></div>${lines(grp('el_sol'))}` : ''}
            <div class="result-subtotal"><span>Delsumma sol</span><span>${UI.fmt(sTot)}</span></div>
          </div>
        </div>
      </div>`;
    } else if (isBat) {
      const header = grp('inverter').length > 0 && s.brand === 'solis_dyness' ? '⚡ Växelriktare' : '🔋 Batteri';
      html += `<div class="result-col">
        <div class="result-col-header">${header}</div>
        <div class="result-col-body">
          ${lines(grp('inverter'))}${lines(grp('battery'))}${lines(grp('addons'))}
          ${grp('el_bat').length ? `<div class="divider"></div>${lines(grp('el_bat'))}` : ''}
        </div>
      </div>`;
    } else if (isSol) {
      const invHdr = s.brand === 'enphase' ? '⚡ Mikroväxelriktare' : '⚡ Växelriktare';
      html += `<div class="result-col" style="margin-bottom:12px">
        <div class="result-col-header">${invHdr}</div>
        <div class="result-col-body">${lines(grp('inverter'))}${lines(grp('addons'))}</div>
      </div>
      <div class="result-col" style="margin-bottom:12px">
        <div class="result-col-header">☀️ Solceller</div>
        <div class="result-col-body">
          ${lines(grp('solar'))}
          ${grp('ue').length     ? `<div class="divider"></div>${lines(grp('ue'))}`     : ''}
          ${grp('el_sol').length ? `<div class="divider"></div>${lines(grp('el_sol'))}` : ''}
        </div>
      </div>`;
    }

    if (grp('frakt').length) {
      html += `<div class="result-freight">
        <span style="color:var(--text-secondary)">🚚 ${grp('frakt')[0].name}</span>
        <span style="font-weight:600;color:var(--text-primary)">${UI.fmt(tot(grp('frakt')))}</span>
      </div>`;
    }

    if (ret) {
      const custom = s.elspotPrice !== 1.9;
      html += `<div class="info-box">
        <div class="info-box-title">☀️ Beräknad avkastning</div>
        <div class="info-row">
          <span class="info-row-label">Installerad effekt</span>
          <span style="font-weight:600;color:var(--text-primary)">${ret.kWp.toFixed(2)} kWp</span>
        </div>
        <div class="info-row">
          <span class="info-row-label">Årsproduktion (est.)</span>
          <span style="font-weight:600;color:var(--text-primary)">${ret.kWhPerYear.toLocaleString('sv-SE')} kWh/år</span>
        </div>
        <div class="info-row">
          <span class="info-row-label">Avkastning${custom ? ` (${s.elspotPrice} kr/kWh*)` : ''}</span>
          <span class="info-green">${UI.fmt(ret.krPerYear)}/år</span>
        </div>
        ${custom ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px">*Anpassat: ${s.elspotPrice} kr/kWh (standard 1,90 kr/kWh)</div>` : ''}
      </div>`;
    }

    // Gridreward — informationsblock (EJ produktrad, per spec §3.3)
    if (s.brand === 'emaldo') {
      const nBat = 1 + s.emaldoExtraModules;
      const monthly = Pricing.emaldoAvkastning(s.gridrewardElomrade, s.gridrewardType, nBat);
      if (monthly !== null) {
        html += `<div class="gridreward-panel">
          <div class="gridreward-title">⚡ Emaldo Gridreward — ${s.gridrewardType === 'fast' ? 'Låst 3 år' : 'Rörlig'} (${s.gridrewardElomrade})</div>
          <div class="gridreward-result">
            <div class="gridreward-amount">${UI.fmt(monthly)}/mån</div>
            <div class="gridreward-period">${UI.fmt(monthly * 12)}/år${s.gridrewardType === 'fast' ? ` · ${UI.fmt(monthly * 36)} totalt (3 år)` : ''}</div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px">ℹ️ Gridreward är informationsuppgift — ingår ej i offerten.</div>
        </div>`;
      }
    }

    // Beräkna grönt avdrag per scenario
    const isBatScen = s.scenario === 'battery' || s.scenario === 'hybrid';
    const isSolScen = s.scenario === 'solar'   || s.scenario === 'hybrid';
    const isHybScen = s.scenario === 'hybrid';

    // Grönt avdrag: sol 14.55%, batteri 48.5% (på inkl moms-belopp)
    // Vid hybrid: beräkna per delsumma
    const batItems  = items.filter(i => ['battery','inverter','addons','el_bat'].includes(i.group));
    const solItems2 = items.filter(i => ['solar','ue','el_sol'].includes(i.group));
    const batRevEx  = batItems.reduce((a,i) => a + i.salesPrice * i.qty, 0);
    const solRevEx  = solItems2.reduce((a,i) => a + i.salesPrice * i.qty, 0);
    const batIncVat = batRevEx * 1.25;
    const solIncVat = solRevEx * 1.25;
    const batAvdrag = Math.round(batIncVat * 0.485);
    const solAvdrag = Math.round(solIncVat * 0.1455);

    // Total kWh
    const r = CalcUI._lastResult;
    const kWhLine = (r?.totalBatKwh > 0 && isBatScen)
      ? `<div class="summary-row" style="margin-top:4px">
          <span class="summary-label">⚡ Totalt batteri</span>
          <span class="summary-value">${r.totalBatKwh.toFixed(2)} kWh</span>
        </div>`
      : '';

    // Avdrags-block
    let avdragHtml = '';
    if (isBatScen || isSolScen) {
      avdragHtml = `<div style="margin-top:14px;padding:14px;background:var(--green-bg);border:1px solid var(--green-border);border-radius:var(--radius-md)">
        <div style="font-size:12px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">🌱 Grönt avdrag (Skattereduktion)</div>`;

      if (isBatScen && batRevEx > 0) {
        avdragHtml += `
        <div style="margin-bottom:${isSolScen ? '10' : '0'}px">
          ${isHybScen ? `<div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">🔋 BATTERI (48,5% på inkl moms)</div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:3px">
            <span>Pris inkl moms</span><span>${UI.fmt(batIncVat)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--green);margin-bottom:3px">
            <span>− Grönt avdrag 48,5%</span><span>− ${UI.fmt(batAvdrag)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:var(--text-primary);border-top:1px solid var(--green-border);padding-top:6px;margin-top:4px">
            <span>Pris efter avdrag</span><span style="color:var(--green)">${UI.fmt(batIncVat - batAvdrag)}</span>
          </div>
        </div>`;
      }

      if (isSolScen && solRevEx > 0) {
        avdragHtml += `
        <div>
          ${isHybScen ? `<div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">☀️ SOLCELLER (14,55% på inkl moms)</div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:3px">
            <span>Pris inkl moms</span><span>${UI.fmt(solIncVat)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--green);margin-bottom:3px">
            <span>− Grönt avdrag 14,55%</span><span>− ${UI.fmt(solAvdrag)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:var(--text-primary);border-top:1px solid var(--green-border);padding-top:6px;margin-top:4px">
            <span>Pris efter avdrag</span><span style="color:var(--green)">${UI.fmt(solIncVat - solAvdrag)}</span>
          </div>
        </div>`;
      }

      avdragHtml += `<div style="font-size:10px;color:var(--text-muted);margin-top:8px">* Avdraget söks via skattedeklarationen. Villkor gäller.</div>
      </div>`;
    }

    // Sammanfattningsbox
    html += `<div class="summary-box">
      <div class="summary-row">
        <span class="summary-label">Produkter & tjänster ex moms</span>
        <span class="summary-value">${UI.fmt(revExVat - profit)}</span>
      </div>
      ${profit > 0 ? `<div class="summary-row">
        <span class="summary-label" style="color:var(--green)">Ditt påslag</span>
        <span class="summary-value" style="color:var(--green)">${UI.fmt(profit)}</span>
      </div>` : ''}
      ${kWhLine}
      <div class="summary-total-row">
        <span class="summary-total-label">Totalt <span style="font-size:12px;font-weight:400;color:var(--text-muted)">ex moms</span></span>
        <span class="summary-total-value">${UI.fmt(revExVat)}</span>
      </div>
      <div class="summary-row" style="margin-top:8px">
        <span class="summary-vat">Inkl moms (25%)</span>
        <span class="summary-vat" style="font-weight:600">${UI.fmt(revIncVat)}</span>
      </div>
      ${avdragHtml}
      <div class="summary-actions">
        <button class="btn btn-primary" onclick="CalcUI.saveProject()">💾 Spara projekt</button>
        <button class="btn btn-secondary" onclick="CalcUI.exportPDF()">📄 PDF</button>
        <button class="btn btn-secondary" onclick="CalcUI.shareOffer()">🔗 Dela offert</button>
      </div>
    </div>`;

    document.getElementById('result-panel').innerHTML = html;
  },

  // ── SAVE PROJECT ────────────────────────────────────────────
  async saveProject() {
    const s = CalcUI.s;
    const r = CalcUI._lastResult;
    if (!r) {
      UI.toast('Beräkna offert först', 'error');
      return;
    }

    const products = r.lineItems.map(i => ({
      name: i.name,
      qty: i.qty,
      salesPrice: i.salesPrice,
      purchasePrice: i.purchasePrice,
      group: i.group
    }));

    const existing = s.projectId ? App.projects.find(p => p.projectId === s.projectId) : null;

    const data = {
      projectId: s.projectId || crypto.randomUUID(),
      projectName: s.projectName || 'Namnlös offert',
      projectOwner: s.projectOwner || '',
      status: existing?.status || 'draft',
      scenario: s.scenario,
      brand: s.brand,
      customer: s.customer || {},
      calcState: { ...s },
      products,
      financials: {
        revenueExVat: r.revenueExVat,
        revenueIncVat: r.revenueIncVat,
        cost: r.cost
      },
      customerProfit: r.customerProfit,
      solarReturn: r.solarReturn,
      changelog: [
        ...(existing?.changelog || []),
        { action: existing ? 'Kalkyl uppdaterad' : 'Projekt skapat', timestamp: new Date().toISOString() }
      ].slice(-30),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      installFlow: existing?.installFlow || {},
      admin: existing?.admin || {}
    };

    CalcUI.s.projectId = data.projectId;
    const id = await CloudDB.saveProject(data);
    if (id) UI.toast('✅ Projekt sparat!', 'success');
    else UI.toast('Fel vid sparning. Kontrollera anslutning.', 'error');
  },

  exportPDF() {
    const r = CalcUI._lastResult;
    if (!r || !r.lineItems.length) { UI.toast('Beräkna en offert först', 'error'); return; }
    PDF.generate(CalcUI.s, r);
  },

  shareOffer() {
    if (!CalcUI.s.projectId) {
      UI.toast('Spara projektet först', 'error');
      return;
    }
    const url = `${location.origin}${location.pathname}?share=${CalcUI.s.projectId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => UI.toast('Länk kopierad!', 'success'))
        .catch(() => UI.toast(url, 'success'));
    } else {
      UI.toast(url, 'success');
    }
  }
};

/* ════════════════════════════════════════════════════════════
   UI HELPERS
   Återanvändbara hjälpfunktioner för formatering och toasts
════════════════════════════════════════════════════════════ */
window.UI = {
  fmt(n) {
    return Utils.formatCurrency(n || 0);
  },

  formatDate(s) {
    return Utils.formatDate(s);
  },

  // Skydda mot XSS i användarinput
  escape(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  statusInfo(s) {
    return {
      draft:    { label: 'Skapad',    cls: 'muted' },
      sent:     { label: 'Skickad',   cls: 'blue' },
      won:      { label: 'Vunnen',    cls: 'green' },
      lost:     { label: 'Förlorad',  cls: 'red' },
      archived: { label: 'Arkiverad', cls: 'muted' }
    }[s] || { label: s, cls: 'muted' };
  },

  stepLabel(k) {
    return {
      foranmalan:          'Föranmälan inskickad',
      medgivande:          'Medgivande godkänt',
      material_levererat:  'Material levererat',
      el_installation:     'Elinstallation färdig',
      sol_installation:    'Solcellsinstallation färdig',
      fardiganmalan:       'Färdiganmälan gjord',
      driftsattning:       'Driftsättning klar'
    }[k] || k;
  },

  toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span>${UI.escape(msg)}`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  showError(id, msg) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }
};

/* ════════════════════════════════════════════════════════════
   INIT
   Körs direkt från kund.html via script.onload
   DOMContentLoaded används INTE här eftersom scriptet laddas
   dynamiskt och det eventet redan har triggat
════════════════════════════════════════════════════════════ */
function kundInit() {
  document.getElementById('login-btn').addEventListener('click', Auth.login);
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') Auth.login();
  });
  Auth.init();
}