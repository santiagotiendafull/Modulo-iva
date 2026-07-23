import { Router } from 'express';
import { listarCreditoManual, agregarCreditoManual, eliminarCreditoManual } from '../services/creditoFiscalManualService.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const soloAdminODev = requireRole('administrador', 'dev');

router.get('/', soloAdminODev, async (req, res) => {
  res.json(await listarCreditoManual());
});

router.post('/', soloAdminODev, async (req, res) => {
  const { razon_social: razonSocial, periodo, monto, descripcion } = req.body;
  try {
    await agregarCreditoManual(razonSocial, periodo, monto, descripcion);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', soloAdminODev, async (req, res) => {
  await eliminarCreditoManual(req.params.id);
  res.json({ ok: true });
});

export default router;
