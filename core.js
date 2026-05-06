// ============================================================
// SolarCPQ — CORE DATA LAYER v3.5
// Aurora Energy Group AB
// Kund: Kalmar VVS & Elmontage AB
// ============================================================

const DB_KEY     = "sbP_v3";
const DB_VERSION = "3.5";

// ─── DEFAULT STATE ───────────────────────────────────────────
const DEFAULT_STATE = {
  meta: { version: DB_VERSION },
  settings: {
    vat: 0.25,
    currency: "SEK",
    fraktBattery: 2000,
    fraktSolar: 2000,
    fraktHybrid: 3200,
    region: "kalmar",
    elspotPrice: 1.9,
    productionFactor: 1000
  },
  products: {
    batteries: [
      {
        id: "bat_001",
        brand: "emaldo",
        name: "Power Store AI",
        type: "battery_only",
        autoSelect: "battery",
        capacityKwh: 5.12,
        purchasePrice: 25000,
        salesPrice: 35000,
        badge: "green",
        description: "Startpaket inkluderar: Växelriktare (utan MPPT-ingång), Batteri 5,12 kWh, Energistyrning (AI/EMS).",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "bat_002",
        brand: "emaldo",
        name: "Power Core AI",
        type: "hybrid",
        autoSelect: "solar_hybrid",
        capacityKwh: 5.12,
        minPanels: 4,
        purchasePrice: 28000,
        salesPrice: 40000,
        badge: "green",
        description: "Startpaket inkluderar: Växelriktare med 3× MPPT-ingångar, Batteri 5,12 kWh, Energistyrning (EMS + AI), Inbyggd laddbox (Typ 2). Kräver minst 4 solpaneler.",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "bat_005",
        brand: "emaldo",
        name: "Emaldo tilläggsmodul 5,12 kWh",
        type: "addon_module",
        capacityKwh: 5.12,
        maxModules: 2,
        minModules: 0,
        purchasePrice: 15000,
        salesPrice: 22000,
        badge: "green",
        description: "Extra batterimodul för utökning av Emaldo-system.",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "bat_003",
        brand: "enphase",
        name: "IQ Battery 5P",
        type: "battery_only",
        capacityKwh: 5,
        maxModules: 9,
        minModules: 1,
        purchasePrice: 30000,
        salesPrice: 32000,
        badge: "blue",
        description: "Enphase IQ Battery 5P. Max 9 st per installation.",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "bat_004_base",
        brand: "dyness",
        name: "Dyness BDU & Base",
        type: "battery_only",
        isDynessBase: true,
        capacityKwh: 0,
        purchasePrice: 8495,
        salesPrice: 15000,
        badge: "amber",
        description: "Dyness Stack 100 — baskonfiguration. Alltid 1 st per installation.",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "bat_004_mod",
        brand: "dyness",
        name: "Dyness batterimodul 5,12 kWh",
        type: "battery_only",
        isDynessModule: true,
        capacityKwh: 5.12,
        maxModules: 15,
        minModules: 3,
        purchasePrice: 8895,
        salesPrice: 17000,
        badge: "amber",
        description: "Dyness Stack 100 batterimodul. 5,12 kWh per modul.",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "bat_006",
        brand: "huawei",
        name: "Huawei Luna2000",
        type: "battery_only",
        capacityKwh: 0,
        purchasePrice: 0,
        salesPrice: 0,
        badge: "red",
        description: "Huawei Luna2000 — priser sätts i admin.",
        datasheetUrl: "",
        manualUrl: "",
        comingSoon: true
      }
    ],
    inverters: [
      {
        id: "inv_001",
        brand: "solis",
        name: "Solis S6-EH3P 10kW",
        powerKw: 10,
        minPanels: 6,
        purchasePrice: 12500,
        salesPrice: 18500,
        badge: "amber",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "inv_002",
        brand: "solis",
        name: "Solis S6-EH3P 12kW",
        powerKw: 12,
        minPanels: 6,
        purchasePrice: 16000,
        salesPrice: 23000,
        badge: "amber",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "inv_003",
        brand: "solis",
        name: "Solis S6-EH3P 15kW",
        powerKw: 15,
        minPanels: 6,
        purchasePrice: 16900,
        salesPrice: 23000,
        badge: "amber",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "inv_004",
        brand: "solis",
        name: "Solis S6-EH3P 20kW",
        powerKw: 20,
        minPanels: 6,
        purchasePrice: 20900,
        salesPrice: 31000,
        badge: "amber",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "inv_005",
        brand: "solis",
        name: "Solis S6-EH3P 30kW",
        powerKw: 30,
        minPanels: 6,
        purchasePrice: 35500,
        salesPrice: 45000,
        badge: "amber",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "inv_006",
        brand: "solis",
        name: "Solis S6-EH3P 50kW",
        powerKw: 50,
        minPanels: 6,
        purchasePrice: 48900,
        salesPrice: 62000,
        badge: "amber",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "inv_007",
        brand: "solis",
        name: "Solis S6-EH3P 80kW",
        powerKw: 80,
        minPanels: 6,
        purchasePrice: 80900,
        salesPrice: 95000,
        badge: "amber",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "inv_010",
        brand: "enphase",
        name: "Enphase mikroväxelriktare IQ8",
        isMicroinverter: true,
        powerKw: 0.366,
        purchasePrice: 1500,
        salesPrice: 1600,
        badge: "blue",
        description: "1 mikroväxelriktare per panel. AC-kabel mellan mikroväxelriktarna ingår i priset.",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "inv_020",
        brand: "huawei",
        name: "Huawei SUN2000",
        powerKw: 0,
        minPanels: 6,
        purchasePrice: 0,
        salesPrice: 0,
        badge: "red",
        description: "Huawei SUN2000 — priser sätts i admin.",
        datasheetUrl: "",
        manualUrl: "",
        comingSoon: true
      }
    ],
    solarPanels: [
      {
        id: "pan_001",
        name: "Solpanel 460W",
        watt: 460,
        purchasePrice: 679,
        salesPrice: 1150,
        badge: "neutral",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "pan_002",
        name: "Solpanel 500W",
        watt: 500,
        purchasePrice: 719,
        salesPrice: 1290,
        badge: "neutral",
        datasheetUrl: "",
        manualUrl: ""
      }
    ],
    mounting: [
      { id: "mnt_001", name: "Falsad plåt",          type: "roof",   purchasePrice: 1004, salesPrice: 1320 },
      { id: "mnt_002", name: "TRP/Korrugerad plåt",  type: "roof",   purchasePrice: 450,  salesPrice: 890  },
      { id: "mnt_003", name: "Betong/Tegeltak",      type: "roof",   purchasePrice: 750,  salesPrice: 990  },
      { id: "mnt_004", name: "Papptak",              type: "roof",   purchasePrice: 1020, salesPrice: 1250 },
      { id: "mnt_005", name: "Markmontage",          type: "ground", purchasePrice: 1100, salesPrice: 1530 },
      { id: "mnt_006", name: "Fasadmontage",         type: "facade", purchasePrice: 550,  salesPrice: 910  }
    ],
    addons: [
      {
        id: "add_001",
        name: "Gateway Metered",
        brand: "enphase",
        purchasePrice: 4700,
        salesPrice: 5200,
        datasheetUrl: "",
        manualUrl: ""
      },
      // add_002 (Comms Kit 1) BORTTAGEN — behövs ej
      {
        id: "add_003",
        name: "Comms Kit 2",
        brand: "enphase",
        purchasePrice: 1300,
        salesPrice: 1800,
        description: "Används vid batteri-only och hybrid.",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "add_004",
        name: "IQ Relay",
        brand: "enphase",
        purchasePrice: 1400,
        salesPrice: 1600,
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "add_005",
        name: "Pedestal",
        brand: "enphase",
        purchasePrice: 3400,
        salesPrice: 3600,
        description: "En pedestal krävs per batterimodul vid markmontage.",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "add_006",
        name: "Smartmätare",
        brand: "solis",
        purchasePrice: 1500,
        salesPrice: 2200,
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "add_009",
        name: "IQ Combiner Box",
        brand: "enphase",
        isCombiners: true,
        purchasePrice: 11900,
        salesPrice: 13000,
        description: "Ingår: Gateway Metered, 2× IQ Relay, Comms Kit 2, 6× CT-klämmor, säkringar och jordfelsbrytare. Möjliggör framtida batteriutbyggnad utan extra tillbehör.",
        datasheetUrl: "",
        manualUrl: ""
      },
      {
        id: "add_011",
        name: "DC-kabel",
        brand: "generic",
        isDcCable: true,
        purchasePerMeter: 20,
        pricePerMeter: 30,
        purchasePrice: 20,
        salesPrice: 30,
        description: "Startavgift: 2m × antal paneler. Kund anger extra meter utöver startavgiften."
      },
      {
        id: "add_012",
        name: "Grävning",
        brand: "generic",
        isGravning: true,
        pricePerMeter: 700,
        purchasePerMeter: 700,
        purchasePrice: 700,
        salesPrice: 700,
        description: "Grävning för kabelförläggning. 700 kr/m."
      },
      {
        id: "add_013",
        name: "Frakt — Batteri",
        brand: "generic",
        isFrakt: true,
        fraktType: "battery",
        purchasePrice: 0,
        salesPrice: 2000
      },
      {
        id: "add_014",
        name: "Frakt — Solceller",
        brand: "generic",
        isFrakt: true,
        fraktType: "solar",
        purchasePrice: 0,
        salesPrice: 2000
      },
      {
        id: "add_015",
        name: "Frakt — Hybrid",
        brand: "generic",
        isFrakt: true,
        fraktType: "hybrid",
        purchasePrice: 0,
        salesPrice: 3200
      }
    ],
    ue: [
      {
        id: "ue_001",
        name: "Underentreprenad solcellsmontage",
        description: "Installation av solceller och montagesystem. Ställning ingår. Kabeldragning från solpaneler till växelriktarens placering. Buntband, klammer och övrig fästning ingår.",
        purchasePrice: 1050,
        salesPrice: 1300
      }
    ],
    customAddons: []
  },

  pricing: {
    // Emaldo Gridreward — kr/mån per elområde, typ och antal batterier
    // null = ej tillgängligt
    emaldoAvkastning: {
      fast: {
        SE3: { 1: null, 2: null, 3: 1100 },
        SE4: { 1: null, 2: null, 3: 1370 }
      },
      rorlig: {
        SE3: { 1: 500, 2: 750, 3: 750 },
        SE4: { 1: 500, 2: 1007, 3: 1007 }
      }
    }
  },

  projects: []
};

