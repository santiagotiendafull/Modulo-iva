import { Router } from 'express';
import { listarEscenarios, guardarEscenario, eliminarEscenario } from '../services/proyeccionService.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const soloAdminODev = requireRole('administrador', 'dev');

router.get('/', soloAdminODev, async (req, res) => {
  try {
    res.json(await listarEscenarios(req.query.razon_social));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', soloAdminODev, async (req, res) => {
  const { razon_social: razonSocial, anio, nombre, objetivo, saldo_final: saldoFinal, neto, palanca, iva_pendiente: ivaPendiente, compra_adicional: compraAdicional, credito_fijo: creditoFijo, base_modo: baseModo, ajustar_al_objetivo: ajustarAlObjetivo, meses } = req.body;
  try {
    res.json(await guardarEscenario(
      { razonSocial, anio, nombre, objetivo, saldoFinal, neto, palanca, ivaPendiente, compraAdicional, creditoFijo, baseModo, ajustarAlObjetivo, meses },
      req.usuario?.username
    ));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', soloAdminODev, async (req, res) => {
  await eliminarEscenario(req.params.id);
  res.json({ ok: true });
});

export default router;
