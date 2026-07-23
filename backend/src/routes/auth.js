import { Router } from 'express';
import { login, cerrarSesion, obtenerHistorialAccesos, listarUsuarios } from '../services/authService.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Falta usuario o contraseña' });
  try {
    const resultado = await login(username, password, { userAgent: req.headers['user-agent'] });
    res.json(resultado);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) cerrarSesion(token);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.usuario.username, rol: req.usuario.rol });
});

router.get('/accesos', requireAuth, requireRole('dev'), async (req, res) => {
  res.json(await obtenerHistorialAccesos());
});

router.get('/usuarios', requireAuth, requireRole('dev'), async (req, res) => {
  res.json(await listarUsuarios());
});

export default router;
