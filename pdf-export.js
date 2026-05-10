// ============================================================
// SolarCPQ — PDF Export v3.5.4
// 3-sidors layout, kompakt och visuell
// Sida 1: Produkter + summering
// Sida 2: Grönt avdrag + ekonomisk översikt
// Sida 3: (om nodvandigt, overflow)
// ============================================================

window.PDF = {

  C: {
    primary:   [79,  142, 247],
    green:     [21,  128, 61],
    greenMid:  [187, 247, 208],
    greenBg:   [240, 253, 244],
    amber:     [160, 100, 0],
    dark:      [15,  17,  23],
    text:      [30,  35,  50],
    muted:     [110, 125, 165],
    white:     [255, 255, 255],
    gray:      [247, 248, 252],
    border:    [218, 224, 238],
    purple:    [100, 60,  200]
  },

  SUPPLIER: {
    name:    'Kalmar VVS- & El-Montage AB',
    address: 'Storgatan 70, 386 32 Färjestaden',
    group:   'En del av Assemblin Caverion Group',
    desc:    'I april 2024 gick Caverion och Assemblin samman och bildade ett ledande ' +
             'nordeuropeiskt tekniskt service- och installationsföretag med ca 20 000 ' +
             'medarbetare i 9 länder.'
  },

  DISCLAIMER: 'Beräkningarna är exempelberäkningar avsedda som vägledning. Faktiska resultat ' +
              'kan avvika beroende på elanvändning, elpriser och skatteregler. ' +
              'Kalmar VVS- & El-Montage AB kan ej hållas ansvarig för beräkningarnas riktighet.',

  AVDRAG: { battery: 0.485, solar: 0.1455 },
  SCHAB:  { battery: 0.015, solar: 0.0045 },

  async generate(state, result) {
    if (!window.jspdf) {
      UI.toast('Laddar PDF-bibliotek...', 'success');
      await PDF._load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    if (!window.jspdf) { UI.toast('Kunde inte ladda PDF', 'error'); return; }
    UI.toast('Genererar PDF...', 'success');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = 210, ph = 297, ml = 15, mr = 15, cw = pw - ml - mr;
    let y = 0;

    // ══════════════════════════════════════════════════════
    // SIDA 1 — PRODUKTER
    // ══════════════════════════════════════════════════════
    // Ladda logo och rita header
    let logoData = null;
    try {
      logoData = await PDF._getLogo();
    } catch(e) {}
    y = PDF._header(doc, pw, ph, ml, mr, cw, state, logoData);

    // Kund + Leverantor hanteras nu i _header

    // Scenario-pill
    const pillC = { battery: PDF.C.primary, solar: PDF.C.amber, hybrid: PDF.C.purple };
    doc.setFillColor(...(pillC[state.scenario] || PDF.C.primary));
    doc.roundedRect(ml, y, 46, 6.5, 1.5, 1.5, 'F');
    doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.white);
    const scLbl = { battery: 'ENBART BATTERI', solar: 'ENBART SOLCELLER', hybrid: 'HYBRID' };
    doc.text(scLbl[state.scenario] || state.scenario.toUpperCase(), ml + 23, y + 4.6, { align: 'center' });
    y += 10;

    // Produkttabeller
    // BUGG 5 FIX: Baka in kundens vinstpåslag i radpriserna (per spec §9)
    // Vinstpåslaget ska INTE visas som separat rad i PDF
    const rawItems = result.lineItems;
    const profit   = result.customerProfit || 0;

    // Beräkna bas-revenue (exkl frakt) för att fördela påslaget proportionellt
    const nonFraktItems = rawItems.filter(i => i.group !== 'frakt');
    const baseRevenue   = nonFraktItems.reduce((s, i) => s + i.salesPrice * i.qty, 0);
    const profitFactor  = baseRevenue > 0 ? (baseRevenue + profit) / baseRevenue : 1;

    // Skapa justerade items med inbakat påslag (frakt behålls oförändrad)
    const items = rawItems.map(i => ({
      ...i,
      salesPrice: i.group === 'frakt' ? i.salesPrice : Math.round(i.salesPrice * profitFactor)
    }));

    const isBat    = state.scenario !== 'solar';
    const isSol    = state.scenario !== 'battery';
    const isHyb    = state.scenario === 'hybrid';
    const batItems = items.filter(i => ['battery','inverter','addons','el_bat'].includes(i.group));
    const solItems = items.filter(i => ['solar','ue','el_sol'].includes(i.group));
    const fraktItem= items.find(i => i.group === 'frakt');

    let batTotal = 0, solTotal = 0;
    if (isBat) batTotal = PDF._table(doc, ml, cw, ph, y, batItems, 'BATTERI & ELINSTALLATION', PDF.C.primary,       r => { y = r; });
    if (isSol) solTotal = PDF._table(doc, ml, cw, ph, y, solItems, 'SOLCELLER & MONTAGE',      PDF.C.amber, r => { y = r; });

    // Frakt + summering på sida 1
    if (fraktItem) {
      if (y > ph - 55) { doc.addPage(); y = 20; }
      doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(...PDF.C.muted);
      doc.text('Frakt - ' + PDF.s(fraktItem.name).replace('Frakt -- ','').replace('Frakt - ',''), ml + 2, y + 4);
      doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.text);
      doc.text(PDF.f(fraktItem.salesPrice), ml + cw, y + 4, { align: 'right' });
      y += 9;
    }

    // ── SUMMERING: separat per sektion + totalt ─────────────
    if (y > ph - 65) { doc.addPage(); y = 20; }

    const exVat    = result.revenueExVat;
    const incVat   = exVat * 1.25;
    const batIncV  = batTotal * 1.25;
    const solIncV  = solTotal * 1.25;
    const fraktVal = fraktItem ? fraktItem.salesPrice : 0;

    // Frakt laggs till batteri-sidan vid hybrid, annars pa relevant sida
    const batTotInc = isHyb
      ? batIncV + fraktVal * 1.25
      : (isBat ? (batTotal + fraktVal) * 1.25 : 0);
    const solTotInc = isHyb
      ? solIncV
      : (isSol ? (solTotal + fraktVal) * 1.25 : 0);

    const boxW = isHyb ? (cw - 4) / 2 : cw;

    // kWh-chip (ovanfor summering vid batteri)
    if (result.totalBatKwh > 0 && isBat) {
      doc.setFillColor(235, 241, 255);
      doc.roundedRect(ml, y, 60, 8, 2, 2, 'F');
      doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.primary);
      doc.text('Batterikapacitet: ' + result.totalBatKwh.toFixed(2) + ' kWh', ml + 3, y + 5.5);
      y += 11;
    }

    const drawTotalBox = (label, exMomsVal, inclMomsVal, color, xPos) => {
      const bw = isHyb ? boxW : cw;
      doc.setFillColor(...PDF.C.gray);
      doc.roundedRect(xPos, y, bw, 28, 2, 2, 'F');
      doc.setDrawColor(...color);
      doc.roundedRect(xPos, y, bw, 28, 2, 2, 'S');

      doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...color);
      doc.text(label, xPos + 4, y + 6);

      doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...PDF.C.muted);
      doc.text('Ex moms', xPos + 4, y + 13);
      doc.text('Moms 25%', xPos + 4, y + 19);
      doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.text);
      doc.text(PDF.f(exMomsVal), xPos + bw - 3, y + 13, { align: 'right' });
      doc.text(PDF.f(exMomsVal * 0.25), xPos + bw - 3, y + 19, { align: 'right' });

      doc.setDrawColor(...PDF.C.border);
      doc.line(xPos + 4, y + 21, xPos + bw - 4, y + 21);
      doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...color);
      doc.text('Totalt inkl moms', xPos + 4, y + 27);
      doc.text(PDF.f(inclMomsVal), xPos + bw - 3, y + 27, { align: 'right' });
    };

    if (isHyb) {
      drawTotalBox('BATTERI & EL', batTotal, batIncV, PDF.C.primary, ml);
      drawTotalBox('SOLCELLER & MONTAGE', solTotal, solIncV, PDF.C.amber, ml + boxW + 4);
    } else if (isBat) {
      drawTotalBox('BATTERI & ELINSTALLATION', batTotal, batIncV, PDF.C.primary, ml);
    } else {
      drawTotalBox('SOLCELLER & MONTAGE', solTotal, solIncV, PDF.C.amber, ml);
    }
    y += 32;

    // Grand total (vid hybrid)
    if (isHyb) {
      doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.primary);
      doc.text('TOTALT inkl moms (batteri + sol + frakt):', ml, y + 7);
      doc.text(PDF.f(incVat), ml + cw, y + 7, { align: 'right' });
      y += 12;
    }

    // ══════════════════════════════════════════════════════
    // SIDA 2 — GRÖNT AVDRAG + EKONOMISK ÖVERSIKT
    // ══════════════════════════════════════════════════════
    doc.addPage(); y = 15;

    // Grön header-banner
    doc.setFillColor(...PDF.C.green);
    doc.rect(0, 0, pw, 14, 'F');
    doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.white);
    doc.text('GRÖNT AVDRAG GRONT AVDRAG & EKONOMISK ÖVERSIKT EKONOMISK ÖVERSIKT', ml, 10);
    y = 20;

    // 2-kolumn: grönt avdrag vänster, ekonomi höger
    const colW  = (cw - 6) / 2;
    const col1x = ml;
    const col2x = ml + colW + 6;
    let col1y = y, col2y = y;

    // ── KOLUMN 1: GRÖNT AVDRAG ───────────────────────────
    doc.setFontSize(8.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.green);
    doc.text('SKATTEREDUKTION', col1x, col1y + 5);
    col1y += 8;

    doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(...PDF.C.muted);
    const explTxt = PDF.s('Staten erbjuder skattereduktion for batteri och solceller. ' +
      'Söks via årlig inkomstdeklaration.');
    const explL = doc.splitTextToSize(explTxt, colW);
    explL.forEach(l => { doc.text(l, col1x, col1y); col1y += 3.8; });
    col1y += 3;

    const drawAvdrag = (inclMoms, rate, schab, label, color) => {
      const avdrag    = Math.round(inclMoms * rate);
      const ejAvdrag  = Math.round(inclMoms * schab);
      const efterPris = inclMoms - avdrag;
      const pctAvd    = (rate * 100).toFixed(1).replace('.', ',') + '%';
      const pctSchab  = (schab * 100).toFixed(1).replace('.', ',') + '%';
      const totPct    = ((rate + schab) * 100).toFixed(0) + '%';

      // Rubriklabel
      doc.setFillColor(...color);
      doc.rect(col1x, col1y, colW, 6, 'F');
      doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.white);
      doc.text(label, col1x + 2, col1y + 4.2);
      col1y += 7;

      // Schablonförklaring
      doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...PDF.C.muted);
      const schabTxt = PDF.s(totPct + ' reduktion, varav ' + pctSchab + ' ej avdragsgill (schablonbelopp). Netto: ' + pctAvd + '.');
      const schabL = doc.splitTextToSize(schabTxt, colW);
      schabL.forEach(l => { doc.text(l, col1x, col1y); col1y += 3.5; });
      col1y += 2;

      const row = (bg, label, val, textCol, bold, big) => {
        doc.setFillColor(...bg);
        const rh = big ? 9 : 6.5;
        doc.rect(col1x, col1y, colW, rh, 'F');
        if (big) {
          doc.setDrawColor(...PDF.C.green);
          doc.rect(col1x, col1y, colW, rh, 'S');
        }
        doc.setFontSize(big ? 8.5 : 7.5);
        doc.setFont(undefined, bold ? 'bold' : 'normal');
        doc.setTextColor(...textCol);
        doc.text(PDF.s(label), col1x + 2, col1y + (big ? 6 : 4.5));
        doc.setFont(undefined, 'bold');
        doc.text(val, col1x + colW, col1y + (big ? 6 : 4.5), { align: 'right' });
        col1y += rh + 1;
      };

      row([248,250,255], 'Pris inkl moms',        PDF.f(inclMoms),    PDF.C.text,  false, false);
      row([220,252,231], 'Skattereduktion ' + pctAvd + ' (avdragsgill)', '- ' + PDF.f(avdrag), PDF.C.green, false, false);
      row([245,245,250], 'Ej avdragsgill ' + pctSchab + ' (schablonbelopp)', PDF.f(ejAvdrag), PDF.C.muted, false, false);
      row([187,247,208], 'PRIS EFTER SKATTEREDUKTION', PDF.f(efterPris), PDF.C.green, true,  true);

      col1y += 5;
      return { avdrag, efterPris };
    };

    let batResult = null, solResult = null;
    if (isBat && batTotal > 0) batResult = drawAvdrag(batTotal * 1.25, PDF.AVDRAG.battery, PDF.SCHAB.battery, 'BATTERI 50% (48,5% netto)', PDF.C.primary);
    if (isSol && solTotal > 0) solResult = drawAvdrag(solTotal * 1.25, PDF.AVDRAG.solar, PDF.SCHAB.solar, 'SOLCELLER 15% (14,55% netto)', PDF.C.amber);

    // Fotnot
    doc.setFontSize(6.5); doc.setFont(undefined, 'italic'); doc.setTextColor(...PDF.C.muted);
    const fnL = doc.splitTextToSize(PDF.s('* Skattereduktionen söks via inkomstdeklarationen. Villkor per Skatteverkets regler.'), colW);
    fnL.forEach(l => { doc.text(l, col1x, col1y); col1y += 3.5; });

    // ── KOLUMN 2: EKONOMISK ÖVERSIKT ─────────────────────
    doc.setFontSize(8.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.primary);
    doc.text('EKONOMISK ÖVERSIKT', col2x, col2y + 5);
    col2y += 8;

    const infoBox = (title, rows, bgCol, borderCol) => {
      const bh = 8 + rows.length * 7 + 2;
      doc.setFillColor(...bgCol);
      doc.roundedRect(col2x, col2y, colW, bh, 2, 2, 'F');
      doc.setDrawColor(...borderCol);
      doc.roundedRect(col2x, col2y, colW, bh, 2, 2, 'S');
      doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...borderCol);
      doc.text(title, col2x + 3, col2y + 6);
      let ry = col2y + 11;
      rows.forEach(([lbl, val, highlight]) => {
        doc.setFontSize(7);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...(highlight ? PDF.C.green : PDF.C.text));
        doc.text(PDF.s(lbl), col2x + 3, ry);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...(highlight ? PDF.C.green : PDF.C.text));
        doc.text(PDF.s(val), col2x + colW - 2, ry, { align: 'right' });
        ry += 7;
      });
      col2y += bh + 5;
    };

    // Sol-avkastning
    if (result.solarReturn && isSol) {
      const ret = result.solarReturn;
      const solAfter = solResult ? solResult.efterPris : solTotal * 1.25;
      const payback  = ret.krPerYear > 0 ? (solAfter / ret.krPerYear).toFixed(1) : '-';
      const avkPct   = solAfter > 0 ? (ret.krPerYear / solAfter * 100).toFixed(1) : '0';
      infoBox('AVKASTNING SOLCELLER', [
        ['Installerad effekt', ret.kWp.toFixed(2) + ' kWp', false],
        ['Årsproduktion (uppsk.)', '~' + ret.kWhPerYear.toLocaleString('sv-SE') + ' kWh/år', false],
        ['Elbesparing per ar', '~' + PDF.f(ret.krPerYear) + '/ar', true],
        ['Återbetalning (efter avdrag)', '~' + payback + ' ar', false],
        ['Årlig avkastning på kapital', '~' + avkPct + '%', true]
      ], PDF.C.greenBg, PDF.C.green);
    }

    // Emaldo Gridreward
    const nBat = 1 + (state.emaldoExtraModules || 0);
    const monthly = state.brand === 'emaldo'
      ? Pricing.emaldoAvkastning(state.gridrewardElomrade || 'SE3', state.gridrewardType || 'rorlig', nBat)
      : null;

    if (monthly !== null) {
      const batAfter = batResult ? batResult.efterPris : batTotal * 1.25;
      const avkBat   = batAfter > 0 ? (monthly * 12 / batAfter * 100).toFixed(1) : '0';
      const typLbl   = state.gridrewardType === 'fast' ? 'Låst 3 år' : 'Rörlig ersättning';
      const grRows = [
        ['Typ', typLbl, false],
        [nBat + ' batteri · ' + (nBat * 5.12).toFixed(2) + ' kWh', '', false],
        ['Månadsersättning', PDF.f(monthly) + '/man', true],
        ['Arsersattning', PDF.f(monthly * 12) + '/ar', true],
      ];
      if (state.gridrewardType === 'fast') grRows.push(['Total 3 ar', PDF.f(monthly * 36), true]);
      grRows.push(['Årlig avkastning på kapital', '~' + avkBat + '%', true]);
      infoBox('EMALDO GRIDREWARD (' + (state.gridrewardElomrade || 'SE3') + ')', grRows, [240, 245, 255], PDF.C.primary);
    }

    // Disclaimer
    doc.setFillColor(248, 248, 252);
    const discH = 18;
    const discY = Math.max(col1y, col2y) + 4;
    if (discY < ph - discH - 20) {
      doc.roundedRect(ml, discY, cw, discH, 2, 2, 'F');
      doc.setDrawColor(...PDF.C.border);
      doc.roundedRect(ml, discY, cw, discH, 2, 2, 'S');
      doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.muted);
      doc.text('OBSERVERA', ml + 4, discY + 5);
      doc.setFont(undefined, 'normal');
      const dL = doc.splitTextToSize(PDF.s(PDF.DISCLAIMER), cw - 8);
      let dy = discY + 10;
      dL.forEach(l => { doc.text(l, ml + 4, dy); dy += 3.8; });
    }

    // ══════════════════════════════════════════════════════
    // FOOTERS
    // ══════════════════════════════════════════════════════
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(...PDF.C.border);
      doc.line(ml, ph - 14, pw - mr, ph - 14);
      doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.setTextColor(155, 165, 195);
      doc.text(PDF.s('Kalmar VVS- & El-Montage AB · SolarCPQ v3.5 · Aurora Energy Group AB'), ml, ph - 8);
      doc.text('Sida ' + i + ' av ' + n, pw - mr, ph - 8, { align: 'right' });
      doc.text(PDF.s('Offerten är giltig i 10 dagar. Priser ex moms. Skattereduktion söks via deklarationen.'), ml, ph - 3.5);
    }

    const custN = PDF.s(state.customer?.name || state.projectName || 'Offert');
    doc.save('Offert_' + custN.replace(/\s+/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.pdf');
    UI.toast('PDF klar!', 'success');
  },

  // ── HEADER ────────────────────────────────────────────
  _header(doc, pw, ph, ml, mr, cw, state, logoData) {
    // Header-banner (hogre for att fa plats med kund/leverantor)
    const headerH = 72;
    doc.setFillColor(...PDF.C.dark);
    doc.rect(0, 0, pw, headerH, 'F');

    // Logo
    if (logoData) {
      try { doc.addImage(logoData, 'PNG', ml, 8, 44, 18, '', 'FAST'); } catch(e) {}
    }

    // Offertinfo hoger
    doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.white);
    doc.text('OFFERTDOKUMENT', pw - mr, 13, { align: 'right' });
    doc.setFont(undefined, 'normal'); doc.setTextColor(160, 185, 220);
    doc.text(new Date().toLocaleDateString('sv-SE'), pw - mr, 19, { align: 'right' });
    doc.text('Giltig i 10 dagar', pw - mr, 25, { align: 'right' });

    // Projektnamn
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.white);
    doc.text(PDF.s(state.projectName || 'Offert'), ml, 36);

    // Kund + Leverantor INUTI headern
    const cust = state.customer || {};
    const colW = (cw - 6) / 2;

    // Kund (vänster)
    doc.setFontSize(6); doc.setFont(undefined, 'bold'); doc.setTextColor(120, 150, 200);
    doc.text('KUND', ml, 44);
    doc.setFont(undefined, 'normal'); doc.setTextColor(200, 215, 240);
    doc.setFontSize(7.5);
    const custLines = [
      cust.name    || '-',
      [cust.address, [cust.zip, cust.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      cust.email   || '',
      cust.phone   || ''
    ].filter(Boolean);
    let cy = 50;
    custLines.forEach(l => {
      doc.text(PDF.s(l), ml, cy);
      cy += 4;
    });

    // Leverantor (hoger om kunden)
    const lx = ml + colW + 6;
    doc.setFontSize(6); doc.setFont(undefined, 'bold'); doc.setTextColor(120, 150, 200);
    doc.text('LEVERANTOR', lx, 44);
    doc.setFont(undefined, 'bold'); doc.setTextColor(200, 215, 240);
    doc.setFontSize(7.5);
    doc.text(PDF.s(PDF.SUPPLIER.name), lx, 50);
    doc.setFont(undefined, 'normal'); doc.setTextColor(160, 180, 220);
    doc.setFontSize(7);
    doc.text(PDF.s(PDF.SUPPLIER.address), lx, 55);
    doc.setTextColor(100, 140, 200);
    doc.text(PDF.s(PDF.SUPPLIER.group), lx, 60);
    if (state.projectOwner) {
      doc.setTextColor(160, 180, 220);
      doc.text('Kontakt: ' + PDF.s(state.projectOwner), lx, 65);
    }

    return headerH + 6;
  },

  // ── KUND + LEVERANTOR ─────────────────────────────────
  _parties(doc, pw, ml, mr, cw, y, state) {
    const cust = state.customer || {};
    const colW = (cw - 6) / 2;

    doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.muted);
    doc.text('KUND', ml, y); doc.text('LEVERANTOR', ml + colW + 6, y);
    y += 4;

    // Kund
    doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF.C.text);
    let cy = y;
    [cust.name||'-', cust.address||'', [cust.zip,cust.city].filter(Boolean).join(' '),
     cust.email||'', cust.phone||''].filter(Boolean)
      .forEach(l => { doc.text(PDF.s(l), ml, cy); cy += 4.5; });

    // Leverantor
    let sy = y;
    doc.setFont(undefined, 'bold'); doc.setFontSize(8.5);
    doc.text(PDF.s(PDF.SUPPLIER.name), ml + colW + 6, sy); sy += 4.5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF.C.muted);
    doc.text(PDF.s(PDF.SUPPLIER.address), ml + colW + 6, sy); sy += 4;
    doc.setTextColor([79,142,247]);
    doc.text(PDF.s(PDF.SUPPLIER.group), ml + colW + 6, sy); sy += 4;
    doc.setTextColor(...PDF.C.muted); doc.setFontSize(6.5);
    const descL = doc.splitTextToSize(PDF.s(PDF.SUPPLIER.desc), colW);
    descL.forEach(l => { doc.text(l, ml + colW + 6, sy); sy += 3.5; });
    if (state.projectOwner) {
      doc.setFontSize(7.5); doc.setTextColor(...PDF.C.text);
      doc.text('Kontakt: ' + PDF.s(state.projectOwner), ml + colW + 6, sy); sy += 4;
    }
    return Math.max(cy, sy) + 5;
  },

  // ── PRODUKTTABELL ─────────────────────────────────────
  _table(doc, ml, cw, ph, y, items, title, color, setY) {
    if (!items.length) { setY(y); return 0; }
    if (y > ph - 55) { doc.addPage(); y = 18; }

    doc.setFillColor(...color);
    doc.rect(ml, y, cw, 7, 'F');
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.white);
    doc.text(title, ml + 2, y + 4.8);
    y += 8;

    doc.setFillColor(...PDF.C.gray);
    doc.rect(ml, y, cw, 5, 'F');
    doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...PDF.C.muted);
    doc.text('Produkt', ml + 2, y + 3.5);
    doc.text('Antal', ml + 105, y + 3.5, { align: 'center' });
    doc.text('A-pris', ml + 142, y + 3.5, { align: 'right' });
    doc.text('Totalt ex moms', ml + cw, y + 3.5, { align: 'right' });
    y += 6;

    let total = 0;
    items.forEach((item, idx) => {
      if (y > ph - 35) { doc.addPage(); y = 18; }
      const rh = 6, rowTotal = item.salesPrice * item.qty;
      total += rowTotal;
      if (idx % 2 === 0) { doc.setFillColor(249,250,254); doc.rect(ml, y-1, cw, rh, 'F'); }

      doc.setFontSize(8); let name = PDF.s(item.name);
      while (doc.getTextWidth(name) > 84 && name.length > 2) name = name.slice(0,-1);
      if (name !== PDF.s(item.name)) name += '..';

      doc.setFont(undefined, 'normal'); doc.setTextColor(...PDF.C.text);
      doc.text(name, ml + 2, y + 4);
      doc.text(String(item.qty), ml + 105, y + 4, { align: 'center' });
      if (item.qty > 1) { doc.setTextColor(...PDF.C.muted); doc.text(PDF.f(item.salesPrice), ml + 142, y + 4, { align: 'right' }); }
      doc.setTextColor(...PDF.C.text); doc.setFont(undefined, 'bold');
      doc.text(PDF.f(rowTotal), ml + cw, y + 4, { align: 'right' });
      y += rh;
    });

    doc.setDrawColor(...PDF.C.border); doc.line(ml, y, ml + cw, y); y += 3;
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...color);
    doc.text('Delsumma', ml + 2, y + 4);
    doc.text(PDF.f(total), ml + cw, y + 4, { align: 'right' });
    y += 8;

    setY(y);
    return total;
  },

  // Säker strängkonvertering — jsPDF 2.5 hanterar Latin-1 (å ä ö) native
  // Vi behåller alla tecken inom Latin-1 (0x00–0xFF) och ersätter
  // bara specialtecken utanför den rangen
  s(str) {
    if (!str) return '';
    return String(str).replace(/[\u0100-\uFFFF]/g, ch => {
      const m = {'—':'-','–':'-','\u2019':"'",'…':'...'};
      return m[ch] || '';
    }).trim();
  },

  f(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0 kr';
    return new Intl.NumberFormat('sv-SE', {
      style:'currency', currency:'SEK',
      minimumFractionDigits:0, maximumFractionDigits:0
    }).format(n);
  },

  async _getLogo() {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = 'logo.png';
    });
  },

  async _load(src) {
    return new Promise((res,rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
};
