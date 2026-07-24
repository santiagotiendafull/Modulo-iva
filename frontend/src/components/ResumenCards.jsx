import { money, fechaLabel, esCierreDeMes } from '../format';
import InfoTooltip from './InfoTooltip';

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
          <div className="card-label">
            IVA Ventas {etiqueta}
            <InfoTooltip texto="Suma el IVA de todas las ventas: Facturas A, B y C (el vendedor debe el débito fiscal aunque el comprobante no discrimine el IVA). Las Notas de Crédito restan." />
          </div>
          <div className="card-value">{money(resumen.iva_ventas)}</div>
        </div>
        <div className="card">
          <div className="card-label">
            IVA Compras {etiqueta}
            {resumen.credito_931_estimado > 0 && <span className="origen-pill-mini origen-estimado">931 estimado</span>}
            <InfoTooltip texto={
              resumen.credito_931_estimado > 0
                ? `Suma el IVA solo de Facturas A. Excluye proveedores 'No corresponde'. Incluye el crédito fiscal manual si hay cargado. Todavía no se cargó el Formulario 931 de este período: se está estimando con el crédito del mes anterior (${money(resumen.credito_931_estimado)}) hasta que se cargue el propio.`
                : "Suma el IVA solo de Facturas A (las únicas que toman crédito fiscal válido; B/C no cuentan). Excluye compras a proveedores marcados 'No corresponde'. Incluye el crédito fiscal del Formulario 931 y el crédito fiscal manual, si hay cargados."
            } />
          </div>
          <div className="card-value">{money(resumen.iva_compras)}</div>
        </div>
        <div className="card">
          <div className="card-label">
            Diferencia del mes
            <InfoTooltip texto="IVA Ventas menos IVA Compras de este período." />
          </div>
          <div className={`card-value ${resumen.diferencia >= 0 ? 'neg' : 'pos'}`}>{money(resumen.diferencia)}</div>
          <div className="card-hint">IVA Ventas − IVA Compras</div>
        </div>
      </div>
      <div className="resumen-cards resumen-cards-saldo">
        <div className="card">
          <div className="card-label">
            Saldo trasladado (mes anterior)
            <InfoTooltip texto="El saldo técnico (a favor o a pagar) que quedó al cierre del mes anterior." />
          </div>
          <div className="card-value">{money(resumen.saldo_tecnico_anterior)}</div>
        </div>
        <div className={`card card-highlight ${aFavor ? 'card-highlight-favor' : 'card-highlight-pagar'}`}>
          <div className="card-label">
            Saldo técnico resultante
            <InfoTooltip texto="Saldo trasladado del mes anterior más la diferencia de este mes: lo que queda a favor del contribuyente o a pagar a ARCA." />
          </div>
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
