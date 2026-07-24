import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importarPdfBuffer, parseSoloPdfBuffer, existeHistorico, importarManual } from '../services/historicoService.js';
import { importarArchivo, previsualizarArchivo, leerFilasXlsx, EMITIDOS_COLS, RECIBIDOS_COLS } from '../services/mesEnCursoService.js';
import { historialCargas } from '../services/historialCargasService.js';
import { importarPdfBuffer931, parseSoloPdfBuffer931, existeFormulario931 } from '../services/formulario931Service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data', 'source');
const MES_EN_CURSO_DIR = path.join(DATA_DIR, 'mes-en-curso');
const HISTORICO_DIR = path.join(DATA_DIR, 'historico');
const F931_DIR = path.join(DATA_DIR, 'f931');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okMime = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
    ];
    cb(null, okMime.includes(file.mimetype));
  },
});

const router = Router();

function colsDeNombreArchivo(nombre) {
  const esEmitido = /emitid/i.test(nombre);
  const esRecibido = /recibid/i.test(nombre);
  if (!esEmitido && !esRecibido) return null;
  return esEmitido ? EMITIDOS_COLS : RECIBIDOS_COLS;
}

// Parsea un "Mis Comprobantes Emitidos/Recibidos" sin escribir nada en la base — para poder
// mostrar de qué razón social/período es antes de confirmar la carga. razon_social (opcional): para
// el export "consulta" de ARCA, que no trae el CUIT en ningún lado del archivo.
router.post('/mes-en-curso/preview', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "archivo")' });
  const nombre = req.file.originalname;
  const cols = colsDeNombreArchivo(nombre);
  if (!cols) return res.status(400).json({ error: 'el nombre del archivo debe indicar Emitidos o Recibidos' });

  try {
    const resultado = await previsualizarArchivo({
      fileNameOrBuffer: req.file.buffer, nombreArchivo: nombre, tipo: 'xlsx', cols, leerFilas: leerFilasXlsx,
      razonSocialManual: req.body.razon_social,
    });
    if (!resultado.razonSocial) {
      return res.status(422).json({ error: 'no se pudo determinar la razón social (CUIT) del archivo' });
    }
    res.json({ archivo: nombre, ...resultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sube un "Mis Comprobantes Emitidos/Recibidos" de ARCA, tenga o no DDJJ presentada ese período: el
// resultado fiscal siempre prioriza la DDJJ cuando existe, y tener el detalle disponible es lo que
// permite comparar "Interna vs Externa" en Conciliación para meses ya cerrados.
router.post('/mes-en-curso', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "archivo")' });

  const nombre = req.file.originalname;
  const cols = colsDeNombreArchivo(nombre);
  if (!cols) return res.status(400).json({ error: 'el nombre del archivo debe indicar Emitidos o Recibidos' });

  try {
    const resultado = await importarArchivo({
      fileNameOrBuffer: req.file.buffer, nombreArchivo: nombre, tipo: 'xlsx', cols, leerFilas: leerFilasXlsx,
      razonSocialManual: req.body.razon_social,
    });
    if (!resultado.razonSocial) {
      return res.status(422).json({ error: 'no se pudo determinar la razón social (CUIT) del archivo' });
    }
    fs.mkdirSync(MES_EN_CURSO_DIR, { recursive: true });
    fs.writeFileSync(path.join(MES_EN_CURSO_DIR, nombre), req.file.buffer);

    const periodos = [...new Set(resultado.filas.map((f) => f.periodo))];
    res.json({
      archivo: nombre,
      razon_social: resultado.razonSocial,
      comprobantes: resultado.filas.length,
      periodos,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parsea el PDF y avisa si ya hay una DDJJ cargada para esa razón social + período, sin escribir nada.
router.post('/historico/preview', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "archivo")' });
  try {
    const row = await parseSoloPdfBuffer(req.file.buffer, req.file.originalname);
    res.json({
      razon_social: row.razon_social,
      periodo: row.periodo,
      ya_existe: await existeHistorico(row.razon_social, row.periodo),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sube el PDF F.2051 de una posición mensual ya presentada. La razón social se detecta sola por el
// CUIT que trae el PDF.
router.post('/historico', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "archivo")' });

  try {
    const row = await importarPdfBuffer(req.file.buffer, req.file.originalname);
    const dir = path.join(HISTORICO_DIR, row.razon_social);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, req.file.originalname), req.file.buffer);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Carga a mano una posición histórica sin PDF (ej. DDJJ de un formato anterior que ya no se puede
// volver a descargar en PDF). Los montos se calculan aparte (fuera de esta ruta) a partir de lo que
// mande el usuario y se mandan ya resueltos: no hay parseo acá.
router.post('/historico/manual', async (req, res) => {
  const { razon_social, periodo, iva_ventas, iva_compras, saldo_tecnico_anterior, saldo_tecnico, archivo_origen } = req.body;
  if (!['NT', 'Target'].includes(razon_social)) {
    return res.status(400).json({ error: 'falta razon_social (NT o Target)' });
  }
  if (!/^\d{4}-\d{2}$/.test(periodo || '')) {
    return res.status(400).json({ error: 'periodo inválido (formato YYYY-MM)' });
  }
  for (const [campo, valor] of Object.entries({ iva_ventas, iva_compras, saldo_tecnico_anterior, saldo_tecnico })) {
    if (typeof valor !== 'number' || Number.isNaN(valor)) {
      return res.status(400).json({ error: `falta o es inválido el campo numérico "${campo}"` });
    }
  }
  try {
    const row = await importarManual({ razon_social, periodo, iva_ventas, iva_compras, saldo_tecnico_anterior, saldo_tecnico, archivo_origen });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parsea el Formulario 931 y avisa si ya hay uno cargado para esa razón social + período.
router.post('/931/preview', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "archivo")' });
  try {
    const row = await parseSoloPdfBuffer931(req.file.buffer, req.file.originalname);
    res.json({
      razon_social: row.razon_social,
      periodo: row.periodo,
      suma_rem_10: row.suma_rem_10,
      ya_existe: await existeFormulario931(row.razon_social, row.periodo),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sube el PDF del Formulario 931 ("Declaración en línea Formulario F.931"). La razón social se
// detecta sola por el CUIT que trae el PDF.
router.post('/931', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "archivo")' });

  try {
    const row = await importarPdfBuffer931(req.file.buffer, req.file.originalname);
    const dir = path.join(F931_DIR, row.razon_social);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, req.file.originalname), req.file.buffer);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historial de todo lo cargado (Recibidos/Emitidos/931/DDJJ por razón social y período), para
// poder controlar de un vistazo qué falta antes de dar por cerrado un mes.
router.get('/historial', async (req, res) => {
  res.json(await historialCargas());
});

export default router;
