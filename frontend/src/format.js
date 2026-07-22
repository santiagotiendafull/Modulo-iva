export function money(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
}

export function periodoLabel(periodo) {
  if (!periodo) return '';
  const [y, m] = periodo.split('-');
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${meses[parseInt(m, 10) - 1]} ${y}`;
}

export function periodoLabelCompleto(periodo) {
  if (!periodo) return '';
  const [y, m] = periodo.split('-');
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return `${meses[parseInt(m, 10) - 1]} ${y}`;
}

export function fechaLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Último día calendario del período 'YYYY-MM', en formato ISO 'YYYY-MM-DD'.
export function ultimoDiaDelPeriodo(periodo) {
  const [y, m] = periodo.split('-').map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  return `${periodo}-${String(ultimoDia).padStart(2, '0')}`;
}

// Un período sin DDJJ se considera "cerrado" (mes ya terminado, pendiente de que el Estudio
// Contable presente la DDJJ) cuando el último comprobante cargado llega hasta cerca del último día
// del mes. Si todavía no se acerca a fin de mes, es el mes en curso (sigue acumulando comprobantes).
// Deliberadamente no se compara contra la fecha real de hoy: eso hacía que un período sin datos
// completos de un mes futuro o pasado se mostrara como "mes en curso" por error.
//
// No se exige que el último comprobante caiga justo en el último día calendario: puede no haber
// ventas ese día (cae domingo, feriado, etc.) sin que el mes esté incompleto por eso. Un margen de
// unos pocos días cubre un fin de semana largo sin necesidad de un calendario de feriados.
const TOLERANCIA_DIAS_CIERRE = 3;

export function esCierreDeMes(periodo, ultimaFecha) {
  if (!ultimaFecha) return false;
  const ultimoDia = new Date(`${ultimoDiaDelPeriodo(periodo)}T00:00:00`);
  const fecha = new Date(`${ultimaFecha}T00:00:00`);
  const diffDias = (ultimoDia - fecha) / (1000 * 60 * 60 * 24);
  return diffDias >= 0 && diffDias <= TOLERANCIA_DIAS_CIERRE;
}
