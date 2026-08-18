// Entrada serverless de Vercel para el servicio "backend" (ver vercel.json en la raíz del repo:
// root "backend" para este servicio, así que Vercel busca la función acá, relativo a esa carpeta).
// Una app de Express es directamente un handler (req, res) válido, así que Vercel puede invocarla
// sin envoltorio extra.
export { default } from '../src/app.js';
