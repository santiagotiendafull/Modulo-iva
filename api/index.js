// Entrada serverless de Vercel: cualquier archivo bajo /api en la raíz del repo se despliega
// como función. Una app de Express es directamente un handler (req, res) válido, así que Vercel
// puede invocarla sin envoltorio extra — vercel.json redirige todo /api/* acá (ver rewrites).
export { default } from '../backend/src/app.js';
