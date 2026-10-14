// Formato de pesos para casillas editables: "$ 1.234.567,89" mientras se escribe. Todo es puro (sin
// React) para poder probarlo aparte.
//
// El valor "crudo" que se guarda es un string con punto decimal ("1234567.89", "-50", "12.", ""), que
// es lo que entiende parseFloat; el texto que se ve usa punto de miles y coma decimal (es-AR). Al
// escribir, el punto SIEMPRE es separador de miles y la coma el decimal.

const MAX_DECIMALES = 2;

// Texto tipeado (con o sin formato) -> valor crudo.
export function rawDesdeTexto(texto) {
  const t = String(texto ?? '').replace(/[$\s]/g, '');
  const negativo = t.startsWith('-');
  const sinSigno = t.replace(/-/g, '');
  const iComa = sinSigno.indexOf(',');
  const tieneComa = iComa >= 0;
  const parteEntera = (tieneComa ? sinSigno.slice(0, iComa) : sinSigno).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const decimales = tieneComa ? sinSigno.slice(iComa + 1).replace(/\D/g, '').slice(0, MAX_DECIMALES) : '';

  if (parteEntera === '' && !tieneComa) return negativo ? '-' : '';
  return `${negativo ? '-' : ''}${parteEntera === '' ? '0' : parteEntera}${tieneComa ? `.${decimales}` : ''}`;
}

function conPuntosDeMiles(digitos) {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Valor crudo -> texto que se muestra en la casilla.
export function textoDesdeRaw(raw) {
  if (raw == null || raw === '') return '';
  const negativo = String(raw).startsWith('-');
  const sinSigno = String(raw).replace(/^-/, '');
  if (sinSigno === '') return '$ -';
  const [entera, decimales] = sinSigno.split('.');
  const hayDecimales = sinSigno.includes('.');
  return `$ ${negativo ? '-' : ''}${conPuntosDeMiles(entera)}${hayDecimales ? `,${decimales}` : ''}`;
}

// Número -> texto con siempre 2 decimales (para valores calculados que todavía nadie tocó).
export function textoDesdeNumero(n) {
  if (n == null || !Number.isFinite(n)) return '';
  return textoDesdeRaw(n.toFixed(MAX_DECIMALES));
}

const esSignificativo = (c) => /[\d,-]/.test(c);

// Cuántos caracteres "con significado" (dígitos, coma y signo) hay antes de la posición `hasta`.
// Sirve para devolver el cursor al mismo lugar después de reformatear el texto.
export function contarSignificativos(texto, hasta) {
  let n = 0;
  for (let i = 0; i < Math.min(hasta, texto.length); i++) if (esSignificativo(texto[i])) n++;
  return n;
}

// Posición del cursor justo después del carácter significativo número `cantidad` (0 = al comienzo del
// número, o sea después de "$ ").
export function posicionTrasSignificativos(texto, cantidad) {
  if (cantidad <= 0) {
    const primero = [...texto].findIndex(esSignificativo);
    return primero >= 0 ? primero : texto.length;
  }
  let n = 0;
  for (let i = 0; i < texto.length; i++) {
    if (esSignificativo(texto[i])) n++;
    if (n === cantidad) return i + 1;
  }
  return texto.length;
}

// Lo que se pega desde afuera: "172157221.73" (punto decimal, de otra planilla) se entiende como
// decimal; "172.157.221,73" ya viene en formato argentino y se deja igual.
export function normalizarPegado(texto) {
  const t = String(texto ?? '').trim();
  if (!t.includes(',') && /^-?\$?\s*\d+\.\d{1,2}$/.test(t)) return t.replace('.', ',');
  return t;
}
