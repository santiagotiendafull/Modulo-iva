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

// Reparte `total` entre varios meses en proporción a `pesos`; si todos pesan 0, en partes iguales.
function repartir(total, pesos) {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (suma > 0) return pesos.map((p) => (total * p) / suma);
  return pesos.map(() => total / pesos.length);
}

const sumar = (xs) => xs.reduce((a, b) => a + b, 0);
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

// Aplica una diferencia neta `d` (Débito − Crédito) a los meses que la palanca puede mover:
//  - 'debito': cuánto se factura. En los meses con Débito sin tocar, Débito = Crédito del mes + d.
//  - 'credito': cuántas compras se consiguen. En los meses con Crédito sin tocar, Crédito = Débito − d.
function aplicarSolucion(filas, d, palanca) {
  return filas.map((f) => {
    if (f.tipo !== 'proyectado') return f;
    if (palanca === 'credito') return f.libreCredito ? { ...f, credito: f.debito - d } : f;
    return f.libreDebito ? { ...f, debito: f.credito + d } : f;
  });
}

function netoConDiferencia(filas, saldoInicial, d, palanca) {
  return netoDelAnio(simular(aplicarSolucion(filas, d, palanca), saldoInicial));
}

// Busca la diferencia neta que, repetida igual en todos los meses que la palanca puede mover, deja el
// Neto del año en el objetivo. Es una búsqueda numérica y no una fórmula cerrada porque el saldo "a
// pagar" no se arrastra al mes siguiente. El Neto baja siempre que sube la diferencia (cada saldo
// mensual baja o se queda igual, y el del propio mes baja seguro), así que hay una única solución.
export function resolverDiferenciaUniforme(filas, saldoInicial, objetivo, palanca = 'debito') {
  const hayLibres = filas.some((f) => f.tipo === 'proyectado' && (palanca === 'credito' ? f.libreCredito : f.libreDebito));
  if (!hayLibres) return null;
  if (filas.at(-1).tipo === 'real') return null;
  let bajo = -1e13;
  let alto = 1e13;
  for (let i = 0; i < 200; i++) {
    const medio = (bajo + alto) / 2;
    if (netoConDiferencia(filas, saldoInicial, medio, palanca) > objetivo) bajo = medio;
    else alto = medio;
  }
  const d = (bajo + alto) / 2;
  const obtenido = netoConDiferencia(filas, saldoInicial, d, palanca);
  return { d, alcanzable: Math.abs(obtenido - objetivo) < 1 };
}

