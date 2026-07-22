import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import { money, periodoLabel } from '../format';

const COLOR_FAVOR = '#0ca30c';
const COLOR_PAGAR = '#d03b3b';

// Paleta categórica validada (dataviz skill): orden fijo, separación CVD chequeada.
const SERIES = [
  { key: 'NT', label: 'NT', color: '#2a78d6' },
  { key: 'Target', label: 'Target', color: '#e34948' },
  { key: 'Consolidado', label: 'Consolidado', color: '#008300' },
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-fecha">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-fila">
          <span className="chart-tooltip-linea" style={{ background: p.color }} />
          <span className="chart-tooltip-nombre">{p.dataKey}</span>
          <span className="chart-tooltip-valor">{p.value == null ? '—' : money(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function EvolucionChart({ evoluciones }) {
  const [ocultas, setOcultas] = useState(new Set());

  const periodos = [...new Set(Object.values(evoluciones).flat().map((e) => e.periodo))].sort();
  const data = periodos.map((periodo) => {
    const fila = { periodo, periodoLabel: periodoLabel(periodo) };
    for (const razon of Object.keys(evoluciones)) {
      const punto = evoluciones[razon].find((e) => e.periodo === periodo);
      fila[razon] = punto ? punto.saldo_tecnico : null;
    }
    return fila;
  });

  const series = useMemo(() => SERIES.filter((s) => evoluciones[s.key]), [evoluciones]);

  const valores = data.flatMap((d) => series.map((s) => d[s.key])).filter((v) => v != null);
  const maxValor = valores.length ? Math.max(0, ...valores) : 0;
  const minValor = valores.length ? Math.min(0, ...valores) : 0;
  // Un pequeño margen para que las zonas y sus etiquetas no queden pegadas al borde del gráfico.
  const margen = Math.max(maxValor - minValor, 1) * 0.08;

  function toggle(key) {
    setOcultas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const todasOcultas = series.length > 0 && series.every((s) => ocultas.has(s.key));

  return (
    <div className="evolucion">
      <div className="evolucion-header">
        <h3>Evolución del saldo técnico</h3>
        <div className="evolucion-leyenda">
          {series.map((s) => {
            const activa = !ocultas.has(s.key);
            return (
              <button
                key={s.key}
                className={`leyenda-item ${activa ? '' : 'apagada'}`}
                onClick={() => toggle(s.key)}
                style={{ '--serie-color': s.color }}
              >
                <span className="leyenda-linea" />
                {s.label}
              </button>
            );
          })}
          {ocultas.size > 0 && (
            <button className="leyenda-reset" onClick={() => setOcultas(new Set())}>
              {todasOcultas ? 'Mostrar todo' : 'Ver todo'}
            </button>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="periodoLabel" tick={{ fontSize: 12 }} stroke="var(--text)" tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="var(--text)"
            tickLine={false}
            axisLine={false}
            domain={[minValor - margen, maxValor + margen]}
            tickFormatter={(v) => new Intl.NumberFormat('es-AR', { notation: 'compact' }).format(v)}
          />
          <ReferenceArea
            y1={0}
            y2={maxValor + margen}
            ifOverflow="extendDomain"
            fill={COLOR_FAVOR}
            fillOpacity={0.06}
            label={{ value: 'Saldo a favor', position: 'insideTopLeft', fill: COLOR_FAVOR, fontSize: 12, fontWeight: 700 }}
          />
          <ReferenceArea
            y1={minValor - margen}
            y2={0}
            ifOverflow="extendDomain"
            fill={COLOR_PAGAR}
            fillOpacity={0.06}
            label={{ value: 'Saldo a pagar', position: 'insideBottomLeft', fill: COLOR_PAGAR, fontSize: 12, fontWeight: 700 }}
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
          <Tooltip content={<CustomTooltip />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
              hide={ocultas.has(s.key)}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
