// Lógica de agregación mensual: unifica posiciones históricas (PDF) y comprobantes del mes en
// curso (Mis Comprobantes) en una sola línea de tiempo por razón social, para reutilizar tanto en
// el resumen de un período puntual como en la vista de evolución mensual.
import { db } from '../db.js';
import { signoComprobante, contribuyeAlCalculo, esResta, motivoExclusion } from './clasificacionComprobantes.js';
import { cuitsNoCorresponde } from './proveedoresService.js';
import { creditoFiscal931, creditoFiscal931PorPeriodo } from './formulario931Service.js';

const RAZONES = ['Target', 'NT'];

function periodosHistoricos(razonSocial) {
  return db
    .prepare('SELECT * FROM posiciones_historicas WHERE razon_social = ? ORDER BY periodo')
    .all(razonSocial);
}

// Notas de crédito y Factura B/C (solo compras) quedan afuera o restan del cálculo según el caso:
// ver clasificacionComprobantes.js para el detalle de la regla de negocio. Además, ninguna compra
// a un proveedor marcado "no corresponde" toma crédito fiscal (proveedoresService.js), y el crédito
// fiscal adicional del Formulario 931 (Suma de Rem. 10 × porcentaje configurable) se suma al IVA
// Compras del período en el que se cargó (formulario931Service.js).
function periodosComprobantes(razonSocial) {
  const rows = db
    .prepare('SELECT periodo, tipo, tipo_comprobante, cuit_contraparte, iva FROM comprobantes WHERE razon_social = ?')
    .all(razonSocial);
  const noCorresponde = cuitsNoCorresponde();

  const porPeriodo = new Map();
  for (const r of rows) {
    if (r.tipo === 'compra' && noCorresponde.has(r.cuit_contraparte)) continue;
    const signo = signoComprobante(r.tipo, r.tipo_comprobante);
    if (signo === 0) continue;
    if (!porPeriodo.has(r.periodo)) porPeriodo.set(r.periodo, { periodo: r.periodo, iva_ventas: 0, iva_compras: 0, credito_931: 0 });
    const acc = porPeriodo.get(r.periodo);
    if (r.tipo === 'venta') acc.iva_ventas += signo * r.iva;
    else acc.iva_compras += signo * r.iva;
  }

  const creditos931 = creditoFiscal931PorPeriodo(razonSocial);
  for (const [periodo, credito] of creditos931) {
    if (!porPeriodo.has(periodo)) porPeriodo.set(periodo, { periodo, iva_ventas: 0, iva_compras: 0, credito_931: 0 });
    const acc = porPeriodo.get(periodo);
    acc.iva_compras += credito;
    acc.credito_931 = credito;
  }

  return [...porPeriodo.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

// Última fecha de comprobante cargado por período: sirve para mostrar "hasta el día X" en los
// períodos que todavía no tienen DDJJ (ni presentada ni el cierre del mes confirmado).
function ultimasFechasPorPeriodo(razonSocial) {
  const rows = db
    .prepare('SELECT periodo, MAX(fecha) as ultima_fecha FROM comprobantes WHERE razon_social = ? GROUP BY periodo')
    .all(razonSocial);
  return new Map(rows.map((r) => [r.periodo, r.ultima_fecha]));
}

// Devuelve la línea de tiempo completa de una razón social: para cada período, si hay PDF
// (DDJJ ya presentada) se usan esos valores tal cual; si no, se calculan a partir de los
// comprobantes cargados y se encadena el saldo técnico del período anterior.
export function lineaDeTiempo(razonSocial) {
  const historicos = periodosHistoricos(razonSocial);
  const historicoPorPeriodo = new Map(historicos.map((h) => [h.periodo, h]));
  const comprobantes = periodosComprobantes(razonSocial).filter((c) => !historicoPorPeriodo.has(c.periodo));
  const ultimasFechas = ultimasFechasPorPeriodo(razonSocial);

  const periodos = [...new Set([...historicos.map((h) => h.periodo), ...comprobantes.map((c) => c.periodo)])].sort();

  let saldoAnteriorEncadenado = null;
  const linea = [];
  for (const periodo of periodos) {
    const hist = historicoPorPeriodo.get(periodo);
    if (hist) {
      linea.push({
        periodo,
        razon_social: razonSocial,
        origen: 'historico',
        iva_ventas: hist.iva_ventas,
        iva_compras: hist.iva_compras,
        diferencia: hist.diferencia,
        saldo_tecnico_anterior: hist.saldo_tecnico_anterior,
        saldo_tecnico: hist.saldo_tecnico,
        fecha_presentacion: hist.fecha_presentacion,
      });
      saldoAnteriorEncadenado = hist.saldo_tecnico;
    } else {
      const c = comprobantes.find((x) => x.periodo === periodo);
      const diferencia = c.iva_ventas - c.iva_compras;
      // Un saldo técnico anterior a favor de ARCA (negativo) no se arrastra como crédito: esa
      // deuda ya se paga con la DDJJ de ese mes. Solo el saldo a favor del contribuyente (positivo)
      // se traslada y resta de la diferencia del mes siguiente.
      const saldoAnterior = Math.max(saldoAnteriorEncadenado ?? 0, 0);
      const saldoTecnico = saldoAnterior - diferencia;
      linea.push({
        periodo,
        razon_social: razonSocial,
        origen: 'actual',
        iva_ventas: c.iva_ventas,
        iva_compras: c.iva_compras,
        credito_931: c.credito_931,
        diferencia,
        saldo_tecnico_anterior: saldoAnterior,
        saldo_tecnico: saldoTecnico,
        fecha_presentacion: null,
        ultima_fecha: ultimasFechas.get(periodo) ?? null,
      });
      saldoAnteriorEncadenado = saldoTecnico;
    }
  }
  return linea;
}

export function periodosDisponibles(razonSocial) {
  if (razonSocial === 'Consolidado') {
    const periodos = new Set();
    for (const r of RAZONES) lineaDeTiempo(r).forEach((p) => periodos.add(p.periodo));
    return [...periodos].sort();
  }
  return lineaDeTiempo(razonSocial).map((p) => p.periodo);
}

export function resumenPeriodo(razonSocial, periodo) {
  if (razonSocial === 'Consolidado') {
    const nt = lineaDeTiempo('NT').find((p) => p.periodo === periodo);
    const target = lineaDeTiempo('Target').find((p) => p.periodo === periodo);
    if (!nt && !target) return null;
    const suma = (campo) => (nt?.[campo] ?? 0) + (target?.[campo] ?? 0);
    const faltantes = [!target && 'Target', !nt && 'NT'].filter(Boolean);
    const nota = faltantes.length
      ? `Vista de gestión interna: suma de Target + NT, no reemplaza la posición individual ante ARCA. ` +
        `${faltantes.join(' y ')} todavía no tiene datos cargados para este período — se está sumando como si fuera $0, no como saldo real.`
      : 'Vista de gestión interna: suma de Target + NT, no reemplaza la posición individual ante ARCA.';
    return {
      periodo,
      razon_social: 'Consolidado',
      origen: [nt?.origen, target?.origen].filter(Boolean).join('+') || null,
      iva_ventas: suma('iva_ventas'),
      iva_compras: suma('iva_compras'),
      credito_931: suma('credito_931'),
      diferencia: suma('diferencia'),
      saldo_tecnico_anterior: suma('saldo_tecnico_anterior'),
      saldo_tecnico: suma('saldo_tecnico'),
      fecha_presentacion: null,
      ultima_fecha: [nt?.ultima_fecha, target?.ultima_fecha].filter(Boolean).sort().at(-1) ?? null,
      nota,
    };
  }
  return lineaDeTiempo(razonSocial).find((p) => p.periodo === periodo) ?? null;
}

export function evolucionMensual(razonSocial) {
  if (razonSocial === 'Consolidado') {
    const periodos = periodosDisponibles('Consolidado');
    return periodos.map((periodo) => resumenPeriodo('Consolidado', periodo));
  }
  return lineaDeTiempo(razonSocial);
}

// Tabla comparativa NT vs Target vs Total para un período. El total NO netea entre razones
// sociales: son CUIT distintos ante ARCA, así que si una tiene saldo a favor y la otra debe,
// el monto a pagar real es la suma de lo que debe cada una, no la diferencia entre ambas.
export function comparativa(periodo) {
  const nt = lineaDeTiempo('NT').find((p) => p.periodo === periodo) ?? null;
  const target = lineaDeTiempo('Target').find((p) => p.periodo === periodo) ?? null;
  const debe = (p) => (p && p.saldo_tecnico < 0 ? -p.saldo_tecnico : 0);
  const aFavor = (p) => (p && p.saldo_tecnico > 0 ? p.saldo_tecnico : 0);
  const suma = (campo) => (nt?.[campo] ?? 0) + (target?.[campo] ?? 0);

  if (!nt && !target) return null;

  return {
    periodo,
    razones: { NT: nt, Target: target },
    total: {
      iva_ventas: suma('iva_ventas'),
      iva_compras: suma('iva_compras'),
      credito_931: suma('credito_931'),
      diferencia: suma('diferencia'),
      saldo_tecnico_anterior: suma('saldo_tecnico_anterior'),
      saldo_tecnico: suma('saldo_tecnico'),
      a_pagar: debe(nt) + debe(target),
      a_favor: aFavor(nt) + aFavor(target),
    },
  };
}

function anotarYSumar(rows, noCorresponde) {
  const anotadas = rows.map((r) => {
    const proveedorVetado = r.tipo === 'compra' && noCorresponde.has(r.cuit_contraparte);
    const excluido = proveedorVetado || !contribuyeAlCalculo(r.tipo, r.tipo_comprobante);
    const resta = !excluido && esResta(r.tipo, r.tipo_comprobante);
    const motivo_exclusion = proveedorVetado
      ? 'Proveedor marcado "No corresponde": no toma crédito fiscal.'
      : (excluido ? motivoExclusion(r.tipo, r.tipo_comprobante) : null);
    return { ...r, excluido, resta, proveedor_vetado: proveedorVetado, motivo_exclusion };
  });
  const incluidas = anotadas.filter((r) => !r.excluido);
  const signo = (r) => (r.resta ? -1 : 1);
  return {
    filas: anotadas,
    totales: {
      iva: incluidas.reduce((acc, r) => acc + signo(r) * r.iva, 0),
      neto_gravado: incluidas.reduce((acc, r) => acc + signo(r) * r.neto_gravado, 0),
      excluidos: anotadas.length - incluidas.length,
    },
  };
}

// Desglose del monto gravado e IVA por alícuota (10,5% / 21% / 27%), sumando lo que corresponda
// sumar y restando lo que corresponda restar (mismo criterio que el total de iva_ventas/iva_compras).
export function desgloseAlicuotas(razonSocial, periodo, tipo) {
  const rows = db
    .prepare(`
      SELECT tipo_comprobante, cuit_contraparte, neto_gravado_105, iva_105, neto_gravado_21, iva_21, neto_gravado_27, iva_27
      FROM comprobantes
      WHERE razon_social = ? AND periodo = ? AND tipo = ?
    `)
    .all(razonSocial, periodo, tipo);
  const noCorresponde = tipo === 'compra' ? cuitsNoCorresponde() : new Set();

  const alicuotas = {
    '10.5': { neto_gravado: 0, iva: 0 },
    '21': { neto_gravado: 0, iva: 0 },
    '27': { neto_gravado: 0, iva: 0 },
  };

  for (const r of rows) {
    if (noCorresponde.has(r.cuit_contraparte)) continue;
    const signo = signoComprobante(tipo, r.tipo_comprobante);
    if (signo === 0) continue;
    alicuotas['10.5'].neto_gravado += signo * r.neto_gravado_105;
    alicuotas['10.5'].iva += signo * r.iva_105;
    alicuotas['21'].neto_gravado += signo * r.neto_gravado_21;
    alicuotas['21'].iva += signo * r.iva_21;
    alicuotas['27'].neto_gravado += signo * r.neto_gravado_27;
    alicuotas['27'].iva += signo * r.iva_27;
  }

  return alicuotas;
}

export function ventasCompras(razonSocial, periodo) {
  if (razonSocial === 'Consolidado') return null; // el desglose de comprobantes es por razón social
  const hist = db.prepare('SELECT 1 FROM posiciones_historicas WHERE razon_social = ? AND periodo = ?').get(razonSocial, periodo);
  if (hist) {
    return { disponible: false, motivo: 'Período con DDJJ ya presentada: el PDF de ARCA no trae detalle por comprobante.' };
  }
  const rows = db
    .prepare(`
      SELECT tipo, tipo_comprobante, cuit_contraparte, denominacion_contraparte, fecha,
             neto_gravado, neto_no_gravado, op_exentas, otros_tributos, iva, total, categoria
      FROM comprobantes
      WHERE razon_social = ? AND periodo = ?
      ORDER BY tipo, fecha
    `)
    .all(razonSocial, periodo);
  const noCorresponde = cuitsNoCorresponde();
  const ventas = anotarYSumar(rows.filter((r) => r.tipo === 'venta'), noCorresponde);
  const compras = anotarYSumar(rows.filter((r) => r.tipo === 'compra'), noCorresponde);
  // El crédito fiscal del 931 no es un comprobante: se suma aparte al total de IVA Compras para que
  // este detalle cierre con el mismo número que el resumen del período (resumenPeriodo).
  const credito931 = creditoFiscal931(razonSocial, periodo);
  return {
    disponible: true,
    ventas: ventas.filas,
    ventasTotales: ventas.totales,
    compras: compras.filas,
    comprasTotales: { ...compras.totales, iva: compras.totales.iva + credito931 },
    credito_931: credito931,
  };
}
