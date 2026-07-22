import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import posicionesRouter from './routes/posiciones.js';
import importarRouter from './routes/importar.js';
import proveedoresRouter from './routes/proveedores.js';
import conciliacionRouter from './routes/conciliacion.js';
import configuracionRouter from './routes/configuracion.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/posiciones', posicionesRouter);
app.use('/api/importar', importarRouter);
app.use('/api/proveedores', proveedoresRouter);
app.use('/api/conciliacion', conciliacionRouter);
app.use('/api/configuracion', configuracionRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4310;

// La base (Turso o archivo local, ver db.js) hay que prepararla antes de aceptar pedidos.
await initDb();
app.listen(PORT, () => console.log(`Módulo IVA backend escuchando en http://localhost:${PORT}`));