// ─── DATABASE ─────────────────────────────────────────────────
const DB = {
  load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return this._migrate(DEFAULT_STATE);
      const stored = JSON.parse(raw);
      return this._migrate(stored);
    } catch(e) {
      console.error("DB.load error:", e);
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  },

  save(state) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(state));
    } catch(e) {
      console.error("DB.save error:", e);
    }
  },

  set(updaterFn) {
    const state = this.load();
    const updated = updaterFn(state);
    this.save(updated);
    this._notifyListeners();
    return updated;
  },

  _migrate(state) {
    // Always ensure fresh product catalog from DEFAULT_STATE
    // but preserve admin-added customAddons and user-edited prices
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
    if (!state.meta || state.meta.version !== DB_VERSION) {
      // Preserve projects and custom addons across migrations
      fresh.projects = state.projects || [];
      fresh.products.customAddons = state.products?.customAddons || [];
      fresh.meta = { version: DB_VERSION };
      this.save(fresh);
      return fresh;
    }
    // Preserve projects
    if (state.projects) fresh.projects = state.projects;
    if (state.products?.customAddons) fresh.products.customAddons = state.products.customAddons;
    return fresh;
  },

  _listeners: [],
  onExternalChange(fn) { this._listeners.push(fn); },
  _notifyListeners() { this._listeners.forEach(fn => fn()); }
};

