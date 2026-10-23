import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { periodoLabel, periodoLabelCompleto } from '../format';
import Dropzone from './Dropzone';
import HistorialCargas from './HistorialCargas';

const RAZON_SOCIAL_DESCONOCIDA = 'no se pudo determinar la razón social (CUIT) del archivo';
const RAZONES_ARCA = ['NT', 'Target'];
const MODOS_PERIODO = [['actual', 'Este mes'], ['anterior', 'Mes pasado'], ['otro', 'Otro mes']];

function mesAnterior(periodo) {
  const [y, m] = periodo.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// "NT", "NT y Target"
function listaDeRazones(razones) {
  return razones.join(' y ');
}

function Icono({ children }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONOS = {
  comprobantes: <Icono><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16" /></Icono>,
  historico: <Icono><path d="M6 3h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5" /></Icono>,
  f931: <Icono><path d="M6 3h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M9 13h6M9 17h6M9 9h2" /></Icono>,
};

function Seccion({ icono, titulo, descripcion, estado, children }) {
  return (
    <section className="cd-seccion">
      <header className="cd-seccion-info">
        <span className="cd-icono">{icono}</span>
        <div className="cd-seccion-titulos">
          <h3>{titulo}{estado}</h3>
          <p>{descripcion}</p>
        </div>
      </header>
      <div className="cd-seccion-cuerpo">{children}</div>
    </section>
  );
}

function Mensaje({ estado }) {
  if (!estado) return null;
  return <p className={`cd-mensaje ${estado.tipo}`} role="status">{estado.mensaje}</p>;
}

function EstadoArchivo({ archivo, onElegirRazonSocial }) {
  if (archivo.cargando) return <span className="cd-archivo-estado">Analizando…</span>;
  if (archivo.error === RAZON_SOCIAL_DESCONOCIDA) {
    return (
      <span className="cd-archivo-estado cd-archivo-aviso">
        Este archivo no trae el CUIT. ¿De quién es?
        <span className="cd-archivo-elegir">
          <button type="button" onClick={() => onElegirRazonSocial('NT')}>NT</button>
          <button type="button" onClick={() => onElegirRazonSocial('Target')}>Target</button>
        </span>
      </span>
    );
  }
  if (archivo.error) return <span className="cd-archivo-estado cd-archivo-error">{archivo.error}</span>;
  return <span className="cd-archivo-estado cd-archivo-listo">Listo para cargar</span>;
}

function agruparArchivos(archivos) {
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

function IconoProgreso({ estado }) {
  if (estado === 'cargando') return <span className="cd-spinner" aria-hidden="true" />;
  if (estado === 'ok') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
    );
  }
  if (estado === 'error') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01" /></svg>
    );
  }
  return <span className="cd-punto" aria-hidden="true" />;
}

const TEXTO_PROGRESO = { pendiente: 'En espera', cargando: 'Descargando de ARCA…' };

