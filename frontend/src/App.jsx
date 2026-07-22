import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import Selector from './components/Selector';
import ResumenCards from './components/ResumenCards';
import VentasCompras from './components/VentasCompras';
import EvolucionChart from './components/EvolucionChart';
import TablaComparativa from './components/TablaComparativa';
import ResultadoFiscalMensual from './components/ResultadoFiscalMensual';
import CargarDatos from './components/CargarDatos';
import Proveedores from './components/Proveedores';
import Conciliacion from './components/Conciliacion';
import Login, { estaAutenticado } from './components/Login';
import { ResumenSkeleton, VentasComprasSkeleton, EvolucionSkeleton } from './components/DashboardSkeleton';
import { cacheGet, cacheSet } from './cache';
import './App.css';

const keyPeriodos = (razonSocial) => `dashboard-periodos-${razonSocial}`;
const keyResumen = (razonSocial, periodo) => `dashboard-resumen-${razonSocial}-${periodo}`;
const keyVentasCompras = (razonSocial, periodo) => `dashboard-ventas-compras-${razonSocial}-${periodo}`;

export default function App() {
  const [autenticado, setAutenticado] = useState(estaAutenticado());
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

  const cargarEvoluciones = useCallback(async () => {
    const [nt, target, consolidado] = await Promise.all([
      api.evolucion('NT'),
      api.evolucion('Target'),
      api.evolucion('Consolidado'),
    ]);
    setEvoluciones({ NT: nt.evolucion, Target: target.evolucion, Consolidado: consolidado.evolucion });
    if (!vistaElegidaPorUsuario) {
      setVista(consolidado.evolucion.length === 0 ? 'cargar-datos' : 'dashboard');
    }
  }, [vistaElegidaPorUsuario]);

  const recargarTodo = useCallback(async () => {
    await cargarEvoluciones();
    const { periodos: nuevosPeriodos } = await api.periodos(razonSocial);
    setPeriodos(nuevosPeriodos);
    cacheSet(keyPeriodos(razonSocial), nuevosPeriodos);
    setPeriodo((actual) => (nuevosPeriodos.includes(actual) ? actual : nuevosPeriodos.at(-1) ?? null));
    setRefreshKey((k) => k + 1);
  }, [razonSocial, cargarEvoluciones]);

  useEffect(() => { cargarEvoluciones().catch((e) => setError(e.message)); }, [cargarEvoluciones]);

  useEffect(() => {
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
  }, [razonSocial]);

  useEffect(() => {
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
  }, [razonSocial, periodo, refreshKey]);

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

  if (!autenticado) {
    return <Login onIngresar={() => setAutenticado(true)} />;
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
            <button className={`nav-tab-standalone ${vista === 'cargar-datos' ? 'active' : ''}`} onClick={() => irA('cargar-datos')}>
              Cargar datos
            </button>
            <button className={`nav-tab-standalone ${vista === 'proveedores' ? 'active' : ''}`} onClick={() => irA('proveedores')}>
              Proveedores
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {vista === 'cargar-datos' ? (
          <CargarDatos onDatosActualizados={recargarTodo} />
        ) : vista === 'proveedores' ? (
          <Proveedores onCambio={recargarTodo} />
        ) : vista === 'conciliacion' ? (
          <Conciliacion />
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
                <ResultadoFiscalMensual
                  razonSocial={razonSocial}
                  meses={evoluciones[razonSocial]}
                  periodoSeleccionado={periodoSeleccionado}
                  onSeleccionarPeriodo={irAPeriodo}
                  onDeseleccionar={deseleccionarPeriodo}
                />
              </>
            ) : null}

            {periodo && cargandoResumen ? <VentasComprasSkeleton /> : <VentasCompras resumen={resumen} ventasCompras={ventasCompras} />}

            {Object.keys(evoluciones).length === 0 ? <EvolucionSkeleton /> : <EvolucionChart evoluciones={evoluciones} />}
          </>
        )}
      </main>
    </div>
  );
}