// ─── PROJECTS ─────────────────────────────────────────────────
const Projects = {
  getAll() {
    return DB.load().projects || [];
  },

  getById(id) {
    return this.getAll().find(p => p.projectId === id) || null;
  },

  create(data) {
    const project = {
      projectId: crypto.randomUUID(),
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      admin: {},
      ...data
    };
    DB.set(state => {
      if (!state.projects) state.projects = [];
      state.projects.push(project);
      return state;
    });
    return project;
  },

  update(id, changes) {
    DB.set(state => {
      const idx = (state.projects || []).findIndex(p => p.projectId === id);
      if (idx > -1) {
        state.projects[idx] = {
          ...state.projects[idx],
          ...changes,
          admin: { ...state.projects[idx].admin, ...(changes.admin || {}) },
          updatedAt: new Date().toISOString()
        };
      }
      return state;
    });
  },

  updateStatus(id, status) {
    this.update(id, { status });
  },

  delete(id) {
    DB.set(state => {
      state.projects = (state.projects || []).filter(p => p.projectId !== id);
      return state;
    });
  },

  search(query) {
    const q = query.toLowerCase();
    return this.getAll().filter(p =>
      p.projectName?.toLowerCase().includes(q) ||
      p.customer?.name?.toLowerCase().includes(q) ||
      p.customer?.email?.toLowerCase().includes(q)
    );
  }
};

