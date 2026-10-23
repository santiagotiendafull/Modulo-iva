// "Cargar datos" automático: baja de ARCA los Mis Comprobantes (Emitidos y Recibidos) de una razón
// social para un período y los importa con el importador de siempre, igual que si se hubieran subido
// a mano los archivos. La descarga en sí vive en arcaClient.js.
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

export async function sincronizarDesdeArca({ periodo, razonSocial }) {
  if (!arcaConfigurado()) throw new ErrorSync('Falta configurar la clave fiscal de ARCA (variable de entorno ARCA_CLAVE).', 503);
  if (!RAZONES_ARCA[razonSocial]) throw new ErrorSync('razon_social debe ser NT o Target', 400);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo || '')) throw new ErrorSync('periodo inválido (formato AAAA-MM)', 400);
  if (periodo > periodoActualArgentina()) throw new ErrorSync('No se puede cargar un período futuro.', 400);
  if (enCurso) throw new ErrorSync(`Ya hay una carga en curso (${enCurso.razon_social} — ${enCurso.periodo}). Esperá a que termine.`, 409);

  enCurso = { razon_social: razonSocial, periodo, desde: new Date().toISOString() };
  try {
    let descargados;
    try {
      descargados = await descargarComprobantesArca({ periodo, razonSocial });
    } catch (err) {
      throw new ErrorSync(`No se pudo bajar de ARCA: ${err.message}`, 502);
    }

    const resultados = [];
    for (const d of descargados) {
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
    return { razon_social: razonSocial, periodo, resultados };
  } finally {
    enCurso = null;
  }
}
