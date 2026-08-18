import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import posicionesRouter from './routes/posiciones.js';
import importarRouter from './routes/importar.js';
import proveedoresRouter from './routes/proveedores.js';
import conciliacionRouter from './routes/conciliacion.js';
import configuracionRouter from './routes/configuracion.js';
import creditoFiscalManualRouter from './routes/creditoFiscalManual.js';
import authRouter from './routes/auth.js';
import { requireAuth, requireRole } from './middleware/auth.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Dashboard: lo ven los 3 roles (gerente incluido).
app.use('/api/posiciones', requireAuth, posicionesRouter);
// Cargar datos y Proveedores: solo administrador/dev — el gerente no los necesita.
app.use('/api/importar', requireAuth, requireRole('administrador', 'dev'), importarRouter);
app.use('/api/proveedores', requireAuth, requireRole('administrador', 'dev'), proveedoresRouter);
// Conciliación: /interna-externa queda abierta a los 3 roles adentro del router; el resto
// (Comprobantes, subir/borrar interna, PDF de faltantes) se restringe ruta por ruta.
app.use('/api/conciliacion', requireAuth, conciliacionRouter);
app.use('/api/configuracion', requireAuth, configuracionRouter);
app.use('/api/credito-fiscal-manual', requireAuth, creditoFiscalManualRouter);

// La base (Turso o archivo local, ver db.js) hay que prepararla antes de aceptar pedidos. Esto
// corre una vez por instancia del proceso — en Vercel, una vez por "cold start" de la función
// serverless (las migraciones son idempotentes, así que repetirlas no rompe nada).
await initDb();

export default app;
