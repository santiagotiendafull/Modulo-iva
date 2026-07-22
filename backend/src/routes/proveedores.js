import { Router } from 'express';
import { listarProveedores, establecerEstado, comprasExcluidasPorProveedor } from '../services/proveedoresService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(listarProveedores());
});

router.put('/:cuit', (req, res) => {
  const { estado } = req.body;
  try {
    establecerEstado(req.params.cuit, estado);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/excluidas', (req, res) => {
  res.json(comprasExcluidasPorProveedor());
});

export default router;
