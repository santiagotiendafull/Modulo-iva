const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4310/api';

let token = null;
export function setToken(t) { token = t; }

let onUnauthorized = null;
export function setOnUnauthorized(fn) { onUnauthorized = fn; }

async function req(path, opts) {
  const headers = { ...(opts?.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error('Sesión vencida, iniciá sesión de nuevo.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

// El PDF de faltantes no puede ser un <a href> plano: necesita el header Authorization, que un
// link no puede mandar. Se pide con fetch autenticado y se dispara la descarga con un blob.
async function descargarConAuth(path, nombreArchivo) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  login: (username, password) => req('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  me: () => req('/auth/me'),
  accesos: () => req('/auth/accesos'),
  usuarios: () => req('/auth/usuarios'),

  periodos: (razonSocial) => req(`/posiciones/periodos?razon_social=${razonSocial}`),
  resumen: (razonSocial, periodo) => req(`/posiciones/resumen?razon_social=${razonSocial}&periodo=${periodo}`),
  evolucion: (razonSocial) => req(`/posiciones/evolucion?razon_social=${razonSocial}`),
  ventasCompras: (razonSocial, periodo) => req(`/posiciones/ventas-compras?razon_social=${razonSocial}&periodo=${periodo}`),
  comparativa: (periodo) => req(`/posiciones/comparativa?periodo=${periodo}`),
  desgloseAlicuotas: (razonSocial, periodo, tipo) => req(`/posiciones/desglose-alicuotas?razon_social=${razonSocial}&periodo=${periodo}&tipo=${tipo}`),
  proveedores: () => req('/proveedores'),
  proveedoresExcluidas: () => req('/proveedores/excluidas'),
  establecerEstadoProveedor: (cuit, estado) => req(`/proveedores/${encodeURIComponent(cuit)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado }),
  }),
  importarMesEnCurso: (file, razonSocialManual) => {
    const form = new FormData();
    form.append('archivo', file);
    if (razonSocialManual) form.append('razon_social', razonSocialManual);
    return req('/importar/mes-en-curso', { method: 'POST', body: form });
  },
  previsualizarMesEnCurso: (file, razonSocialManual) => {
    const form = new FormData();
    form.append('archivo', file);
    if (razonSocialManual) form.append('razon_social', razonSocialManual);
    return req('/importar/mes-en-curso/preview', { method: 'POST', body: form });
  },
  importarHistorico: (file) => {
    const form = new FormData();
    form.append('archivo', file);
    return req('/importar/historico', { method: 'POST', body: form });
  },
  previsualizarHistorico: (file) => {
    const form = new FormData();
    form.append('archivo', file);
    return req('/importar/historico/preview', { method: 'POST', body: form });
  },
  historialCargas: () => req('/importar/historial'),
  importarFormulario931: (file) => {
    const form = new FormData();
    form.append('archivo', file);
    return req('/importar/931', { method: 'POST', body: form });
  },
  previsualizarFormulario931: (file) => {
    const form = new FormData();
    form.append('archivo', file);
    return req('/importar/931/preview', { method: 'POST', body: form });
  },
  conciliacionComprobantes: (razonSocial) => req(`/conciliacion/comprobantes?razon_social=${razonSocial}`),
  conciliacionInternaExterna: (razonSocial) => req(`/conciliacion/interna-externa?razon_social=${razonSocial}`),
  importarConciliacionInterna: (file, razonSocial) => {
    const form = new FormData();
    form.append('archivo', file);
    form.append('razon_social', razonSocial);
    return req('/conciliacion/interna', { method: 'POST', body: form });
  },
  borrarConciliacionInterna: (razonSocial) => req(`/conciliacion/interna?razon_social=${razonSocial}`, { method: 'DELETE' }),
  descargarFaltantesPdf: (razonSocial) => descargarConAuth(`/conciliacion/faltantes.pdf?razon_social=${razonSocial}`, `comprobantes-faltantes-${razonSocial}.pdf`),
  obtenerPorcentaje931: () => req('/configuracion/porcentaje-931'),
  establecerPorcentaje931: (valor) => req('/configuracion/porcentaje-931', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ valor }),
  }),
  obtenerVisibilidad: () => req('/configuracion/ui-visibilidad'),
  establecerVisibilidad: (valores) => req('/configuracion/ui-visibilidad', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(valores),
  }),
};
