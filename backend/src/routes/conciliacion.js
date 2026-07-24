import { Router } from 'express';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import {
  importarInternaParaConciliacion,
  obtenerConciliacion,
  comprobantesFaltantesEnInterna,
  limpiarInterna,
  conciliacionInternaExterna,
} from '../services/conciliacionService.js';
import {
  previsualizarHojas,
  importarHojas,
  obtenerPendientes,
  obtenerHistorial,
  enviarAEstudio,
  pendientesPorProveedor,
  marcarListo,
} from '../services/pendientesEstudioService.js';
import { requireRole } from '../middleware/auth.js';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();
// El gerente solo puede ver /interna-externa (queda sin requireRole, abierta a los 3 roles).
// Todo lo demás de Conciliación es administrador/dev.
const soloAdminODev = requireRole('administrador', 'dev');

function fechaLabel(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function money(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
}

// Tabla genérica en PDF (mismo formato que ya usaba faltantes.pdf), reutilizada por los 3 PDF de
// comprobantes de esta pantalla: título + subtítulo + tabla con salto de página automático.
function renderTablaPdf(res, { nombreArchivo, titulo, subtitulo, cols, filas, notaVacio, notaTotal }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
  doc.pipe(res);

  doc.fontSize(16).text(titulo, { align: 'left' });
  doc.fontSize(10).fillColor('#555').text(subtitulo);
  doc.moveDown(1);

  function encabezado(y) {
    doc.fontSize(9).fillColor('#000');
    let x = 40;
    for (const c of cols) {
      doc.font('Helvetica-Bold').text(c.label, x, y, { width: c.width, height: 14, ellipsis: true, lineBreak: false });
      x += c.width;
    }
    doc.moveTo(40, y + 14).lineTo(x, y + 14).strokeColor('#ccc').stroke();
    return y + 20;
  }

  let y = encabezado(doc.y);
  doc.font('Helvetica').fontSize(9);

  for (const f of filas) {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = encabezado(40);
      doc.font('Helvetica').fontSize(9);
    }
    let x = 40;
    for (const c of cols) {
      const valor = c.formato ? c.formato(f[c.key]) : (f[c.key] ?? '');
      doc.fillColor('#000').text(String(valor), x, y, { width: c.width, height: 14, ellipsis: true, lineBreak: false });
      x += c.width;
    }
    y += 16;
  }

  if (filas.length === 0) {
    doc.fontSize(11).fillColor('#555').text(notaVacio, 40, y);
  } else if (notaTotal) {
    doc.moveDown(1);
    doc.fontSize(10).fillColor('#000').text(notaTotal(filas.length), 40, y + 10);
  }

  doc.end();
}

