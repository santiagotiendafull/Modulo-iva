import { Router } from 'express';
import { periodosDisponibles, resumenPeriodo, evolucionMensual, ventasCompras, comparativa, desgloseAlicuotas } from '../services/posicionService.js';

const router = Router();
const RAZONES_VALIDAS = new Set(['NT', 'Target', 'Consolidado']);

function validarRazonSocial(req, res, next) {
  const { razon_social } = req.query;
  if (!RAZONES_VALIDAS.has(razon_social)) {
    return res.status(400).json({ error: 'razon_social debe ser NT, Target o Consolidado' });
  }
  next();
}

router.get('/periodos', validarRazonSocial, (req, res) => {
  res.json({ periodos: periodosDisponibles(req.query.razon_social) });
});

router.get('/resumen', validarRazonSocial, (req, res) => {
  const { razon_social, periodo } = req.query;
  if (!periodo) return res.status(400).json({ error: 'falta periodo (YYYY-MM)' });
  const resumen = resumenPeriodo(razon_social, periodo);
  if (!resumen) return res.status(404).json({ error: 'no hay datos para ese período' });
  res.json(resumen);
});

router.get('/evolucion', validarRazonSocial, (req, res) => {
  res.json({ evolucion: evolucionMensual(req.query.razon_social) });
});

router.get('/comparativa', (req, res) => {
  const { periodo } = req.query;
  if (!periodo) return res.status(400).json({ error: 'falta periodo (YYYY-MM)' });
  const resultado = comparativa(periodo);
  if (!resultado) return res.status(404).json({ error: 'no hay datos para ese período' });
  res.json(resultado);
});

router.get('/ventas-compras', validarRazonSocial, (req, res) => {
  const { razon_social, periodo } = req.query;
  if (!periodo) return res.status(400).json({ error: 'falta periodo (YYYY-MM)' });
  const resultado = ventasCompras(razon_social, periodo);
  if (!resultado) return res.status(404).json({ error: 'no disponible' });
  res.json(resultado);
});

router.get('/desglose-alicuotas', (req, res) => {
  const { razon_social, periodo, tipo } = req.query;
  if (razon_social !== 'NT' && razon_social !== 'Target') {
    return res.status(400).json({ error: 'razon_social debe ser NT o Target' });
  }
  if (!periodo) return res.status(400).json({ error: 'falta periodo (YYYY-MM)' });
  if (tipo !== 'venta' && tipo !== 'compra') return res.status(400).json({ error: 'tipo debe ser venta o compra' });
  res.json(desgloseAlicuotas(razon_social, periodo, tipo));
});

export default router;
