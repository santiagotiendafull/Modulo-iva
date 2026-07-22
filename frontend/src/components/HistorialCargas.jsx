import { useEffect, useState } from 'react';
import { api } from '../api';
import { periodoLabelCompleto, fechaLabel, money } from '../format';

// El último período con datos (por razón social + tipo) todavía no terminó de acumular
// comprobantes: es esperable que le falten días, no es una alerta. Un período más viejo que siga
// incompleto sí lo es — se debería haber cerrado ya.
function ultimoPeriodoConDatos(filas, razonSocial, campo) {
  return filas
    .filter((f) => f.razon_social === razonSocial && f[campo].cargado)
    .map((f) => f.periodo)
    .sort()
    .at(-1) ?? null;
}

function CeldaComprobantes({ dato, esUltimoPeriodo }) {
  if (!dato.cargado) return <span className="historial-celda historial-celda-vacio">Sin cargar</span>;
  if (dato.completo) {
    return <span className="historial-celda historial-celda-ok">Completo <span className="historial-cantidad">({dato.cantidad})</span></span>;
  }
  if (esUltimoPeriodo) {
    return <span className="historial-celda historial-celda-neutro">Mes en curso <span className="historial-cantidad">hasta {fechaLabel(dato.ultima_fecha)}</span></span>;
  }
  return <span className="historial-celda historial-celda-warn">Incompleto <span className="historial-cantidad">hasta {fechaLabel(dato.ultima_fecha)}</span></span>;
}

export default function HistorialCargas({ refreshKey }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtroRazonSocial, setFiltroRazonSocial] = useState('todas');
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos');

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    api.historialCargas()
      .then((r) => !cancelado && setFilas(r))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => { cancelado = true; };
  }, [refreshKey]);

  if (cargando) return <p className="empty-state">Cargando historial…</p>;
  if (error) return <p className="error-banner">{error}</p>;
  if (filas.length === 0) return null;

  // "Último período con datos" se calcula sobre todas las filas, no sobre las filtradas: si se
  // filtra por período no tiene que dejar de saber cuál es el mes en curso real.
  const ultimoRecibidos = { NT: ultimoPeriodoConDatos(filas, 'NT', 'recibidos'), Target: ultimoPeriodoConDatos(filas, 'Target', 'recibidos') };
  const ultimoEmitidos = { NT: ultimoPeriodoConDatos(filas, 'NT', 'emitidos'), Target: ultimoPeriodoConDatos(filas, 'Target', 'emitidos') };

  const periodosDisponibles = [...new Set(filas.map((f) => f.periodo))].sort();
  const filasFiltradas = filas.filter((f) =>
    (filtroRazonSocial === 'todas' || f.razon_social === filtroRazonSocial) &&
    (filtroPeriodo === 'todos' || f.periodo === filtroPeriodo)
  );

  return (
    <div className="historial-cargas">
      <div className="historial-header">
        <div>
          <h3>Historial de cargas</h3>
          <p className="historial-nota">Control de qué está cargado y qué falta, por razón social y período.</p>
        </div>
        <div className="historial-filtros">
          <select className="periodo-select" value={filtroRazonSocial} onChange={(e) => setFiltroRazonSocial(e.target.value)}>
            <option value="todas">Todas las razones sociales</option>
            <option value="NT">NT</option>
            <option value="Target">Target</option>
          </select>
          <select className="periodo-select" value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value)}>
            <option value="todos">Todos los períodos</option>
            {periodosDisponibles.map((p) => (
              <option key={p} value={p}>{periodoLabelCompleto(p)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="tabla-scroll">
        <table className="tabla-historial">
          <thead>
            <tr>
              <th className="col-concepto">Período</th>
              <th>Razón social</th>
              <th>Recibidos (ARCA)</th>
              <th>Emitidos (ARCA)</th>
              <th>Formulario 931</th>
              <th>DDJJ presentada</th>
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.length === 0 && (
              <tr><td colSpan={6} className="bloque-nota">No hay cargas para este filtro.</td></tr>
            )}
            {filasFiltradas.map((f) => (
              <tr key={`${f.razon_social}-${f.periodo}`}>
                <td className="col-concepto">{periodoLabelCompleto(f.periodo)}</td>
                <td>{f.razon_social}</td>
                <td>
                  <CeldaComprobantes dato={f.recibidos} esUltimoPeriodo={f.periodo === ultimoRecibidos[f.razon_social]} />
                </td>
                <td>
                  <CeldaComprobantes dato={f.emitidos} esUltimoPeriodo={f.periodo === ultimoEmitidos[f.razon_social]} />
                </td>
                <td>
                  {f.formulario_931.cargado
                    ? <span className="historial-celda historial-celda-ok">Rem. 10: {money(f.formulario_931.suma_rem_10)}</span>
                    : <span className="historial-celda historial-celda-vacio">Sin cargar</span>}
                </td>
                <td>
                  {f.ddjj.presentada
                    ? <span className="historial-celda historial-celda-ok">Presentada <span className="historial-cantidad">{f.ddjj.fecha_presentacion}</span></span>
                    : <span className="historial-celda historial-celda-vacio">Sin presentar</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