router.post('/interna', soloAdminODev, upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "archivo")' });
  const { razon_social: razonSocial } = req.body;
  if (!['NT', 'Target'].includes(razonSocial)) {
    return res.status(400).json({ error: 'falta razon_social (NT o Target)' });
  }
  try {
    const resultado = await importarInternaParaConciliacion(req.file.buffer, req.file.originalname, razonSocial);
    res.json(resultado);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

router.get('/comprobantes', soloAdminODev, async (req, res) => {
  const { razon_social: razonSocial } = req.query;
  if (!['NT', 'Target'].includes(razonSocial)) {
    return res.status(400).json({ error: 'falta razon_social (NT o Target)' });
  }
  res.json(await obtenerConciliacion(razonSocial));
});

router.get('/interna-externa', async (req, res) => {
  const { razon_social: razonSocial } = req.query;
  if (!['NT', 'Target'].includes(razonSocial)) {
    return res.status(400).json({ error: 'falta razon_social (NT o Target)' });
  }
  res.json(await conciliacionInternaExterna(razonSocial));
});

router.delete('/interna', soloAdminODev, async (req, res) => {
  const { razon_social: razonSocial } = req.query;
  if (!['NT', 'Target'].includes(razonSocial)) {
    return res.status(400).json({ error: 'falta razon_social (NT o Target)' });
  }
  await limpiarInterna(razonSocial);
  res.json({ ok: true });
});

const COLS_COMPROBANTES = [
  { label: 'Fecha', width: 65, key: 'fecha', formato: (v) => fechaLabel(v) || v || '' },
  { label: 'Comprobante', width: 130, key: 'tipo_comprobante' },
  { label: 'PDV', width: 45, key: 'pdv' },
  { label: 'Número', width: 70, key: 'numero' },
  { label: 'CUIT', width: 100, key: 'cuit_contraparte' },
  { label: 'Proveedor', width: 220, key: 'denominacion_contraparte' },
  { label: 'Total', width: 90, key: 'total', formato: money },
];

router.get('/faltantes.pdf', soloAdminODev, async (req, res) => {
  const { razon_social: razonSocial } = req.query;
  if (!['NT', 'Target'].includes(razonSocial)) {
    return res.status(400).json({ error: 'falta razon_social (NT o Target)' });
  }
  const faltantes = await comprobantesFaltantesEnInterna(razonSocial);
  renderTablaPdf(res, {
    nombreArchivo: `comprobantes-faltantes-${razonSocial}.pdf`,
    titulo: `Comprobantes faltantes en el sistema interno — ${razonSocial}`,
    subtitulo: `Comprobantes que están en "Mis Comprobantes Recibidos" (ARCA) pero no aparecen cargados en el sistema de gestión interno. Generado el ${new Date().toLocaleDateString('es-AR')}.`,
    cols: COLS_COMPROBANTES,
    filas: faltantes,
    notaVacio: 'No hay comprobantes faltantes: la conciliación cierra perfecta.',
    notaTotal: (n) => `Total de comprobantes faltantes: ${n}`,
  });
});

// --- Pendientes de envío al estudio contable -----------------------------------------------

router.post('/pendientes-estudio/preview', soloAdminODev, upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "archivo")' });
  try {
    res.json({ hojas: await previsualizarHojas(req.file.buffer) });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

router.post('/pendientes-estudio/importar', soloAdminODev, upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "archivo")' });
  const { hojas, razon_social: razonSocial } = req.body;
  if (!hojas) return res.status(400).json({ error: 'falta indicar qué hoja(s) importar' });
  let nombresHojas;
  try {
    nombresHojas = JSON.parse(hojas);
  } catch {
    return res.status(400).json({ error: 'formato inválido para "hojas" (debe ser un array JSON)' });
  }
  try {
    const resultado = await importarHojas(req.file.buffer, nombresHojas, razonSocial, req.file.originalname);
    res.json(resultado);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

router.get('/pendientes-estudio', soloAdminODev, async (req, res) => {
  const { razon_social: razonSocial } = req.query;
  if (!['NT', 'Target'].includes(razonSocial)) {
    return res.status(400).json({ error: 'falta razon_social (NT o Target)' });
  }
  res.json(await obtenerPendientes(razonSocial));
});

router.patch('/pendientes-estudio/:id/listo', soloAdminODev, async (req, res) => {
  await marcarListo(req.params.id, !!req.body.listo);
  res.json({ ok: true });
});

router.get('/pendientes-estudio/historial', soloAdminODev, async (req, res) => {
  const { razon_social: razonSocial } = req.query;
  if (!['NT', 'Target'].includes(razonSocial)) {
    return res.status(400).json({ error: 'falta razon_social (NT o Target)' });
  }
  res.json(await obtenerHistorial(razonSocial));
});

router.post('/pendientes-estudio/enviar', soloAdminODev, async (req, res) => {
  const { razon_social: razonSocial, ids } = req.body;
  try {
    const { filas } = await enviarAEstudio(razonSocial, ids, req.usuario?.username);
    renderTablaPdf(res, {
      nombreArchivo: `envio-estudio-${razonSocial}-${new Date().toISOString().slice(0, 10)}.pdf`,
      titulo: `Comprobantes enviados al estudio contable — ${razonSocial}`,
      subtitulo: `Este PDF acompaña físicamente a los comprobantes que se mandan. Generado el ${new Date().toLocaleDateString('es-AR')} por ${req.usuario?.username ?? '—'}.`,
      cols: COLS_COMPROBANTES,
      filas,
      notaVacio: 'No hay comprobantes en este envío.',
      notaTotal: (n) => `Total de comprobantes enviados: ${n}`,
    });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

router.get('/pendientes-estudio/pdf-proveedor', soloAdminODev, async (req, res) => {
  const { razon_social: razonSocial, cuit } = req.query;
  if (!['NT', 'Target'].includes(razonSocial)) {
    return res.status(400).json({ error: 'falta razon_social (NT o Target)' });
  }
  if (!cuit) return res.status(400).json({ error: 'falta cuit' });
  const filas = await pendientesPorProveedor(razonSocial, cuit);
  const proveedor = filas[0]?.denominacion_contraparte || cuit;
  renderTablaPdf(res, {
    nombreArchivo: `comprobantes-pendientes-${proveedor}.pdf`.replace(/[^\w.-]+/g, '_'),
    titulo: `Comprobantes pendientes — ${proveedor}`,
    subtitulo: `Detalle de los comprobantes de ${proveedor} (CUIT ${cuit}) que todavía nos faltan gestionar. Generado el ${new Date().toLocaleDateString('es-AR')}.`,
    cols: COLS_COMPROBANTES,
    filas,
    notaVacio: 'No hay comprobantes pendientes de este proveedor.',
    notaTotal: (n) => `Total de comprobantes pendientes: ${n}`,
  });
});

export default router;