export default function CargarDatos({ onDatosActualizados }) {
  const [subiendoHistorico, setSubiendoHistorico] = useState(false);
  const [estadoHistorico, setEstadoHistorico] = useState(null);
  const [subiendo931, setSubiendo931] = useState(false);
  const [estado931, setEstado931] = useState(null);
  const [porcentaje931, setPorcentaje931] = useState('');
  const [porcentaje931Guardado, setPorcentaje931Guardado] = useState(null);
  const [guardandoPorcentaje, setGuardandoPorcentaje] = useState(false);
  const [estadoPorcentaje, setEstadoPorcentaje] = useState(null);

  // Subida manual de Mis Comprobantes
  const [staged, setStaged] = useState([]);
  const [cargandoTodo, setCargandoTodo] = useState(false);
  const [estadoMesEnCurso, setEstadoMesEnCurso] = useState(null);
  const [historialKey, setHistorialKey] = useState(0);
  const proximoId = useRef(1);

  // Carga automática desde ARCA: el backend entra con la clave fiscal de sus variables de entorno.
  const [arcaEstado, setArcaEstado] = useState(null);
  const [modoPeriodo, setModoPeriodo] = useState('actual');
  const [periodoOtro, setPeriodoOtro] = useState('');
  const [razonesArca, setRazonesArca] = useState(RAZONES_ARCA);
  const [sincronizando, setSincronizando] = useState(false);
  const [progresoArca, setProgresoArca] = useState([]);

  useEffect(() => {
    api.obtenerPorcentaje931()
      .then((r) => { setPorcentaje931(String(r.porcentaje)); setPorcentaje931Guardado(r.porcentaje); })
      .catch(() => {});
    api.arcaEstado().then(setArcaEstado).catch(() => {});
  }, []);

  const periodoArca = !arcaEstado ? ''
    : modoPeriodo === 'actual' ? arcaEstado.periodo_actual
    : modoPeriodo === 'anterior' ? mesAnterior(arcaEstado.periodo_actual)
    : periodoOtro;

  function alternarRazonArca(razon) {
    setRazonesArca((prev) => (prev.includes(razon) ? prev.filter((r) => r !== razon) : RAZONES_ARCA.filter((r) => r === razon || prev.includes(r))));
  }

  // Recién acá se entra a ARCA: elegir período o razón social no dispara nada.
  async function cargarDesdeArca() {
    if (!periodoArca || razonesArca.length === 0) return;
    setSincronizando(true);
    const actualizar = (razon, cambios) => setProgresoArca((prev) => prev.map((p) => (p.razon === razon ? { ...p, ...cambios } : p)));
    setProgresoArca(razonesArca.map((razon) => ({ razon, estado: 'pendiente' })));
    // Una razón social por pedido: cada una entra en el tiempo máximo de la función serverless.
    for (const razon of razonesArca) {
      actualizar(razon, { estado: 'cargando' });
      try {
        const r = await api.sincronizarArca(periodoArca, razon);
        const detalle = r.resultados
          .map((x) => `${x.tipo === 'emitidos' ? 'Emitidos' : 'Recibidos'}: ${x.sin_comprobantes ? 'sin comprobantes' : x.comprobantes}`)
          .join(' · ');
        actualizar(razon, { estado: 'ok', detalle });
      } catch (err) {
        actualizar(razon, { estado: 'error', detalle: err.message });
      }
    }
    onDatosActualizados?.();
    setHistorialKey((k) => k + 1);
    setSincronizando(false);
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

  const grupos = agruparArchivos(staged);
  const hayAlgoParaCargar = staged.some((a) => !a.error && !a.cargando);

  const motivoDeshabilitado = !periodoArca ? 'Elegí el mes que querés cargar.'
    : razonesArca.length === 0 ? 'Elegí al menos una razón social.'
    : null;

  return (
    <div className="cargar-datos cd">
      <div className="cd-encabezado">
        <h2>Cargar datos</h2>
        <p>Las fuentes que arman la posición de IVA de cada razón social.</p>
      </div>

      <div className="cd-panel">
        <Seccion
          icono={ICONOS.comprobantes}
          titulo="Mis Comprobantes"
          descripcion="Emitidos y Recibidos de ARCA, por razón social y mes."
          estado={arcaEstado?.configurado ? <span className="cd-pastilla">ARCA conectado</span> : null}
        >
          {arcaEstado?.configurado && (
            <div className="cd-automatica">
              <div className="cd-controles">
                <div className="cd-campo">
                  <span className="cd-etiqueta" id="cd-etiqueta-periodo">Período</span>
                  <div className="cd-campo-linea">
                    <div className="cd-segmentado" role="radiogroup" aria-labelledby="cd-etiqueta-periodo">
                      {MODOS_PERIODO.map(([modo, texto]) => (
                        <button
                          key={modo}
                          type="button"
                          role="radio"
                          aria-checked={modoPeriodo === modo}
                          className={modoPeriodo === modo ? 'activo' : ''}
                          onClick={() => setModoPeriodo(modo)}
                          disabled={sincronizando}
                        >
                          {texto}
                        </button>
                      ))}
                    </div>
                    {modoPeriodo === 'otro' && (
                      <input
                        type="month"
                        className="cd-input"
                        aria-label="Mes a cargar"
                        value={periodoOtro}
                        max={arcaEstado.periodo_actual}
                        onChange={(e) => setPeriodoOtro(e.target.value)}
                        disabled={sincronizando}
                      />
                    )}
                  </div>
                </div>

                <div className="cd-campo">
                  <span className="cd-etiqueta" id="cd-etiqueta-razones">Razón social</span>
                  <div className="cd-opciones" role="group" aria-labelledby="cd-etiqueta-razones">
                    {RAZONES_ARCA.map((razon) => {
                      const activa = razonesArca.includes(razon);
                      return (
                        <label key={razon} className={`cd-opcion ${activa ? 'activa' : ''} ${sincronizando ? 'deshabilitada' : ''}`}>
                          <input type="checkbox" checked={activa} onChange={() => alternarRazonArca(razon)} disabled={sincronizando} />
                          <span className="cd-opcion-casilla" aria-hidden="true">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                          </span>
                          <span className="cd-opcion-texto">{razon}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button type="button" className="cd-boton cd-boton-primario" onClick={cargarDesdeArca} disabled={sincronizando || Boolean(motivoDeshabilitado)}>
                  {sincronizando && <span className="cd-spinner cd-spinner-blanco" aria-hidden="true" />}
                  {sincronizando ? 'Cargando…' : 'Cargar datos'}
                </button>
              </div>

              <p className="cd-resumen">
                {motivoDeshabilitado
                  ? motivoDeshabilitado
                  : <>Descarga Emitidos y Recibidos de <strong>{listaDeRazones(razonesArca)}</strong> · <strong>{periodoLabelCompleto(periodoArca)}</strong>. Reemplaza lo ya cargado de ese mes.</>}
              </p>

              {progresoArca.length > 0 && (
                <ul className="cd-progreso" aria-live="polite">
                  {progresoArca.map((p) => (
                    <li key={p.razon} className={`cd-progreso-fila ${p.estado}`}>
                      <span className="cd-progreso-icono"><IconoProgreso estado={p.estado} /></span>
                      <span className="cd-progreso-razon">{p.razon}</span>
                      <span className="cd-progreso-detalle">{p.detalle || TEXTO_PROGRESO[p.estado]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {arcaEstado && !arcaEstado.configurado && (
            <p className="cd-aviso">La carga automática desde ARCA no está configurada en el servidor (falta la variable de entorno ARCA_CLAVE). Mientras tanto se pueden subir los archivos a mano.</p>
          )}

          <div className="cd-manual">
            <Dropzone
              compact
              accept=".xlsx,.csv,.zip"
              multiple
              label="O subí los archivos a mano: Excel o .zip de Mis Comprobantes"
              hint='El nombre debe incluir "Emitidos" o "Recibidos"; la app detecta razón social y período'
              onFiles={agregarArchivos}
            />

            {grupos.length > 0 && (
              <div className="cd-archivos">
                {grupos.map((grupo) => (
                  <div key={`${grupo.razon}-${grupo.periodo}`} className="cd-archivos-grupo">
                    <div className="cd-archivos-titulo">
                      {grupo.razon} · {grupo.periodo === '—' ? 'período por detectar' : periodoLabel(grupo.periodo)}
                    </div>
                    {grupo.archivos.map((a) => (
                      <div key={a.id} className="cd-archivo">
                        <div className="cd-archivo-info">
                          <span className="cd-archivo-nombre" title={a.nombre}>{a.nombre}</span>
                          <EstadoArchivo archivo={a} onElegirRazonSocial={(r) => elegirRazonSocial(a.id, r)} />
                        </div>
                        <button type="button" className="cd-quitar" onClick={() => quitarArchivo(a.id)} aria-label={`Quitar ${a.nombre}`} disabled={cargandoTodo}>×</button>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="cd-archivos-accion">
                  <button type="button" className="cd-boton cd-boton-primario" onClick={cargarTodo} disabled={cargandoTodo || !hayAlgoParaCargar}>
                    {cargandoTodo && <span className="cd-spinner cd-spinner-blanco" aria-hidden="true" />}
                    {cargandoTodo ? 'Cargando…' : 'Cargar archivos'}
                  </button>
                </div>
              </div>
            )}

            <Mensaje estado={estadoMesEnCurso} />
          </div>
        </Seccion>

        <Seccion
          icono={ICONOS.historico}
          titulo="DDJJ presentadas"
          descripcion='PDF "F.2051 - DJ IVA". Detecta razón social y período; sirve también para años anteriores.'
        >
          <Dropzone
            compact
            accept=".pdf"
            label={subiendoHistorico ? 'Procesando…' : 'Arrastrá o elegí el PDF de la DDJJ'}
            hint="Formato F.2051 - DJ IVA - SIMPLE"
            disabled={subiendoHistorico}
            onFile={handleHistorico}
          />
          <Mensaje estado={estadoHistorico} />
        </Seccion>

        <Seccion
          icono={ICONOS.f931}
          titulo="Formulario 931"
          descripcion='PDF "Declaración en línea F.931". Detecta razón social y período, y guarda la Suma de Rem. 10.'
        >
          <Dropzone
            compact
            accept=".pdf"
            label={subiendo931 ? 'Procesando…' : 'Arrastrá o elegí el PDF del 931'}
            hint="Formato Declaración en línea Formulario F.931"
            disabled={subiendo931}
            onFile={handle931}
          />
          <Mensaje estado={estado931} />

          <div className="cd-ajuste">
            <label htmlFor="cd-porcentaje-931">Crédito fiscal = Suma de Rem. 10 ×</label>
            <div className="cd-input-sufijo">
              <input
                id="cd-porcentaje-931"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={porcentaje931}
                onChange={(e) => setPorcentaje931(e.target.value)}
              />
              <span>%</span>
            </div>
            <button
              type="button"
              className="cd-boton cd-boton-secundario"
              onClick={guardarPorcentaje931}
              disabled={guardandoPorcentaje || porcentaje931 === '' || Number(porcentaje931) === porcentaje931Guardado}
            >
              {guardandoPorcentaje ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          <Mensaje estado={estadoPorcentaje} />
        </Seccion>
      </div>

      <HistorialCargas refreshKey={historialKey} />
    </div>
  );
}
