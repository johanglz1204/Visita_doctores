const PDFDocument = require('pdfkit');
const db = require('../db');

// ── Colores y estilos ──
const COLORS = {
  primary: '#5b4ff5',
  dark: '#1a1a2e',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  white: '#ffffff',
};

// ── Helpers ──
function drawLine(doc, y, width) {
  doc.strokeColor('#e5e7eb').lineWidth(0.5)
    .moveTo(50, y).lineTo(width - 50, y).stroke();
}

function drawSectionTitle(doc, title, y) {
  doc.fontSize(14).fillColor(COLORS.primary).font('Helvetica-Bold')
    .text(title, 50, y);
  drawLine(doc, y + 20, doc.page.width);
  return y + 30;
}

function drawKPI(doc, x, y, label, value, width = 120) {
  // Card background
  doc.roundedRect(x, y, width, 55, 6)
    .fill(COLORS.lightGray);
  
  doc.fontSize(18).fillColor(COLORS.dark).font('Helvetica-Bold')
    .text(String(value), x + 10, y + 8, { width: width - 20, align: 'center' });
  doc.fontSize(8).fillColor(COLORS.gray).font('Helvetica')
    .text(label.toUpperCase(), x + 10, y + 34, { width: width - 20, align: 'center' });
}

function drawTableRow(doc, y, cols, isHeader, widths) {
  const startX = 50;
  let x = startX;

  if (isHeader) {
    doc.rect(startX, y - 2, widths.reduce((a, b) => a + b, 0), 18).fill(COLORS.primary);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(8);
  } else {
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(8);
  }

  cols.forEach((col, i) => {
    doc.text(String(col), x + 4, y + 2, { width: widths[i] - 8, align: i > 0 ? 'center' : 'left' });
    x += widths[i];
  });

  if (!isHeader) {
    drawLine(doc, y + 16, startX + widths.reduce((a, b) => a + b, 0));
  }
  return y + 18;
}

