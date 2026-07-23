import { obtenerSesion } from '../services/authService.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const sesion = token && obtenerSesion(token);
  if (!sesion) return res.status(401).json({ error: 'No autenticado' });
  req.usuario = sesion;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No autorizado para esta acción' });
    }
    next();
  };
}
