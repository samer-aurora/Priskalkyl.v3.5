// ============================================================
// SolarCPQ — Adminportal Application Logic v3.5
// Aurora Energy Group AB
//
// Beroenden:
// - core.js (DB, Pricing, Utils, BrandConfig)
// - firebase.js (CloudDB, FirebaseAuth) — importeras i admin.html
//
// Etapp 2a omfattar:
// - AdminAuth: Firebase Authentication med admin-roll
// - AdminApp: vyhantering, realtime-projektsync
// - AdminDashboard: 6 statistikkort, 2 pipeline-kort, projekttabell
// - ProjectModal: fullständig CRM-vy med alla redigerbara fält
// - AdminUI: hjälpfunktioner (toast, format, escape)
//
// Etapp 2b lägger till:
// - ProductCatalog (produktredigering, datablad-URL, marginalvy)
/* ════════════════════════════════════════════════════════════
   ADMIN AUTH
   Firebase Authentication med admin-roll-kontroll
════════════════════════════════════════════════════════════ */
window.AdminAuth = {
  currentUser: null,
  _initialAuthChecked: false,

  async init() {
    // Säkerhetstimeout: om Firebase inte svarar inom 5s, visa ändå login-skärmen
    const safetyTimeout = setTimeout(() => {
      if (!AdminAuth._initialAuthChecked) {
        console.warn('Firebase auth timeout — visar login-skärm');
        AdminAuth._initialAuthChecked = true;
        AdminApp.onLogout();
      }
    }, 5000);

    FirebaseAuth.onAuthChange(user => {
      AdminAuth._initialAuthChecked = true;
      clearTimeout(safetyTimeout);

      if (user) {
        AdminAuth.currentUser = user;
        AdminApp.onLogin(user);
      } else {
        AdminAuth.currentUser = null;
        AdminApp.onLogout();
      }
    });
  },

  async login() {
    const email = document.getElementById('login-email').value.trim();
    const pw    = document.getElementById('login-password').value;
    const btn   = document.getElementById('login-btn');

    if (!email || !pw) {
      AdminUI.showError('login-error', 'Ange e-post och lösenord.');
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
      AdminUI.showError('login-error', msg);
      btn.disabled = false;
      btn.textContent = 'Logga in som admin';
    }
    // Vid success: onAuthStateChanged triggar AdminApp.onLogin
  },

  async logout() {
    if (!confirm('Vill du logga ut från adminportalen?')) return;
    await FirebaseAuth.logout();
  }
};

/* ════════════════════════════════════════════════════════════
   ADMIN APP
   Övergripande vy-hantering och realtime-projektsync
════════════════════════════════════════════════════════════ */
window.AdminApp = {
  projects: [],
  filterStatus: 'all',
  filterOwner: 'all',
  searchQuery: '',
  _unsubProjects: null,

  onLogin(user) {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Visa admin-info i headern
    const name = user.email?.split('@')[0] || 'Admin';
    document.getElementById('user-name').textContent = name;
    document.getElementById('user-avatar').textContent = name[0].toUpperCase();

    // Realtime-listener för ALLA projekt (admin ser allt)
    AdminApp._unsubProjects = CloudDB.onProjectsChange(projects => {
      AdminApp.projects = projects;
      AdminDashboard.refresh();

      // Om en modal är öppen, uppdatera den med senaste data
      if (ProjectModal.currentId) {
        const updated = projects.find(p => p.projectId === ProjectModal.currentId);
        if (updated) ProjectModal._draw(updated);
      }
    });
  },

  onLogout() {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    if (AdminApp._unsubProjects) AdminApp._unsubProjects();
    AdminApp.projects = [];
    ProjectModal.close();
  },

  showView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.header-nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`view-${view}`)?.classList.add('active');
    document.getElementById(`nav-${view}`)?.classList.add('active');

    // Initiera katalogen när den öppnas
    if (view === 'catalog') {
      if (!Catalog.data) {
        CatalogInit();
      } else {
        Catalog.render();
      }
    }
  },

  openProject(id) {
    ProjectModal.open(id);
  },

  async deleteProject(id, name) {
    const first = confirm(`Vill du radera projektet "${name}"?\n\nDetta går inte att ångra.`);
    if (!first) return;
    const second = confirm(`⚠️ SISTA VARNINGEN\n\nÄr du helt säker på att du vill radera "${name}" permanent?`);
    if (!second) return;

    ProjectModal.close();
    const ok = await CloudDB.deleteProject(id);
    if (ok) AdminUI.toast(`"${name}" raderat`, 'success');
    else AdminUI.toast('Kunde inte radera projektet', 'error');
  }
};

