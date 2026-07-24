import { useEffect, useRef, useState, useCallback } from 'react';
import { api, setToken, setOnUnauthorized } from './api';
import Selector from './components/Selector';
import ResumenCards from './components/ResumenCards';
import VentasCompras from './components/VentasCompras';
import EvolucionChart from './components/EvolucionChart';
import TablaComparativa from './components/TablaComparativa';
import ResultadoFiscalMensual from './components/ResultadoFiscalMensual';
import CargarDatos from './components/CargarDatos';
import Proveedores from './components/Proveedores';
import Conciliacion from './components/Conciliacion';
import Configuracion from './components/Configuracion';
import Login, { sesionGuardada, borrarSesion } from './components/Login';
import { ResumenSkeleton, VentasComprasSkeleton, EvolucionSkeleton } from './components/DashboardSkeleton';
import { cacheGet, cacheSet } from './cache';
import './App.css';

const keyPeriodos = (razonSocial) => `dashboard-periodos-${razonSocial}`;
const keyResumen = (razonSocial, periodo) => `dashboard-resumen-${razonSocial}-${periodo}`;
const keyVentasCompras = (razonSocial, periodo) => `dashboard-ventas-compras-${razonSocial}-${periodo}`;

export default function App() {
  const [sesion, setSesion] = useState(() => {
    const guardada = sesionGuardada();
    if (guardada) setToken(guardada.token);
    return guardada;
  });
  // Solo para saber si la sesión actual es la que ya estaba guardada al abrir la página (sessionStorage)
  // — no cambia con logins nuevos.
  const sesionRestauradaAlAbrir = useRef(!!sesion);
  const [visibilidad, setVisibilidad] = useState({});
  const [vista, setVista] = useState('dashboard');
  const [vistaElegidaPorUsuario, setVistaElegidaPorUsuario] = useState(false);
  const [razonSocial, setRazonSocial] = useState('Target');
  const [periodo, setPeriodo] = useState(null);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState(null);
  const [periodos, setPeriodos] = useState([]);
  const [cargandoPeriodos, setCargandoPeriodos] = useState(true);
  const [resumen, setResumen] = useState(null);
  const [ventasCompras, setVentasCompras] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(true);
  const [evoluciones, setEvoluciones] = useState({});
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Al entrar a la app se espera a tener todo lo del dashboard junto (períodos, resumen, evolución)
  // antes de mostrar nada, en vez de ir revelando cada bloque a medida que llega — una vez lista la
  // primera carga no se vuelve a esconder, aunque después se cambie de período o razón social.
  const [cargaInicialLista, setCargaInicialLista] = useState(false);

  const rol = sesion?.rol ?? null;
  const esDev = rol === 'dev';
  const puedeVerCargarProveedores = rol === 'administrador' || rol === 'dev';
  function visible(clave) {
    return esDev || visibilidad[clave] !== false;
  }

  function cerrarSesion() {
    api.logout().catch(() => {});
    setToken(null);
    borrarSesion();
    setSesion(null);
    setVistaElegidaPorUsuario(false);
    setVista('dashboard');
  }

  useEffect(() => {
    setOnUnauthorized(() => cerrarSesion());
  }, []);

  // Si la sesión que ya estaba guardada al abrir la página dejó de ser válida (ej. el server se
  // reinició y perdió las sesiones en memoria), esto la detecta y api.js dispara setOnUnauthorized
  // para corregirlo solo. Una sesión recién creada por un login exitoso NO se re-verifica acá: ya
  // sabemos que es válida porque el login la acaba de confirmar, y una re-verificación inmediata
  // podría toparse con un reinicio del servidor (ej. un redeploy) y cerrar la sesión que recién se
  // abrió, aunque el login haya sido perfectamente válido.
  useEffect(() => {
    if (sesionRestauradaAlAbrir.current) api.me().catch(() => {});
  }, []);

  useEffect(() => {
    if (!sesion) return;
    api.obtenerVisibilidad().then(setVisibilidad).catch(() => {});
  }, [sesion?.token]);

  const cargarEvoluciones = useCallback(async () => {
    const [nt, target, consolidado] = await Promise.all([
      api.evolucion('NT'),
      api.evolucion('Target'),
      api.evolucion('Consolidado'),
    ]);
    setEvoluciones({ NT: nt.evolucion, Target: target.evolucion, Consolidado: consolidado.evolucion });
    if (!vistaElegidaPorUsuario && puedeVerCargarProveedores) {
      setVista(consolidado.evolucion.length === 0 ? 'cargar-datos' : 'dashboard');
    }
  }, [vistaElegidaPorUsuario, puedeVerCargarProveedores]);

  const recargarTodo = useCallback(async () => {
    await cargarEvoluciones();
    const { periodos: nuevosPeriodos } = await api.periodos(razonSocial);
    setPeriodos(nuevosPeriodos);
    cacheSet(keyPeriodos(razonSocial), nuevosPeriodos);
    setPeriodo((actual) => (nuevosPeriodos.includes(actual) ? actual : nuevosPeriodos.at(-1) ?? null));
    setRefreshKey((k) => k + 1);
  }, [razonSocial, cargarEvoluciones]);

  useEffect(() => {
    if (!sesion) return;
    cargarEvoluciones().catch((e) => setError(e.message));
  }, [sesion, cargarEvoluciones]);

  useEffect(() => {
    if (!sesion) return;
    let cancelado = false;
    const key = keyPeriodos(razonSocial);
    const cacheado = cacheGet(key);
    if (cacheado) {
      setPeriodos(cacheado);
      setPeriodo((actual) => (cacheado.includes(actual) ? actual : cacheado.at(-1) ?? null));
      setCargandoPeriodos(false);
    } else {
      setCargandoPeriodos(true);
    }
    setPeriodoSeleccionado(null);
    api.periodos(razonSocial)
      .then(({ periodos: p }) => {
        if (cancelado) return;
        setPeriodos(p);
        cacheSet(key, p);
        setPeriodo((actual) => (p.includes(actual) ? actual : p.at(-1) ?? null));
      })
      .catch((e) => !cancelado && !cacheado && setError(e.message))
      .finally(() => !cancelado && setCargandoPeriodos(false));
    return () => { cancelado = true; };
  }, [sesion, razonSocial]);

  useEffect(() => {
    if (!sesion) return;
    if (!periodo) { setResumen(null); setVentasCompras(null); setCargandoResumen(false); return; }
    let cancelado = false;
    const rKey = keyResumen(razonSocial, periodo);
    const vKey = keyVentasCompras(razonSocial, periodo);
    const cacheadoResumen = cacheGet(rKey);
    setError(null);
    if (cacheadoResumen) {
      setResumen(cacheadoResumen);
      setVentasCompras(cacheGet(vKey) ?? null);
      setCargandoResumen(false);
    } else {
      setCargandoResumen(true);
    }
    const pedidos = [api.resumen(razonSocial, periodo).then((r) => { if (!cancelado) { setResumen(r); cacheSet(rKey, r); } })];
    if (razonSocial !== 'Consolidado') {
      pedidos.push(
        api.ventasCompras(razonSocial, periodo)
          .then((v) => { if (!cancelado) { setVentasCompras(v); cacheSet(vKey, v); } })
          .catch(() => !cancelado && setVentasCompras(null))
      );
    } else {
      setVentasCompras(null);
    }
    Promise.all(pedidos)
      .catch((e) => !cancelado && !cacheadoResumen && setError(e.message))
      .finally(() => !cancelado && setCargandoResumen(false));
    return () => { cancelado = true; };
  }, [sesion, razonSocial, periodo, refreshKey]);

  useEffect(() => {
    if (cargaInicialLista) return;
    if (vista !== 'dashboard') { setCargaInicialLista(true); return; }
    if (cargandoPeriodos) return;
    if (razonSocial !== 'Consolidado' && !evoluciones[razonSocial]) return;
    if (periodo && cargandoResumen) return;
    setCargaInicialLista(true);
  }, [cargaInicialLista, vista, cargandoPeriodos, cargandoResumen, periodo, razonSocial, evoluciones]);

  function irA(nuevaVista) {
    setVistaElegidaPorUsuario(true);
    setVista(nuevaVista);
  }

  function irAPeriodo(p) {
    setPeriodo(p);
    setPeriodoSeleccionado(p);
  }

  function deseleccionarPeriodo() {
    setPeriodoSeleccionado(null);
    setPeriodo(periodos.at(-1) ?? null);
  }

  if (!sesion) {
    return <Login onIngresar={setSesion} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <button type="button" className="app-header-marca app-header-marca-btn" onClick={() => irA('dashboard')}>
            <img src="/logo-tiendafull.svg" alt="Tienda Full" className="app-logo" />
            <div className="app-header-titulo">
              <h1>Módulo IVA al día</h1>
              <p className="subtitle">Tienda Full — Target y NT</p>
            </div>
          </button>
          <div className="app-header-nav-group">
            <nav className="app-nav">
              <button className={`nav-tab ${vista === 'dashboard' ? 'active' : ''}`} onClick={() => irA('dashboard')}>
                Dashboard
              </button>
              <button className={`nav-tab ${vista === 'conciliacion' ? 'active' : ''}`} onClick={() => irA('conciliacion')}>
                Conciliación
              </button>
            </nav>
            {puedeVerCargarProveedores && visible('nav.cargar-datos') && (
              <button className={`nav-tab-standalone ${vista === 'cargar-datos' ? 'active' : ''}`} onClick={() => irA('cargar-datos')}>
                Cargar datos
              </button>
            )}
            {puedeVerCargarProveedores && visible('nav.proveedores') && (
              <button className={`nav-tab-standalone ${vista === 'proveedores' ? 'active' : ''}`} onClick={() => irA('proveedores')}>
                Proveedores
              </button>
            )}
            {esDev && (
              <button className={`nav-tab-standalone ${vista === 'configuracion' ? 'active' : ''}`} onClick={() => irA('configuracion')}>
                Configuración
              </button>
            )}
            <div className="usuario-actual">
              <span>{sesion.username}</span>
              <button type="button" className="btn-salir" onClick={cerrarSesion}>Salir</button>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        {vista === 'cargar-datos' && puedeVerCargarProveedores ? (
          <CargarDatos onDatosActualizados={recargarTodo} />
        ) : vista === 'proveedores' && puedeVerCargarProveedores ? (
          <Proveedores onCambio={recargarTodo} />
        ) : vista === 'configuracion' && esDev ? (
          <Configuracion />
        ) : vista === 'conciliacion' ? (
          <Conciliacion rol={rol} visible={visible} />
        ) : !cargaInicialLista ? (
          <div className="carga-inicial">
            <span className="spinner-anillo" role="status" aria-label="Cargando" />
          </div>
        ) : (
          <>
            <Selector
              razonSocial={razonSocial}
              setRazonSocial={setRazonSocial}
              periodo={razonSocial !== 'Consolidado' ? periodo : null}
              periodos={periodos}
              onCambiarPeriodo={irAPeriodo}
            />

            {error && <p className="error-banner">{error}</p>}

            {!cargandoPeriodos && !periodo && !error && (
              <p className="empty-state">
                No hay períodos cargados todavía para {razonSocial}. Andá a "Cargar datos" para empezar.
              </p>
            )}

            {razonSocial === 'Consolidado' ? (
              <TablaComparativa />
            ) : periodo && (cargandoPeriodos || cargandoResumen || !evoluciones[razonSocial]) ? (
              <ResumenSkeleton />
            ) : periodo ? (
              <>
                <ResumenCards resumen={resumen} />
                {visible('dashboard.resultado-fiscal') && (
                  <ResultadoFiscalMensual
                    razonSocial={razonSocial}
                    meses={evoluciones[razonSocial]}
                    periodoSeleccionado={periodoSeleccionado}
                    onSeleccionarPeriodo={irAPeriodo}
                    onDeseleccionar={deseleccionarPeriodo}
                  />
                )}
              </>
            ) : null}

            {visible('dashboard.ventas-compras') && (
              periodo && cargandoResumen ? <VentasComprasSkeleton /> : <VentasCompras resumen={resumen} ventasCompras={ventasCompras} />
            )}

            {visible('dashboard.evolucion') && (
              Object.keys(evoluciones).length === 0 ? <EvolucionSkeleton /> : <EvolucionChart evoluciones={evoluciones} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
