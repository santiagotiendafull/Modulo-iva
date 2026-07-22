// Caché simple en memoria (vive mientras la pestaña del navegador esté abierta). Evita
// volver a mostrar "Cargando…" cada vez que el usuario va y vuelve a una pantalla ya visitada:
// se muestra al instante lo último que se pidió, mientras en segundo plano se refresca.
const store = new Map();

export function cacheGet(key) {
  return store.get(key);
}

export function cacheSet(key, value) {
  store.set(key, value);
}

export function cacheClear(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
