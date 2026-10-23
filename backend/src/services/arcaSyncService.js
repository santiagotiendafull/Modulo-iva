// "Cargar datos" automático: baja de ARCA los Mis Comprobantes (Emitidos y Recibidos) de las razones
// sociales pedidas para un período y los importa con el importador de siempre, igual que si se hubieran
// subido a mano los archivos. La descarga en sí vive en arcaClient.js.
import {
  descargarComprobantesArca, arcaConfigurado, periodoActualArgentina, RAZONES_ARCA,
} from './arcaClient.js';
import {
  importarArchivo, leerFilasCsv, extraerCsvDeZip, EMITIDOS_COLS, RECIBIDOS_COLS,
} from './mesEnCursoService.js';

export class ErrorSync extends Error {
  constructor(mensaje, status = 500) {
    super(mensaje);
    this.status = status;
  }
}

// Una sola sincronización a la vez por instancia: dos entradas simultáneas con la misma clave fiscal
// pueden pisarse la sesión en ARCA, y varios logins fallidos seguidos bloquean la clave.
let enCurso = null;

export function estadoSincronizacion() {
  return {
    configurado: arcaConfigurado(),
    razones: Object.keys(RAZONES_ARCA),
    periodo_actual: periodoActualArgentina(),
    en_curso: enCurso,
  };
}

async function importarDescargas(razonSocial, descargas) {
  const resultados = [];
  for (const d of descargas) {
    if (d.sinComprobantes) {
      resultados.push({ tipo: d.tipo, comprobantes: 0, sin_comprobantes: true });
      continue;
    }
    const { buffer } = await extraerCsvDeZip(d.buffer);
    const r = await importarArchivo({
      fileNameOrBuffer: buffer,
      nombreArchivo: d.nombreArchivo,
      tipo: 'csv',
      leerFilas: leerFilasCsv,
      cols: d.tipo === 'emitidos' ? EMITIDOS_COLS : RECIBIDOS_COLS,
      razonSocialManual: razonSocial,
    });
    resultados.push({ tipo: d.tipo, comprobantes: r.filas.length, archivo: d.nombreArchivo });
  }
  return resultados;
}

// Valida y toma el turno (síncrono: los errores salen antes de empezar a responder). Devuelve
// `ejecutar(alEvento)`, que hace el trabajo y va avisando cada novedad por `alEvento`:
//   { tipo: 'paso', paso } · { tipo: 'sesion', tiempos } · { tipo: 'razon', razon, estado, ... } · { tipo: 'fin', total_ms }
export function prepararSincronizacion({ periodo, razonesSociales }) {
  if (!arcaConfigurado()) throw new ErrorSync('Falta configurar la clave fiscal de ARCA (variable de entorno ARCA_CLAVE).', 503);
  const pedidas = Array.isArray(razonesSociales) ? razonesSociales : [];
  // En el orden fijo de la app (NT, Target) y sin repetidas.
  const razones = Object.keys(RAZONES_ARCA).filter((r) => pedidas.includes(r));
  if (razones.length === 0 || razones.length !== new Set(pedidas).size) {
    throw new ErrorSync('razones_sociales debe incluir NT y/o Target', 400);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo || '')) throw new ErrorSync('periodo inválido (formato AAAA-MM)', 400);
  if (periodo > periodoActualArgentina()) throw new ErrorSync('No se puede cargar un período futuro.', 400);
  if (enCurso) throw new ErrorSync(`Ya hay una carga en curso (${enCurso.razones.join(' y ')} — ${enCurso.periodo}). Esperá a que termine.`, 409);

  enCurso = { razones, periodo, desde: new Date().toISOString() };

  async function ejecutar(alEvento = () => {}) {
    const emitir = (evento) => { try { alEvento(evento); } catch { /* el cliente se desconectó: la carga sigue igual */ } };
    const inicio = Date.now();
    const importaciones = [];
    const descargadas = new Set();
    let tiemposSesion = [];

    try {
      try {
        await descargarComprobantesArca({
          periodo,
          razonesSociales: razones,
          avance: {
            paso: (paso) => emitir({ tipo: 'paso', paso }),
            sesion: (tiempos) => { tiemposSesion = tiempos; emitir({ tipo: 'sesion', tiempos }); },
            razonIniciada: (razon) => emitir({ tipo: 'razon', razon, estado: 'cargando' }),
            razonTerminada: ({ razonSocial, descargas, error, tiempos }) => {
              descargadas.add(razonSocial);
              if (error) {
                emitir({ tipo: 'razon', razon: razonSocial, estado: 'error', detalle: `No se pudo bajar de ARCA: ${error.message}`, tiempos });
                return;
              }
              emitir({ tipo: 'razon', razon: razonSocial, estado: 'importando', tiempos });
              // La carga en la base corre mientras el navegador sigue con la razón social siguiente.
              const t0 = Date.now();
              importaciones.push(
                importarDescargas(razonSocial, descargas)
                  .then((resultados) => emitir({
                    tipo: 'razon', razon: razonSocial, estado: 'ok', resultados, tiempos: [...tiempos, { etapa: 'carga en la base', ms: Date.now() - t0 }],
                  }))
                  .catch((err) => emitir({ tipo: 'razon', razon: razonSocial, estado: 'error', detalle: `Se bajó de ARCA pero no se pudo cargar: ${err.message}`, tiempos })),
              );
            },
          },
        });
      } catch (err) {
        // Falló algo que afecta a todas las razones sociales que faltaban (ingreso a ARCA, navegador).
        for (const razon of razones.filter((r) => !descargadas.has(r))) {
          emitir({ tipo: 'razon', razon, estado: 'error', detalle: `No se pudo bajar de ARCA: ${err.message}` });
        }
      }
      await Promise.all(importaciones);
      const total = Date.now() - inicio;
      emitir({ tipo: 'fin', total_ms: total });
      console.log(`[arca] ${periodo} ${razones.join('+')} total=${total}ms sesion=${JSON.stringify(tiemposSesion)}`);
    } finally {
      enCurso = null;
    }
  }

  return { razones, ejecutar };
}
