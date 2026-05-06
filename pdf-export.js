// ============================================================
// SolarCPQ — PDF Export v3.5.1
// Aurora Energy Group AB
// ============================================================

window.PDF = {

  C: {
    primary:   [79,  142, 247],
    green:     [34,  197, 94],
    amber:     [245, 158, 11],
    dark:      [15,  17,  23],
    text:      [30,  35,  50],
    muted:     [100, 116, 160],
    white:     [255, 255, 255],
    lightGray: [247, 248, 252],
    border:    [220, 225, 240],
    greenBg:   [240, 253, 244],
    greenBdr:  [34,  197, 94]
  },

  SUPPLIER: {
    name:    'Kalmar VVS- & El-Montage AB',
    address: 'Storgatan 70, 386 32 Färjestaden',
    group:   'En del av Assemblin Caverion Group',
    groupSub:'I april 2024 gick Caverion och Assemblin samman för att skapa ett\nledande nordeuropeiskt tekniskt service- och installationsföretag.\nTillsammans är vi ~20 000 medarbetare i 9 länder.'
  },

  // Avdragsprocent
  AVDRAG: {
    battery: 0.485,   // 48,5%
    solar:   0.1455   // 14,55%
  },

  async generate(state, result) {
    if (!window.jspdf) {
      UI.toast('Laddar PDF-bibliotek...', 'success');
      await PDF._loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    if (!window.jspdf) {
      UI.toast('Kunde inte ladda PDF-biblioteket', 'error');
      return;
    }

    UI.toast('Genererar PDF...', 'success');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = 210, ph = 297, ml = 18, mr = 18;
    const cw = pw - ml - mr;
    let y = 0;

    // ══════════════════════════════════════════════════════
    // HEADER (mörk)
    // ══════════════════════════════════════════════════════
    doc.setFillColor(...PDF.C.dark);
    doc.rect(0, 0, pw, 52, 'F');

    // Logotyp
    try {
      const logo = await PDF._getLogoBase64();
      if (logo) doc.addImage(logo, 'PNG', ml, 10, 52, 22, '', 'FAST');
    } catch(e) {}

    // Offertinfo höger
    doc.setFontSize(8);
    doc.setTextColor(...PDF.C.white);
    doc.setFont(undefined, 'bold');
    doc.text('OFFERTDOKUMENT', pw - mr, 16, { align: 'right' });
    doc.setFont(undefined, 'normal');
    doc.setTextColor(160, 180, 220);
    doc.text(new Date().toLocaleDateString('sv-SE'), pw - mr, 22, { align: 'right' });
    doc.text('Giltig i 10 dagar', pw - mr, 28, { align: 'right' });

    // Projektnamn
    doc.setFontSize(16);
    doc.setTextColor(...PDF.C.white);
    doc.setFont(undefined, 'bold');
    doc.text(state.projectName || 'Offert', ml, 44);

    y = 62;

    // ══════════════════════════════════════════════════════
    // KUND + LEVERANTÖR
    // ══════════════════════════════════════════════════════
    const cust = state.customer || {};
    const custLines = [
      cust.name    || '–',
      cust.address || '',
      [cust.zip, cust.city].filter(Boolean).join(' '),
      cust.email   || '',
      cust.phone   || ''
    ].filter(Boolean);

    // Vänster: Kund
    doc.setFontSize(7.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...PDF.C.muted);
    doc.text('KUND', ml, y);

    // Höger: Leverantör
    doc.text('LEVERANTÖR', pw / 2 + 2, y);
    y += 5;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...PDF.C.text);

    // Kund-rader
    let custY = y;
    custLines.forEach(l => { doc.text(l, ml, custY); custY += 5; });

    // Leverantör-rader
    let suppY = y;
    doc.setFont(undefined, 'bold');
    doc.text(PDF.SUPPLIER.name, pw / 2 + 2, suppY); suppY += 5;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8.5);
    doc.text(PDF.SUPPLIER.address, pw / 2 + 2, suppY); suppY += 5;
    doc.setTextColor(...PDF.C.muted);
    doc.text(PDF.SUPPLIER.group, pw / 2 + 2, suppY); suppY += 4.5;

    // Assemblin-text (liten)
    doc.setFontSize(7);
    const groupLines = doc.splitTextToSize(PDF.SUPPLIER.groupSub, cw / 2 - 4);
    groupLines.forEach(l => { doc.text(l, pw / 2 + 2, suppY); suppY += 3.8; });

    // Projektägare
    if (state.projectOwner) {
      doc.setFontSize(8.5);
      doc.setTextColor(...PDF.C.text);
      doc.setFont(undefined, 'normal');
      doc.text(`Kontakt: ${state.projectOwner}`, pw / 2 + 2, suppY);
      suppY += 5;
    }

    y = Math.max(custY, suppY) + 6;

    // Scenario-pill
    const scenarioColors = {
      battery: PDF.C.primary,
      solar:   PDF.C.amber,
      hybrid:  [100, 60, 200]
    };
    const pillColor = scenarioColors[state.scenario] || PDF.C.primary;
    doc.setFillColor(...pillColor);
    doc.roundedRect(ml, y, 45, 7, 1.5, 1.5, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF.C.white);
    doc.setFont(undefined, 'bold');
    doc.text(Utils.scenarioLabel(state.scenario).toUpperCase(), ml + 22.5, y + 4.8, { align: 'center' });
    y += 12;

    // ══════════════════════════════════════════════════════
    // PRODUKTSEKTIONER
    // ══════════════════════════════════════════════════════
    const items    = result.lineItems;
    const isBat    = state.scenario !== 'solar';
    const isSol    = state.scenario !== 'battery';
    const isHyb    = state.scenario === 'hybrid';

    const batGroups = ['battery','inverter','addons','el_bat'];
    const solGroups = ['solar','ue','el_sol'];

    const batItems  = items.filter(i => batGroups.includes(i.group));
    const solItems  = items.filter(i => solGroups.includes(i.group));
    const fraktItem = items.find(i => i.group === 'frakt');

    let batTotal = 0, solTotal = 0;

    const drawSection = (sItems, title, color) => {
      if (!sItems.length) return 0;
      if (y > ph - 70) { doc.addPage(); y = 20; }

      // Rubrikband
      doc.setFillColor(...color);
      doc.rect(ml, y, cw, 7.5, 'F');
      doc.setFontSize(8.5);
      doc.setTextColor(...PDF.C.white);
      doc.setFont(undefined, 'bold');
      doc.text(title, ml + 3, y + 5.2);
      y += 9;

      // Kolumnhuvuden
      doc.setFillColor(...PDF.C.lightGray);
      doc.rect(ml, y, cw, 5.5, 'F');
      doc.setFontSize(7.5);
      doc.setTextColor(...PDF.C.muted);
      doc.setFont(undefined, 'bold');
      doc.text('Produkt',         ml + 3,    y + 4);
      doc.text('Antal',           ml + 105,  y + 4, { align: 'center' });
      doc.text('À-pris ex moms',  ml + 140,  y + 4, { align: 'right' });
      doc.text('Totalt ex moms',  ml + cw,   y + 4, { align: 'right' });
      y += 7;

      let sectionTotal = 0;
      sItems.forEach((item, idx) => {
        if (y > ph - 40) { doc.addPage(); y = 20; }
        const rowH = 6.5;
        if (idx % 2 === 0) {
          doc.setFillColor(249, 250, 254);
          doc.rect(ml, y - 1, cw, rowH, 'F');
        }
        const total = item.salesPrice * item.qty;
        sectionTotal += total;

        // Produktnamn
        let name = item.name;
        doc.setFontSize(8.5);
        while (doc.getTextWidth(name) > 88 && name.length > 2) name = name.slice(0,-1);
        if (name !== item.name) name += '…';

        doc.setFont(undefined, 'normal');
        doc.setTextColor(...PDF.C.text);
        doc.text(name, ml + 3, y + 4);
        doc.text(String(item.qty), ml + 105, y + 4, { align: 'center' });

        if (item.qty > 1) {
          doc.setTextColor(...PDF.C.muted);
          doc.text(PDF._fmt(item.salesPrice), ml + 140, y + 4, { align: 'right' });
        }
        doc.setTextColor(...PDF.C.text);
        doc.setFont(undefined, 'bold');
        doc.text(PDF._fmt(total), ml + cw, y + 4, { align: 'right' });
        doc.setFont(undefined, 'normal');
        y += rowH;
      });

      // Delsumma
      doc.setDrawColor(...PDF.C.border);
      doc.line(ml, y, ml + cw, y);
      y += 4;
      doc.setFontSize(8.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...color);
      doc.text('Delsumma', ml + 3, y + 4);
      doc.text(PDF._fmt(sectionTotal), ml + cw, y + 4, { align: 'right' });
      doc.setTextColor(...PDF.C.text);
      y += 10;
      return sectionTotal;
    };

    if (isBat) batTotal = drawSection(batItems, '🔋 BATTERI & ELINSTALLATION', PDF.C.primary);
    if (isSol) solTotal = drawSection(solItems, '☀️ SOLCELLER & MONTAGE', PDF.C.amber);

    // Frakt
    if (fraktItem) {
      doc.setFontSize(8.5);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...PDF.C.muted);
      doc.text('🚚 ' + fraktItem.name, ml + 3, y + 4);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...PDF.C.text);
      doc.text(PDF._fmt(fraktItem.salesPrice), ml + cw, y + 4, { align: 'right' });
      y += 10;
    }

    // ══════════════════════════════════════════════════════
    // SUMMERING (höger sida)
    // ══════════════════════════════════════════════════════
    if (y > ph - 60) { doc.addPage(); y = 20; }

    const exVat  = result.revenueExVat;
    const vat    = exVat * 0.25;
    const incVat = exVat * 1.25;

    const sumX = pw / 2 + 5;
    const sumW = pw - mr - sumX;

    doc.setFillColor(...PDF.C.lightGray);
    doc.roundedRect(sumX, y, sumW, 34, 2, 2, 'F');

    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...PDF.C.muted);
    doc.text('Summa ex moms',  sumX + 4,  y + 9);
    doc.text('Moms 25%',       sumX + 4,  y + 17);
    doc.setTextColor(...PDF.C.text);
    doc.setFont(undefined, 'bold');
    doc.text(PDF._fmt(exVat), pw - mr, y + 9,  { align: 'right' });
    doc.text(PDF._fmt(vat),   pw - mr, y + 17, { align: 'right' });

    doc.setDrawColor(...PDF.C.border);
    doc.line(sumX + 4, y + 20, pw - mr, y + 20);

    doc.setFontSize(10);
    doc.setTextColor(...PDF.C.primary);
    doc.text('TOTALT inkl moms', sumX + 4, y + 29);
    doc.text(PDF._fmt(incVat),   pw - mr,  y + 29, { align: 'right' });

    y += 40;

    // ══════════════════════════════════════════════════════
    // TOTAL BATTERI kWh
    // ══════════════════════════════════════════════════════
    if (result.totalBatKwh > 0 && isBat) {
      if (y > ph - 25) { doc.addPage(); y = 20; }
      doc.setFillColor(235, 240, 255);
      doc.roundedRect(ml, y, cw / 2 - 5, 12, 2, 2, 'F');
      doc.setFontSize(8.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...PDF.C.primary);
      doc.text(`⚡ Total batterikapacitet: ${result.totalBatKwh.toFixed(2)} kWh`, ml + 4, y + 8);
      y += 18;
    }

    // ══════════════════════════════════════════════════════
    // GRÖNT AVDRAG
    // ══════════════════════════════════════════════════════
    if (y > ph - 80) { doc.addPage(); y = 20; }

    const batIncVat2 = batTotal * 1.25;
    const solIncVat2 = solTotal * 1.25;
    const batAvdrag  = Math.round(batIncVat2 * PDF.AVDRAG.battery);
    const solAvdrag  = Math.round(solIncVat2 * PDF.AVDRAG.solar);

    const hasAvdrag = (isBat && batTotal > 0) || (isSol && solTotal > 0);
    if (hasAvdrag) {
      // Grön header
      doc.setFillColor(22, 163, 74);
      doc.rect(ml, y, cw, 8, 'F');
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...PDF.C.white);
      doc.text('🌱 GRÖNT AVDRAG — SKATTEREDUKTION', ml + 3, y + 5.5);
      y += 10;

      doc.setFillColor(...PDF.C.greenBg);
      const avdragStartY = y;

      if (isBat && batTotal > 0) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(22, 101, 52);
        if (isHyb) { doc.text('🔋 BATTERI (48,5% skattereduktion)', ml + 3, y + 6); y += 8; }

        const rows = [
          ['Pris inkl moms (före avdrag)',  PDF._fmt(batIncVat2),           false],
          [`− Skattereduktion 48,5%`,       `− ${PDF._fmt(batAvdrag)}`,     true],
          ['Pris efter skattereduktion',    PDF._fmt(batIncVat2 - batAvdrag), false, true]
        ];
        rows.forEach(([label, val, isGreen, isBold]) => {
          if (y > ph - 20) { doc.addPage(); y = 20; }
          doc.setFillColor(isGreen ? 220 : isBold ? 200 : 240, isGreen ? 253 : isBold ? 253 : 253, isGreen ? 230 : isBold ? 235 : 244);
          doc.rect(ml, y, cw, 7, 'F');
          doc.setFontSize(isBold ? 10 : 8.5);
          doc.setFont(undefined, isBold ? 'bold' : 'normal');
          doc.setTextColor(isGreen ? 22 : PDF.C.text[0], isGreen ? 163 : PDF.C.text[1], isGreen ? 74 : PDF.C.text[2]);
          doc.text(label, ml + 3, y + 5);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(isGreen ? 22 : isBold ? 22 : PDF.C.text[0], isGreen ? 163 : isBold ? 163 : PDF.C.text[1], isGreen ? 74 : isBold ? 74 : PDF.C.text[2]);
          doc.text(val, ml + cw, y + 5, { align: 'right' });
          y += 7;
        });
        y += 4;
      }

      if (isSol && solTotal > 0) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(22, 101, 52);
        if (isHyb) { doc.text('☀️ SOLCELLER (14,55% skattereduktion)', ml + 3, y + 6); y += 8; }

        const rows2 = [
          ['Pris inkl moms (före avdrag)',  PDF._fmt(solIncVat2),            false],
          [`− Skattereduktion 14,55%`,      `− ${PDF._fmt(solAvdrag)}`,      true],
          ['Pris efter skattereduktion',    PDF._fmt(solIncVat2 - solAvdrag), false, true]
        ];
        rows2.forEach(([label, val, isGreen, isBold]) => {
          if (y > ph - 20) { doc.addPage(); y = 20; }
          doc.setFillColor(isGreen ? 220 : isBold ? 200 : 240, 253, isGreen ? 230 : isBold ? 235 : 244);
          doc.rect(ml, y, cw, 7, 'F');
          doc.setFontSize(isBold ? 10 : 8.5);
          doc.setFont(undefined, isBold ? 'bold' : 'normal');
          doc.setTextColor(isGreen ? 22 : PDF.C.text[0], isGreen ? 163 : PDF.C.text[1], isGreen ? 74 : PDF.C.text[2]);
          doc.text(label, ml + 3, y + 5);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(isGreen ? 22 : isBold ? 22 : PDF.C.text[0], isGreen ? 163 : isBold ? 163 : PDF.C.text[1], isGreen ? 74 : isBold ? 74 : PDF.C.text[2]);
          doc.text(val, ml + cw, y + 5, { align: 'right' });
          y += 7;
        });
        y += 4;
      }

      // Fotnot
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...PDF.C.muted);
      doc.text('* Skattereduktionen söks via din inkomstdeklaration. Villkor och beloppsgränser gäller per Skatteverkets regler.', ml + 3, y + 4);
      y += 12;
    }

    // ══════════════════════════════════════════════════════
    // AVKASTNING SOL
    // ══════════════════════════════════════════════════════
    if (result.solarReturn && isSol) {
      if (y > ph - 35) { doc.addPage(); y = 20; }
      const ret = result.solarReturn;
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(ml, y, cw / 2 - 4, 32, 2, 2, 'F');
      doc.setDrawColor(...PDF.C.greenBdr);
      doc.roundedRect(ml, y, cw / 2 - 4, 32, 2, 2, 'S');

      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text('☀️ BERÄKNAD AVKASTNING SOL', ml + 4, y + 7);

      doc.setFont(undefined, 'normal');
      doc.setTextColor(...PDF.C.text);
      doc.text(`Installerad effekt: ${ret.kWp.toFixed(2)} kWp`, ml + 4, y + 14);
      doc.text(`Årsproduktion (est.): ~${ret.kWhPerYear.toLocaleString('sv-SE')} kWh/år`, ml + 4, y + 20);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text(`Avkastning: ~${PDF._fmt(ret.krPerYear)}/år`, ml + 4, y + 27);
      const infoX = ml + cw / 2;
    }

    // ══════════════════════════════════════════════════════
    // EMALDO GRIDREWARD
    // ══════════════════════════════════════════════════════
    if (state.brand === 'emaldo') {
      const nBat    = 1 + (state.emaldoExtraModules || 0);
      const monthly = Pricing.emaldoAvkastning(state.gridrewardElomrade, state.gridrewardType, nBat);
      if (monthly !== null) {
        const grX = result.solarReturn ? ml + cw / 2 + 4 : ml;
        const grW = result.solarReturn ? cw / 2 - 4 : cw;
        const grY = result.solarReturn ? y : y;

        doc.setFillColor(240, 253, 244);
        doc.roundedRect(grX, grY, grW, 32, 2, 2, 'F');
        doc.setDrawColor(...PDF.C.greenBdr);
        doc.roundedRect(grX, grY, grW, 32, 2, 2, 'S');

        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(22, 163, 74);
        const grTitle = `⚡ EMALDO GRIDREWARD — ${state.gridrewardType === 'fast' ? 'Låst 3 år' : 'Rörlig'} (${state.gridrewardElomrade || 'SE3'})`;
        doc.text(grTitle, grX + 4, grY + 7);

        doc.setFont(undefined, 'normal');
        doc.setTextColor(...PDF.C.text);
        doc.text(`${nBat} batteri(er) · ${(nBat * 5.12).toFixed(2)} kWh total kapacitet`, grX + 4, grY + 14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(22, 163, 74);
        doc.text(`${PDF._fmt(monthly)}/mån · ${PDF._fmt(monthly * 12)}/år`, grX + 4, grY + 21);
        if (state.gridrewardType === 'fast') {
          doc.setFontSize(7.5);
          doc.text(`Total under 3 år: ${PDF._fmt(monthly * 36)}`, grX + 4, grY + 27);
        } else {
          doc.setFontSize(7);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(...PDF.C.muted);
          doc.text('* Rörlig ersättning — varierar med marknaden', grX + 4, grY + 27);
        }

        if (!result.solarReturn) y += 38;
      }
    }

    if (result.solarReturn || state.brand === 'emaldo') y += 38;

    // ══════════════════════════════════════════════════════
    // FOOTER PÅ ALLA SIDOR
    // ══════════════════════════════════════════════════════
    PDF._addFooters(doc, ph, pw, ml, mr);

    // SPARA
    const fname = `Offert_${(state.customer?.name || state.projectName || 'SolarCPQ').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(fname);
    UI.toast(`✅ PDF sparad: ${fname}`, 'success');
  },

  _addFooters(doc, ph, pw, ml, mr) {
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(210, 215, 235);
      doc.line(ml, ph - 16, pw - mr, ph - 16);
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(150, 160, 190);
      doc.text(`${PDF.SUPPLIER.name} · Powered by SolarCPQ v3.5 · Aurora Energy Group AB`, ml, ph - 10);
      doc.text(`Sida ${i} av ${n}`, pw - mr, ph - 10, { align: 'right' });
      doc.text('Offerten är giltig i 10 dagar. Priser ex moms om ej annat anges. Skattereduktion söks separat via deklarationen.', ml, ph - 5);
    }
  },

  _fmt(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0 kr';
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency', currency: 'SEK',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(n);
  },

  async _getLogoBase64() {
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

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
};
