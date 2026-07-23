// Login con usuario/contraseña y sesiones simples. Las contraseñas se guardan con scrypt
// (nativo de Node, sin dependencia nueva) como "salt:hash" en hex. Las sesiones viven en
// memoria: se pierden si el proceso se reinicia (en Render free ya pasa tras ~15 min de
// inactividad), lo cual está bien para este tamaño de equipo — simplemente hay que
// volver a loguearse.
import crypto from 'node:crypto';
import { get, all, run } from '../db.js';

const sesiones = new Map(); // token -> { id, username, rol, creadoEn }

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const hashIntentado = crypto.scryptSync(password, salt, 64).toString('hex');
  const bufA = Buffer.from(hash, 'hex');
  const bufB = Buffer.from(hashIntentado, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

async function registrarAcceso({ username, rol, exito, userAgent }) {
  await run(
    'INSERT INTO accesos (username, rol, exito, user_agent) VALUES (?, ?, ?, ?)',
    [username, rol ?? null, exito ? 1 : 0, userAgent ?? null]
  );
}

export async function login(username, password, { userAgent } = {}) {
  const usuario = await get('SELECT * FROM usuarios WHERE username = ?', [username]);
  if (!usuario || !verifyPassword(password, usuario.password_hash)) {
    await registrarAcceso({ username, rol: usuario?.rol, exito: false, userAgent });
    throw new Error('Usuario o contraseña incorrectos.');
  }
  await registrarAcceso({ username, rol: usuario.rol, exito: true, userAgent });

  const token = crypto.randomBytes(32).toString('hex');
  sesiones.set(token, { id: usuario.id, username: usuario.username, rol: usuario.rol, creadoEn: Date.now() });
  return { token, username: usuario.username, rol: usuario.rol };
}

export function obtenerSesion(token) {
  return sesiones.get(token) ?? null;
}

export function cerrarSesion(token) {
  sesiones.delete(token);
}

export async function obtenerHistorialAccesos(limit = 200) {
  return all('SELECT username, rol, exito, fecha_hora FROM accesos ORDER BY fecha_hora DESC, id DESC LIMIT ?', [limit]);
}

export async function listarUsuarios() {
  return all('SELECT username, rol, creado_en FROM usuarios ORDER BY rol, username');
}
