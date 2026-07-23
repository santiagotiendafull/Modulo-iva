export default function InfoTooltip({ texto }) {
  return (
    <span className="info-tooltip" tabIndex={0}>
      <span className="info-tooltip-icono" aria-hidden="true">i</span>
      <span className="info-tooltip-texto">{texto}</span>
    </span>
  );
}
