// ============================================================
// SolarCPQ — Produktkatalog v3.5
// Aurora Energy Group AB
//
// Fix v2:
// - Marginal uppdateras live vid prisändring (utan full re-render)
// - Lägg till nya produkter per kategori
// - Ta bort produkter (med bekräftelse)
// - Kalkylatorn hämtar priser från Firebase vid ny offert
// ============================================================

window.Catalog = {
  data: null,
  settings: null,
  activeTab: 'batteries',
  _saveTimer: null,
  _unsub: null,

  // ── INIT ────────────────────────────────────────────────
  async init() {
    // Realtidslyssnare
    Catalog._unsub = CloudDB.onCatalogChange(data => {
      if (data?.products) {
        Catalog.data     = data.products;
        Catalog.settings = data.settings || {};
        Catalog.render();
      }
    });

    // Seed om tom
    const existing = await CloudDB.getProductCatalog();
    if (!existing?.products?.batteries?.length) {
      await Catalog.seedFromCore();
    }
  },

  async seedFromCore() {
    const state = DB.load();
    const ok = await CloudDB.saveProductCatalog({
      products: state.products,
      settings: state.settings
    });
    if (ok) AdminUI.toast('Produktkatalog initierad från core.js ✅', 'success');
  },

  // ── SPARA med debounce 1s ───────────────────────────────
  _scheduleSave() {
    Catalog._updateSaveIndicator('saving');
    clearTimeout(Catalog._saveTimer);
    Catalog._saveTimer = setTimeout(async () => {
      const ok = await CloudDB.saveProductCatalog({
        products: Catalog.data,
        settings: Catalog.settings
      });
      Catalog._updateSaveIndicator(ok ? 'saved' : 'error');
      if (!ok) AdminUI.toast('Fel vid sparning av katalog', 'error');
    }, 1000);
  },

  _updateSaveIndicator(status) {
    const el = document.getElementById('cat-save-indicator');
    if (!el) return;
    const map = {
      saving: ['save-indicator saving', '⏳ Sparar...'],
      saved:  ['save-indicator saved',  '✅ Sparat'],
      error:  ['save-indicator saving', '❌ Fel']
    };
    const [cls, txt] = map[status] || ['save-indicator idle', ''];
    el.className = cls;
    el.innerHTML = txt;
    if (status === 'saved') {
      setTimeout(() => { el.className = 'save-indicator idle'; el.innerHTML = ''; }, 2500);
    }
  },

  // ── RENDER ──────────────────────────────────────────────
  render() {
    const container = document.getElementById('catalog-content');
    if (!container || !Catalog.data) return;

    const tabs = [
      { key: 'batteries', icon: '🔋', label: 'Batterier',    count: Catalog.data.batteries?.length || 0 },
      { key: 'inverters', icon: '⚡', label: 'Växelriktare', count: Catalog.data.inverters?.length || 0 },
      { key: 'panels',    icon: '☀️', label: 'Solpaneler',   count: Catalog.data.solarPanels?.length || 0 },
      { key: 'mounting',  icon: '🔩', label: 'Montage',      count: Catalog.data.mounting?.length || 0 },
      { key: 'addons',    icon: '🔌', label: 'Tillbehör',    count: (Catalog.data.addons?.filter(a => !a.isFrakt)?.length || 0) },
      { key: 'ue',        icon: '👷', label: 'UE',           count: Catalog.data.ue?.length || 0 },
      { key: 'settings',  icon: '⚙️', label: 'Inställningar', count: null }
    ];

    container.innerHTML = `
    <div class="catalog-wrap">
      <div class="catalog-top">
        <div>
          <h1 class="catalog-title">📦 Produktkatalog <span class="admin-badge">Aurora Energy</span></h1>
          <p class="catalog-subtitle">Redigera priser — ändringarna syns live hos kunden på nästa offert</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <span id="cat-save-indicator" class="save-indicator idle"></span>
          <button class="btn btn-secondary btn-sm" onclick="Catalog.seedFromCore()">
            🔄 Återställ standard
          </button>
        </div>
      </div>

      <div class="catalog-tabs">
        ${tabs.map(t => `
          <button class="catalog-tab ${Catalog.activeTab === t.key ? 'active' : ''}"
            onclick="Catalog.setTab('${t.key}')">
            ${t.icon} ${t.label}
            ${t.count !== null ? `<span class="catalog-tab-count">${t.count}</span>` : ''}
          </button>`).join('')}
      </div>

      <div id="catalog-tab-content">
        ${Catalog._renderTab(Catalog.activeTab)}
      </div>
    </div>`;
  },

  setTab(key) {
    Catalog.activeTab = key;
    Catalog.render();
  },

  _renderTab(tab) {
    switch(tab) {
      case 'batteries': return Catalog._renderBatteries();
      case 'inverters': return Catalog._renderInverters();
      case 'panels':    return Catalog._renderPanels();
      case 'mounting':  return Catalog._renderMounting();
      case 'addons':    return Catalog._renderAddons();
      case 'ue':        return Catalog._renderUE();
      case 'settings':  return Catalog._renderSettings();
      default:          return '';
    }
  },

  // ── HJÄLPFUNKTIONER ─────────────────────────────────────
  _marginBadge(purchase, sales) {
    if (!sales || sales <= 0) return '<span class="margin-badge margin-low">–</span>';
    const pct = Math.round((sales - purchase) / sales * 100);
    const cls = pct >= 25 ? 'margin-good' : pct >= 10 ? 'margin-ok' : 'margin-low';
    return `<span class="margin-badge ${cls}">${pct}%</span>`;
  },

  _brandPill(brand) {
    const cls = `brand-${brand?.toLowerCase() || 'generic'}`;
    const labels = { emaldo:'Emaldo', enphase:'Enphase', solis:'Solis', dyness:'Dyness', huawei:'Huawei', generic:'–' };
    return `<span class="brand-pill ${cls}">${labels[brand] || brand || '–'}</span>`;
  },

  // ── UPPDATERA FÄLT + live marginal ──────────────────────
  updateField(category, id, field, value, rowId) {
    const list = Catalog.data[category];
    if (!list) return;
    const item = list.find(x => x.id === id);
    if (!item) return;

    const numFields = ['purchasePrice','salesPrice','purchasePerMeter',
                       'pricePerMeter','watt','powerKw','capacityKwh'];
    item[field] = numFields.includes(field) ? (parseFloat(value) || 0) : value;

    // Uppdatera marginalbadgen live utan full re-render
    if ((field === 'purchasePrice' || field === 'salesPrice') && rowId) {
      const badge = document.getElementById(rowId);
      if (badge) badge.outerHTML = Catalog._marginBadge(item.purchasePrice, item.salesPrice)
        .replace('<span', `<span id="${rowId}"`);
    }

    Catalog._scheduleSave();
  },

  // Input-hjälpare
  _inp(category, id, field, value, cls = '') {
    const escaped = String(value ?? '').replace(/"/g, '&quot;');
    return `<input class="cat-input ${cls}" value="${escaped}"
      onchange="Catalog.updateField('${category}','${id}','${field}',this.value)"
      onclick="event.stopPropagation()">`;
  },

  _priceInp(category, id, field, value, rowId = '') {
    return `<input class="cat-input price" type="number" min="0" step="100" value="${value || 0}"
      onchange="Catalog.updateField('${category}','${id}','${field}',this.value,'${rowId}')"
      onclick="event.stopPropagation()">`;
  },

  _urlInp(category, id, field, value) {
    const escaped = String(value ?? '').replace(/"/g, '&quot;');
    return `<input class="cat-input url" placeholder="https://..." value="${escaped}"
      onchange="Catalog.updateField('${category}','${id}','${field}',this.value)"
      onclick="event.stopPropagation()">`;
  },

  // ── LÄGG TILL PRODUKT ────────────────────────────────────
  addProduct(category) {
    const templates = {
      batteries: { id: `bat_${Date.now()}`, brand: 'generic', name: 'Ny produkt', capacityKwh: 5, purchasePrice: 0, salesPrice: 0, description: '', datasheetUrl: '', manualUrl: '' },
      inverters:  { id: `inv_${Date.now()}`, brand: 'solis', name: 'Ny växelriktare', powerKw: 10, minPanels: 6, purchasePrice: 0, salesPrice: 0, datasheetUrl: '', manualUrl: '' },
      solarPanels:{ id: `pan_${Date.now()}`, name: 'Ny solpanel', watt: 500, purchasePrice: 0, salesPrice: 0, datasheetUrl: '', manualUrl: '' },
      mounting:   { id: `mnt_${Date.now()}`, name: 'Nytt montage', type: 'roof', purchasePrice: 0, salesPrice: 0 },
      addons:     { id: `add_${Date.now()}`, brand: 'generic', name: 'Nytt tillbehör', purchasePrice: 0, salesPrice: 0, description: '' },
      ue:         { id: `ue_${Date.now()}`, name: 'Ny UE-tjänst', purchasePrice: 0, salesPrice: 0, description: '' }
    };
    const template = templates[category];
    if (!template) return;
    if (!Catalog.data[category]) Catalog.data[category] = [];
    Catalog.data[category].push(template);
    Catalog._scheduleSave();
    Catalog.render(); // Re-render för att visa ny rad
    AdminUI.toast('Produkt tillagd — fyll i uppgifterna', 'success');
  },

  // ── TA BORT PRODUKT ──────────────────────────────────────
  removeProduct(category, id, name) {
    if (!confirm(`Ta bort "${name}" från katalogen?\n\nOBS: Befintliga offerter påverkas inte.`)) return;
    const list = Catalog.data[category];
    if (!list) return;
    const idx = list.findIndex(x => x.id === id);
    if (idx > -1) {
      list.splice(idx, 1);
      Catalog._scheduleSave();
      Catalog.render();
      AdminUI.toast(`"${name}" borttagen`, 'success');
    }
  },

  // Lägg till-knapp (återanvändbar)
  _addBtn(category) {
    return `<button class="btn btn-secondary btn-sm" style="margin-top:12px"
      onclick="Catalog.addProduct('${category}')">
      ➕ Lägg till produkt
    </button>`;
  },

  // Ta bort-knapp per rad
  _delBtn(category, id, name) {
    const safe = name.replace(/'/g, "\\'");
    return `<button class="btn btn-sm" style="color:var(--red);border:1px solid var(--red-border);background:var(--red-bg);padding:4px 8px"
      onclick="event.stopPropagation();Catalog.removeProduct('${category}','${id}','${safe}')"
      title="Ta bort produkt">🗑️</button>`;
  },

  // ── FLIK: BATTERIER ─────────────────────────────────────
  _renderBatteries() {
    const items = Catalog.data.batteries || [];
    return `
    <div class="catalog-table-wrap">
      <table class="catalog-table">
        <thead><tr>
          <th>Produkt</th><th>Varumärke</th><th>kWh</th>
          <th style="text-align:right">Inköp (kr)</th>
          <th style="text-align:right">Sälj (kr)</th>
          <th style="text-align:right">Marginal</th>
          <th>Beskrivning</th>
          <th>Datablad</th><th>Manual</th><th></th>
        </tr></thead>
        <tbody>
          ${items.map(b => {
            const rid = `margin-bat-${b.id}`;
            return `<tr class="${b.comingSoon ? 'coming-soon' : ''}">
              <td>
                <div style="font-weight:600;color:var(--text-primary)">${b.comingSoon ? AdminUI.escape(b.name) : Catalog._inp('batteries', b.id, 'name', b.name)}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${b.id}</div>
                ${b.comingSoon ? '<span class="coming-soon-badge">🔜 Kommer snart</span>' : ''}
              </td>
              <td>${Catalog._brandPill(b.brand)}</td>
              <td style="color:var(--text-secondary)">${b.capacityKwh > 0 ? b.capacityKwh + ' kWh' : '—'}</td>
              <td class="num">${b.comingSoon ? '—' : Catalog._priceInp('batteries', b.id, 'purchasePrice', b.purchasePrice, rid)}</td>
              <td class="num">${b.comingSoon ? '—' : Catalog._priceInp('batteries', b.id, 'salesPrice', b.salesPrice, rid)}</td>
              <td style="text-align:right"><span id="${rid}">${b.comingSoon ? '—' : Catalog._marginBadge(b.purchasePrice, b.salesPrice)}</span></td>
              <td>${b.comingSoon ? '—' : Catalog._inp('batteries', b.id, 'description', b.description)}</td>
              <td>${b.comingSoon ? '—' : Catalog._urlInp('batteries', b.id, 'datasheetUrl', b.datasheetUrl)}</td>
              <td>${b.comingSoon ? '—' : Catalog._urlInp('batteries', b.id, 'manualUrl', b.manualUrl)}</td>
              <td>${b.comingSoon ? '' : Catalog._delBtn('batteries', b.id, b.name)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${Catalog._addBtn('batteries')}
    ${Catalog._legendBox()}`;
  },

  // ── FLIK: VÄXELRIKTARE ───────────────────────────────────
  _renderInverters() {
    const items = Catalog.data.inverters || [];
    return `
    <div class="catalog-table-wrap">
      <table class="catalog-table">
        <thead><tr>
          <th>Produkt</th><th>Varumärke</th><th>kW</th>
          <th style="text-align:right">Inköp (kr)</th>
          <th style="text-align:right">Sälj (kr)</th>
          <th style="text-align:right">Marginal</th>
          <th>Datablad</th><th>Manual</th><th></th>
        </tr></thead>
        <tbody>
          ${items.map(inv => {
            const rid = `margin-inv-${inv.id}`;
            return `<tr class="${inv.comingSoon ? 'coming-soon' : ''}">
              <td>
                <div style="font-weight:600;color:var(--text-primary)">${inv.comingSoon ? AdminUI.escape(inv.name) : Catalog._inp('inverters', inv.id, 'name', inv.name)}</div>
                <div style="font-size:10px;color:var(--text-muted)">${inv.id}</div>
                ${inv.isMicroinverter ? '<span class="coming-soon-badge" style="background:var(--blue-bg);color:var(--blue)">Mikro</span>' : ''}
                ${inv.comingSoon ? '<span class="coming-soon-badge">🔜 Kommer snart</span>' : ''}
              </td>
              <td>${Catalog._brandPill(inv.brand)}</td>
              <td style="color:var(--text-secondary)">${inv.powerKw > 0 ? inv.powerKw + ' kW' : '—'}</td>
              <td class="num">${inv.comingSoon ? '—' : Catalog._priceInp('inverters', inv.id, 'purchasePrice', inv.purchasePrice, rid)}</td>
              <td class="num">${inv.comingSoon ? '—' : Catalog._priceInp('inverters', inv.id, 'salesPrice', inv.salesPrice, rid)}</td>
              <td style="text-align:right"><span id="${rid}">${inv.comingSoon ? '—' : Catalog._marginBadge(inv.purchasePrice, inv.salesPrice)}</span></td>
              <td>${inv.comingSoon ? '—' : Catalog._urlInp('inverters', inv.id, 'datasheetUrl', inv.datasheetUrl)}</td>
              <td>${inv.comingSoon ? '—' : Catalog._urlInp('inverters', inv.id, 'manualUrl', inv.manualUrl)}</td>
              <td>${inv.comingSoon ? '' : Catalog._delBtn('inverters', inv.id, inv.name)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${Catalog._addBtn('inverters')}
    ${Catalog._legendBox()}`;
  },

  // ── FLIK: SOLPANELER ─────────────────────────────────────
  _renderPanels() {
    const items = Catalog.data.solarPanels || [];
    return `
    <div class="catalog-table-wrap">
      <table class="catalog-table">
        <thead><tr>
          <th>Produkt</th><th>Watt</th>
          <th style="text-align:right">Inköp (kr)</th>
          <th style="text-align:right">Sälj (kr)</th>
          <th style="text-align:right">Marginal</th>
          <th>Datablad</th><th>Manual</th><th></th>
        </tr></thead>
        <tbody>
          ${items.map(p => {
            const rid = `margin-pan-${p.id}`;
            return `<tr>
              <td>
                <div style="font-weight:600;color:var(--text-primary)">${Catalog._inp('solarPanels', p.id, 'name', p.name)}</div>
                <div style="font-size:10px;color:var(--text-muted)">${p.id}</div>
              </td>
              <td style="display:flex;align-items:center;gap:4px">
                ${Catalog._inp('solarPanels', p.id, 'watt', p.watt, 'price')}
                <span style="font-size:11px;color:var(--text-muted)">W</span>
              </td>
              <td class="num">${Catalog._priceInp('solarPanels', p.id, 'purchasePrice', p.purchasePrice, rid)}</td>
              <td class="num">${Catalog._priceInp('solarPanels', p.id, 'salesPrice', p.salesPrice, rid)}</td>
              <td style="text-align:right"><span id="${rid}">${Catalog._marginBadge(p.purchasePrice, p.salesPrice)}</span></td>
              <td>${Catalog._urlInp('solarPanels', p.id, 'datasheetUrl', p.datasheetUrl)}</td>
              <td>${Catalog._urlInp('solarPanels', p.id, 'manualUrl', p.manualUrl)}</td>
              <td>${Catalog._delBtn('solarPanels', p.id, p.name)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${Catalog._addBtn('panels')}
    ${Catalog._legendBox()}`;
  },

  // ── FLIK: MONTAGE ────────────────────────────────────────
  _renderMounting() {
    const items = Catalog.data.mounting || [];
    const typeLabels = { roof:'🏠 Tak', ground:'🌿 Mark', facade:'🏢 Fasad' };
    return `
    <div class="catalog-table-wrap">
      <table class="catalog-table">
        <thead><tr>
          <th>Produkt</th><th>Typ</th>
          <th style="text-align:right">Inköp/panel (kr)</th>
          <th style="text-align:right">Sälj/panel (kr)</th>
          <th style="text-align:right">Marginal</th><th></th>
        </tr></thead>
        <tbody>
          ${items.map(m => {
            const rid = `margin-mnt-${m.id}`;
            return `<tr>
              <td>
                <div style="font-weight:600;color:var(--text-primary)">${Catalog._inp('mounting', m.id, 'name', m.name)}</div>
                <div style="font-size:10px;color:var(--text-muted)">${m.id}</div>
              </td>
              <td><span class="badge badge-muted">${typeLabels[m.type] || m.type}</span></td>
              <td class="num">${Catalog._priceInp('mounting', m.id, 'purchasePrice', m.purchasePrice, rid)}</td>
              <td class="num">${Catalog._priceInp('mounting', m.id, 'salesPrice', m.salesPrice, rid)}</td>
              <td style="text-align:right"><span id="${rid}">${Catalog._marginBadge(m.purchasePrice, m.salesPrice)}</span></td>
              <td>${Catalog._delBtn('mounting', m.id, m.name)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${Catalog._addBtn('mounting')}
    ${Catalog._legendBox()}`;
  },

  // ── FLIK: TILLBEHÖR ──────────────────────────────────────
  _renderAddons() {
    const items = (Catalog.data.addons || []).filter(a => !a.isFrakt);
    const frakt  = (Catalog.data.addons || []).filter(a =>  a.isFrakt);
    return `
    <div class="catalog-table-wrap">
      <table class="catalog-table">
        <thead><tr>
          <th>Produkt</th><th>Varumärke</th><th>Typ</th>
          <th style="text-align:right">Inköp (kr)</th>
          <th style="text-align:right">Sälj (kr)</th>
          <th style="text-align:right">Marginal</th>
          <th>Beskrivning</th><th></th>
        </tr></thead>
        <tbody>
          ${items.map(a => {
            const rid = `margin-add-${a.id}`;
            const isPerMeter  = a.isDcCable || a.isGravning;
            const purchaseVal = isPerMeter ? (a.purchasePerMeter ?? a.purchasePrice) : a.purchasePrice;
            const salesVal    = isPerMeter ? (a.pricePerMeter   ?? a.salesPrice)    : a.salesPrice;
            const pField      = isPerMeter ? 'purchasePerMeter' : 'purchasePrice';
            const sField      = isPerMeter ? 'pricePerMeter'    : 'salesPrice';
            const unit        = isPerMeter ? '/m' : '';
            let typeLabel = a.isCombiners ? 'Combiner Box' : a.isDcCable ? 'DC-kabel /m' : a.isGravning ? 'Grävning /m' : 'Tillbehör';
            return `<tr>
              <td>
                <div style="font-weight:600;color:var(--text-primary)">${Catalog._inp('addons', a.id, 'name', a.name)}</div>
                <div style="font-size:10px;color:var(--text-muted)">${a.id}</div>
              </td>
              <td>${Catalog._brandPill(a.brand)}</td>
              <td><span class="badge badge-muted" style="font-size:10px">${typeLabel}</span></td>
              <td class="num" style="white-space:nowrap">
                ${Catalog._priceInp('addons', a.id, pField, purchaseVal, rid)}
                ${unit ? `<span style="font-size:11px;color:var(--text-muted)">${unit}</span>` : ''}
              </td>
              <td class="num" style="white-space:nowrap">
                ${Catalog._priceInp('addons', a.id, sField, salesVal, rid)}
                ${unit ? `<span style="font-size:11px;color:var(--text-muted)">${unit}</span>` : ''}
              </td>
              <td style="text-align:right"><span id="${rid}">${Catalog._marginBadge(purchaseVal, salesVal)}</span></td>
              <td>${Catalog._inp('addons', a.id, 'description', a.description)}</td>
              <td>${Catalog._delBtn('addons', a.id, a.name)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${Catalog._addBtn('addons')}

    <!-- Frakt (separat sektion) -->
    <div class="catalog-table-wrap" style="margin-top:16px">
      <div style="padding:12px 16px;background:var(--bg-hover);border-bottom:1px solid var(--border);font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px">
        🚚 Frakt (auto-sätts per scenario)
      </div>
      <table class="catalog-table">
        <thead><tr>
          <th>Frakttyp</th><th>Scenario</th>
          <th style="text-align:right">Inköp (kr)</th>
          <th style="text-align:right">Sälj (kr)</th>
          <th style="text-align:right">Marginal</th>
        </tr></thead>
        <tbody>
          ${frakt.map(a => {
            const rid = `margin-frakt-${a.id}`;
            return `<tr>
              <td><div style="font-weight:600;color:var(--text-primary)">${AdminUI.escape(a.name)}</div></td>
              <td><span class="badge badge-muted" style="font-size:10px">${a.fraktType || '–'}</span></td>
              <td class="num">${Catalog._priceInp('addons', a.id, 'purchasePrice', a.purchasePrice, rid)}</td>
              <td class="num">${Catalog._priceInp('addons', a.id, 'salesPrice', a.salesPrice, rid)}</td>
              <td style="text-align:right"><span id="${rid}">${Catalog._marginBadge(a.purchasePrice, a.salesPrice)}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${Catalog._legendBox()}`;
  },

  // ── FLIK: UE ────────────────────────────────────────────
  _renderUE() {
    const items = Catalog.data.ue || [];
    return `
    <div class="catalog-table-wrap">
      <table class="catalog-table">
        <thead><tr>
          <th>Tjänst</th>
          <th style="text-align:right">Inköp/panel (kr)</th>
          <th style="text-align:right">Sälj/panel (kr)</th>
          <th style="text-align:right">Marginal</th>
          <th>Beskrivning</th><th></th>
        </tr></thead>
        <tbody>
          ${items.map(u => {
            const rid = `margin-ue-${u.id}`;
            return `<tr>
              <td>
                <div style="font-weight:600;color:var(--text-primary)">${Catalog._inp('ue', u.id, 'name', u.name)}</div>
                <div style="font-size:10px;color:var(--text-muted)">${u.id}</div>
              </td>
              <td class="num">${Catalog._priceInp('ue', u.id, 'purchasePrice', u.purchasePrice, rid)}</td>
              <td class="num">${Catalog._priceInp('ue', u.id, 'salesPrice', u.salesPrice, rid)}</td>
              <td style="text-align:right"><span id="${rid}">${Catalog._marginBadge(u.purchasePrice, u.salesPrice)}</span></td>
              <td>${Catalog._inp('ue', u.id, 'description', u.description)}</td>
              <td>${Catalog._delBtn('ue', u.id, u.name)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${Catalog._addBtn('ue')}
    ${Catalog._legendBox()}`;
  },

  // ── FLIK: INSTÄLLNINGAR ──────────────────────────────────
  _renderSettings() {
    const s = Catalog.settings || {};
    return `
    <div class="settings-grid">
      <div class="settings-card">
        <div class="settings-card-title">💰 Ekonomi</div>
        <div class="settings-row">
          <span class="settings-label">Moms</span>
          <div style="display:flex;align-items:center;gap:6px">
            <input class="settings-input" type="number" min="0" max="100" step="1"
              value="${((s.vat || 0.25) * 100).toFixed(0)}"
              onchange="Catalog.updateSetting('vat', this.value / 100)">
            <span style="font-size:13px;color:var(--text-secondary)">%</span>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">Valuta</span>
          <span class="settings-value">${s.currency || 'SEK'}</span>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">☀️ Solcellsberäkning</div>
        <div class="settings-row">
          <span class="settings-label">Produktionsfaktor</span>
          <div style="display:flex;align-items:center;gap:6px">
            <input class="settings-input" type="number" min="500" max="1500" step="10"
              value="${s.productionFactor || 1000}"
              onchange="Catalog.updateSetting('productionFactor', +this.value)">
            <span style="font-size:13px;color:var(--text-secondary)">kWh/kWp</span>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">Standard elpris</span>
          <div style="display:flex;align-items:center;gap:6px">
            <input class="settings-input" type="number" min="0.1" max="10" step="0.1"
              value="${s.elspotPrice || 1.9}"
              onchange="Catalog.updateSetting('elspotPrice', +this.value)">
            <span style="font-size:13px;color:var(--text-secondary)">kr/kWh</span>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">Region</span>
          <span class="settings-value">${s.region || 'kalmar'}</span>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">🚚 Frakt (säljpris)</div>
        <div class="settings-row">
          <span class="settings-label">Batteri-only</span>
          <div style="display:flex;align-items:center;gap:6px">
            <input class="settings-input" type="number" min="0" step="100"
              value="${s.fraktBattery || 2000}"
              onchange="Catalog.updateFrakt('battery', +this.value)">
            <span style="font-size:13px;color:var(--text-secondary)">kr</span>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">Solceller-only</span>
          <div style="display:flex;align-items:center;gap:6px">
            <input class="settings-input" type="number" min="0" step="100"
              value="${s.fraktSolar || 2000}"
              onchange="Catalog.updateFrakt('solar', +this.value)">
            <span style="font-size:13px;color:var(--text-secondary)">kr</span>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">Hybrid</span>
          <div style="display:flex;align-items:center;gap:6px">
            <input class="settings-input" type="number" min="0" step="100"
              value="${s.fraktHybrid || 3200}"
              onchange="Catalog.updateFrakt('hybrid', +this.value)">
            <span style="font-size:13px;color:var(--text-secondary)">kr</span>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">ℹ️ Om systemet</div>
        <div class="settings-row">
          <span class="settings-label">Version</span>
          <span class="settings-value">SolarCPQ v3.5</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">Firebase projekt</span>
          <span class="settings-value" style="font-size:11px">projektering-aurora</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">Region</span>
          <span class="settings-value">europe-west1</span>
        </div>
        <div style="margin-top:14px">
          <button class="btn btn-secondary btn-sm w-full" onclick="Catalog.seedFromCore()">
            🔄 Återinitiera katalog från core.js
          </button>
        </div>
      </div>
    </div>`;
  },

  updateSetting(key, value) {
    if (!Catalog.settings) Catalog.settings = {};
    Catalog.settings[key] = value;
    Catalog._scheduleSave();
  },

  updateFrakt(type, value) {
    const fraktMap   = { battery:'add_013', solar:'add_014', hybrid:'add_015' };
    const settingMap = { battery:'fraktBattery', solar:'fraktSolar', hybrid:'fraktHybrid' };
    const addon = (Catalog.data.addons || []).find(a => a.id === fraktMap[type]);
    if (addon) addon.salesPrice = value;
    if (!Catalog.settings) Catalog.settings = {};
    Catalog.settings[settingMap[type]] = value;
    Catalog._scheduleSave();
  },

  _legendBox() {
    return `
    <div style="display:flex;align-items:center;gap:16px;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);margin-top:8px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px">Marginal:</span>
      <span class="margin-badge margin-good">≥25% Bra</span>
      <span class="margin-badge margin-ok">10–24% OK</span>
      <span class="margin-badge margin-low">&lt;10% Låg</span>
      <span style="font-size:11px;color:var(--text-muted);margin-left:8px">Sparas automatiskt → kunden ser nya priser på nästa offert</span>
    </div>`;
  }
};

window.CatalogInit = async function() {
  await Catalog.init();
};
