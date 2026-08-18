// Entrada solo para desarrollo local (`npm run dev`) y para correr el backend como proceso propio
// fuera de Vercel. El servidor Express en sí vive en app.js — acá solo se lo hace escuchar en un
// puerto. En Vercel esto no se usa: api/index.js importa app.js directamente.
import app from './app.js';

const PORT = process.env.PORT || 4310;
app.listen(PORT, () => console.log(`Módulo IVA backend escuchando en http://localhost:${PORT}`));
