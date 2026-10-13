// Cuenta de la pantalla "Proyección" (cómo terminaría el año en IVA). Todo acá es puro (sin React ni
// red) para poder probarlo aparte.
//
// La regla de fondo es la misma que usa el backend al encadenar los meses (posicionService.lineaDeTiempo):
//   saldo del mes = max(saldo del mes anterior, 0) − (Débito − Crédito)
// Saldo positivo = a favor del contribuyente. Un mes que cierra "a pagar" (negativo) no se arrastra:
// ese monto se paga con la DDJJ y el mes siguiente arranca desde 0.
import { esCierreDeMes } from './format.js';

export const BASES = [
  { clave: 'prom3', label: 'Promedio de los últimos 3 meses' },
  { clave: 'prom6', label: 'Promedio de los últimos 6 meses' },
  { clave: 'anioAnterior', label: 'Mismo mes del año anterior' },
];

const redondear = (n) => Math.round(n * 100) / 100;
const promedio = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Un mes de la evolución es "real" cuando ya está cerrado: tiene la DDJJ presentada, o todavía no
// pero sus comprobantes llegan hasta fin de mes (queda "Pendiente DDJJ"). El mes en curso acumula
// comprobantes todavía, así que sus cifras son parciales y no sirven como dato real.
export function esMesReal(m) {
  if (!m) return false;
  return m.origen !== 'actual' || esCierreDeMes(m.periodo, m.ultima_fecha);
}

// Solo se proyecta lo que viene DESPUÉS del último mes cerrado: un mes anterior a uno cerrado ya
// pasó, aunque su carga haya quedado incompleta (se muestra tal cual está cargado y se marca), y
// un mes sin ningún dato en el medio queda como hueco. Si no, un mes viejo con carga parcial
// quedaba "proyectado" por delante de uno real y desordenaba toda la cuenta.
export function armarFilasBase(evolucion, anio) {
  const porPeriodo = new Map(evolucion.map((m) => [m.periodo, m]));
  const periodos = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
  const ultimoReal = periodos.map((p) => esMesReal(porPeriodo.get(p))).lastIndexOf(true);

  return periodos.map((periodo, i) => {
    const m = porPeriodo.get(periodo);
    if (i <= ultimoReal) {
      if (!m) return { periodo, tipo: 'real', sinDatos: true, debito: 0, credito: 0, saldoAnterior: null, saldo: null };
      return {
        periodo, tipo: 'real', debito: m.iva_ventas, credito: m.iva_compras,
        saldoAnterior: m.saldo_tecnico_anterior, saldo: m.saldo_tecnico, origen: m.origen,
        incompletoHasta: esMesReal(m) ? null : m.ultima_fecha,
      };
    }
    return {
      periodo, tipo: 'proyectado',
      parcial: m ? { debito: m.iva_ventas, credito: m.iva_compras, hasta: m.ultima_fecha } : null,
    };
  });
}

// Saldo con el que arranca enero: el del último mes cargado de un año anterior (0 si no hay).
export function saldoInicialDelAnio(evolucion, anio) {
  const previos = evolucion.filter((m) => m.periodo < `${anio}-01`).sort((a, b) => a.periodo.localeCompare(b.periodo));
  return previos.length ? previos.at(-1).saldo_tecnico : 0;
}

// Valores de referencia de Débito y Crédito para un mes proyectado, según la base elegida.
export function estimarBase(evolucion, periodo, modo) {
  const reales = evolucion.filter(esMesReal).sort((a, b) => a.periodo.localeCompare(b.periodo));
  const promedioUltimos = (n) => {
    const previos = reales.filter((m) => m.periodo < periodo).slice(-n);
    return { debito: promedio(previos.map((m) => m.iva_ventas)), credito: promedio(previos.map((m) => m.iva_compras)) };
  };
  if (modo === 'anioAnterior') {
    const [anio, mes] = periodo.split('-');
    const mismoMes = reales.find((m) => m.periodo === `${Number(anio) - 1}-${mes}`);
    if (mismoMes) return { debito: mismoMes.iva_ventas, credito: mismoMes.iva_compras };
    return promedioUltimos(3); // sin dato del año anterior, se usa la tendencia reciente
  }
  return promedioUltimos(modo === 'prom6' ? 6 : 3);
}

