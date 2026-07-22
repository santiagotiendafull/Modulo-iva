// Historial de todo lo cargado en "Cargar datos", para poder controlar de un vistazo qué falta:
// Mis Comprobantes Recibidos/Emitidos (ARCA, mes en curso), Formulario 931 y DDJJ presentadas, por
// razón social y período.
import { db } from '../db.js';
import { formulario931PorPeriodo } from './formulario931Service.js';

const RAZONES = ['Target', 'NT'];

// Mismo criterio que el resto de la app (ver esCierreDeMes en el frontend): un período se considera
// completo cuando el último comprobante cargado llega hasta cerca del último día calendario del
// mes — no hace falta que caiga justo ese día, porque puede no haber ventas (cae domingo, feriado,
// etc.) sin que el mes esté incompleto por eso. Un margen de unos pocos días cubre eso sin necesitar
// un calendario de feriados. Deliberadamente no se compara contra la fecha real de hoy, para no
// marcar como "en curso" un mes pasado que simplemente nunca se terminó de cargar.
const TOLERANCIA_DIAS_CIERRE = 3;

function ultimoDiaDelPeriodo(periodo) {
  const [y, m] = periodo.split('-').map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  return `${periodo}-${String(ultimoDia).padStart(2, '0')}`;
}

function esPeriodoCompleto(periodo, ultimaFecha) {
  if (!ultimaFecha) return false;
  const ultimoDia = new Date(`${ultimoDiaDelPeriodo(periodo)}T00:00:00`);
  const fecha = new Date(`${ultimaFecha}T00:00:00`);
  const diffDias = (ultimoDia - fecha) / (1000 * 60 * 60 * 24);
  return diffDias >= 0 && diffDias <= TOLERANCIA_DIAS_CIERRE;
}

function comprobantesPorPeriodo(razonSocial, tipo) {
  const rows = db
    .prepare(`
      SELECT periodo, MAX(fecha) as ultima_fecha, COUNT(*) as cantidad
      FROM comprobantes WHERE razon_social = ? AND tipo = ?
      GROUP BY periodo
    `)
    .all(razonSocial, tipo);
  return new Map(rows.map((r) => [r.periodo, r]));
}

function ddjjPorPeriodo(razonSocial) {
  const rows = db.prepare('SELECT periodo, fecha_presentacion FROM posiciones_historicas WHERE razon_social = ?').all(razonSocial);
  return new Map(rows.map((r) => [r.periodo, r]));
}

export function historialCargas() {
  const filas = [];
  for (const razonSocial of RAZONES) {
    const recibidos = comprobantesPorPeriodo(razonSocial, 'compra');
    const emitidos = comprobantesPorPeriodo(razonSocial, 'venta');
    const ddjj = ddjjPorPeriodo(razonSocial);
    const f931 = formulario931PorPeriodo(razonSocial);

    const periodos = new Set([...recibidos.keys(), ...emitidos.keys(), ...ddjj.keys(), ...f931.keys()]);
    for (const periodo of periodos) {
      const r = recibidos.get(periodo);
      const e = emitidos.get(periodo);
      const d = ddjj.get(periodo);
      const f = f931.get(periodo);
      filas.push({
        razon_social: razonSocial,
        periodo,
        recibidos: r
          ? { cargado: true, ultima_fecha: r.ultima_fecha, cantidad: r.cantidad, completo: esPeriodoCompleto(periodo, r.ultima_fecha) }
          : { cargado: false },
        emitidos: e
          ? { cargado: true, ultima_fecha: e.ultima_fecha, cantidad: e.cantidad, completo: esPeriodoCompleto(periodo, e.ultima_fecha) }
          : { cargado: false },
        formulario_931: f ? { cargado: true, suma_rem_10: f.suma_rem_10 } : { cargado: false },
        ddjj: d ? { presentada: true, fecha_presentacion: d.fecha_presentacion } : { presentada: false },
      });
    }
  }
  const ordenRazon = (r) => RAZONES.indexOf(r);
  filas.sort((a, b) => a.periodo.localeCompare(b.periodo) || ordenRazon(a.razon_social) - ordenRazon(b.razon_social));
  return filas;
}
