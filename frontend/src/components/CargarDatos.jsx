import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { periodoLabel, money } from '../format';
import Dropzone from './Dropzone';
import HistorialCargas from './HistorialCargas';

const RAZON_SOCIAL_DESCONOCIDA = 'no se pudo determinar la razón social (CUIT) del archivo';
const RAZONES = ['Target', 'NT'];

function EstadoStaged({ archivo, onElegirRazonSocial }) {
  if (archivo.cargando) return <span className="staged-estado staged-cargando">Analizando…</span>;
  if (archivo.error === RAZON_SOCIAL_DESCONOCIDA) {
    return (
      <span className="staged-estado staged-sin-razon">
        Este archivo no trae el CUIT — elegí a mano de quién es:
        <span className="staged-razon-botones">
          <button type="button" onClick={() => onElegirRazonSocial('NT')}>NT</button>
          <button type="button" onClick={() => onElegirRazonSocial('Target')}>Target</button>
        </span>
      </span>
    );
  }
  if (archivo.error) return <span className="staged-estado staged-error">{archivo.error}</span>;
  return <span className="staged-estado staged-listo">Listo para cargar</span>;
}

function agruparStaged(archivos) {
  const grupos = new Map();
  for (const a of archivos) {
    const razon = a.razonSocial || 'Sin detectar';
    const periodos = a.periodos?.length ? a.periodos : ['—'];
    for (const p of periodos) {
      const key = `${razon}|${p}`;
      if (!grupos.has(key)) grupos.set(key, { razon, periodo: p, archivos: [] });
      grupos.get(key).archivos.push(a);
    }
  }
  return [...grupos.values()].sort((a, b) => (a.razon + a.periodo).localeCompare(b.razon + b.periodo));
}

