function Bloque({ h }) {
  return <div className="skeleton-block" style={{ height: h }} />;
}

export function ResumenSkeleton() {
  return (
    <>
      <Bloque h={26} />
      <div className="resumen-cards">
        <Bloque h={74} />
        <Bloque h={74} />
        <Bloque h={74} />
      </div>
      <div className="resumen-cards resumen-cards-saldo">
        <Bloque h={74} />
        <Bloque h={90} />
      </div>
      <Bloque h={320} />
    </>
  );
}

export function VentasComprasSkeleton() {
  return (
    <div className="ventas-compras">
      <Bloque h={220} />
      <Bloque h={220} />
    </div>
  );
}

export function EvolucionSkeleton() {
  return <Bloque h={260} />;
}