// Encadena los meses y calcula diferencia y saldo de cada uno. Los reales ya traen su saldo.
export function simular(filas, saldoInicial) {
  let arrastre = saldoInicial;
  return filas.map((f) => {
    const diferencia = f.debito - f.credito;
    if (f.tipo === 'real') {
      // Un hueco sin datos no mueve el saldo: se muestra el que venía arrastrándose.
      if (f.saldo == null) return { ...f, diferencia, saldoAnterior: arrastre, saldo: arrastre };
      arrastre = f.saldo;
      return { ...f, diferencia };
    }
    const saldoAnterior = Math.max(arrastre, 0);
    const saldo = saldoAnterior - diferencia;
    arrastre = saldo;
    return { ...f, diferencia, saldoAnterior, saldo };
  });
}

function saldoFinalConDiferencia(filas, saldoInicial, d) {
  const aplicadas = filas.map((f) => (f.libre ? { ...f, debito: f.debitoBase, credito: f.debitoBase - d } : f));
  return simular(aplicadas, saldoInicial).at(-1).saldo;
}

// Busca la diferencia neta (Débito − Crédito) que, repetida igual en todos los meses "libres" (los
// proyectados que el usuario no tocó), deja el saldo de diciembre en el objetivo. Es una búsqueda
// numérica y no una fórmula cerrada porque el saldo "a pagar" no se arrastra: con un objetivo a
// pagar, o con meses fijos de por medio, la fórmula simple (saldo − objetivo) / meses se desvía.
// El saldo final baja siempre que sube la diferencia, así que hay una única solución.
export function resolverDiferenciaUniforme(filas, saldoInicial, objetivo) {
  if (!filas.some((f) => f.libre)) return null;
  if (filas.at(-1).tipo === 'real') return null;
  let bajo = -1e13;
  let alto = 1e13;
  for (let i = 0; i < 200; i++) {
    const medio = (bajo + alto) / 2;
    if (saldoFinalConDiferencia(filas, saldoInicial, medio) > objetivo) bajo = medio;
    else alto = medio;
  }
  const d = (bajo + alto) / 2;
  const obtenido = saldoFinalConDiferencia(filas, saldoInicial, d);
  return { d, alcanzable: Math.abs(obtenido - objetivo) < 1 };
}

// `editados`: { 'YYYY-MM': { debito, credito } } — meses que el usuario tocó a mano; quedan fijos.
// `ajustar`: si es true y hay objetivo, los meses sin tocar se calculan para llegar al objetivo; si
// no, siguen la tendencia (débito y crédito de la base elegida).
export function calcularProyeccion({ evolucion, anio, baseModo, objetivo, ajustar, editados }) {
  const base = armarFilasBase(evolucion, anio);
  const saldoInicial = saldoInicialDelAnio(evolucion, anio);
  const filas = base.map((f) => {
    if (f.tipo === 'real') return f;
    const est = estimarBase(evolucion, f.periodo, baseModo);
    const comun = { ...f, debitoBase: est.debito, creditoBase: est.credito };
    const ed = editados[f.periodo];
    if (ed) return { ...comun, editado: true, libre: false, debito: ed.debito, credito: ed.credito };
    return { ...comun, editado: false, libre: true, debito: est.debito, credito: est.credito };
  });

  const hayObjetivo = objetivo != null && Number.isFinite(objetivo);
  const resolucion = ajustar && hayObjetivo ? resolverDiferenciaUniforme(filas, saldoInicial, objetivo) : null;
  const finales = resolucion
    ? filas.map((f) => (f.libre ? { ...f, credito: redondear(f.debitoBase - resolucion.d) } : f))
    : filas;
  const simuladas = simular(finales, saldoInicial);

  const libres = simuladas.filter((f) => f.libre);
  const creditoNecesario = promedio(libres.map((f) => f.credito));
  const creditoReferencia = promedio(libres.map((f) => f.creditoBase));
  const saldoFinal = simuladas.at(-1).saldo;

  return {
    filas: simuladas,
    saldoInicial,
    saldoFinal,
    resolucion,
    hayMesesProyectados: simuladas.some((f) => f.tipo === 'proyectado'),
    cantidadLibres: libres.length,
    creditoNecesario,
    creditoReferencia,
    variacionCredito: creditoReferencia > 0 ? creditoNecesario / creditoReferencia - 1 : null,
    brecha: hayObjetivo ? saldoFinal - objetivo : null,
    mesesAPagar: simuladas.filter((f) => f.tipo === 'proyectado' && f.saldo < 0).map((f) => f.periodo),
    mesesCreditoNegativo: simuladas.filter((f) => f.libre && f.credito < 0).map((f) => f.periodo),
  };
}