// Cuenta de la pantalla. Cada concepto (Débito y Crédito) tiene un TOTAL para los meses proyectados que se
// reparte entre ellos; si el usuario fija un mes a mano, ese mes toma lo que escribió y los demás se
// reparten lo que queda del total (si pone más en un mes, los otros bajan). Débito y Crédito se
// fijan por separado: tocar uno no mueve al otro.
//
//  - Total de Crédito = IVA pendiente de facturar + IVA de compras futuras + IVA fijo × cantidad de
//    meses proyectados. No usa el promedio de los meses anteriores.
//  - Total de Débito = suma del Débito promedio de la base elegida de cada mes proyectado (parejo en el
//    promedio de 3 o 6 meses; con "mismo mes del año anterior" cada mes trae el suyo y el resto se
//    reparte en proporción).
//
// `objetivo`: Neto del año que se quiere (a favor positivo, a pagar negativo). Con `ajustar` y objetivo, la
// palanca elegida se calcula para llegar justo a ese Neto, en lugar de repartir el total:
//  - 'debito' = cuánto facturar: el Débito de los meses sin tocar se calcula; el Crédito sigue el reparto.
//  - 'credito' = cuántas compras conseguir: el Crédito de los meses sin tocar se calcula; el Débito sigue el reparto.
// `editados`: { 'YYYY-MM': { debito?, credito? } } — solo los campos presentes están fijados a mano.
export function calcularProyeccion({
  evolucion, anio, baseModo, objetivo, ajustar, editados, palanca = 'debito',
  ivaPendiente = 0, compraAdicional = 0, creditoFijo = 0,
}) {
  const base = armarFilasBase(evolucion, anio);
  const saldoInicial = saldoInicialDelAnio(evolucion, anio);
  const positivo = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
  const pendienteTotal = positivo(ivaPendiente);
  const compraAdicionalTotal = positivo(compraAdicional);
  const fijoPorMes = positivo(creditoFijo);

  const proyectadas = base.filter((f) => f.tipo === 'proyectado').map((f) => {
    const ed = editados[f.periodo] ?? {};
    return {
      ...f,
      debitoBase: estimarBase(evolucion, f.periodo, baseModo).debito,
      debitoEd: esNumero(ed.debito) ? ed.debito : null,
      creditoEd: esNumero(ed.credito) ? ed.credito : null,
    };
  });
  const cantidadMeses = proyectadas.length;

  // Crédito: total de los tres conceptos, menos lo fijado a mano, repartido en los meses sin fijar.
  const creditoTotal = pendienteTotal + compraAdicionalTotal + fijoPorMes * cantidadMeses;
  const creditoSinFijar = proyectadas.filter((f) => f.creditoEd == null);
  const creditoFijado = sumar(proyectadas.filter((f) => f.creditoEd != null).map((f) => f.creditoEd));
  const creditoRestante = creditoTotal - creditoFijado;
  const creditoPorMesLibre = creditoSinFijar.length > 0 ? Math.max(0, creditoRestante) / creditoSinFijar.length : 0;

  // Débito: total del promedio, menos lo fijado a mano, repartido en los meses sin fijar.
  const debitoTotal = sumar(proyectadas.map((f) => f.debitoBase));
  const debitoSinFijar = proyectadas.filter((f) => f.debitoEd == null);
  const debitoFijado = sumar(proyectadas.filter((f) => f.debitoEd != null).map((f) => f.debitoEd));
  const debitoRestante = debitoTotal - debitoFijado;
  const debitoRepartido = repartir(Math.max(0, debitoRestante), debitoSinFijar.map((f) => f.debitoBase));
  const debitoPorPeriodo = new Map(debitoSinFijar.map((f, i) => [f.periodo, debitoRepartido[i]]));

  const proyectadasPorPeriodo = new Map(proyectadas.map((f) => [f.periodo, f]));
  const filas = base.map((f) => {
    if (f.tipo === 'real') return f;
    const p = proyectadasPorPeriodo.get(f.periodo);
    return {
      ...p,
      debito: p.debitoEd ?? debitoPorPeriodo.get(f.periodo),
      credito: p.creditoEd ?? creditoPorMesLibre,
      debitoEditado: p.debitoEd != null,
      creditoEditado: p.creditoEd != null,
      editado: p.debitoEd != null || p.creditoEd != null,
      libreDebito: p.debitoEd == null,
      libreCredito: p.creditoEd == null,
    };
  });

  const hayObjetivo = objetivo != null && Number.isFinite(objetivo);
  const resolucion = ajustar && hayObjetivo ? resolverDiferenciaUniforme(filas, saldoInicial, objetivo, palanca) : null;
  const aplicadas = resolucion ? aplicarSolucion(filas, resolucion.d, palanca) : filas;
  // Lo calculado se redondea a centavos; lo que el usuario escribió se deja tal cual.
  const finales = aplicadas.map((f) => (f.tipo !== 'proyectado' ? f : {
    ...f,
    debito: f.debitoEditado ? f.debito : redondear(f.debito),
    credito: f.creditoEditado ? f.credito : redondear(f.credito),
  }));
  const simuladas = simular(finales, saldoInicial);

  const proyectadasSim = simuladas.filter((f) => f.tipo === 'proyectado');
  const libresDebito = proyectadasSim.filter((f) => f.libreDebito);
  const libresCredito = proyectadasSim.filter((f) => f.libreCredito);
  const debitoNecesario = promedio(libresDebito.map((f) => f.debito));
  const debitoReferencia = promedio(libresDebito.map((f) => f.debitoBase));
  const creditoNecesario = promedio(libresCredito.map((f) => f.credito));
  const neto = netoDelAnio(simuladas);

  return {
    filas: simuladas,
    saldoInicial,
    saldoFinal: simuladas.at(-1).saldo,
    neto,
    resolucion,
    hayMesesProyectados: cantidadMeses > 0,
    cantidadMeses,
    // Meses que la palanca elegida puede mover (los que no se fijaron a mano).
    cantidadLibres: (palanca === 'credito' ? libresCredito : libresDebito).length,
    pendienteTotal,
    compraAdicionalTotal,
    fijoPorMes,
    fijoTotal: fijoPorMes * cantidadMeses,
    creditoTotal,
    creditoFijado,
    creditoRestante,
    creditoPorMes: cantidadMeses > 0 ? creditoTotal / cantidadMeses : 0,
    creditoPorMesLibre,
    // Se pasaron del total cargado: los demás meses quedan en $0.
    creditoExcedido: creditoTotal > 0 && creditoRestante < -0.5,
    // Quedó Crédito sin repartir porque todos los meses se fijaron a mano.
    creditoSobrante: creditoSinFijar.length === 0 ? Math.max(0, creditoRestante) : 0,
    debitoTotal,
    debitoFijado,
    debitoExcedido: debitoTotal > 0 && debitoRestante < -0.5,
    debitoNecesario,
    debitoReferencia,
    facturarDeMas: debitoNecesario - debitoReferencia,
    variacionDebito: debitoReferencia > 0 ? debitoNecesario / debitoReferencia - 1 : null,
    creditoNecesario,
    // Lo que los tres conceptos le asignan por mes a un mes sin fijar: contra esto se compara el Crédito necesario.
    creditoReferencia: creditoPorMesLibre,
    brecha: hayObjetivo ? neto - objetivo : null,
    mesesAPagar: proyectadasSim.filter((f) => f.saldo < 0).map((f) => f.periodo),
    mesesCreditoNegativo: libresCredito.filter((f) => f.credito < 0).map((f) => f.periodo),
    mesesDebitoNegativo: libresDebito.filter((f) => f.debito < 0).map((f) => f.periodo),
  };
}
