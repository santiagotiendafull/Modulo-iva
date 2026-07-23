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

router.get('/faltantes.pdf', soloAdminODev, async (req, res) => {
  const { razon_social: razonSocial } = req.query;
  if (!['NT', 'Target'].includes(razonSocial)) {
    return res.status(400).json({ error: 'falta razon_social (NT o Target)' });
  }

  const faltantes = await comprobantesFaltantesEnInterna(razonSocial);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="comprobantes-faltantes-${razonSocial}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
  doc.pipe(res);

  doc.fontSize(16).text(`Comprobantes faltantes en el sistema interno — ${razonSocial}`, { align: 'left' });
  doc.fontSize(10).fillColor('#555').text(
    `Comprobantes que están en "Mis Comprobantes Recibidos" (ARCA) pero no aparecen cargados en el sistema de gestión interno. Generado el ${new Date().toLocaleDateString('es-AR')}.`
  );
  doc.moveDown(1);

  const cols = [
    { label: 'Fecha', width: 65, key: 'fecha' },
    { label: 'Comprobante', width: 130, key: 'tipo_comprobante' },
    { label: 'PDV', width: 45, key: 'pdv' },
    { label: 'Número', width: 70, key: 'numero' },
    { label: 'CUIT', width: 100, key: 'cuit_contraparte' },
    { label: 'Proveedor', width: 220, key: 'denominacion_contraparte' },
    { label: 'Total', width: 90, key: 'total' },
  ];

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

  for (const f of faltantes) {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = encabezado(40);
      doc.font('Helvetica').fontSize(9);
    }
    let x = 40;
    const valores = {
      fecha: fechaLabel(f.fecha) || f.fecha || '',
      tipo_comprobante: f.tipo_comprobante || '',
      pdv: f.pdv,
      numero: f.numero,
      cuit_contraparte: f.cuit_contraparte,
      denominacion_contraparte: f.denominacion_contraparte || '',
      total: money(f.total),
    };
    for (const c of cols) {
      doc.text(String(valores[c.key] ?? ''), x, y, { width: c.width, height: 14, ellipsis: true, lineBreak: false });
      x += c.width;
    }
    y += 16;
  }

  if (faltantes.length === 0) {
    doc.fontSize(11).fillColor('#555').text('No hay comprobantes faltantes: la conciliación cierra perfecta.', 40, y);
  } else {
    doc.moveDown(1);
    doc.fontSize(10).fillColor('#000').text(`Total de comprobantes faltantes: ${faltantes.length}`, 40, y + 10);
  }

  doc.end();
});

export default router;
