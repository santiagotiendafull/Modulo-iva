import { useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api } from '../api';
import { money, periodoLabel, periodoLabelCompleto, fechaLabel, fechaHoraLabel } from '../format';
import { BASES, calcularProyeccion } from '../proyeccion';
import InfoTooltip from './InfoTooltip';
import Spinner from './Spinner';

const RAZONES = ['Target', 'NT'];
const redondear = (n) => Math.round(n * 100) / 100;
const numero = (texto) => {
  const n = parseFloat(texto);
  return Number.isFinite(n) ? n : 0;
};

function saldoTexto(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${money(Math.abs(n))} ${n >= 0 ? '(a favor)' : '(a pagar)'}`;
}
const claseSaldo = (n) => (n >= 0 ? 'pos' : 'neg');

const ESTADO_PILL = {
  real: { texto: 'Real', clase: 'origen-historico' },
  proyectado: { texto: 'Proyectado', clase: 'origen-estimado' },
  editado: { texto: 'Editado', clase: 'origen-actual' },
};
function estadoDeFila(f) {
  if (f.tipo === 'real') return 'real';
  return f.editado ? 'editado' : 'proyectado';
}

function TooltipSaldo({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const visibles = payload.filter((p) => p.value != null);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-fecha">{label}</div>
      {visibles.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-fila">
          <span className="chart-tooltip-linea" style={{ background: p.color }} />
          <span className="chart-tooltip-nombre">{p.name}</span>
          <span className="chart-tooltip-valor">{money(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function GraficoSaldo({ filas, objetivo }) {
  const ultimoReal = filas.map((f) => f.tipo).lastIndexOf('real');
  const data = filas.map((f, i) => ({
    mes: periodoLabel(f.periodo).slice(0, 3),
    real: f.tipo === 'real' ? f.saldo : null,
    // El tramo proyectado arranca desde el último mes real para que la línea no quede cortada.
    proyectado: f.tipo === 'proyectado' || i === ultimoReal ? f.saldo : null,
  }));
  return (
    <div className="evolucion">
      <div className="evolucion-header">
        <h3>Saldo técnico mes a mes</h3>
        <div className="evolucion-leyenda">
          <span className="leyenda-item" style={{ '--serie-color': '#2a78d6' }}><span className="leyenda-linea" />Real</span>
          <span className="leyenda-item" style={{ '--serie-color': '#e34948' }}><span className="leyenda-linea" />Proyectado</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="var(--text)" tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="var(--text)"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => new Intl.NumberFormat('es-AR', { notation: 'compact' }).format(v)}
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
          {objetivo != null && (
            <ReferenceLine y={objetivo} stroke="#0ca30c" strokeDasharray="6 4" label={{ value: 'Objetivo', position: 'insideTopRight', fill: '#0ca30c', fontSize: 12, fontWeight: 700 }} />
          )}
          <Tooltip content={<TooltipSaldo />} />
          <Line type="monotone" dataKey="real" name="Real" stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="proyectado" name="Proyectado" stroke="#e34948" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TablaMeses({ meses }) {
  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th className="col-concepto">Mes</th>
            <th>Estado</th>
            <th>Débito Fiscal</th>
            <th>Crédito Fiscal</th>
            <th>Saldo Resultante</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => {
            const estado = ESTADO_PILL[m.tipo === 'real' ? 'real' : (m.editado ? 'editado' : 'proyectado')];
            return (
              <tr key={m.periodo}>
                <td className="col-concepto">{periodoLabel(m.periodo)}</td>
                <td><span className={`origen-pill-mini ${estado.clase}`}>{estado.texto}</span></td>
                <td>{money(m.debito)}</td>
                <td>{money(m.credito)}</td>
                <td className={`col-total ${claseSaldo(m.saldo)}`}>{saldoTexto(m.saldo)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EscenariosGuardados({ razonSocial, escenarios, cargando, onEliminar }) {
  const [abierto, setAbierto] = useState(null);
  return (
    <div className="tabla-comparativa">
      <div className="tabla-comparativa-header">
        <h3>Escenarios guardados — {razonSocial}</h3>
      </div>
      {cargando && <p className="bloque-nota">Cargando…</p>}
      {!cargando && escenarios.length === 0 && <p className="bloque-nota">Todavía no guardaste ningún escenario.</p>}
      {escenarios.length > 0 && (
        <div className="envios-lista">
          {escenarios.map((e) => (
            <div key={e.id} className="envio-item">
              <button type="button" className="envio-item-header" onClick={() => setAbierto((v) => (v === e.id ? null : e.id))}>
                <span>
                  <strong>{e.nombre}</strong> — {e.anio} — {e.objetivo == null ? 'sin objetivo' : `objetivo ${saldoTexto(e.objetivo)}`} — termina en {saldoTexto(e.saldo_final)}
                </span>
                <span>{abierto === e.id ? '▲' : '▼'}</span>
              </button>
              {abierto === e.id && (
                <div className="proy-escenario-detalle">
                  <p className="card-hint">
                    Guardado el {fechaHoraLabel(e.creado_en)}{e.usuario ? ` por ${e.usuario}` : ''}.
                    {' '}Base de estimación: {BASES.find((b) => b.clave === e.base_modo)?.label ?? '—'}.
                    {' '}{e.ajustar_al_objetivo ? 'Los meses sin editar se ajustaron para llegar al objetivo.' : 'Los meses sin editar siguieron la tendencia.'}
                  </p>
                  <TablaMeses meses={e.meses} />
                  <button
                    type="button"
                    className="btn-desglose"
                    onClick={() => { if (window.confirm(`¿Borrar el escenario "${e.nombre}"?`)) onEliminar(e.id); }}
                  >
                    Borrar escenario
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Simulador del cierre de año. Los meses cerrados salen de los datos reales y no se tocan; de los
// meses que faltan, los que el usuario no modificó se calculan solos — o para llegar al objetivo, o
// siguiendo la tendencia — y los que modifica a mano quedan fijos. Ver proyeccion.js para la cuenta.
export default function Proyeccion({ evoluciones }) {
  const anioActual = new Date().getFullYear();
  const [razonSocial, setRazonSocial] = useState('Target');
  const [anio, setAnio] = useState(anioActual);
  const [objetivoTexto, setObjetivoTexto] = useState('');
  const [objetivoSigno, setObjetivoSigno] = useState('favor');
  const [baseModo, setBaseModo] = useState('prom3');
  const [ajustar, setAjustar] = useState(true);
  // { 'YYYY-MM': { debito: '123', credito: '45' } } — texto tal cual se tipea, para poder borrar y
  // escribir sin que el campo salte; se convierte a número recién al calcular.
  const [editados, setEditados] = useState({});

  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null);
  const [escenarios, setEscenarios] = useState([]);
  const [cargandoEscenarios, setCargandoEscenarios] = useState(true);

  const evolucion = evoluciones?.[razonSocial];

  const aniosDisponibles = useMemo(() => {
    const deLosDatos = (evolucion ?? []).map((m) => Number(m.periodo.slice(0, 4)));
    return [...new Set([...deLosDatos, anioActual, anioActual + 1])].sort();
  }, [evolucion, anioActual]);

  const cargarEscenarios = useCallback(async () => {
    setCargandoEscenarios(true);
    try {
      setEscenarios(await api.proyecciones(razonSocial));
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    } finally {
      setCargandoEscenarios(false);
    }
  }, [razonSocial]);

  useEffect(() => { cargarEscenarios(); }, [cargarEscenarios]);

  const objetivo = useMemo(() => {
    if (objetivoTexto.trim() === '') return null;
    const n = parseFloat(objetivoTexto);
    if (!Number.isFinite(n)) return null;
    return objetivoSigno === 'favor' ? n : -n;
  }, [objetivoTexto, objetivoSigno]);

  const resultado = useMemo(() => {
    if (!evolucion) return null;
    const editadosNumericos = Object.fromEntries(
      Object.entries(editados).map(([p, v]) => [p, { debito: numero(v.debito), credito: numero(v.credito) }])
    );
    return calcularProyeccion({ evolucion, anio, baseModo, objetivo, ajustar, editados: editadosNumericos });
  }, [evolucion, anio, baseModo, objetivo, ajustar, editados]);

  function cambiarRazonSocial(r) {
    setRazonSocial(r);
    setEditados({});
    setEstado(null);
  }

  function cambiarAnio(a) {
    setAnio(Number(a));
    setEditados({});
    setEstado(null);
  }

  // Tocar un solo campo de un mes lo vuelve fijo; el otro campo conserva el valor que se veía.
  function editarCampo(fila, campo, valor) {
    setEditados((prev) => {
      const actual = prev[fila.periodo] ?? {
        debito: String(redondear(fila.debito)),
        credito: String(redondear(fila.credito)),
      };
      return { ...prev, [fila.periodo]: { ...actual, [campo]: valor } };
    });
  }

  function restablecerMes(periodo) {
    setEditados((prev) => {
      const { [periodo]: _quitado, ...resto } = prev;
      return resto;
    });
  }

  async function guardar() {
    setGuardando(true);
    setEstado(null);
    try {
      await api.guardarProyeccion({
        razon_social: razonSocial,
        anio,
        nombre,
        objetivo,
        saldo_final: resultado.saldoFinal,
        base_modo: baseModo,
        ajustar_al_objetivo: ajustar && objetivo != null,
        meses: resultado.filas.map((f) => ({
          periodo: f.periodo,
          tipo: f.tipo,
          editado: !!f.editado,
          debito: f.debito,
          credito: f.credito,
          saldo_anterior: f.saldoAnterior,
          saldo: f.saldo,
        })),
      });
      setNombre('');
      setEstado({ tipo: 'ok', mensaje: 'Escenario guardado.' });
      await cargarEscenarios();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id) {
    try {
      await api.eliminarProyeccion(id);
      await cargarEscenarios();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    }
  }

  if (!evolucion || !resultado) return <Spinner />;

  const { filas, resolucion } = resultado;
  const ultimoReal = [...filas].reverse().find((f) => f.tipo === 'real');
  const saldoActual = ultimoReal ? ultimoReal.saldo : resultado.saldoInicial;
  const etiquetaSaldoActual = ultimoReal ? `Saldo al cierre de ${periodoLabelCompleto(ultimoReal.periodo)}` : `Saldo con el que arranca ${anio}`;
  const cantidadEditados = Object.keys(editados).length;
  const sumaDebito = filas.reduce((a, f) => a + f.debito, 0);
  const sumaCredito = filas.reduce((a, f) => a + f.credito, 0);
  const sumaDiferencia = filas.reduce((a, f) => a + f.diferencia, 0);

  return (
    <div className="proyeccion">
      <div className="proyeccion-encabezado">
        <h2>Proyección del año</h2>
        <div className="razon-tabs">
          {RAZONES.map((r) => (
            <button key={r} type="button" className={`razon-tab ${razonSocial === r ? 'active' : ''}`} onClick={() => cambiarRazonSocial(r)}>{r}</button>
          ))}
        </div>
        <select value={anio} onChange={(e) => cambiarAnio(e.target.value)} aria-label="Año">
          {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <p className="nota">
        Simulá cómo terminaría el año en IVA. Los meses cerrados salen de los datos reales y no se tocan.
        De los que faltan, poné con qué saldo querés terminar diciembre y la app calcula cuánto Crédito
        Fiscal necesitás por mes (con un Débito estimado), repartido parejo entre los meses que no
        modificaste. Si cambiás un mes a mano queda fijo y el resto se reajusta.
      </p>

      <div className="fuente-card">
        <div className="proyeccion-controles">
          <label className="campo-manual">
            <span>Quiero terminar diciembre con</span>
            <div className="proyeccion-objetivo">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto"
                value={objetivoTexto}
                onChange={(e) => setObjetivoTexto(e.target.value)}
              />
              <select value={objetivoSigno} onChange={(e) => setObjetivoSigno(e.target.value)} aria-label="A favor o a pagar">
                <option value="favor">Saldo a favor</option>
                <option value="pagar">Saldo a pagar</option>
              </select>
            </div>
          </label>
          <label className="campo-manual">
            <span>
              Base para estimar el Débito
              <InfoTooltip texto="Cuánto se estima de Débito Fiscal en los meses que faltan. También es la referencia con la que se compara el Crédito necesario." />
            </span>
            <select value={baseModo} onChange={(e) => setBaseModo(e.target.value)}>
              {BASES.map((b) => <option key={b.clave} value={b.clave}>{b.label}</option>)}
            </select>
          </label>
          <label className="proyeccion-check">
            <input type="checkbox" checked={ajustar} onChange={(e) => setAjustar(e.target.checked)} />
            <span>Ajustar los meses sin modificar para llegar al objetivo</span>
          </label>
          {cantidadEditados > 0 && (
            <button type="button" className="btn-desglose" onClick={() => setEditados({})}>
              Restablecer {cantidadEditados} {cantidadEditados === 1 ? 'mes modificado' : 'meses modificados'}
            </button>
          )}
        </div>
      </div>

      {!resultado.hayMesesProyectados ? (
        <p className="bloque-nota">{anio} ya tiene todos sus meses cerrados: no queda nada para proyectar. Elegí otro año.</p>
      ) : (
        <>
          <div className="resumen-cards resumen-cards-compacto">
            <div className="card">
              <div className="card-label">{etiquetaSaldoActual}</div>
              <div className={`card-value ${claseSaldo(saldoActual)}`}>{saldoTexto(saldoActual)}</div>
            </div>
            <div className="card">
              <div className="card-label">Objetivo a diciembre</div>
              <div className="card-value">{objetivo == null ? '—' : saldoTexto(objetivo)}</div>
            </div>
            <div className="card">
              <div className="card-label">Terminarías en</div>
              <div className={`card-value ${claseSaldo(resultado.saldoFinal)}`}>{saldoTexto(resultado.saldoFinal)}</div>
            </div>
            <div className="card">
              <div className="card-label">Diferencia contra el objetivo</div>
              <div className="card-value">{resultado.brecha == null ? '—' : money(Math.abs(resultado.brecha))}</div>
              {resultado.brecha != null && (
                <div className="card-hint">
                  {Math.abs(resultado.brecha) < 1
                    ? 'Llegás justo al objetivo'
                    : (resultado.brecha > 0 ? 'Terminarías con más saldo a favor que el objetivo' : 'Te faltaría saldo a favor para llegar al objetivo')}
                </div>
              )}
            </div>
            {resolucion && (
              <>
                <div className="card">
                  <div className="card-label">
                    Diferencia neta por mes
                    <InfoTooltip texto="Débito − Crédito que tiene que dar cada mes sin modificar para llegar al objetivo. Positivo: se consume saldo a favor; negativo: el crédito supera al débito y el saldo crece." />
                  </div>
                  <div className="card-value">{money(resolucion.d)}</div>
                  <div className="card-hint">en {resultado.cantidadLibres} {resultado.cantidadLibres === 1 ? 'mes' : 'meses'} sin modificar</div>
                </div>
                <div className="card">
                  <div className="card-label">
                    Crédito Fiscal necesario por mes
                    <InfoTooltip texto="Crédito promedio que necesitás en los meses sin modificar, dado el Débito estimado. Es lo que hay que juntar en comprobantes de compra." />
                  </div>
                  <div className="card-value">{money(resultado.creditoNecesario)}</div>
                  {resultado.variacionCredito != null && (
                    <div className={`card-hint ${resultado.variacionCredito > 0.5 ? 'card-hint-pagar' : ''}`}>
                      {resultado.variacionCredito >= 0 ? '+' : ''}{(resultado.variacionCredito * 100).toFixed(0)}% sobre tu referencia ({money(resultado.creditoReferencia)})
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {ajustar && objetivo == null && (
            <p className="bloque-nota">Poné un objetivo para calcular cuánto Crédito Fiscal necesitás por mes. Mientras tanto los meses siguen la tendencia de la base elegida.</p>
          )}
          {ajustar && objetivo != null && !resolucion && (
            <p className="bloque-nota">No queda ningún mes sin modificar para ajustar: el resultado es solo lo que cargaste a mano.</p>
          )}
          {resolucion && !resolucion.alcanzable && (
            <p className="error-banner">No se llega exactamente al objetivo con los meses que quedan sin modificar.</p>
          )}
          {resultado.mesesCreditoNegativo.length > 0 && (
            <p className="error-banner">
              Con el Débito estimado el objetivo es inalcanzable: el Crédito de {resultado.mesesCreditoNegativo.map(periodoLabel).join(', ')} tendría
              que ser negativo. Probá con otra base para el Débito o un objetivo menos exigente.
            </p>
          )}
          {resultado.mesesAPagar.length > 0 && (
            <p className="bloque-nota">
              Con estos números {resultado.mesesAPagar.map(periodoLabel).join(', ')} cerrarían a pagar. Ese saldo no se arrastra al mes siguiente (se paga con la DDJJ).
            </p>
          )}
        </>
      )}

      <div className="resultado-fiscal proyeccion-tabla">
        <div className="resultado-fiscal-header">
          <h3>Mes a mes — {razonSocial} {anio}</h3>
        </div>
        <p className="resultado-fiscal-hint">Podés modificar el Débito y el Crédito de los meses proyectados.</p>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th className="col-concepto">Mes</th>
                <th>Estado</th>
                <th>Débito Fiscal</th>
                <th>Crédito Fiscal</th>
                <th>Diferencia</th>
                <th>Saldo anterior</th>
                <th className="col-total">Saldo Resultante</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const pill = ESTADO_PILL[estadoDeFila(f)];
                const proyectado = f.tipo === 'proyectado';
                const edicion = editados[f.periodo];
                return (
                  <tr key={f.periodo}>
                    <td className="col-concepto">
                      {periodoLabel(f.periodo)}
                      {f.sinDatos && <div className="proy-sub">sin datos cargados</div>}
                      {f.incompletoHasta && <div className="proy-sub">carga incompleta: llega hasta el {fechaLabel(f.incompletoHasta)}</div>}
                      {proyectado && f.parcial && (
                        <div className="proy-sub">hoy lleva {money(f.parcial.debito)} de débito y {money(f.parcial.credito)} de crédito (hasta el {fechaLabel(f.parcial.hasta)})</div>
                      )}
                    </td>
                    <td><span className={`origen-pill-mini ${pill.clase}`}>{pill.texto}</span></td>
                    {['debito', 'credito'].map((campo) => (
                      <td key={campo}>
                        {proyectado ? (
                          <input
                            className="proy-input"
                            type="number"
                            step="0.01"
                            value={edicion ? edicion[campo] : redondear(f[campo])}
                            onChange={(e) => editarCampo(f, campo, e.target.value)}
                            aria-label={`${campo === 'debito' ? 'Débito' : 'Crédito'} ${periodoLabel(f.periodo)}`}
                          />
                        ) : money(f[campo])}
                      </td>
                    ))}
                    <td>{money(f.diferencia)}</td>
                    <td>{money(f.saldoAnterior)}</td>
                    <td className={`col-total ${claseSaldo(f.saldo)}`}>{saldoTexto(f.saldo)}</td>
                    <td>
                      {f.editado && (
                        <button type="button" className="btn-desglose proy-restablecer" onClick={() => restablecerMes(f.periodo)}>Restablecer</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="fila-subtotal-anio">
                <td className="col-concepto">Total {anio}</td>
                <td />
                <td>{money(sumaDebito)}</td>
                <td>{money(sumaCredito)}</td>
                <td>{money(sumaDiferencia)}</td>
                <td />
                <td className={`col-total ${claseSaldo(resultado.saldoFinal)}`}>{saldoTexto(resultado.saldoFinal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <GraficoSaldo filas={filas} objetivo={objetivo} />

      {resultado.hayMesesProyectados && (
        <div className="fuente-card">
          <div className="fuente-card-header">
            <div>
              <h3>Guardar este escenario</h3>
              <p>Queda en la lista de abajo, tal como lo ves ahora, para consultarlo después.</p>
            </div>
          </div>
          <div className="proyeccion-guardar">
            <input
              type="text"
              maxLength={80}
              placeholder="Nombre (ej. Terminar con 20 millones a favor)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nombre.trim() && !guardando) guardar(); }}
            />
            <button type="button" className="btn-desglose" onClick={guardar} disabled={guardando || !nombre.trim()}>
              {guardando ? 'Guardando…' : 'Guardar escenario'}
            </button>
          </div>
          {estado && <p className={`estado-mensaje ${estado.tipo}`}>{estado.mensaje}</p>}
        </div>
      )}

      <EscenariosGuardados razonSocial={razonSocial} escenarios={escenarios} cargando={cargandoEscenarios} onEliminar={eliminar} />
    </div>
  );
}
