import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api } from '../api';
import { money, periodoLabel, periodoLabelCompleto, fechaLabel, fechaHoraLabel } from '../format';
import { BASES, calcularProyeccion } from '../proyeccion';
import InfoTooltip from './InfoTooltip';
import Spinner from './Spinner';

const RAZONES = ['Target', 'NT'];
const COLOR_FAVOR = '#0ca30c';
const COLOR_PAGAR = '#d03b3b';
// Alícuota general: solo sirve para dar una idea de cuánta venta neta representa un Débito de más.
const ALICUOTA_REFERENCIA = 0.21;

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
const porcentaje = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;

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
  if (!active || !payload?.length || payload[0].value == null) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-fecha">{label}{payload[0].payload.proyectado ? ' (proyectado)' : ''}</div>
      <div className="chart-tooltip-fila">
        <span className="chart-tooltip-nombre">Saldo resultante</span>
        <span className="chart-tooltip-valor">{saldoTexto(payload[0].value)}</span>
      </div>
    </div>
  );
}

// Barras verdes (a favor) y rojas (a pagar): lo que suma y lo que resta al Neto del año. Los meses
// proyectados se ven con el color más claro.
function GraficoSaldo({ filas }) {
  const data = filas.map((f) => ({
    mes: periodoLabel(f.periodo).slice(0, 3),
    saldo: f.sinDatos ? null : f.saldo,
    proyectado: f.tipo === 'proyectado',
  }));
  return (
    <div className="evolucion">
      <div className="evolucion-header">
        <h3>Saldo resultante mes a mes (verde suma, rojo resta)</h3>
        <div className="evolucion-leyenda">
          <span className="leyenda-item" style={{ '--serie-color': COLOR_FAVOR }}><span className="leyenda-linea" />A favor</span>
          <span className="leyenda-item" style={{ '--serie-color': COLOR_PAGAR }}><span className="leyenda-linea" />A pagar</span>
          <span className="leyenda-item"><span className="proy-leyenda-claro" />Más claro: proyectado</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="var(--text)" tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="var(--text)"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => new Intl.NumberFormat('es-AR', { notation: 'compact' }).format(v)}
          />
          <ReferenceLine y={0} stroke="var(--text)" />
          <Tooltip content={<TooltipSaldo />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="saldo" isAnimationActive={false} radius={[3, 3, 3, 3]}>
            {data.map((d) => (
              <Cell key={d.mes} fill={d.saldo != null && d.saldo < 0 ? COLOR_PAGAR : COLOR_FAVOR} fillOpacity={d.proyectado ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TablaMeses({ meses, neto }) {
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
          {neto != null && (
            <tr className="fila-subtotal-anio">
              <td className="col-concepto">Neto del año</td>
              <td /><td /><td />
              <td className={`col-total ${claseSaldo(neto)}`}>{saldoTexto(neto)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function resumenEscenario(e) {
  if (e.objetivo_tipo === 'neto') {
    const objetivo = e.objetivo == null ? 'sin objetivo' : `objetivo neto ${saldoTexto(e.objetivo)}`;
    return `${objetivo} — neto del año ${saldoTexto(e.neto)}`;
  }
  // Escenarios guardados antes de que el objetivo pasara a ser el Neto: apuntaban al saldo de diciembre.
  const objetivo = e.objetivo == null ? 'sin objetivo' : `objetivo (saldo de diciembre) ${saldoTexto(e.objetivo)}`;
  return `${objetivo} — terminaba diciembre en ${saldoTexto(e.saldo_final)}`;
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
                <span><strong>{e.nombre}</strong> — {e.anio} — {resumenEscenario(e)}</span>
                <span>{abierto === e.id ? '▲' : '▼'}</span>
              </button>
              {abierto === e.id && (
                <div className="proy-escenario-detalle">
                  <p className="card-hint">
                    Guardado el {fechaHoraLabel(e.creado_en)}{e.usuario ? ` por ${e.usuario}` : ''}.
                    {' '}Base de estimación: {BASES.find((b) => b.clave === e.base_modo)?.label ?? '—'}.
                    {' '}{e.ajustar_al_objetivo
                      ? `Los meses sin editar se ajustaron para llegar al objetivo${e.palanca ? ` moviendo ${e.palanca === 'debito' ? 'la facturación (Débito)' : 'las compras (Crédito)'}` : ''}.`
                      : 'Los meses sin editar siguieron la tendencia.'}
                    {e.iva_pendiente > 0 && ` IVA de compras pendientes de facturar: ${money(e.iva_pendiente)}.`}
                  </p>
                  <TablaMeses meses={e.meses} neto={e.objetivo_tipo === 'neto' ? e.neto : null} />
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

// Simulador del cierre de año. El objetivo es el Neto del año: la suma de los Saldos Resultantes de los
// 12 meses (los a favor suman, los a pagar restan), igual que el subtotal del Dashboard. Los meses
// cerrados salen de los datos reales y no se tocan; de los que faltan, los que el usuario no modificó se
// calculan solos — para llegar al objetivo o siguiendo la tendencia — y los que modifica a mano quedan
// fijos. Ver proyeccion.js para la cuenta.
export default function Proyeccion({ evoluciones }) {
  const anioActual = new Date().getFullYear();
  const [razonSocial, setRazonSocial] = useState('Target');
  const [anio, setAnio] = useState(anioActual);
  const [objetivoTexto, setObjetivoTexto] = useState('');
  const [objetivoSigno, setObjetivoSigno] = useState('favor');
  const [baseModo, setBaseModo] = useState('prom3');
  const [palanca, setPalanca] = useState('debito');
  const [pendienteTexto, setPendienteTexto] = useState('');
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

  const ivaPendiente = Math.max(0, numero(pendienteTexto));

  const resultado = useMemo(() => {
    if (!evolucion) return null;
    const editadosNumericos = Object.fromEntries(
      Object.entries(editados).map(([p, v]) => [p, { debito: numero(v.debito), credito: numero(v.credito) }])
    );
    return calcularProyeccion({ evolucion, anio, baseModo, objetivo, ajustar, editados: editadosNumericos, palanca, ivaPendiente });
  }, [evolucion, anio, baseModo, objetivo, ajustar, editados, palanca, ivaPendiente]);

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
        neto: resultado.neto,
        palanca,
        iva_pendiente: ivaPendiente,
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
  const facturarDeMas = resultado.facturarDeMas;

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
        Simulá cómo terminaría el año en IVA. El resultado del año es el <strong>Neto</strong>: la suma del Saldo
        Resultante de los 12 meses (los meses a favor suman, los a pagar restan). Los meses cerrados salen de los
        datos reales y no se tocan. Poné el Neto con el que querés terminar y la app calcula cuánto habría que
        facturar (o cuánto Crédito juntar) por mes en los meses que faltan, teniendo en cuenta las compras que
        todavía no te facturaron. Si cambiás un mes a mano queda fijo y el resto se reajusta.
      </p>

      <div className="fuente-card">
        <div className="proyeccion-controles">
          <label className="campo-manual">
            <span>
              Quiero que el Neto del año sea de
              <InfoTooltip texto="Neto del año = suma del Saldo Resultante de los 12 meses: los meses a favor (verde) suman y los a pagar (rojo) restan. Es el mismo Subtotal que ves al pie de cada año en 'Resultado fiscal por mes' del Dashboard." />
            </span>
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
                <option value="favor">Neto a favor</option>
                <option value="pagar">Neto a pagar</option>
              </select>
            </div>
          </label>
          <label className="campo-manual">
            <span>
              IVA de compras pendientes de facturar
              <InfoTooltip texto="IVA de compras que ya hiciste pero el proveedor todavía no te facturó. Se suma al Crédito Fiscal de los meses que faltan, repartido parejo entre los meses sin modificar." />
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={pendienteTexto}
              onChange={(e) => setPendienteTexto(e.target.value)}
            />
          </label>
          <label className="campo-manual">
            <span>
              Para llegar al objetivo, ajustar
              <InfoTooltip texto="Qué se mueve en los meses sin modificar: la facturación (Débito Fiscal) o las compras (Crédito Fiscal). Lo otro sigue la tendencia." />
            </span>
            <select value={palanca} onChange={(e) => setPalanca(e.target.value)}>
              <option value="debito">Cuánto facturo (Débito Fiscal)</option>
              <option value="credito">Cuántas compras consigo (Crédito Fiscal)</option>
            </select>
          </label>
          <label className="campo-manual">
            <span>
              Base para estimar
              <InfoTooltip texto="Con qué meses se estiman el Débito y el Crédito de referencia de los meses que faltan. También es contra lo que se compara cuánto hay que facturar de más." />
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
              <div className="card-label">Objetivo: Neto del año</div>
              <div className="card-value">{objetivo == null ? '—' : saldoTexto(objetivo)}</div>
            </div>
            <div className="card">
              <div className="card-label">
                Neto del año proyectado
                <InfoTooltip texto="Suma del Saldo Resultante de los 12 meses con los números de la tabla (los a favor suman, los a pagar restan)." />
              </div>
              <div className={`card-value ${claseSaldo(resultado.neto)}`}>{saldoTexto(resultado.neto)}</div>
              <div className="card-hint">Saldo de diciembre: {saldoTexto(resultado.saldoFinal)}</div>
            </div>
            <div className="card">
              <div className="card-label">Diferencia contra el objetivo</div>
              <div className="card-value">{resultado.brecha == null ? '—' : money(Math.abs(resultado.brecha))}</div>
              {resultado.brecha != null && (
                <div className="card-hint">
                  {Math.abs(resultado.brecha) < 1
                    ? 'Llegás justo al objetivo'
                    : (resultado.brecha > 0 ? 'El Neto queda por encima del objetivo' : 'El Neto queda por debajo del objetivo')}
                </div>
              )}
            </div>
            {resolucion && (
              <div className="card">
                <div className="card-label">
                  Diferencia neta por mes
                  <InfoTooltip texto="Débito − Crédito que tiene que dar cada mes sin modificar para llegar al objetivo. Positivo: el mes consume saldo a favor o genera a pagar; negativo: el crédito supera al débito." />
                </div>
                <div className="card-value">{money(resolucion.d)}</div>
                <div className="card-hint">en {resultado.cantidadLibres} {resultado.cantidadLibres === 1 ? 'mes' : 'meses'} sin modificar</div>
              </div>
            )}
            {resolucion && palanca === 'debito' && (
              <div className="card">
                <div className="card-label">
                  {facturarDeMas >= 0 ? 'Facturar de más por mes' : 'Facturar de menos por mes'}
                  <InfoTooltip texto="Cuánto Débito Fiscal (IVA de ventas) hay que facturar por mes contra el promedio de la base elegida, para llegar al objetivo con las compras pendientes de facturar ya sumadas al Crédito." />
                </div>
                <div className={`card-value ${facturarDeMas > 0 ? 'neg' : 'pos'}`}>{money(Math.abs(facturarDeMas))}</div>
                <div className="card-hint">
                  Débito necesario {money(resultado.debitoNecesario)} contra {money(resultado.debitoReferencia)} de promedio
                  {resultado.variacionDebito != null && ` (${porcentaje(resultado.variacionDebito)})`}
                </div>
                <div className="card-hint">
                  En total {money(Math.abs(facturarDeMas) * resultado.cantidadLibres)} en {resultado.cantidadLibres} {resultado.cantidadLibres === 1 ? 'mes' : 'meses'} · equivale a unos {money(Math.abs(facturarDeMas) / ALICUOTA_REFERENCIA)} de ventas netas por mes (aprox., a {ALICUOTA_REFERENCIA * 100}%)
                </div>
              </div>
            )}
            {resolucion && palanca === 'credito' && (
              <div className="card">
                <div className="card-label">
                  Crédito Fiscal necesario por mes
                  <InfoTooltip texto="Crédito promedio que necesitás en los meses sin modificar, dado el Débito de la tendencia. Se compara contra tu promedio más el IVA de compras pendientes de facturar." />
                </div>
                <div className="card-value">{money(resultado.creditoNecesario)}</div>
                {resultado.variacionCredito != null && (
                  <div className={`card-hint ${resultado.variacionCredito > 0.5 ? 'card-hint-pagar' : ''}`}>
                    {porcentaje(resultado.variacionCredito)} sobre tu referencia ({money(resultado.creditoReferencia)}
                    {resultado.pendientePorMes > 0 ? ', ya con el IVA pendiente' : ''})
                  </div>
                )}
                <div className="card-hint">
                  {resultado.creditoNecesario > resultado.creditoReferencia
                    ? `Faltaría conseguir ${money(resultado.creditoNecesario - resultado.creditoReferencia)} más por mes`
                    : 'Con tu promedio y lo pendiente ya alcanza'}
                </div>
              </div>
            )}
            {resultado.pendienteTotal > 0 && (
              <div className="card">
                <div className="card-label">IVA de compras pendientes</div>
                <div className="card-value">{money(resultado.pendienteTotal)}</div>
                <div className="card-hint">
                  {resultado.pendienteSinUsar
                    ? 'No se está usando: todos los meses están modificados a mano'
                    : `${money(resultado.pendientePorMes)} por mes de Crédito extra en ${resultado.cantidadLibres} ${resultado.cantidadLibres === 1 ? 'mes' : 'meses'}`}
                </div>
              </div>
            )}
          </div>

          {ajustar && objetivo == null && (
            <p className="bloque-nota">Poné un objetivo para calcular cuánto hay que facturar. Mientras tanto los meses siguen la tendencia de la base elegida.</p>
          )}
          {ajustar && objetivo != null && !resolucion && (
            <p className="bloque-nota">No queda ningún mes sin modificar para ajustar: el resultado es solo lo que cargaste a mano.</p>
          )}
          {resolucion && !resolucion.alcanzable && (
            <p className="error-banner">No se llega exactamente al objetivo con los meses que quedan sin modificar.</p>
          )}
          {resultado.mesesCreditoNegativo.length > 0 && (
            <p className="error-banner">
              Con el Débito de la tendencia el objetivo es inalcanzable: el Crédito de {resultado.mesesCreditoNegativo.map(periodoLabel).join(', ')} tendría
              que ser negativo. Probá ajustando la facturación (Débito) o con un objetivo menos exigente.
            </p>
          )}
          {resultado.mesesDebitoNegativo.length > 0 && (
            <p className="error-banner">
              Para llegar al objetivo el Débito de {resultado.mesesDebitoNegativo.map(periodoLabel).join(', ')} tendría que ser negativo
              (no se puede facturar menos que cero). Probá ajustando las compras (Crédito) o con un objetivo menos exigente.
            </p>
          )}
          {resultado.mesesAPagar.length > 0 && (
            <p className="bloque-nota">
              Con estos números {resultado.mesesAPagar.map(periodoLabel).join(', ')} cerrarían a pagar. Ese saldo no se arrastra al mes siguiente (se paga con la DDJJ), pero sí resta al Neto.
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
                <td className="col-concepto">Neto {anio}</td>
                <td />
                <td>{money(sumaDebito)}</td>
                <td>{money(sumaCredito)}</td>
                <td>{money(sumaDiferencia)}</td>
                <td />
                <td className={`col-total ${claseSaldo(resultado.neto)}`}>{saldoTexto(resultado.neto)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="resultado-fiscal-hint">
          Neto del año = suma del Saldo Resultante de los 12 meses (verde suma, rojo resta). Saldo de diciembre: {saldoTexto(resultado.saldoFinal)}.
        </p>
      </div>

      <GraficoSaldo filas={filas} />

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
              placeholder="Nombre (ej. Neto de 200 millones facturando más)"
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
