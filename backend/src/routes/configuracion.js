import { Router } from 'express';
import { obtenerPorcentaje931, establecerPorcentaje931, obtenerVisibilidad, establecerVisibilidad } from '../services/configuracionService.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/porcentaje-931', async (req, res) => {
  res.json({ porcentaje: await obtenerPorcentaje931() });
});

router.put('/porcentaje-931', requireRole('administrador', 'dev'), async (req, res) => {
  try {
    const porcentaje = await establecerPorcentaje931(req.body.valor);
    res.json({ porcentaje });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/ui-visibilidad', async (req, res) => {
  res.json(await obtenerVisibilidad());
});

router.put('/ui-visibilidad', requireRole('dev'), async (req, res) => {
  res.json(await establecerVisibilidad(req.body));
});

export default router;
