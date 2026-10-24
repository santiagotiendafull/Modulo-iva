import { useEffect, useState } from 'react';
import { useInstalarApp } from '../pwa';

// Navegación para pantallas angostas: barra fija abajo con las vistas principales y un panel "Más"
// con el resto (cargar datos, proveedores, configuración), el usuario y el botón de instalar la app.
// En escritorio no se ve (el header de siempre se encarga) — se oculta desde CSS.

const ICONOS = {
  dashboard: <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" />,
  conciliacion: <path d="M7 7h11l-3-3M17 17H6l3 3M7 7v3M17 17v-3" />,
  proyeccion: <path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6" />,
  'cargar-datos': <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />,
  proveedores: <path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" />,
  configuracion: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3-2 1 .3 2-2 2-2-.7-1.3 1.7h-2L9.7 17l-2 .7-2-2 .3-2-2-1V11l2-1-.3-2 2-2 2 .7L10 5h2l1.3 1.7 2-.7 2 2-.3 2 2 1v2Z" />,
  mas: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
};

function Icono({ nombre }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[nombre]}
    </svg>
  );
}

export default function NavMovil({ vista, onIr, principales, secundarias, usuario, onSalir }) {
  const [abierto, setAbierto] = useState(false);
  const { instalada, puedeInstalar, instalar, mostrarPistaIOS } = useInstalarApp();
  const masActivo = secundarias.some((i) => i.id === vista);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  function ir(id) {
    setAbierto(false);
    onIr(id);
  }

  return (
    <>
      <nav className="nav-movil" aria-label="Navegación principal">
        {principales.map((item) => (
          <button key={item.id} type="button" className={`nav-movil-item ${vista === item.id ? 'active' : ''}`} onClick={() => ir(item.id)} aria-current={vista === item.id ? 'page' : undefined}>
            <Icono nombre={item.id} />
            <span>{item.etiquetaCorta ?? item.etiqueta}</span>
          </button>
        ))}
        <button type="button" className={`nav-movil-item ${masActivo || abierto ? 'active' : ''}`} onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-expanded={abierto}>
          <Icono nombre="mas" />
          <span>Más</span>
        </button>
      </nav>

      {abierto && (
        <div className="nav-movil-overlay" onClick={() => setAbierto(false)}>
          <div className="nav-movil-panel" role="dialog" aria-modal="true" aria-label="Más opciones" onClick={(e) => e.stopPropagation()}>
            <div className="nav-movil-panel-asa" aria-hidden="true" />
            {secundarias.map((item) => (
              <button key={item.id} type="button" className={`nav-movil-fila ${vista === item.id ? 'active' : ''}`} onClick={() => ir(item.id)}>
                <Icono nombre={item.id} />
                <span>{item.etiqueta}</span>
              </button>
            ))}
            {!instalada && puedeInstalar && (
              <button type="button" className="nav-movil-fila" onClick={() => { setAbierto(false); instalar(); }}>
                <Icono nombre="cargar-datos" />
                <span>Instalar la app</span>
              </button>
            )}
            {mostrarPistaIOS && (
              <p className="nav-movil-pista">Para instalarla: tocá Compartir y elegí «Agregar a inicio».</p>
            )}
            <div className="nav-movil-usuario">
              <span>{usuario}</span>
              <button type="button" className="btn-salir" onClick={() => { setAbierto(false); onSalir(); }}>Salir</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