export default function CargarDatos({ onDatosActualizados }) {
  const [subiendoHistorico, setSubiendoHistorico] = useState(false);
  const [estadoHistorico, setEstadoHistorico] = useState(null);
  const [subiendo931, setSubiendo931] = useState(false);
  const [estado931, setEstado931] = useState(null);
  const [porcentaje931, setPorcentaje931] = useState('');
  const [porcentaje931Guardado, setPorcentaje931Guardado] = useState(null);
  const [guardandoPorcentaje, setGuardandoPorcentaje] = useState(false);
  const [estadoPorcentaje, setEstadoPorcentaje] = useState(null);

  const [staged, setStaged] = useState([]);
  const [cargandoTodo, setCargandoTodo] = useState(false);
  const [estadoMesEnCurso, setEstadoMesEnCurso] = useState(null);
  const [historialKey, setHistorialKey] = useState(0);
  const proximoId = useRef(1);

  const [razonSocialInterna, setRazonSocialInterna] = useState('Target');
  const [subiendoInternaConciliacion, setSubiendoInternaConciliacion] = useState(false);
  const [estadoInternaConciliacion, setEstadoInternaConciliacion] = useState(null);

  const [razonSocialCredito, setRazonSocialCredito] = useState('Target');
  const [periodoCredito, setPeriodoCredito] = useState('');
  const [montoCredito, setMontoCredito] = useState('');
  const [descripcionCredito, setDescripcionCredito] = useState('');
  const [guardandoCredito, setGuardandoCredito] = useState(false);
  const [estadoCredito, setEstadoCredito] = useState(null);
  const [historialCredito, setHistorialCredito] = useState([]);

  useEffect(() => {
    api.obtenerPorcentaje931()
      .then((r) => { setPorcentaje931(String(r.porcentaje)); setPorcentaje931Guardado(r.porcentaje); })
      .catch(() => {});
    cargarHistorialCredito();
  }, []);

  function cargarHistorialCredito() {
    api.listarCreditoManual().then(setHistorialCredito).catch(() => {});
  }

  async function agregarCredito(e) {
    e.preventDefault();
    setGuardandoCredito(true);
    setEstadoCredito(null);
    try {
      await api.agregarCreditoManual(razonSocialCredito, periodoCredito, montoCredito, descripcionCredito);
      setEstadoCredito({ tipo: 'ok', mensaje: `Crédito cargado para ${razonSocialCredito} — ${periodoLabel(periodoCredito)}.` });
      setMontoCredito('');
      setDescripcionCredito('');
      cargarHistorialCredito();
      onDatosActualizados?.();
    } catch (err) {
      setEstadoCredito({ tipo: 'error', mensaje: err.message });
    } finally {
      setGuardandoCredito(false);
    }
  }

  async function borrarCredito(id) {
    if (!window.confirm('¿Borrar esta carga de crédito fiscal manual?')) return;
    await api.eliminarCreditoManual(id);
    cargarHistorialCredito();
    onDatosActualizados?.();
  }

  async function guardarPorcentaje931() {
    setGuardandoPorcentaje(true);
    setEstadoPorcentaje(null);
    try {
      const r = await api.establecerPorcentaje931(porcentaje931);
      setPorcentaje931Guardado(r.porcentaje);
      setPorcentaje931(String(r.porcentaje));
      setEstadoPorcentaje({ tipo: 'ok', mensaje: 'Porcentaje actualizado.' });
      onDatosActualizados?.();
    } catch (err) {
      setEstadoPorcentaje({ tipo: 'error', mensaje: err.message });
    } finally {
      setGuardandoPorcentaje(false);
    }
  }

  async function handleHistorico(file) {
    setSubiendoHistorico(true);
    setEstadoHistorico(null);
    try {
      const preview = await api.previsualizarHistorico(file);
      if (preview.ya_existe) {
        const reemplazar = window.confirm(
          `Ya hay una DDJJ cargada para ${preview.razon_social} — ${periodoLabel(preview.periodo)}. ¿Querés reemplazarla con este archivo?`
        );
        if (!reemplazar) {
          setEstadoHistorico({ tipo: 'error', mensaje: 'Carga cancelada: ya había una DDJJ para ese período.' });
          return;
        }
      }
      const row = await api.importarHistorico(file);
      setEstadoHistorico({
        tipo: 'ok',
        mensaje: `${periodoLabel(row.periodo)} cargado para ${row.razon_social}: Diferencia ${row.diferencia >= 0 ? 'a pagar' : 'a favor'} de ${Math.abs(row.diferencia).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.`,
      });
      onDatosActualizados?.();
      setHistorialKey((k) => k + 1);
    } catch (err) {
      setEstadoHistorico({ tipo: 'error', mensaje: err.message });
    } finally {
      setSubiendoHistorico(false);
    }
  }

  async function handle931(file) {
    setSubiendo931(true);
    setEstado931(null);
    try {
      const preview = await api.previsualizarFormulario931(file);
      if (preview.ya_existe) {
        const reemplazar = window.confirm(
          `Ya hay un Formulario 931 cargado para ${preview.razon_social} — ${periodoLabel(preview.periodo)}. ¿Querés reemplazarlo con este archivo?`
        );
        if (!reemplazar) {
          setEstado931({ tipo: 'error', mensaje: 'Carga cancelada: ya había un 931 para ese período.' });
          return;
        }
      }
      const row = await api.importarFormulario931(file);
      setEstado931({
        tipo: 'ok',
        mensaje: `${periodoLabel(row.periodo)} cargado para ${row.razon_social}: Suma de Rem. 10 = ${row.suma_rem_10.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.`,
      });
      onDatosActualizados?.();
      setHistorialKey((k) => k + 1);
    } catch (err) {
      setEstado931({ tipo: 'error', mensaje: err.message });
    } finally {
      setSubiendo931(false);
    }
  }

  async function handleInternaConciliacion(file) {
    setSubiendoInternaConciliacion(true);
    setEstadoInternaConciliacion(null);
    try {
      const r = await api.importarConciliacionInterna(file, razonSocialInterna);
      setEstadoInternaConciliacion({
        tipo: 'ok',
        mensaje: `${r.comprobantes} comprobantes cargados${r.omitidos > 0 ? ` (${r.omitidos} filas omitidas por datos incompletos)` : ''}.`,
      });
    } catch (err) {
      setEstadoInternaConciliacion({ tipo: 'error', mensaje: err.message });
    } finally {
      setSubiendoInternaConciliacion(false);
    }
  }

  async function vaciarInternaConciliacion() {
    if (!window.confirm(`¿Borrar todos los comprobantes internos cargados para ${razonSocialInterna}?`)) return;
    await api.borrarConciliacionInterna(razonSocialInterna);
    setEstadoInternaConciliacion({ tipo: 'ok', mensaje: `Comprobantes internos de ${razonSocialInterna} borrados.` });
  }

  function agregarArchivos(files) {
    setEstadoMesEnCurso(null);
    const nuevos = files.map((file) => ({ id: proximoId.current++, file, nombre: file.name, cargando: true }));
    setStaged((prev) => [...prev, ...nuevos]);
    for (const entrada of nuevos) {
      api.previsualizarMesEnCurso(entrada.file)
        .then((preview) => {
          setStaged((prev) => prev.map((a) => (a.id === entrada.id
            ? { ...a, cargando: false, razonSocial: preview.razonSocial, periodos: preview.periodos }
            : a)));
        })
        .catch((err) => {
          setStaged((prev) => prev.map((a) => (a.id === entrada.id ? { ...a, cargando: false, error: err.message } : a)));
        });
    }
  }

  function quitarArchivo(id) {
    setStaged((prev) => prev.filter((a) => a.id !== id));
  }

  function elegirRazonSocial(id, razonSocialManual) {
    setStaged((prev) => prev.map((a) => (a.id === id ? { ...a, cargando: true, error: null } : a)));
    const entrada = staged.find((a) => a.id === id);
    api.previsualizarMesEnCurso(entrada.file, razonSocialManual)
      .then((preview) => {
        setStaged((prev) => prev.map((a) => (a.id === id
          ? { ...a, cargando: false, razonSocial: preview.razonSocial, periodos: preview.periodos, razonSocialManual }
          : a)));
      })
      .catch((err) => {
        setStaged((prev) => prev.map((a) => (a.id === id ? { ...a, cargando: false, error: err.message } : a)));
      });
  }

  async function cargarTodo() {
    setCargandoTodo(true);
    setEstadoMesEnCurso(null);
    const aCargar = staged.filter((a) => !a.error && !a.cargando);
    const resultados = [];
    const errores = [];
    for (const entrada of aCargar) {
      try {
        resultados.push(await api.importarMesEnCurso(entrada.file, entrada.razonSocialManual));
      } catch (err) {
        errores.push(`${entrada.nombre}: ${err.message}`);
      }
    }
    const totalComprobantes = resultados.reduce((acc, r) => acc + r.comprobantes, 0);
    const partes = [];
    if (resultados.length > 0) {
      partes.push(`${resultados.length} archivo${resultados.length > 1 ? 's' : ''} cargado${resultados.length > 1 ? 's' : ''}: ${totalComprobantes} comprobantes en total.`);
    }
    if (errores.length > 0) partes.push(`Errores — ${errores.join(' | ')}`);
    setEstadoMesEnCurso({ tipo: errores.length > 0 ? 'error' : 'ok', mensaje: partes.join(' ') || 'No había nada para cargar.' });
    setStaged([]);
    onDatosActualizados?.();
    setHistorialKey((k) => k + 1);
    setCargandoTodo(false);
  }

  const grupos = agruparStaged(staged);
  const hayAlgoParaCargar = staged.some((a) => !a.error && !a.cargando);

  return (
    <div className="cargar-datos">
      <div className="cargar-intro">
        <h2>Cargar datos</h2>
        <p className="nota">Estas fuentes se combinan para armar la posición de cada razón social: los PDF de las DDJJ ya presentadas (histórico), el Excel de comprobantes del mes que todavía no se presentó y el Formulario 931.</p>
      </div>

      <div className="cargar-grid">
        <div className="fuente-card">
          <div className="fuente-card-header">
            <span className="fuente-icono" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M6 3h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
                <path d="M14 3v5h5" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h3>Históricos</h3>
              <p>
                DDJJ ya presentada — PDF "F.2051 - DJ IVA" de ARCA. La app detecta sola si es NT o
                Target por el CUIT del PDF, y de qué mes y año es por el período que trae el PDF —
                sirve igual para cargar años anteriores (ej. 2025) y así comparar un mes contra el
                mismo mes del año pasado en "Resultado fiscal por mes" más abajo.
              </p>
            </div>
          </div>

          <Dropzone
            accept=".pdf"
            label={subiendoHistorico ? 'Procesando…' : 'Arrastrá o elegí el PDF de la DDJJ'}
            hint="Formato F.2051 - DJ IVA - SIMPLE"
            disabled={subiendoHistorico}
            onFile={handleHistorico}
          />
          {estadoHistorico && <p className={`estado-mensaje ${estadoHistorico.tipo}`}>{estadoHistorico.mensaje}</p>}
        </div>

        <div className="fuente-card">
          <div className="fuente-card-header">
            <span className="fuente-icono" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 9h18M8 4v16" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h3>Mis Comprobantes (Emitidos - Recibidos)</h3>
              <p>Excel "Mis Comprobantes Emitidos" o "Recibidos" de ARCA. La app detecta sola la razón social y el período de cada comprobante.</p>
            </div>
          </div>

          <Dropzone
            accept=".xlsx"
            multiple
            label="Arrastrá o elegí uno o varios Excel de comprobantes"
            hint='El nombre debe incluir "Emitidos" o "Recibidos"'
            onFiles={agregarArchivos}
          />

          {grupos.length > 0 && (
            <div className="staged-lista">
              {grupos.map((grupo) => (
                <div key={`${grupo.razon}-${grupo.periodo}`} className="staged-grupo">
                  <div className="staged-grupo-titulo">
                    {grupo.razon} — {grupo.periodo === '—' ? 'período por detectar' : periodoLabel(grupo.periodo)}
                  </div>
                  {grupo.archivos.map((a) => (
                    <div key={a.id} className="staged-item">
                      <div className="staged-item-info">
                        <span className="staged-item-nombre">{a.nombre}</span>
                        <EstadoStaged archivo={a} onElegirRazonSocial={(r) => elegirRazonSocial(a.id, r)} />
                      </div>
                      <button
                        type="button"
                        className="staged-item-quitar"
                        onClick={() => quitarArchivo(a.id)}
                        aria-label={`Quitar ${a.nombre}`}
                        disabled={cargandoTodo}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              <button type="button" className="btn-cargar-todo" onClick={cargarTodo} disabled={cargandoTodo || !hayAlgoParaCargar}>
                {cargandoTodo ? 'Cargando…' : 'Cargar toda la información'}
              </button>
            </div>
          )}

          {estadoMesEnCurso && <p className={`estado-mensaje ${estadoMesEnCurso.tipo}`}>{estadoMesEnCurso.mensaje}</p>}
        </div>

        <div className="fuente-card">
          <div className="fuente-card-header">
            <span className="fuente-icono" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M6 3h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
                <path d="M9 13h6M9 17h6M9 9h2" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h3>Formulario 931</h3>
              <p>PDF "Declaración en línea Formulario F.931" de ARCA. La app detecta sola la razón social y el período, y guarda la Suma de Rem. 10.</p>
            </div>
          </div>

          <Dropzone
            accept=".pdf"
            label={subiendo931 ? 'Procesando…' : 'Arrastrá o elegí el PDF del 931'}
            hint="Formato Declaración en línea Formulario F.931"
            disabled={subiendo931}
            onFile={handle931}
          />
          {estado931 && <p className={`estado-mensaje ${estado931.tipo}`}>{estado931.mensaje}</p>}

          <div className="porcentaje-931">
            <label htmlFor="porcentaje-931-input">
              Crédito fiscal = Suma de Rem. 10 ×
            </label>
            <div className="porcentaje-931-controles">
              <input
                id="porcentaje-931-input"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={porcentaje931}
                onChange={(e) => setPorcentaje931(e.target.value)}
              />
              <span>%</span>
              <button
                type="button"
                className="btn-desglose"
                onClick={guardarPorcentaje931}
                disabled={guardandoPorcentaje || porcentaje931 === '' || Number(porcentaje931) === porcentaje931Guardado}
              >
                {guardandoPorcentaje ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            {estadoPorcentaje && <p className={`estado-mensaje ${estadoPorcentaje.tipo}`}>{estadoPorcentaje.mensaje}</p>}
          </div>
        </div>

        <div className="fuente-card">
          <div className="fuente-card-header">
            <span className="fuente-icono" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="9" />
                <path d="M9 12h6M12 9v6" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h3>Crédito fiscal manual</h3>
              <p>Un monto fijo por período para comprobantes que no aparecen en ARCA pero se pueden tomar como crédito fiscal. Se suma al IVA Compras de ese período.</p>
            </div>
          </div>

          <form className="credito-manual-form" onSubmit={agregarCredito}>
            <div className="razon-tabs">
              {RAZONES.map((r) => (
                <button key={r} type="button" className={`razon-tab ${razonSocialCredito === r ? 'active' : ''}`} onClick={() => setRazonSocialCredito(r)}>
                  {r}
                </button>
              ))}
            </div>
            <input
              type="month"
              value={periodoCredito}
              onChange={(e) => setPeriodoCredito(e.target.value)}
              required
            />
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Monto"
              value={montoCredito}
              onChange={(e) => setMontoCredito(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Descripción (opcional)"
              value={descripcionCredito}
              onChange={(e) => setDescripcionCredito(e.target.value)}
            />
            <button type="submit" className="btn-desglose" disabled={guardandoCredito || !periodoCredito || !montoCredito}>
              {guardandoCredito ? 'Agregando…' : 'Agregar'}
            </button>
          </form>
          {estadoCredito && <p className={`estado-mensaje ${estadoCredito.tipo}`}>{estadoCredito.mensaje}</p>}

          {historialCredito.length > 0 && (
            <ul className="credito-manual-historial">
              {historialCredito.map((c) => (
                <li key={c.id}>
                  <span className="credito-manual-item-info">
                    <strong>{c.razon_social}</strong> — {periodoLabel(c.periodo)} — {money(c.monto)}
                    {c.descripcion && <span className="credito-manual-descripcion"> ({c.descripcion})</span>}
                  </span>
                  <button type="button" className="staged-item-quitar" onClick={() => borrarCredito(c.id)} aria-label="Borrar">×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="cargar-intro cargar-intro-seccion">
        <h2>Conciliación de compras</h2>
        <p className="nota">Esto alimenta el cruce de comprobantes en Conciliación contra lo que ya tenés cargado arriba en "Mis Comprobantes (Emitidos - Recibidos)".</p>
      </div>

      <div className="cargar-grid">
        <div className="fuente-card">
          <div className="fuente-card-header">
            <span className="fuente-icono" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M6 3h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
                <path d="M14 3v5h5" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h3>Sistema de gestión interna</h3>
              <p>
                Todavía no hay un export automático, así que se carga a mano: un Excel con columnas
                {' '}<strong>Fecha, Tipo Comprobante, Punto de Venta, Número, CUIT, Proveedor, Total</strong>.
                El cruce con ARCA es por CUIT + Tipo + Punto de Venta + Número, así que esos cuatro datos tienen que ser exactos
                (Tipo Comprobante puede ser el código AFIP: 1 Factura A, 6 Factura B, 11 Factura C, etc.).
              </p>
            </div>
          </div>
          <div className="razon-tabs">
            {RAZONES.map((r) => (
              <button key={r} className={`razon-tab ${razonSocialInterna === r ? 'active' : ''}`} onClick={() => setRazonSocialInterna(r)}>
                {r}
              </button>
            ))}
          </div>
          <Dropzone
            accept=".xlsx"
            label={subiendoInternaConciliacion ? 'Procesando…' : `Arrastrá o elegí el Excel de compras de ${razonSocialInterna}`}
            hint="Se carga para la razón social seleccionada arriba"
            disabled={subiendoInternaConciliacion}
            onFile={handleInternaConciliacion}
          />
          {estadoInternaConciliacion && <p className={`estado-mensaje ${estadoInternaConciliacion.tipo}`}>{estadoInternaConciliacion.mensaje}</p>}
          <p className="conciliacion-borrar">
            <button type="button" className="link-borrar" onClick={vaciarInternaConciliacion}>Borrar los comprobantes internos cargados de {razonSocialInterna}</button>
          </p>
        </div>
      </div>

      <HistorialCargas refreshKey={historialKey} />
    </div>
  );
}
