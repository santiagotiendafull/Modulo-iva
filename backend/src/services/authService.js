// Login con usuario/contraseña y sesiones simples. Las contraseñas se guardan con scrypt
// (nativo de Node, sin dependencia nueva) como "salt:hash" en hex. Las sesiones se guardan en la
// tabla `sesiones` (no en memoria): en Vercel cada invocación puede caer en una instancia
// serverless distinta, así que un Map en memoria del proceso se perdería todo el tiempo.
import crypto from 'node:crypto';
import { get, all, run } from '../db.js';

const SESION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

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
  await run(
    'INSERT INTO sesiones (token, usuario_id, username, rol) VALUES (?, ?, ?, ?)',
    [token, usuario.id, usuario.username, usuario.rol]
  );
  return { token, username: usuario.username, rol: usuario.rol };
}

export async function obtenerSesion(token) {
  const sesion = await get('SELECT * FROM sesiones WHERE token = ?', [token]);
  if (!sesion) return null;
  const creadoEnMs = new Date(`${sesion.creado_en.replace(' ', 'T')}Z`).getTime();
  if (Date.now() - creadoEnMs > SESION_TTL_MS) {
    await run('DELETE FROM sesiones WHERE token = ?', [token]);
    return null;
  }
  return { id: sesion.usuario_id, username: sesion.username, rol: sesion.rol };
}

export async function cerrarSesion(token) {
  await run('DELETE FROM sesiones WHERE token = ?', [token]);
}

export async function obtenerHistorialAccesos(limit = 200) {
  return all('SELECT username, rol, exito, fecha_hora FROM accesos ORDER BY fecha_hora DESC, id DESC LIMIT ?', [limit]);
}

export async function listarUsuarios() {
  return all('SELECT username, rol, creado_en FROM usuarios ORDER BY rol, username');
}
