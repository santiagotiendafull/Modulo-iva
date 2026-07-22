import { Router } from 'express';
import { obtenerPorcentaje931, establecerPorcentaje931 } from '../services/configuracionService.js';

const router = Router();

router.get('/porcentaje-931', (req, res) => {
  res.json({ porcentaje: obtenerPorcentaje931() });
});

router.put('/porcentaje-931', (req, res) => {
  try {
    const porcentaje = establecerPorcentaje931(req.body.valor);
    res.json({ porcentaje });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
