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

// Débito de referencia (el "promedio") para un mes proyectado, según la base elegida. Solo se estima el
// Débito: el Crédito proyectado no sale de los meses anteriores sino de lo que se cargue a mano
// (IVA pendiente de facturar, compras adicionales y un IVA fijo por mes).
export function estimarBase(evolucion, periodo, modo) {
  const reales = evolucion.filter(esMesReal).sort((a, b) => a.periodo.localeCompare(b.periodo));
  const promedioUltimos = (n) => {
    const previos = reales.filter((m) => m.periodo < periodo).slice(-n);
    return { debito: promedio(previos.map((m) => m.iva_ventas)) };
  };
  if (modo === 'anioAnterior') {
    const [anio, mes] = periodo.split('-');
    const mismoMes = reales.find((m) => m.periodo === `${Number(anio) - 1}-${mes}`);
    if (mismoMes) return { debito: mismoMes.iva_ventas };
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

// Neto del año: suma de los Saldos Resultantes de los meses, los a favor (verde) suman y los a pagar
// (rojo) restan. Es la misma cuenta que el Subtotal del año en "Resultado fiscal por mes". Un mes sin
// ningún dato cargado no aporta nada.
export function netoDelAnio(filas) {
  return filas.filter((f) => !f.sinDatos).reduce((acc, f) => acc + f.saldo, 0);
}

// Valores de los meses "libres" (proyectados que el usuario no tocó) para una diferencia neta `d`
// (Débito − Crédito) repetida igual en cada uno. El Crédito de un mes libre es siempre
// `creditoPorMes` (lo que se cargó: IVA pendiente, compras adicionales y monto fijo). Según la palanca:
//  - 'debito': cuánto se factura. El Crédito queda en `creditoPorMes` y el Débito se calcula sobre eso.
//  - 'credito': cuántas compras se consiguen. El Débito se queda en el promedio y el Crédito se calcula.
function aplicarLibres(filas, d, palanca, creditoPorMes) {
  return filas.map((f) => {
    if (!f.libre) return f;
    if (palanca === 'credito') return { ...f, debito: f.debitoBase, credito: f.debitoBase - d };
    return { ...f, credito: creditoPorMes, debito: creditoPorMes + d };
  });
}

function netoConDiferencia(filas, saldoInicial, d, palanca, creditoPorMes) {
  return netoDelAnio(simular(aplicarLibres(filas, d, palanca, creditoPorMes), saldoInicial));
}

// Busca la diferencia neta que, repetida igual en todos los meses libres, deja el Neto del año en el
// objetivo. Es una búsqueda numérica y no una fórmula cerrada porque el saldo "a pagar" no se
// arrastra al mes siguiente. El Neto baja siempre que sube la diferencia (cada saldo mensual baja o se
// queda igual, y el del propio mes baja seguro), así que hay una única solución.
export function resolverDiferenciaUniforme(filas, saldoInicial, objetivo, palanca = 'debito', creditoPorMes = 0) {
  if (!filas.some((f) => f.libre)) return null;
  if (filas.at(-1).tipo === 'real') return null;
  let bajo = -1e13;
  let alto = 1e13;
  for (let i = 0; i < 200; i++) {
    const medio = (bajo + alto) / 2;
    if (netoConDiferencia(filas, saldoInicial, medio, palanca, creditoPorMes) > objetivo) bajo = medio;
    else alto = medio;
  }
  const d = (bajo + alto) / 2;
  const obtenido = netoConDiferencia(filas, saldoInicial, d, palanca, creditoPorMes);
  return { d, alcanzable: Math.abs(obtenido - objetivo) < 1 };
}

// `objetivo`: Neto del año que se quiere (a favor positivo, a pagar negativo).
// `editados`: { 'YYYY-MM': { debito, credito } } — meses que el usuario tocó a mano; quedan fijos.
// `ajustar`: si es true y hay objetivo, los meses sin tocar se calculan para llegar al objetivo; si
// no, siguen la tendencia (el Débito promedio de la base elegida y el Crédito cargado).
// `palanca`: qué se mueve para llegar al objetivo ('debito' = cuánto facturar, 'credito' = compras).
//
// El Crédito de cada mes sin tocar se arma SOLO con lo que se carga (no con el promedio de meses anteriores):
//  - `ivaPendiente`: IVA de compras que los proveedores todavía no facturaron (total, repartido parejo).
//  - `compraAdicional`: IVA de compras que se piensa hacer más adelante (total, repartido parejo).
//  - `creditoFijo`: IVA fijo que se suma igual en CADA mes sin tocar.
export function calcularProyeccion({
  evolucion, anio, baseModo, objetivo, ajustar, editados, palanca = 'debito',
  ivaPendiente = 0, compraAdicional = 0, creditoFijo = 0,
}) {
  const base = armarFilasBase(evolucion, anio);
  const saldoInicial = saldoInicialDelAnio(evolucion, anio);
  const filas = base.map((f) => {
    if (f.tipo === 'real') return f;
    const est = estimarBase(evolucion, f.periodo, baseModo);
    const comun = { ...f, debitoBase: est.debito };
    const ed = editados[f.periodo];
    if (ed) return { ...comun, editado: true, libre: false, debito: ed.debito, credito: ed.credito };
    return { ...comun, editado: false, libre: true, debito: est.debito, credito: 0 };
  });

  const cantidadLibres = filas.filter((f) => f.libre).length;
  const positivo = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
  const pendienteTotal = positivo(ivaPendiente);
  const compraAdicionalTotal = positivo(compraAdicional);
  const fijoPorMes = positivo(creditoFijo);
  const pendientePorMes = cantidadLibres > 0 ? pendienteTotal / cantidadLibres : 0;
  const compraAdicionalPorMes = cantidadLibres > 0 ? compraAdicionalTotal / cantidadLibres : 0;
  const creditoPorMes = cantidadLibres > 0 ? pendientePorMes + compraAdicionalPorMes + fijoPorMes : 0;

  const hayObjetivo = objetivo != null && Number.isFinite(objetivo);
  const resolucion = ajustar && hayObjetivo
    ? resolverDiferenciaUniforme(filas, saldoInicial, objetivo, palanca, creditoPorMes)
    : null;

  // Sin objetivo (o sin meses para ajustar), los libres siguen la tendencia: Débito promedio y el Crédito
  // cargado. Con objetivo, se calculan para que el Neto dé justo el objetivo.
  const aplicadas = resolucion
    ? aplicarLibres(filas, resolucion.d, palanca, creditoPorMes)
    : filas.map((f) => (f.libre ? { ...f, credito: creditoPorMes } : f));
  const finales = aplicadas.map((f) => (f.libre ? { ...f, debito: redondear(f.debito), credito: redondear(f.credito) } : f));
  const simuladas = simular(finales, saldoInicial);

  const libres = simuladas.filter((f) => f.libre);
  const debitoNecesario = promedio(libres.map((f) => f.debito));
  const creditoNecesario = promedio(libres.map((f) => f.credito));
  const debitoReferencia = promedio(libres.map((f) => f.debitoBase));
  const neto = netoDelAnio(simuladas);

  return {
    filas: simuladas,
    saldoInicial,
    saldoFinal: simuladas.at(-1).saldo,
    neto,
    resolucion,
    hayMesesProyectados: simuladas.some((f) => f.tipo === 'proyectado'),
    cantidadLibres,
    pendienteTotal,
    compraAdicionalTotal,
    pendientePorMes,
    compraAdicionalPorMes,
    fijoPorMes,
    creditoPorMes,
    extraSinUsar: pendienteTotal + compraAdicionalTotal + fijoPorMes > 0 && cantidadLibres === 0,
    debitoNecesario,
    debitoReferencia,
    facturarDeMas: debitoNecesario - debitoReferencia,
    variacionDebito: debitoReferencia > 0 ? debitoNecesario / debitoReferencia - 1 : null,
    creditoNecesario,
    // Cuánto Crédito ya está armado por mes con lo cargado; con la palanca Crédito, la diferencia contra
    // el Crédito necesario es lo que falta conseguir.
    creditoReferencia: creditoPorMes,
    brecha: hayObjetivo ? neto - objetivo : null,
    mesesAPagar: simuladas.filter((f) => f.tipo === 'proyectado' && f.saldo < 0).map((f) => f.periodo),
    mesesCreditoNegativo: simuladas.filter((f) => f.libre && f.credito < 0).map((f) => f.periodo),
    mesesDebitoNegativo: simuladas.filter((f) => f.libre && f.debito < 0).map((f) => f.periodo),
  };
}