// ── Main Report Generator ──
const generateExecutiveReport = async (req, res, next) => {
  try {
    const knex = db.knex;
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split('T')[0];

    // Previous period for growth
    const prevStart = new Date();
    prevStart.setDate(prevStart.getDate() - (days * 2));
    const prevStr = prevStart.toISOString().split('T')[0];

    // ── Gather all data in parallel ──
    const [
      totalDocs, totalProds, 
      currentSales, previousSales,
      topProducts, topDoctors,
      sucursalStats, criticalProducts,
      stockOutEvents, visitCount
    ] = await Promise.all([
      knex('doctors').count('* as count'),
      knex('products').count('* as count'),
      knex('sales_history').where('sale_date', '>=', startStr).sum('quantity as total'),
      knex('sales_history').whereBetween('sale_date', [prevStr, startStr]).sum('quantity as total'),
      // Top 10 products
      knex('sales_history as s').join('products as p', 's.product_id', 'p.id')
        .select('p.name', 'p.ranking', 'p.stock')
        .sum('s.quantity as sold')
        .where('s.sale_date', '>=', startStr)
        .groupBy('p.name', 'p.ranking', 'p.stock')
        .orderBy('sold', 'desc').limit(10),
      // Top 10 doctors
      knex('sales_history as s').join('doctors as d', 's.doctor_id', 'd.id')
        .select('d.name', 'd.category')
        .sum('s.quantity as total')
        .where('s.sale_date', '>=', startStr)
        .whereNotNull('d.name')
        .groupBy('d.name', 'd.category')
        .orderBy('total', 'desc').limit(10),
      // Sucursales
      knex('sales_history')
        .select(knex.raw("COALESCE(NULLIF(sucursal, ''), 'GENERAL') as name"))
        .sum('quantity as total')
        .where('sale_date', '>=', startStr)
        .groupBy('sucursal').orderBy('total', 'desc'),
      // Critical products
      knex('products')
        .select('name', 'stock', 'min_stock', 'ranking')
        .whereIn('ranking', ['AA', 'A'])
        .andWhereRaw('stock <= COALESCE(min_stock, 5)')
        .orderBy('stock', 'asc').limit(10),
      // Stock-out events in period
      knex('stock_out_history').where('start_date', '>=', startStr).count('* as count').catch(() => [{ count: 0 }]),
      // Visits in period
      knex('doctor_visits').where('visit_date', '>=', startStr).count('* as count').catch(() => [{ count: 0 }]),
    ]);

    const curVal = parseInt(currentSales[0]?.total) || 0;
    const prevVal = parseInt(previousSales[0]?.total) || 0;
    const growth = prevVal === 0 ? 0 : Math.round(((curVal - prevVal) / prevVal) * 100);

    // ── Build PDF ──
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Ejecutivo_${new Date().toISOString().split('T')[0]}.pdf`);
    doc.pipe(res);

    // ── HEADER ──
    doc.rect(0, 0, doc.page.width, 90).fill(COLORS.primary);
    doc.fontSize(22).fillColor(COLORS.white).font('Helvetica-Bold')
      .text('REPORTE EJECUTIVO', 50, 25);
    doc.fontSize(10).fillColor('#c4b5fd').font('Helvetica')
      .text(`VisitaDoctores — Periodo: ${days} días (${startStr} a ${new Date().toISOString().split('T')[0]})`, 50, 55);

    let y = 110;

    // ── KPIs ──
    const kpiWidth = 115;
    const kpiGap = 14;
    const kpiStartX = 50;
    drawKPI(doc, kpiStartX, y, 'Piezas Vendidas', curVal.toLocaleString(), kpiWidth);
    drawKPI(doc, kpiStartX + kpiWidth + kpiGap, y, 'Crecimiento', `${growth >= 0 ? '+' : ''}${growth}%`, kpiWidth);
    drawKPI(doc, kpiStartX + (kpiWidth + kpiGap) * 2, y, 'Doctores', parseInt(totalDocs[0].count), kpiWidth);
    drawKPI(doc, kpiStartX + (kpiWidth + kpiGap) * 3, y, 'Productos', parseInt(totalProds[0].count), kpiWidth);

    y += 75;

    // ── TOP PRODUCTOS ──
    y = drawSectionTitle(doc, 'Top Productos del Periodo', y);
    const prodWidths = [200, 70, 80, 80];
    y = drawTableRow(doc, y, ['Producto', 'Ranking', 'Vendido', 'Stock'], true, prodWidths);
    for (const p of topProducts) {
      y = drawTableRow(doc, y, [p.name, p.ranking || '—', parseInt(p.sold), parseInt(p.stock)], false, prodWidths);
      if (y > 680) { doc.addPage(); y = 50; }
    }

    y += 15;

    // ── TOP DOCTORES ──
    y = drawSectionTitle(doc, 'Top Doctores Prescriptores', y);
    const docWidths = [250, 100, 100];
    y = drawTableRow(doc, y, ['Doctor', 'Categoría', 'Recetas'], true, docWidths);
    for (const d of topDoctors) {
      y = drawTableRow(doc, y, [d.name, d.category || '—', parseInt(d.total)], false, docWidths);
      if (y > 680) { doc.addPage(); y = 50; }
    }

    y += 15;

    // ── VENTAS POR SUCURSAL ──
    if (sucursalStats.length > 0) {
      y = drawSectionTitle(doc, 'Distribución por Sucursal', y);
      const sucWidths = [250, 120];
      y = drawTableRow(doc, y, ['Sucursal', 'Piezas'], true, sucWidths);
      for (const s of sucursalStats) {
        y = drawTableRow(doc, y, [s.name, parseInt(s.total)], false, sucWidths);
        if (y > 680) { doc.addPage(); y = 50; }
      }
      y += 15;
    }

    // ── ALERTAS DE DESABASTO ──
    if (criticalProducts.length > 0) {
      if (y > 580) { doc.addPage(); y = 50; }
      y = drawSectionTitle(doc, 'Alertas de Desabasto (Ranking AA/A)', y);
      const critWidths = [200, 70, 80, 80];
      y = drawTableRow(doc, y, ['Producto', 'Ranking', 'Stock', 'Mínimo'], true, critWidths);
      for (const c of criticalProducts) {
        y = drawTableRow(doc, y, [c.name, c.ranking, parseInt(c.stock), parseInt(c.min_stock)], false, critWidths);
        if (y > 680) { doc.addPage(); y = 50; }
      }
    }

    // ── FOOTER ──
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor(COLORS.gray).font('Helvetica')
        .text(
          `Generado el ${new Date().toLocaleString('es-MX')} | VisitaDoctores | Página ${i + 1} de ${pages.count}`,
          50, doc.page.height - 30,
          { width: doc.page.width - 100, align: 'center' }
        );
    }

    doc.end();
  } catch (err) {
    next(err);
  }
};

module.exports = { generateExecutiveReport };
