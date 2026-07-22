// Reglas de negocio sobre qué comprobantes entran en el cálculo de IVA Ventas/Compras del mes en
// curso, y con qué signo:
//
// - Compras: solo la letra A discrimina IVA de forma válida para tomar crédito fiscal (Factura A,
//   sus tiques y variantes con leyenda). Facturas B/C, Recibos, etc. no cuentan. Las Notas de
//   Crédito A restan (revierten una compra A que sí tomó crédito fiscal); notas de crédito de
//   otras letras no cuentan, porque nunca hubo crédito fiscal que revertir.
// - Ventas: todas las letras suman (A, B y C): el vendedor debe el débito fiscal sobre cualquier
//   venta, discrimine o no el IVA en el comprobante. Las Notas de Crédito, de cualquier letra,
//   restan: revierten la venta que reversan.
// - Remitos, resúmenes de datos e informes de cierre (Z) no son comprobantes de venta/compra —
//   quedan afuera del cálculo aunque aparezcan en el export de ARCA, porque contarlos duplicaría
//   el importe ya facturado en el comprobante real.
//
// La letra y si es Nota de Crédito se determinan por el código AFIP (tabla oficial de "Tipos de
// Comprobante"), no por el texto: algunos exports de ARCA solo traen el código numérico ("8", sin
// "Nota de Crédito B" al lado), y buscar la frase en un texto que no está ahí hacía que esas notas
// de crédito se sumaran en vez de restarse. Si el código no está en la tabla, se cae al texto como
// respaldo (formatos viejos o códigos no contemplados).
const CODIGOS = {
  '1': { letra: 'A' }, '2': { letra: 'A' }, '3': { letra: 'A', nc: true }, '4': { letra: 'A' }, '5': { letra: 'A' },
  '6': { letra: 'B' }, '7': { letra: 'B' }, '8': { letra: 'B', nc: true }, '9': { letra: 'B' }, '10': { letra: 'B' },
  '11': { letra: 'C' }, '12': { letra: 'C' }, '13': { letra: 'C', nc: true }, '15': { letra: 'C' }, '16': { letra: 'C' },
  '17': { letra: 'A' }, '18': { letra: 'B' },
  '19': {}, '20': {}, '21': { nc: true }, '22': {},
  '23': { letra: 'A' }, '24': { letra: 'A' }, '25': { letra: 'B' }, '26': { letra: 'B' },
  '27': { letra: 'A' }, '28': { letra: 'B' }, '29': { letra: 'C' },
  '30': {}, '31': {}, '32': {}, '33': {},
  '34': { letra: 'A' }, '35': { letra: 'B' }, '36': { letra: 'C' },
  '37': {}, '38': { nc: true },
  '39': { letra: 'A' }, '40': { letra: 'B' }, '41': { letra: 'C' },
  '43': { letra: 'B', nc: true }, '44': { letra: 'C', nc: true },
  '45': { letra: 'A' }, '46': { letra: 'B' }, '47': { letra: 'C' },
  '48': { letra: 'A', nc: true },
  '49': {},
  '51': { letra: 'A' }, '52': { letra: 'A' }, '53': { letra: 'A', nc: true }, '54': { letra: 'A' }, '55': { letra: 'A' },
  '56': { letra: 'A' }, '57': { letra: 'A' }, '58': { letra: 'A' }, '59': { letra: 'A' },
  '60': { letra: 'A' }, '61': { letra: 'B' },
  '63': { letra: 'A' }, '64': { letra: 'B' },
  '66': {},
  '80': { cuenta: false }, // informe diario de cierre (Z) — control, no un comprobante
  '81': { letra: 'A' }, '82': { letra: 'B' }, '83': {},
  '88': { cuenta: false }, // remito electrónico
  '89': { cuenta: false }, // resumen de datos
  '90': { nc: true }, // "otros comprobantes - documentos exceptuados - notas de crédito"
  '91': { cuenta: false }, // remitos R
  '99': {},
  '109': { letra: 'C' },
  '110': { nc: true }, '111': { letra: 'C' },
  '112': { letra: 'A', nc: true }, '113': { letra: 'B', nc: true }, '114': { letra: 'C', nc: true },
  '115': { letra: 'A' }, '116': { letra: 'B' }, '117': { letra: 'C' },
  '201': { letra: 'A' }, '202': { letra: 'A' }, '203': { letra: 'A', nc: true },
  '206': { letra: 'B' }, '207': { letra: 'B' }, '208': { letra: 'B', nc: true },
  '211': { letra: 'C' }, '212': { letra: 'C' }, '213': { letra: 'C', nc: true },
  '331': {}, '332': {},
  '991': { cuenta: false }, '992': { cuenta: false }, '993': { cuenta: false },
  '994': { cuenta: false }, '995': { cuenta: false }, '997': { cuenta: false }, '998': { cuenta: false },
};

function codigoDe(tipoComprobante) {
  if (tipoComprobante == null) return null;
  const m = String(tipoComprobante).trim().match(/^0*(\d+)/);
  return m ? m[1] : null;
}

function infoCodigo(tipoComprobante) {
  const codigo = codigoDe(tipoComprobante);
  return codigo != null ? CODIGOS[codigo] : undefined;
}

function letraDeTexto(tipoComprobante) {
  const m = (tipoComprobante || '').match(/\b([ABC])\b/i);
  return m ? m[1].toUpperCase() : null;
}

function esNotaDeCreditoTexto(tipoComprobante) {
  return /nota\s+de\s+cr[eé]dito/i.test(tipoComprobante || '');
}

function letraDe(tipoComprobante) {
  const info = infoCodigo(tipoComprobante);
  if (info) return info.letra ?? null;
  return letraDeTexto(tipoComprobante);
}

function esNotaDeCredito(tipoComprobante) {
  const info = infoCodigo(tipoComprobante);
  if (info) return !!info.nc;
  return esNotaDeCreditoTexto(tipoComprobante);
}

function esDocumentoNoTransaccional(tipoComprobante) {
  return infoCodigo(tipoComprobante)?.cuenta === false;
}

// Devuelve 1 (suma), -1 (resta) o 0 (no participa del cálculo).
export function signoComprobante(tipo, tipoComprobante) {
  if (esDocumentoNoTransaccional(tipoComprobante)) return 0;

  const esNC = esNotaDeCredito(tipoComprobante);

  if (tipo === 'compra') {
    if (letraDe(tipoComprobante) !== 'A') return 0;
    return esNC ? -1 : 1;
  }

  return esNC ? -1 : 1;
}

export function contribuyeAlCalculo(tipo, tipoComprobante) {
  return signoComprobante(tipo, tipoComprobante) !== 0;
}

export function esResta(tipo, tipoComprobante) {
  return signoComprobante(tipo, tipoComprobante) < 0;
}

export function motivoExclusion(tipo, tipoComprobante) {
  if (esDocumentoNoTransaccional(tipoComprobante)) {
    return 'Remito, resumen de datos o informe de cierre: no es un comprobante de venta/compra.';
  }
  if (tipo === 'compra' && letraDe(tipoComprobante) !== 'A') {
    return 'No es Factura A: no discrimina IVA de forma válida para crédito fiscal.';
  }
  return null;
}
