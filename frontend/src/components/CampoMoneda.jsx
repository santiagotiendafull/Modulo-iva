import { useLayoutEffect, useRef } from 'react';
import { rawDesdeTexto, textoDesdeRaw, contarSignificativos, posicionTrasSignificativos, normalizarPegado } from '../moneda';

// Casilla de importe en pesos: muestra "$ 1.234.567,89" y se va reformateando mientras se escribe.
// `valor` es el valor crudo (string con punto decimal, ver moneda.js) y `onChange` recibe el nuevo
// valor crudo. El cursor se devuelve al mismo lugar después de reformatear, y Borrar/Suprimir saltan
// los puntos de miles en vez de quedarse trabados en ellos.
export default function CampoMoneda({ valor, onChange, className, ...resto }) {
  const ref = useRef(null);
  const cursor = useRef(null);
  const texto = textoDesdeRaw(valor);

  useLayoutEffect(() => {
    if (cursor.current != null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(cursor.current, cursor.current);
    }
    cursor.current = null;
  });

  function actualizar(textoNuevo, posicion) {
    const raw = rawDesdeTexto(textoNuevo);
    cursor.current = posicionTrasSignificativos(textoDesdeRaw(raw), contarSignificativos(textoNuevo, posicion));
    onChange(raw);
  }

  function alCambiar(e) {
    actualizar(e.target.value, e.target.selectionStart);
  }

  function alPegar(e) {
    e.preventDefault();
    const pegado = normalizarPegado(e.clipboardData.getData('text'));
    const el = e.target;
    const nuevo = el.value.slice(0, el.selectionStart) + pegado + el.value.slice(el.selectionEnd);
    actualizar(nuevo, el.selectionStart + pegado.length);
  }

  function alTeclear(e) {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    const el = e.target;
    if (el.selectionStart !== el.selectionEnd) return;
    const i = el.selectionStart;
    const caracter = e.key === 'Backspace' ? el.value[i - 1] : el.value[i];
    if (caracter === '.') {
      // Un punto de miles no se borra solo: se pasa por encima para que la próxima tecla borre el dígito.
      e.preventDefault();
      const destino = e.key === 'Backspace' ? i - 1 : i + 1;
      el.setSelectionRange(destino, destino);
    } else if (e.key === 'Backspace' && (caracter === ' ' || caracter === '$')) {
      e.preventDefault(); // el "$ " del principio no se toca
    }
  }

  return (
    <input
      {...resto}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={className}
      value={texto}
      onChange={alCambiar}
      onPaste={alPegar}
      onKeyDown={alTeclear}
    />
  );
}
