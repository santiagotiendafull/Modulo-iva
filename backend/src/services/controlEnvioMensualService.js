// Control mensual: a diferencia de pendientes_estudio (lo que el ESTUDIO dice que le falta), esto es
// el control propio — todo lo que debería mandarse en un mes puntual (compras de Mis Comprobantes +
// comprobantes_manuales de ese período), con una marca "enviado" que se puede tildar/destildar en
// cualquier momento. Comparar() cruza esta lista contra pendientes_estudio para detectar cuando el
// estudio dice que algo falta pero acá ya está marcado como enviado — esa es la señal para reclamarle.
import { all, run } from '../db.js';

// Solo importa para cruzar contra pendientes_estudio, una fuente distinta (Excel del estudio) que
// puede traer los números con relleno de ceros distinto al export de ARCA. El pdv/numero_desde que
// llega de un Excel a veces queda como número con ".0" pegado (ej. "274060.0" en vez de "274060") —
// hay que sacar eso ANTES de tirar el punto, si no "274060.0" queda "2740600" en vez de "274060".
function normalizarNumero(v) {
  if (v == null || v === '') return '';
  const sinDecimalCero = String(v).trim().replace(/\.0+$/, '');
  const digitos = sinDecimalCero.replace(/[^\d]/g, '');
  if (!digitos) return sinDecimalCero.toLowerCase();
  return String(parseInt(digitos, 10));
}
function normalizarCuit(v) {
  if (v == null || v === '') return '';
  return String(v).trim().replace(/\.0+$/, '').replace(/[^\d]/g, '');
}
function clave(cuit, pdv, numero) {
  return `${normalizarCuit(cuit)}|${normalizarNumero(pdv)}|${normalizarNumero(numero)}`;
}

// El pdv/numero_desde de "comprobantes" a veces viene de una celda de Excel que ExcelJS leyó como
// número, no como texto, y queda con un ".0" pegado (ej. "274060.0"). Se limpia acá, antes de
// armar la clave que después se guarda en control_envio_mensual y se vuelve a buscar — si se
// limpiara solo para mostrar en pantalla, tildar un comprobante guardaría la versión limpia pero la
// próxima carga la buscaría con la versión sucia y el tilde se "perdería".
function limpiarNumero(v) {
  if (v == null) return v;
  return String(v).trim().replace(/\.0+$/, '');
}

// Todo lo que debería mandarse ese mes: comprobantes de compra ya cargados (Mis Comprobantes) más
// los cargados a mano (peajes, combustible), unificados en una sola lista con la misma forma.
export async function obtenerControlMensual(razonSocial, periodo) {
  if (!['NT', 'Target'].includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  if (!/^\d{4}-\d{2}$/.test(periodo || '')) throw new Error('Falta período (formato YYYY-MM).');

  const [comprobantesArcaCrudos, marcas, manuales] = await Promise.all([
    all(
      `SELECT id, fecha, tipo_comprobante, pdv, numero_desde as numero, cuit_contraparte, denominacion_contraparte, total
       FROM comprobantes WHERE razon_social = ? AND periodo = ? AND tipo = 'compra'`,
      [razonSocial, periodo]
    ),
    all('SELECT cuit_contraparte, pdv, numero, enviado FROM control_envio_mensual WHERE razon_social = ?', [razonSocial]),
    all('SELECT * FROM comprobantes_manuales WHERE razon_social = ? AND periodo = ?', [razonSocial, periodo]),
  ]);
  const comprobantesArca = comprobantesArcaCrudos.map((c) => ({ ...c, pdv: limpiarNumero(c.pdv), numero: limpiarNumero(c.numero) }));

  // Acá el cruce es siempre contra la misma tabla comprobantes (misma fuente), así que la marca se
  // guarda y se busca con el pdv/número tal cual vienen de ARCA, sin normalizar.
  const marcasPorClave = new Map(marcas.map((m) => [`${m.cuit_contraparte}|${m.pdv}|${m.numero}`, !!m.enviado]));

  const filasArca = comprobantesArca.map((c) => ({
    origen: 'arca',
    id: c.id,
    fecha: c.fecha,
    tipo_comprobante: c.tipo_comprobante,
    pdv: c.pdv,
    numero: c.numero,
    cuit_contraparte: c.cuit_contraparte,
    denominacion_contraparte: c.denominacion_contraparte,
    total: c.total,
    enviado: marcasPorClave.get(`${c.cuit_contraparte}|${c.pdv}|${c.numero}`) ?? false,
  }));

  const filasManuales = manuales.map((m) => ({
    origen: 'manual',
    id: m.id,
    fecha: m.fecha,
    tipo_comprobante: m.tipo_comprobante,
    pdv: null,
    numero: m.numero,
    cuit_contraparte: null,
    denominacion_contraparte: m.proveedor,
    total: m.monto,
    enviado: !!m.enviado,
  }));

  const filas = [...filasArca, ...filasManuales].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  return {
    filas,
    kpis: {
      cantidad_total: filas.length,
      cantidad_enviados: filas.filter((f) => f.enviado).length,
      monto_total: filas.reduce((acc, f) => acc + f.total, 0),
      monto_enviado: filas.filter((f) => f.enviado).reduce((acc, f) => acc + f.total, 0),
    },
  };
}

export async function marcarEnviadoArca(razonSocial, cuitContraparte, pdv, numero, enviado) {
  if (!['NT', 'Target'].includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  await run(
    `INSERT INTO control_envio_mensual (razon_social, cuit_contraparte, pdv, numero, enviado, actualizado_en)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (razon_social, cuit_contraparte, pdv, numero) DO UPDATE SET
       enviado = excluded.enviado, actualizado_en = excluded.actualizado_en`,
    [razonSocial, cuitContraparte, pdv, numero, enviado ? 1 : 0]
  );
}

export async function comprobantesMarcadosParaPdf(razonSocial, periodo) {
  const { filas } = await obtenerControlMensual(razonSocial, periodo);
  return filas.filter((f) => f.enviado);
}

// Cruza tu Control mensual contra lo que dice pendientes_estudio para el mismo período (pendientes_
// estudio no tiene columna período propia, así que se filtra por el mes de la fecha del comprobante).
// discrepancias = el estudio dice que le falta, pero vos ya lo tenés marcado como enviado acá — señal
// para reclamarle. pendientes = coincide en las dos listas (o no está en la tuya todavía): falta de verdad.
export async function compararEnvio(razonSocial, periodo) {
  if (!['NT', 'Target'].includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  if (!/^\d{4}-\d{2}$/.test(periodo || '')) throw new Error('Falta período (formato YYYY-MM).');

  const [pideElEstudio, control] = await Promise.all([
    all('SELECT * FROM pendientes_estudio WHERE razon_social = ? AND fecha LIKE ?', [razonSocial, `${periodo}%`]),
    obtenerControlMensual(razonSocial, periodo),
  ]);

  const enviadoPorClave = new Map(
    control.filas.map((f) => [clave(f.cuit_contraparte, f.pdv, f.numero), f.enviado])
  );

  const discrepancias = [];
  const pendientes = [];
  for (const f of pideElEstudio) {
    const c = clave(f.cuit_contraparte, f.pdv, f.numero);
    if (enviadoPorClave.get(c)) discrepancias.push(f);
    else pendientes.push(f);
  }

  return {
    periodo,
    razon_social: razonSocial,
    discrepancias,
    pendientes,
    resumen: { cantidad_discrepancias: discrepancias.length, cantidad_pendientes: pendientes.length },
  };
}
