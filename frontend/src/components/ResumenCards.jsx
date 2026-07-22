import { money, fechaLabel, esCierreDeMes } from '../format';

function badgeInfo(resumen) {
  const esHistorico = !resumen.origen?.includes('actual');
  if (esHistorico) return { texto: 'DDJJ', clase: 'historico' };

  if (!resumen.ultima_fecha) {
    return { texto: 'Mes en curso — todavía sin comprobantes cargados', clase: 'actual' };
  }
  if (esCierreDeMes(resumen.periodo, resumen.ultima_fecha)) {
    return { texto: 'Estimado — pendiente de DDJJ del Estudio Contable', clase: 'estimado' };
  }
  return { texto: `Hasta el día ${fechaLabel(resumen.ultima_fecha)} la posición del IVA es esta`, clase: 'actual' };
}

function etiquetaAlDia(resumen) {
  return resumen.ultima_fecha ? `al ${fechaLabel(resumen.ultima_fecha)}` : 'del período';
}

export default function ResumenCards({ resumen }) {
  if (!resumen) return null;
  const aFavor = resumen.saldo_tecnico >= 0;
  const badge = badgeInfo(resumen);
  const etiqueta = etiquetaAlDia(resumen);

  return (
    <div className="resumen">
      <div className="resumen-badge">
        <span className={`origen-pill origen-${badge.clase}`}>{badge.texto}</span>
        {resumen.fecha_presentacion && <span className="fecha-presentacion">Presentada el {resumen.fecha_presentacion}</span>}
      </div>
      <div className="resumen-cards">
        <div className="card">
          <div className="card-label">IVA Ventas {etiqueta}</div>
          <div className="card-value">{money(resumen.iva_ventas)}</div>
        </div>
        <div className="card">
          <div className="card-label">IVA Compras {etiqueta}</div>
          <div className="card-value">{money(resumen.iva_compras)}</div>
        </div>
        <div className="card">
          <div className="card-label">Diferencia del mes</div>
          <div className={`card-value ${resumen.diferencia >= 0 ? 'neg' : 'pos'}`}>{money(resumen.diferencia)}</div>
          <div className="card-hint">IVA Ventas − IVA Compras</div>
        </div>
      </div>
      <div className="resumen-cards resumen-cards-saldo">
        <div className="card">
          <div className="card-label">Saldo trasladado (mes anterior)</div>
          <div className="card-value">{money(resumen.saldo_tecnico_anterior)}</div>
        </div>
        <div className={`card card-highlight ${aFavor ? 'card-highlight-favor' : 'card-highlight-pagar'}`}>
          <div className="card-label">Saldo técnico resultante</div>
          <div className={`card-value big ${aFavor ? 'pos' : 'neg'}`}>{money(Math.abs(resumen.saldo_tecnico))}</div>
          <div className={`card-hint ${aFavor ? 'card-hint-favor' : 'card-hint-pagar'}`}>
            {aFavor ? 'A FAVOR DEL CONTRIBUYENTE' : 'A FAVOR DE ARCA — A PAGAR'}
          </div>
        </div>
      </div>
      {resumen.nota && <p className="nota">{resumen.nota}</p>}
    </div>
  );
}
