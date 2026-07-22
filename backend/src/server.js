import express from 'express';
import cors from 'cors';
import './db.js'; // inicializa la base y el schema
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
app.listen(PORT, () => console.log(`Módulo IVA backend escuchando en http://localhost:${PORT}`));