/* ════════════════════════════════════════════════════════════
   ADMIN DASHBOARD
   6 statistikkort + 2 pipeline-kort + projekttabell
════════════════════════════════════════════════════════════ */
window.AdminDashboard = {
  refresh() {
    AdminDashboard._renderStats();
    AdminDashboard._renderPipeline();
    AdminDashboard._renderFilters();
    AdminDashboard._renderTable();
  },

  // ── STATS (6 kort enligt spec §7.1) ──────────────────────
  _renderStats() {
    const all      = AdminApp.projects;
    const won      = all.filter(p => p.status === 'won');
    const winRate  = all.length ? Math.round(won.length / all.length * 100) : 0;

    // Omsättning på vunna projekt (inkl moms enligt admin-perspektiv)
    const wonRev      = won.reduce((s, p) => s + (p.financials?.revenueExVat || 0), 0);
    // Total omsättning på alla aktiva projekt (exkl arkiverade och förlorade)
    const activeRev   = all.filter(p => !['lost','archived'].includes(p.status))
                            .reduce((s, p) => s + (p.financials?.revenueExVat || 0), 0);
    // Kundens samlade vinst (Kalmars påslag på vunna)
    const custProfit  = won.reduce((s, p) => s + (p.customerProfit || 0), 0);
    // Auroras egen marginal på vunna projekt = revenueExVat - cost - customerProfit
    const auroraMarg  = won.reduce((s, p) => {
      const rev   = p.financials?.revenueExVat || 0;
      const cost  = p.financials?.cost || 0;
      const cprof = p.customerProfit || 0;
      return s + (rev - cost - cprof);
    }, 0);
    // Fakturor ej betalda
    const unpaid      = all.filter(p => p.admin?.faktura_skickad && !p.admin?.faktura_betald).length;

    document.getElementById('admin-stats-grid').innerHTML = `
      <div class="admin-stat-card">
        <div class="stat-label">Totalt</div>
        <div class="stat-value">${all.length}</div>
        <div class="stat-sub">projekt</div>
      </div>
      <div class="admin-stat-card highlight">
        <div class="stat-label">Vunna</div>
        <div class="stat-value" style="color:var(--green)">${won.length}</div>
        <div class="stat-sub">${winRate}% vinstrate</div>
      </div>
      <div class="admin-stat-card">
        <div class="stat-label">Omsättning vunna</div>
        <div class="stat-value">${AdminUI.fmt(wonRev)}</div>
        <div class="stat-sub">ex moms</div>
      </div>
      <div class="admin-stat-card">
        <div class="stat-label">Total omsättning</div>
        <div class="stat-value">${AdminUI.fmt(activeRev)}</div>
        <div class="stat-sub">inkl pågående</div>
      </div>
      <div class="admin-stat-card">
        <div class="stat-label">Kundens vinst</div>
        <div class="stat-value" style="color:var(--admin-accent)">${AdminUI.fmt(custProfit)}</div>
        <div class="stat-sub">Auroras: ${AdminUI.fmt(auroraMarg)}</div>
      </div>
      <div class="admin-stat-card" ${unpaid > 0 ? 'style="border-color:var(--amber-border)"' : ''}>
        <div class="stat-label">Fakturor ej betalda</div>
        <div class="stat-value" style="color:${unpaid > 0 ? 'var(--amber)' : 'var(--text-primary)'}">${unpaid}</div>
        <div class="stat-sub">${unpaid > 0 ? 'kräver uppföljning' : 'allt är betalt'}</div>
      </div>`;
  },

  // ── PIPELINE (Kräver åtgärd + Senaste vunna) ─────────────
  _renderPipeline() {
    // "Kräver åtgärd": vunna projekt där installationsflödet inte är klart
    // ELLER fakturor som inte är betalda
    const requiresAction = AdminApp.projects.filter(p => {
      if (p.status !== 'won') return false;
      const flow = p.installFlow || {};
      const scenario = p.scenario || '';
      const hasSol = scenario === 'solar' || scenario === 'hybrid';
      const allDone = flow.foranmalan && flow.medgivande && flow.material_levererat &&
                      flow.el_installation && (!hasSol || flow.sol_installation) &&
                      flow.fardiganmalan && flow.driftsattning;
      const invoicePending = p.admin?.faktura_skickad && !p.admin?.faktura_betald;
      return !allDone || invoicePending;
    }).slice(0, 5);

    // "Senaste vunna": senaste 5 vunna projekten
    const latestWon = AdminApp.projects
      .filter(p => p.status === 'won')
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 5);

    document.getElementById('pipeline-container').innerHTML = `
      <div class="pipeline-card urgent">
        <div class="pipeline-header">
          <span class="pipeline-title">⚠️ Kräver åtgärd</span>
          <span class="pipeline-count-badge">${requiresAction.length}</span>
        </div>
        ${requiresAction.length === 0
          ? `<div class="pipeline-empty">✅ Inget kräver åtgärd just nu</div>`
          : `<div class="pipeline-list">
              ${requiresAction.map(p => AdminDashboard._pipelineItem(p, 'urgent')).join('')}
            </div>`}
      </div>
      <div class="pipeline-card success">
        <div class="pipeline-header">
          <span class="pipeline-title">🎉 Senaste vunna</span>
          <span class="pipeline-count-badge">${latestWon.length}</span>
        </div>
        ${latestWon.length === 0
          ? `<div class="pipeline-empty">Inga vunna projekt ännu</div>`
          : `<div class="pipeline-list">
              ${latestWon.map(p => AdminDashboard._pipelineItem(p, 'success')).join('')}
            </div>`}
      </div>`;
  },

  _pipelineItem(p, type) {
    let meta = '';
    if (type === 'urgent') {
      const flow = p.installFlow || {};
      const _hasSol = (p.scenario === 'solar' || p.scenario === 'hybrid');
      const steps = ['foranmalan','medgivande','material_levererat','el_installation',
                     ...(_hasSol ? ['sol_installation'] : []),'fardiganmalan','driftsattning'];
      const remaining = steps.filter(k => !flow[k]).length;
      const invoicePending = p.admin?.faktura_skickad && !p.admin?.faktura_betald;
      if (invoicePending) meta = '⏳ Faktura ej betald';
      else if (remaining > 0) meta = `${remaining} steg kvar i installation`;
    } else {
      meta = AdminUI.formatDate(p.updatedAt);
    }
    return `
      <div class="pipeline-item" onclick="AdminApp.openProject('${p.projectId}')">
        <div class="pipeline-item-info">
          <div class="pipeline-item-name">${AdminUI.escape(p.projectName) || 'Namnlöst'}</div>
          <div class="pipeline-item-meta">${AdminUI.escape(p.customer?.name || '–')} · ${meta}</div>
        </div>
        <div class="pipeline-item-amount">${AdminUI.fmt(p.financials?.revenueExVat || 0)}</div>
      </div>`;
  },

  // ── FILTER PILLS ─────────────────────────────────────────
  _renderFilters() {
    const statuses = [
      { k: 'all',      l: 'Alla' },
      { k: 'draft',    l: 'Skapade' },
      { k: 'sent',     l: 'Skickade' },
      { k: 'won',      l: 'Vunna' },
      { k: 'lost',     l: 'Förlorade' },
      { k: 'archived', l: 'Arkiverade' }
    ];
    const owners = [...new Set(AdminApp.projects.map(p => p.projectOwner).filter(Boolean))].sort();
    const statusHtml = statuses.map(s => {
      const count = s.k === 'all'
        ? AdminApp.projects.length
        : AdminApp.projects.filter(p => p.status === s.k).length;
      return `<button class="filter-pill ${AdminApp.filterStatus === s.k ? 'active' : ''}"
        onclick="AdminApp.filterStatus='${s.k}';AdminDashboard.refresh()">
        ${s.l} <span style="opacity:.6;font-size:10px;margin-left:4px">${count}</span>
      </button>`;
    }).join('');
    const ownerHtml = owners.length > 0 ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px">
        <span style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px">Säljare:</span>
        <button class="filter-pill ${AdminApp.filterOwner === 'all' ? 'active' : ''}"
          onclick="AdminApp.filterOwner='all';AdminDashboard.refresh()">Alla</button>
        ${owners.map(o => `<button class="filter-pill ${AdminApp.filterOwner === o ? 'active' : ''}"
          onclick="AdminApp.filterOwner='${o}';AdminDashboard.refresh()">${o}</button>`).join('')}
      </div>` : '';
    document.getElementById('filter-pills').innerHTML = statusHtml + ownerHtml;
  },

  // ── PROJEKT-TABELL ───────────────────────────────────────
  _renderTable() {
    let filtered = AdminApp.filterStatus === 'all'
      ? AdminApp.projects
      : AdminApp.projects.filter(p => p.status === AdminApp.filterStatus);

    // Filter på projektägare
    if (AdminApp.filterOwner !== 'all') {
      filtered = filtered.filter(p => p.projectOwner === AdminApp.filterOwner);
    }

    if (AdminApp.searchQuery) {
      const q = AdminApp.searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.projectName?.toLowerCase().includes(q) ||
        p.customer?.name?.toLowerCase().includes(q) ||
        p.customer?.email?.toLowerCase().includes(q) ||
        p.customer?.city?.toLowerCase().includes(q)
      );
    }

    // Sort: senast uppdaterade först
    filtered.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    const wrap = document.getElementById('admin-table-body');
    if (!filtered.length) {
      wrap.innerHTML = `
        <tr><td colspan="7" class="admin-table-empty">
          ${AdminApp.searchQuery
            ? `Inga träffar för "${AdminUI.escape(AdminApp.searchQuery)}"`
            : 'Inga projekt i denna kategori'}
        </td></tr>`;
      return;
    }

    wrap.innerHTML = filtered.map(p => {
      const si = AdminUI.statusInfo(p.status);
      const flow = p.installFlow || {};
      const _hasSol = (p.scenario === 'solar' || p.scenario === 'hybrid');
      const steps = ['foranmalan','medgivande','material_levererat','el_installation',
                     ...(_hasSol ? ['sol_installation'] : []),'fardiganmalan','driftsattning'];
      const done = steps.filter(s => flow[s]).length;
      const prog = Math.round(done / steps.length * 100);
      const hasInv = p.admin?.faktura_skickad;
      const invPaid = p.admin?.faktura_betald;

      return `
      <tr onclick="AdminApp.openProject('${p.projectId}')">
        <td>
          <div style="font-weight:600">${AdminUI.escape(p.projectName) || 'Namnlöst'}</div>
          <div style="font-size:11px;color:var(--text-muted)">${AdminUI.escape(p.projectOwner || 'Ingen ägare')}</div>
        </td>
        <td>
          <div>${AdminUI.escape(p.customer?.name) || '–'}</div>
          <div style="font-size:11px;color:var(--text-muted)">${AdminUI.escape(p.customer?.city || '')}</div>
        </td>
        <td><span class="badge badge-${si.cls}">${si.label}</span></td>
        <td class="col-amount">${AdminUI.fmt(p.financials?.revenueExVat || 0)}</td>
        <td class="col-amount" style="color:var(--green)">${AdminUI.fmt(p.customerProfit || 0)}</td>
        <td class="col-amount" style="color:var(--admin-accent)">${AdminUI.fmt((p.financials?.revenueExVat || 0) - (p.financials?.cost || 0) - (p.customerProfit || 0))}</td>
        <td class="col-progress">
          ${p.status === 'won' ? `
          <div class="table-progress-wrap">
            <div class="table-progress-bar"><div class="table-progress-fill" style="width:${prog}%"></div></div>
            <div class="table-progress-label">${done}/${steps.length} steg ${hasInv ? `· ${invPaid ? '✓ Betald' : '⏳ Faktura'}` : ''}</div>
          </div>` : `<span style="color:var(--text-muted);font-size:11px">—</span>`}
        </td>
        <td style="text-align:right;color:var(--text-muted);font-size:11px;white-space:nowrap">
          ${AdminUI.formatDate(p.updatedAt)}
        </td>
      </tr>`;
    }).join('');
  },

  setSearch(query) {
    AdminApp.searchQuery = query.trim();
    AdminDashboard._renderTable();
  }
};

/* ════════════════════════════════════════════════════════════
   PROJECT MODAL
   Fullständig CRM-vy med alla redigerbara fält
   Auto-spara med 1.5s debounce → Firebase → kund ser direkt
════════════════════════════════════════════════════════════ */
window.ProjectModal = {
  currentId: null,
  _saveTimer: null,
  _pendingChanges: {},

  open(projectId) {
    const project = AdminApp.projects.find(p => p.projectId === projectId);
    if (!project) {
      AdminUI.toast('Projektet hittades inte', 'error');
      return;
    }
    ProjectModal.currentId = projectId;
    ProjectModal._pendingChanges = {};
    document.getElementById('project-modal-backdrop').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    ProjectModal._draw(project);
  },

  close() {
    // Flusha eventuella pending changes innan stängning
    if (ProjectModal._saveTimer) {
      clearTimeout(ProjectModal._saveTimer);
      ProjectModal._flushSave();
    }
    document.getElementById('project-modal-backdrop').classList.add('hidden');
    document.body.style.overflow = '';
    ProjectModal.currentId = null;
    ProjectModal._pendingChanges = {};
  },

  _draw(p) {
    const flow  = p.installFlow || {};
    const admin = p.admin || {};
    const cl    = p.changelog || [];
    const prods = p.products || [];

    const statusOpts = ['draft','sent','won','lost','archived'].map(s => {
      const { label } = AdminUI.statusInfo(s);
      return `<option value="${s}"${p.status === s ? ' selected' : ''}>${label}</option>`;
    }).join('');

    // Beräkna marginaler för beställningsunderlag
    // OBS: totalSale inkluderar kundens vinstpåslag → subtrahera det för Auroras egna marginal
    const totalCost      = prods.reduce((s, pr) => s + (pr.purchasePrice || 0) * pr.qty, 0);
    const totalSale      = prods.reduce((s, pr) => s + pr.salesPrice * pr.qty, 0);
    const custProfit     = p.customerProfit || 0;
    const auroraMargin   = totalSale - custProfit - totalCost;
    const marginPercent  = totalSale > 0 ? Math.round(auroraMargin / totalSale * 100) : 0;
    const marginCls      = marginPercent >= 25 ? 'margin-good' : marginPercent >= 10 ? 'margin-ok' : 'margin-low';

    const body = `
      <div class="modal-grid">

        <!-- KUNDUPPGIFTER -->
        <div class="modal-section">
          <div class="modal-section-title">👤 Kunduppgifter</div>
          <div class="modal-form-grid">
            <div class="form-group full">
              <label class="form-label">Namn</label>
              <input type="text" class="form-input" value="${AdminUI.escape(p.customer?.name || '')}"
                onchange="ProjectModal.setNested('customer.name', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">E-post</label>
              <input type="email" class="form-input" value="${AdminUI.escape(p.customer?.email || '')}"
                onchange="ProjectModal.setNested('customer.email', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Telefon</label>
              <input type="tel" class="form-input" value="${AdminUI.escape(p.customer?.phone || '')}"
                onchange="ProjectModal.setNested('customer.phone', this.value)">
            </div>
            <div class="form-group full">
              <label class="form-label">Adress</label>
              <input type="text" class="form-input" value="${AdminUI.escape(p.customer?.address || '')}"
                onchange="ProjectModal.setNested('customer.address', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Postnr</label>
              <input type="text" class="form-input" value="${AdminUI.escape(p.customer?.zip || '')}"
                onchange="ProjectModal.setNested('customer.zip', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Stad</label>
              <input type="text" class="form-input" value="${AdminUI.escape(p.customer?.city || '')}"
                onchange="ProjectModal.setNested('customer.city', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Personnummer ägare 1</label>
              <input type="text" class="form-input" value="${AdminUI.escape(p.customer?.ssn1 || '')}"
                onchange="ProjectModal.setNested('customer.ssn1', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Personnummer ägare 2</label>
              <input type="text" class="form-input" value="${AdminUI.escape(p.customer?.ssn2 || '')}"
                onchange="ProjectModal.setNested('customer.ssn2', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Anläggnings-ID</label>
              <input type="text" class="form-input" value="${AdminUI.escape(admin.anlaggning_id || '')}"
                placeholder="t.ex. 735999..." onchange="ProjectModal.setNested('admin.anlaggning_id', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Fastighetsbeteckning</label>
              <input type="text" class="form-input" value="${AdminUI.escape(admin.fastighet || '')}"
                placeholder="t.ex. KALMAR 1:23" onchange="ProjectModal.setNested('admin.fastighet', this.value)">
            </div>
            <div class="form-group full">
              <label class="form-label">Projektägare (säljare)</label>
              <input type="text" class="form-input" value="${AdminUI.escape(p.projectOwner || '')}"
                onchange="ProjectModal.set('projectOwner', this.value)">
            </div>
          </div>
        </div>

        <!-- STATUS & DATUM -->
        <div class="modal-section">
          <div class="modal-section-title">📋 Status & datum</div>
          <div class="modal-form-grid">
            <div class="form-group full">
              <label class="form-label">Projektstatus</label>
              <select class="form-select" onchange="ProjectModal.set('status', this.value)">
                ${statusOpts}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Önskat leverans</label>
              <input type="date" class="form-input" value="${p.wantedDelivery || ''}"
                onchange="ProjectModal.set('wantedDelivery', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Bekräftat leverans</label>
              <input type="date" class="form-input" value="${admin.confirmed_delivery || ''}"
                onchange="ProjectModal.setNested('admin.confirmed_delivery', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">UE önskat</label>
              <input type="date" class="form-input" value="${p.wantedInstallDate || ''}"
                onchange="ProjectModal.set('wantedInstallDate', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">UE bekräftat</label>
              <input type="date" class="form-input" value="${admin.ue_confirmed || ''}"
                onchange="ProjectModal.setNested('admin.ue_confirmed', this.value)">
            </div>
          </div>
        </div>

        <!-- INSTALLATIONSFLÖDE -->
        <div class="modal-section full">
          <div class="modal-section-title">🔧 Installationsflöde</div>
          ${ProjectModal._installRow(flow, admin, 'foranmalan',         'Föranmälan inskickad')}
          ${ProjectModal._installRow(flow, admin, 'medgivande',         'Medgivande godkänt')}
          ${ProjectModal._installRow(flow, admin, 'material_levererat', 'Material levererat')}
          ${ProjectModal._installRow(flow, admin, 'el_installation',    'Elinstallation färdig')}
          ${p.scenario === 'solar' || p.scenario === 'hybrid' ? ProjectModal._installRow(flow, admin, 'sol_installation', 'Solcellsinstallation färdig') : ''}
          ${ProjectModal._installRow(flow, admin, 'fardiganmalan',      'Färdiganmälan gjord')}
          ${ProjectModal._installRow(flow, admin, 'driftsattning',      'Driftsättning klar')}
        </div>

        <!-- FAKTURERING -->
        <div class="modal-section full">
          <div class="modal-section-title">💳 Fakturering</div>
          <div class="modal-form-grid">
            <div class="form-group">
              <label class="form-label">Fakturadatum</label>
              <input type="date" class="form-input" value="${admin.faktura_datum || ''}"
                onchange="ProjectModal.setNested('admin.faktura_datum', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Förfallodatum</label>
              <input type="date" class="form-input" value="${admin.forfallo_datum || ''}"
                onchange="ProjectModal.setNested('admin.forfallo_datum', this.value)">
            </div>
          </div>
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">
            ${ProjectModal._invoiceRow(admin, 'faktura_skickad', 'Faktura skickad till kund')}
            ${ProjectModal._invoiceRow(admin, 'faktura_betald',  'Faktura betald')}
          </div>
        </div>

        <!-- EKONOMI (read-only översikt) -->
        <div class="modal-section">
          <div class="modal-section-title">💰 Ekonomi</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div class="info-row">
              <span class="info-row-label">Totalt ex moms</span>
              <span style="font-weight:600;color:var(--text-primary)">${AdminUI.fmt(p.financials?.revenueExVat || 0)}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">Moms 25%</span>
              <span style="font-weight:600;color:var(--text-primary)">${AdminUI.fmt((p.financials?.revenueExVat || 0) * 0.25)}</span>
            </div>
            <div class="info-row" style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
              <span style="font-weight:700;color:var(--text-primary)">Totalt inkl moms</span>
              <span style="font-weight:700;color:var(--text-primary)">${AdminUI.fmt((p.financials?.revenueExVat || 0) * 1.25)}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">Inköpskostnad (Aurora)</span>
              <span style="font-weight:600;color:var(--text-primary)">${AdminUI.fmt(p.financials?.cost || 0)}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label" style="color:var(--admin-accent)">Kundens vinst (påslag)</span>
              <span style="font-weight:700;color:var(--admin-accent)">${AdminUI.fmt(p.customerProfit || 0)}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label" style="color:var(--green)">Auroras marginal</span>
              <span class="${marginCls}">${AdminUI.fmt(auroraMargin)} (${marginPercent}%)</span>
            </div>
          </div>
        </div>

        <!-- ÄNDRINGSHISTORIK -->
        <div class="modal-section">
          <div class="modal-section-title">🕐 Ändringshistorik</div>
          ${cl.length === 0
            ? `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Inga ändringar ännu</div>`
            : `<div class="changelog-list" style="max-height:240px;overflow-y:auto">
                ${cl.slice(-30).reverse().map(c => `
                  <div class="changelog-item">
                    <div class="changelog-dot"></div>
                    <span class="changelog-text">${AdminUI.escape(c.action)}</span>
                    <span class="changelog-time">${AdminUI.formatDate(c.timestamp)}</span>
                  </div>`).join('')}
              </div>`}
        </div>

        <!-- BESTÄLLNINGSUNDERLAG (full bredd) -->
        ${prods.length ? `
        <div class="modal-section full">
          <div class="modal-section-title">📦 Beställningsunderlag (${prods.length} produkter)</div>
          <div style="overflow-x:auto">
            <table class="admin-product-table">
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th class="num">Antal</th>
                  <th class="num">Inköp/st</th>
                  <th class="num">Sälj/st</th>
                  <th class="num">Inköp totalt</th>
                  <th class="num">Sälj totalt</th>
                  <th class="num">Marg.</th>
                </tr>
              </thead>
              <tbody>
                ${prods.map(pr => {
                  const cost     = (pr.purchasePrice || 0) * pr.qty;
                  const sale     = pr.salesPrice * pr.qty;
                  const margin   = sale - cost;
                  const margPct  = sale > 0 ? Math.round(margin / sale * 100) : 0;
                  const cls      = margPct >= 25 ? 'margin-good' : margPct >= 10 ? 'margin-ok' : 'margin-low';
                  return `
                  <tr>
                    <td>${AdminUI.escape(pr.name)}</td>
                    <td class="num">${pr.qty}</td>
                    <td class="num">${AdminUI.fmt(pr.purchasePrice || 0)}</td>
                    <td class="num">${AdminUI.fmt(pr.salesPrice)}</td>
                    <td class="num">${AdminUI.fmt(cost)}</td>
                    <td class="num-amount">${AdminUI.fmt(sale)}</td>
                    <td class="num ${cls}">${margPct}%</td>
                  </tr>`;
                }).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="4" style="text-align:right">Totalt</td>
                  <td class="num">${AdminUI.fmt(totalCost)}</td>
                  <td class="num-amount">${AdminUI.fmt(totalSale)}</td>
                  <td class="num ${marginCls}">${marginPercent}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>` : ''}

      </div>`;

    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-title-input').value = p.projectName || '';
  },

  // Installations-rad: checkbox + datum
  _installRow(flow, admin, key, label) {
    const done = !!flow[key];
    const dateKey = `${key}_datum`;  // foranmalan_datum, medgivande_datum etc.
    const dateVal = admin[dateKey] || '';
    return `
    <div class="crm-check-row ${done ? 'done' : ''}">
      <button class="crm-check" onclick="ProjectModal.toggleInstall('${key}')">${done ? '✓' : ''}</button>
      <span class="crm-check-label" onclick="ProjectModal.toggleInstall('${key}')">${label}</span>
      <input type="date" class="crm-check-date" value="${dateVal}"
        onchange="ProjectModal.setNested('admin.${dateKey}', this.value)"
        ${!done ? 'disabled style="opacity:0.4"' : ''}>
    </div>`;
  },

  // Faktura-rad: checkbox utan datum (datum hanteras separat)
  _invoiceRow(admin, key, label) {
    const done = !!admin[key];
    return `
    <div class="crm-check-row ${done ? 'done' : ''}">
      <button class="crm-check" onclick="ProjectModal.toggleInvoice('${key}')">${done ? '✓' : ''}</button>
      <span class="crm-check-label" onclick="ProjectModal.toggleInvoice('${key}')">${label}</span>
    </div>`;
  },

  // ── SETTERS med debounce ─────────────────────────────────
  set(key, value) {
    ProjectModal._pendingChanges[key] = value;
    ProjectModal._scheduleSave(`${ProjectModal._pretty(key)} → ${value || '(tom)'}`);
  },

  setNested(path, value) {
    const parts = path.split('.');
    if (parts.length === 2) {
      const proj = AdminApp.projects.find(p => p.projectId === ProjectModal.currentId);
      const current = ProjectModal._pendingChanges[parts[0]] ?? proj?.[parts[0]] ?? {};
      ProjectModal._pendingChanges[parts[0]] = { ...current, [parts[1]]: value };
      ProjectModal._scheduleSave(`${ProjectModal._pretty(parts[1])} → ${value || '(tom)'}`);
    }
  },

  setTitle(value) {
    ProjectModal._pendingChanges.projectName = value;
    ProjectModal._scheduleSave(`Projektnamn → ${value}`);
  },

  // Toggle installations-checkbox (måste flushas direkt eftersom det är ett tydligt event)
  async toggleInstall(key) {
    const proj = AdminApp.projects.find(p => p.projectId === ProjectModal.currentId);
    if (!proj) return;
    const flow = { ...(proj.installFlow || {}), ...(ProjectModal._pendingChanges.installFlow || {}) };
    flow[key] = !flow[key];

    // Auto-sätt datum till idag om checkboxen bockas i för första gången
    const dateKey = `${key}_datum`;
    const adminUpd = { ...(proj.admin || {}), ...(ProjectModal._pendingChanges.admin || {}) };
    if (flow[key] && !adminUpd[dateKey]) {
      adminUpd[dateKey] = new Date().toISOString().slice(0, 10);
    }

    ProjectModal._pendingChanges.installFlow = flow;
    ProjectModal._pendingChanges.admin = adminUpd;
    ProjectModal._scheduleSave(`${AdminUI.stepLabel(key)} ${flow[key] ? 'ibockad' : 'avbockad'}`, true);
  },

  // Toggle faktura-checkbox (faktura_skickad / faktura_betald)
  async toggleInvoice(key) {
    const proj = AdminApp.projects.find(p => p.projectId === ProjectModal.currentId);
    if (!proj) return;
    const adminUpd = { ...(proj.admin || {}), ...(ProjectModal._pendingChanges.admin || {}) };
    adminUpd[key] = !adminUpd[key];

    // Auto-sätt fakturadatum till idag när "Faktura skickad" bockas i
    if (key === 'faktura_skickad' && adminUpd[key] && !adminUpd.faktura_datum) {
      adminUpd.faktura_datum = new Date().toISOString().slice(0, 10);
    }

    ProjectModal._pendingChanges.admin = adminUpd;
    const labelMap = { faktura_skickad: 'Faktura skickad', faktura_betald: 'Faktura betald' };
    ProjectModal._scheduleSave(`${labelMap[key]} ${adminUpd[key] ? 'markerad' : 'avmarkerad'}`, true);
  },

  // Schemalägg sparning med 1.5s debounce (per spec)
  _scheduleSave(actionDescription, immediate = false) {
    ProjectModal._pendingChangeDescription = actionDescription;

    if (immediate) {
      // För toggles: flusha snabbare så användaren ser direkt effekt
      clearTimeout(ProjectModal._saveTimer);
      ProjectModal._flushSave();
      return;
    }

    clearTimeout(ProjectModal._saveTimer);
    ProjectModal._saveTimer = setTimeout(() => ProjectModal._flushSave(), 1500);
  },

  async _flushSave() {
    if (Object.keys(ProjectModal._pendingChanges).length === 0) return;
    if (!ProjectModal.currentId) return;

    const proj = AdminApp.projects.find(p => p.projectId === ProjectModal.currentId);
    const action = ProjectModal._pendingChangeDescription || 'Admin uppdaterade projekt';
    const cl = [
      ...(proj?.changelog || []),
      { action, timestamp: new Date().toISOString() }
    ].slice(-30);

    const payload = { ...ProjectModal._pendingChanges, changelog: cl };
    ProjectModal._pendingChanges = {};
    ProjectModal._pendingChangeDescription = null;

    const ok = await CloudDB.updateProject(ProjectModal.currentId, payload);
    if (ok) AdminUI.toast('Sparad', 'success');
    else AdminUI.toast('Fel vid sparning', 'error');
  },

  // Förvandla "customer.email" → "E-post" osv för changelog
  _pretty(key) {
    const map = {
      status: 'Status', projectName: 'Projektnamn', projectOwner: 'Projektägare',
      wantedDelivery: 'Önskat leverans', wantedInstallDate: 'UE önskat',
      confirmed_delivery: 'Bekräftat leverans', ue_confirmed: 'UE bekräftat',
      faktura_datum: 'Fakturadatum', forfallo_datum: 'Förfallodatum',
      anlaggning_id: 'Anläggnings-ID', fastighet: 'Fastighetsbeteckning',
      name: 'Kundnamn', email: 'E-post', phone: 'Telefon',
      address: 'Adress', zip: 'Postnr', city: 'Stad',
      ssn1: 'Personnr 1', ssn2: 'Personnr 2',
      foranmalan_datum:         'Föranmälansdatum',
      medgivande_datum:         'Medgivandedatum',
      material_levererat_datum: 'Material levererat-datum',
      el_installation_datum:    'Elinstallation-datum',
      sol_installation_datum:   'Solcellsinstallation-datum',
      fardiganmalan_datum:      'Färdiganmälansdatum',
      driftsattning_datum:      'Driftsättningsdatum'
    };
    return map[key] || key;
  }
};

/* ════════════════════════════════════════════════════════════
   ADMIN UI HELPERS
   Återanvändbara hjälpfunktioner
════════════════════════════════════════════════════════════ */
window.AdminUI = {
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
      foranmalan:         'Föranmälan',
      medgivande:         'Medgivande',
      material_levererat: 'Material levererat',
      el_installation:    'Elinstallation färdig',
      sol_installation:   'Solcellsinstallation färdig',
      fardiganmalan:      'Färdiganmälan',
      driftsattning:      'Driftsättning'
    }[k] || k;
  },

  toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span>${AdminUI.escape(msg)}`;
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
   Körs direkt från admin.html via script.onload
   DOMContentLoaded används INTE här eftersom scriptet laddas
   dynamiskt och det eventet redan har triggat
════════════════════════════════════════════════════════════ */
function adminInit() {
  // Login
  document.getElementById('login-btn').addEventListener('click', AdminAuth.login);
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') AdminAuth.login();
  });

  // Search input (debounced)
  const searchInput = document.getElementById('admin-search-input');
  if (searchInput) {
    let searchTimer;
    searchInput.addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => AdminDashboard.setSearch(e.target.value), 200);
    });
  }

  // ESC stänger modalen
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ProjectModal.currentId) ProjectModal.close();
  });

  // Klick utanför modal-card stänger modalen
  document.getElementById('project-modal-backdrop')?.addEventListener('click', e => {
    if (e.target.id === 'project-modal-backdrop') ProjectModal.close();
  });

  // Starta auth-listener (hanterar login/logout flödet)
  AdminAuth.init();
  // OBS: Katalogen (Catalog) initieras lazy när användaren klickar
  // på "Produktkatalog" — se showView() ovan
}