// ─── PRICING ──────────────────────────────────────────────────
const Pricing = {

  // Calculate financial summary from line items
  calcFinancials(lineItems) {
    const revenueExVat = lineItems.reduce((s, i) => s + (i.salesPrice * i.qty), 0);
    const revenueIncVat = revenueExVat * 1.25;
    const cost = lineItems.reduce((s, i) => s + ((i.purchasePrice || 0) * i.qty), 0);
    const profit = revenueExVat - cost;
    const marginPercent = revenueExVat > 0 ? Math.round(profit / revenueExVat * 1000) / 10 : 0;
    return { revenueExVat, revenueIncVat, cost, profit, marginPercent };
  },

  // Estimate solar production
  estimateProduction(kWp) {
    const state = DB.load();
    const factor = state.settings.productionFactor || 1000;
    return Math.round(kWp * factor);
  },

  // Emaldo Gridreward monthly income
  // Returns null if not available
  emaldoAvkastning(elomrade, typ, antalBatterier) {
    const state = DB.load();
    const table = state.pricing?.emaldoAvkastning?.[typ]?.[elomrade];
    if (!table) return null;
    const n = Math.min(3, Math.max(1, antalBatterier));
    return table[n] ?? null;
  },

  // Get required addons for Enphase based on scenario and combiner mode
  // OBS: Comms Kit 1 (add_002) is REMOVED. Comms Kit 2 (add_003) used for battery-only AND hybrid.
  getEnphaseAddons(scenario, useCombinerBox) {
    if (useCombinerBox) {
      return [{ id: "add_009", qty: 1 }];
    }
    const addons = [{ id: "add_001", qty: 1 }]; // Gateway always
    if (scenario === "battery" || scenario === "hybrid") {
      addons.push({ id: "add_003", qty: 1 }); // Comms Kit 2
    }
    if (scenario === "battery" || scenario === "solar") {
      addons.push({ id: "add_004", qty: 1 }); // 1× IQ Relay
    }
    if (scenario === "hybrid") {
      addons.push({ id: "add_004", qty: 2 }); // 2× IQ Relay
    }
    return addons;
  }
};

