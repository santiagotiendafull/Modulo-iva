import { Router } from 'express';
import { listarProveedores, establecerEstado, comprasExcluidasPorProveedor } from '../services/proveedoresService.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json(await listarProveedores());
});

router.put('/:cuit', async (req, res) => {
  const { estado } = req.body;
  try {
    await establecerEstado(req.params.cuit, estado);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/excluidas', async (req, res) => {
  res.json(await comprasExcluidasPorProveedor());
});

export default router;
