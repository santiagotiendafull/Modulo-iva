// Lógica de agregación mensual: unifica posiciones históricas (PDF) y comprobantes del mes en
// curso (Mis Comprobantes) en una sola línea de tiempo por razón social, para reutilizar tanto en
// el resumen de un período puntual como en la vista de evolución mensual.
import { all } from '../db.js';
import { grupoComprobante, motivoExclusion } from './clasificacionComprobantes.js';
import { cuitsNoCorresponde } from './proveedoresService.js';
import { creditoFiscal931, creditoFiscal931PorPeriodo, existeFormulario931 } from './formulario931Service.js';
import { creditoManual, creditoManualPorPeriodo } from './creditoFiscalManualService.js';

const RAZONES = ['Target', 'NT'];

// El Formulario 931 de un mes recién está disponible ~10 días después de cerrado (ver
// formulario931Service.js), así que mientras no se cargó el propio se usa el del mes anterior como
// estimación del crédito fiscal de ese período — se reemplaza por el monto exacto en cuanto se carga.
function periodoAnterior(periodo) {
  const [y, m] = periodo.split('-').map(Number);
  const fecha = new Date(y, m - 2, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function periodosHistoricos(razonSocial) {
  return all('SELECT * FROM posiciones_historicas WHERE razon_social = ? ORDER BY periodo', [razonSocial]);
}

// Clasifica cada comprobante por grupo (A/B/C/D, ver clasificacionComprobantes.js) y arma el
// Débito Fiscal Total y el Crédito Fiscal Total como los expone la DDJJ de ARCA: sin netear las
// Notas de Crédito contra su propio rubro — Grupo B (NC Ventas) suma al Crédito Fiscal, Grupo D
// (NC Compras A) suma al Débito Fiscal. Además, ninguna compra a un proveedor marcado "no
// corresponde" toma crédito fiscal (proveedoresService.js), y el crédito fiscal adicional del
// Formulario 931 (Suma de Rem. 10 × porcentaje configurable) y el crédito fiscal manual cargado a
// mano en Cargar Datos son "Ajustes Externos" que suman directo al Crédito Fiscal Total.
function nuevoAcumulador(periodo) {
  return {
    periodo,
    debito_fiscal_facturado: 0, // Grupo A
    restitucion_debito_fiscal: 0, // Grupo B (NC Ventas) — suma al Crédito Fiscal
    credito_fiscal_computable: 0, // Grupo C
    restitucion_credito_fiscal: 0, // Grupo D (NC Compras A) — suma al Débito Fiscal
    credito_931: 0,
    credito_931_estimado: 0,
    credito_manual: 0,
  };
}

async function periodosComprobantes(razonSocial) {
  const rows = await all('SELECT periodo, tipo, tipo_comprobante, cuit_contraparte, iva FROM comprobantes WHERE razon_social = ?', [razonSocial]);
  const noCorresponde = await cuitsNoCorresponde();

  const porPeriodo = new Map();
  for (const r of rows) {
    if (r.tipo === 'compra' && noCorresponde.has(r.cuit_contraparte)) continue;
    const grupo = grupoComprobante(r.tipo, r.tipo_comprobante);
    if (!grupo) continue;
    if (!porPeriodo.has(r.periodo)) porPeriodo.set(r.periodo, nuevoAcumulador(r.periodo));
    const acc = porPeriodo.get(r.periodo);
    if (grupo === 'A') acc.debito_fiscal_facturado += r.iva;
    else if (grupo === 'B') acc.restitucion_debito_fiscal += r.iva;
    else if (grupo === 'C') acc.credito_fiscal_computable += r.iva;
    else if (grupo === 'D') acc.restitucion_credito_fiscal += r.iva;
  }

  const creditos931 = await creditoFiscal931PorPeriodo(razonSocial);
  for (const [periodo, credito] of creditos931) {
    if (!porPeriodo.has(periodo)) porPeriodo.set(periodo, nuevoAcumulador(periodo));
    const acc = porPeriodo.get(periodo);
    acc.credito_931 = credito;
  }

  // Períodos sin su propio 931 cargado todavía: se estima con el crédito del mes anterior.
  for (const [periodo, acc] of porPeriodo) {
    if (creditos931.has(periodo)) continue;
    const estimado = creditos931.get(periodoAnterior(periodo));
    if (estimado) acc.credito_931_estimado = estimado;
  }

  const creditosManuales = await creditoManualPorPeriodo(razonSocial);
  for (const [periodo, credito] of creditosManuales) {
    if (!porPeriodo.has(periodo)) porPeriodo.set(periodo, nuevoAcumulador(periodo));
    const acc = porPeriodo.get(periodo);
    acc.credito_manual = credito;
  }

  // TOTAL DÉBITO FISCAL = Grupo A + Grupo D. TOTAL CRÉDITO FISCAL = Grupo C + Grupo B + Ajustes
  // externos (931 + manual). Se exponen con los nombres iva_ventas/iva_compras por compatibilidad
  // con los históricos (posiciones_historicas), que ya representan exactamente esto.
  for (const acc of porPeriodo.values()) {
    acc.iva_ventas = acc.debito_fiscal_facturado + acc.restitucion_credito_fiscal;
    acc.iva_compras = acc.credito_fiscal_computable + acc.restitucion_debito_fiscal
      + acc.credito_931 + acc.credito_931_estimado + acc.credito_manual;
  }

  return [...porPeriodo.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

// Última fecha de comprobante cargado por período: sirve para mostrar "hasta el día X" en los
// períodos que todavía no tienen DDJJ (ni presentada ni el cierre del mes confirmado).
async function ultimasFechasPorPeriodo(razonSocial) {
  const rows = await all('SELECT periodo, MAX(fecha) as ultima_fecha FROM comprobantes WHERE razon_social = ? GROUP BY periodo', [razonSocial]);
  return new Map(rows.map((r) => [r.periodo, r.ultima_fecha]));
}

// Devuelve la línea de tiempo completa de una razón social: para cada período, si hay PDF
// (DDJJ ya presentada) se usan esos valores tal cual; si no, se calculan a partir de los
// comprobantes cargados y se encadena el saldo técnico del período anterior.
export async function lineaDeTiempo(razonSocial) {
  const [historicos, comprobantesTodos, ultimasFechas] = await Promise.all([
    periodosHistoricos(razonSocial),
    periodosComprobantes(razonSocial),
    ultimasFechasPorPeriodo(razonSocial),
  ]);
  const historicoPorPeriodo = new Map(historicos.map((h) => [h.periodo, h]));
  const comprobantes = comprobantesTodos.filter((c) => !historicoPorPeriodo.has(c.periodo));

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
        debito_fiscal_facturado: c.debito_fiscal_facturado,
        restitucion_debito_fiscal: c.restitucion_debito_fiscal,
        credito_fiscal_computable: c.credito_fiscal_computable,
        restitucion_credito_fiscal: c.restitucion_credito_fiscal,
        credito_931: c.credito_931,
        credito_931_estimado: c.credito_931_estimado,
        credito_manual: c.credito_manual,
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

export async function periodosDisponibles(razonSocial) {
  if (razonSocial === 'Consolidado') {
    const lineas = await Promise.all(RAZONES.map((r) => lineaDeTiempo(r)));
    const periodos = new Set();
    for (const linea of lineas) linea.forEach((p) => periodos.add(p.periodo));
    return [...periodos].sort();
  }
  return (await lineaDeTiempo(razonSocial)).map((p) => p.periodo);
}

// Arma la fila consolidada de un período a partir de las posiciones ya calculadas de cada razón
// social. Es pura a propósito: la línea de tiempo de NT y Target se calcula una sola vez y se
// reutiliza para todos los períodos (antes se recalculaba entera por cada mes, lo que hacía que la
// evolución consolidada tardara decenas de segundos).
function consolidarPeriodo(nt, target, periodo) {
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
    debito_fiscal_facturado: suma('debito_fiscal_facturado'),
    restitucion_debito_fiscal: suma('restitucion_debito_fiscal'),
    credito_fiscal_computable: suma('credito_fiscal_computable'),
    restitucion_credito_fiscal: suma('restitucion_credito_fiscal'),
    credito_931: suma('credito_931'),
    credito_931_estimado: suma('credito_931_estimado'),
    credito_manual: suma('credito_manual'),
    diferencia: suma('diferencia'),
    saldo_tecnico_anterior: suma('saldo_tecnico_anterior'),
    saldo_tecnico: suma('saldo_tecnico'),
    fecha_presentacion: null,
    ultima_fecha: [nt?.ultima_fecha, target?.ultima_fecha].filter(Boolean).sort().at(-1) ?? null,
    nota,
  };
}

export async function resumenPeriodo(razonSocial, periodo) {
  if (razonSocial === 'Consolidado') {
    const [lineaNt, lineaTarget] = await Promise.all([lineaDeTiempo('NT'), lineaDeTiempo('Target')]);
    return consolidarPeriodo(
      lineaNt.find((p) => p.periodo === periodo),
      lineaTarget.find((p) => p.periodo === periodo),
      periodo,
    );
  }
  return (await lineaDeTiempo(razonSocial)).find((p) => p.periodo === periodo) ?? null;
}

export async function evolucionMensual(razonSocial) {
  if (razonSocial === 'Consolidado') {
    const [lineaNt, lineaTarget] = await Promise.all([lineaDeTiempo('NT'), lineaDeTiempo('Target')]);
    const porPeriodoNt = new Map(lineaNt.map((p) => [p.periodo, p]));
    const porPeriodoTarget = new Map(lineaTarget.map((p) => [p.periodo, p]));
    const periodos = [...new Set([...porPeriodoNt.keys(), ...porPeriodoTarget.keys()])].sort();
    return periodos.map((periodo) => consolidarPeriodo(porPeriodoNt.get(periodo), porPeriodoTarget.get(periodo), periodo));
  }
  return lineaDeTiempo(razonSocial);
}

// Tabla comparativa NT vs Target vs Total para un período. El total NO netea entre razones
// sociales: son CUIT distintos ante ARCA, así que si una tiene saldo a favor y la otra debe,
// el monto a pagar real es la suma de lo que debe cada una, no la diferencia entre ambas.
export async function comparativa(periodo) {
  const [lineaNt, lineaTarget] = await Promise.all([lineaDeTiempo('NT'), lineaDeTiempo('Target')]);
  const nt = lineaNt.find((p) => p.periodo === periodo) ?? null;
  const target = lineaTarget.find((p) => p.periodo === periodo) ?? null;
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
      credito_931_estimado: suma('credito_931_estimado'),
      credito_manual: suma('credito_manual'),
      diferencia: suma('diferencia'),
      saldo_tecnico_anterior: suma('saldo_tecnico_anterior'),
      saldo_tecnico: suma('saldo_tecnico'),
      a_pagar: debe(nt) + debe(target),
      a_favor: aFavor(nt) + aFavor(target),
    },
  };
}

// Anota cada comprobante con su grupo (A/B/C/D) y separa los totales en "Operaciones" (grupo A o
// C, según tipo) y "Restitución" (grupo B o D — Notas de Crédito que suman al rubro contrario, ver
// clasificacionComprobantes.js). Nada se resta: la regla de oro es prohibido netear en origen.
function anotarYSumar(rows, noCorresponde) {
  const anotadas = rows.map((r) => {
    const proveedorVetado = r.tipo === 'compra' && noCorresponde.has(r.cuit_contraparte);
    const grupo = proveedorVetado ? null : grupoComprobante(r.tipo, r.tipo_comprobante);
    const excluido = proveedorVetado || grupo == null;
    const restitucion = grupo === 'B' || grupo === 'D';
    const motivo_exclusion = proveedorVetado
      ? 'Proveedor marcado "No corresponde": no toma crédito fiscal.'
      : (excluido ? motivoExclusion(r.tipo, r.tipo_comprobante) : null);
    return { ...r, excluido, grupo, restitucion, proveedor_vetado: proveedorVetado, motivo_exclusion };
  });
  const incluidas = anotadas.filter((r) => !r.excluido);
  const operaciones = incluidas.filter((r) => !r.restitucion);
  const restituciones = incluidas.filter((r) => r.restitucion);
  const sumaIva = (rs) => rs.reduce((acc, r) => acc + r.iva, 0);
  const sumaNeto = (rs) => rs.reduce((acc, r) => acc + r.neto_gravado, 0);
  return {
    filas: anotadas,
    totales: {
      operaciones_iva: sumaIva(operaciones),
      operaciones_neto_gravado: sumaNeto(operaciones),
      restitucion_iva: sumaIva(restituciones),
      restitucion_neto_gravado: sumaNeto(restituciones),
      excluidos: anotadas.length - incluidas.length,
    },
  };
}

// Desglose del monto gravado e IVA por alícuota (10,5% / 21% / 27%), separado en Operaciones
// (grupo A o C) y Restitución (grupo B o D) — mismo criterio que anotarYSumar, sin netear.
export async function desgloseAlicuotas(razonSocial, periodo, tipo) {
  const rows = await all(`
    SELECT tipo_comprobante, cuit_contraparte, neto_gravado_105, iva_105, neto_gravado_21, iva_21, neto_gravado_27, iva_27
    FROM comprobantes
    WHERE razon_social = ? AND periodo = ? AND tipo = ?
  `, [razonSocial, periodo, tipo]);
  const noCorresponde = tipo === 'compra' ? await cuitsNoCorresponde() : new Set();

  const alicuotasVacias = () => ({
    '10.5': { neto_gravado: 0, iva: 0 },
    '21': { neto_gravado: 0, iva: 0 },
    '27': { neto_gravado: 0, iva: 0 },
  });
  const operaciones = alicuotasVacias();
  const restitucion = alicuotasVacias();

  for (const r of rows) {
    if (noCorresponde.has(r.cuit_contraparte)) continue;
    const grupo = grupoComprobante(tipo, r.tipo_comprobante);
    if (!grupo) continue;
    const destino = (grupo === 'B' || grupo === 'D') ? restitucion : operaciones;
    destino['10.5'].neto_gravado += r.neto_gravado_105;
    destino['10.5'].iva += r.iva_105;
    destino['21'].neto_gravado += r.neto_gravado_21;
    destino['21'].iva += r.iva_21;
    destino['27'].neto_gravado += r.neto_gravado_27;
    destino['27'].iva += r.iva_27;
  }

  return { operaciones, restitucion };
}

export async function ventasCompras(razonSocial, periodo) {
  if (razonSocial === 'Consolidado') return null; // el desglose de comprobantes es por razón social
  const hist = await all('SELECT 1 FROM posiciones_historicas WHERE razon_social = ? AND periodo = ?', [razonSocial, periodo]);
  if (hist.length > 0) {
    return { disponible: false, motivo: 'Período con DDJJ ya presentada: el PDF de ARCA no trae detalle por comprobante.' };
  }
  const rows = await all(`
    SELECT tipo, tipo_comprobante, cuit_contraparte, denominacion_contraparte, fecha,
           neto_gravado, neto_no_gravado, op_exentas, otros_tributos, iva, total, categoria
    FROM comprobantes
    WHERE razon_social = ? AND periodo = ?
    ORDER BY tipo, fecha
  `, [razonSocial, periodo]);
  const noCorresponde = await cuitsNoCorresponde();
  const ventas = anotarYSumar(rows.filter((r) => r.tipo === 'venta'), noCorresponde);
  const compras = anotarYSumar(rows.filter((r) => r.tipo === 'compra'), noCorresponde);
  // El crédito fiscal del 931 y el manual no son comprobantes: se suman aparte al total de IVA
  // Compras para que este detalle cierre con el mismo número que el resumen del período (resumenPeriodo).
  // Si todavía no se cargó el 931 propio de este período, se estima con el del mes anterior.
  const tienePropio931 = await existeFormulario931(razonSocial, periodo);
  let credito931 = await creditoFiscal931(razonSocial, periodo);
  let credito931Estimado = false;
  if (!tienePropio931) {
    const estimado = await creditoFiscal931(razonSocial, periodoAnterior(periodo));
    if (estimado > 0) {
      credito931 = estimado;
      credito931Estimado = true;
    }
  }
  const creditoManualPeriodo = await creditoManual(razonSocial, periodo);
  return {
    disponible: true,
    ventas: ventas.filas,
    ventasTotales: ventas.totales,
    compras: compras.filas,
    comprasTotales: compras.totales,
    credito_931: credito931,
    credito_931_estimado: credito931Estimado,
    credito_manual: creditoManualPeriodo,
  };
}