// ─── AUTH ─────────────────────────────────────────────────────
// NOTE: v3.5 uses Firebase Authentication instead of local passwords.
// These functions are kept as fallback only.
const Auth = {
  ADMIN_HASH: "d8e2b2c6f4a5c7e9f1b3d5e7a9c1e3f5b7d9e1f3a5c7e9f1b3d5e7a9c1e3f5b7",
  CUSTOMER_HASH: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",

  async _hash(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  },

  async verifyAdmin(pw) {
    // In v3.5: use Firebase Auth. Fallback: Admin953
    if (pw === "Admin953") return true;
    return false;
  },

  async verifyCustomer(pw) {
    // In v3.5: use Firebase Auth. Fallback: kalmar2026
    if (pw === "kalmar2026") return true;
    return false;
  },

  setSession(role) {
    sessionStorage.setItem("sbP_role", role);
    sessionStorage.setItem("sbP_auth", "1");
  },

  getSession() {
    return {
      authenticated: sessionStorage.getItem("sbP_auth") === "1",
      role: sessionStorage.getItem("sbP_role")
    };
  },

  clearSession() {
    sessionStorage.removeItem("sbP_role");
    sessionStorage.removeItem("sbP_auth");
  }
};

// ─── UTILS ───────────────────────────────────────────────────
const Utils = {
  formatCurrency(amount) {
    if (typeof amount !== "number" || isNaN(amount)) return "0 kr";
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: "SEK",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  },

  formatDate(dateStr) {
    if (!dateStr) return "–";
    try {
      return new Date(dateStr).toLocaleDateString("sv-SE");
    } catch { return "–"; }
  },

  formatDateTime(dateStr) {
    if (!dateStr) return "–";
    try {
      return new Date(dateStr).toLocaleString("sv-SE");
    } catch { return "–"; }
  },

  statusLabel(status) {
    const labels = {
      draft:    "Offert skapad",
      sent:     "Offert skickad",
      won:      "Vunnen",
      lost:     "Förlorad",
      archived: "Arkiverad"
    };
    return labels[status] || status;
  },

  scenarioLabel(scenario) {
    const labels = {
      battery:     "Enbart batteri",
      solar:       "Enbart solceller",
      hybrid:      "Hybrid",
      supplement:  "Komplettering av befintligt batteri"
    };
    return labels[scenario] || scenario;
  },

  brandLabel(brand) {
    const labels = {
      emaldo:      "Emaldo",
      solis_dyness:"Solis + Dyness",
      enphase:     "Enphase IQ 5P",
      huawei:      "Huawei"
    };
    return labels[brand] || brand;
  }
};

// ─── BRAND CONFIG ─────────────────────────────────────────────
// Centralized brand configuration for UI rendering
const BrandConfig = {
  getBrandsForScenario(scenario) {
    const isSolarOnly = scenario === "solar";
    const brands = [];

    if (!isSolarOnly) {
      brands.push({ brand: "emaldo",       cls: "green", name: "Emaldo",                desc: "Premium AI / VPP" });
      brands.push({ brand: "solis_dyness", cls: "amber", name: "Solis + Dyness",        desc: "Budget" });
      brands.push({ brand: "enphase",      cls: "blue",  name: "Enphase IQ 5P",         desc: "Premium" });
      brands.push({ brand: "huawei",       cls: "red",   name: "Huawei Luna2000",       desc: "Kommer snart", comingSoon: true });
    } else {
      brands.push({ brand: "solis_dyness", cls: "amber", name: "Solis",                 desc: "Solväxelriktare" });
      brands.push({ brand: "enphase",      cls: "blue",  name: "Enphase mikroväxelriktare", desc: "1 per panel" });
      brands.push({ brand: "huawei",       cls: "red",   name: "Huawei",                desc: "Solväxelriktare — Kommer snart", comingSoon: true });
    }

    return brands;
  },

  getMinPanels(brand, scenario) {
    if (brand === "emaldo" && scenario !== "battery") return 4;
    if (brand === "solis_dyness") return 6;
    if (brand === "huawei") return 6;
    return 1;
  }
};
