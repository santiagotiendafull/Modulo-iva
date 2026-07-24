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

// Los PDF no pueden ser un <a href> plano: necesitan el header Authorization, que un link no puede
// mandar. Se piden con fetch autenticado y se dispara la descarga con un blob.
async function descargarConAuth(path, nombreArchivo, opts) {
  const headers = { ...(opts?.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });
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
  // No usa req(): un 401 acá es "usuario o contraseña incorrectos", no una sesión vencida — no
  // corresponde disparar onUnauthorized (que es para cuando ya había una sesión y dejó de ser válida).
  login: async (username, password) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Error ${res.status}`);
    }
    return res.json();
  },
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

  previsualizarPendientesEstudio: (file) => {
    const form = new FormData();
    form.append('archivo', file);
    return req('/conciliacion/pendientes-estudio/preview', { method: 'POST', body: form });
  },
  importarPendientesEstudio: (file, hojas, razonSocial) => {
    const form = new FormData();
    form.append('archivo', file);
    form.append('hojas', JSON.stringify(hojas));
    form.append('razon_social', razonSocial);
    return req('/conciliacion/pendientes-estudio/importar', { method: 'POST', body: form });
  },
  pendientesEstudio: (razonSocial) => req(`/conciliacion/pendientes-estudio?razon_social=${razonSocial}`),
  marcarListoPendiente: (id, listo) => req(`/conciliacion/pendientes-estudio/${id}/listo`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listo }),
  }),
  historialPendientesEstudio: (razonSocial) => req(`/conciliacion/pendientes-estudio/historial?razon_social=${razonSocial}`),
  enviarPendientesEstudio: (razonSocial, ids) => descargarConAuth(
    '/conciliacion/pendientes-estudio/enviar',
    `envio-estudio-${razonSocial}.pdf`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ razon_social: razonSocial, ids }) }
  ),
  pdfProveedorPendientes: (razonSocial, cuit, nombreProveedor) => descargarConAuth(
    `/conciliacion/pendientes-estudio/pdf-proveedor?razon_social=${razonSocial}&cuit=${cuit}`,
    `comprobantes-pendientes-${nombreProveedor || cuit}.pdf`
  ),

  listarCreditoManual: () => req('/credito-fiscal-manual'),
  agregarCreditoManual: (razonSocial, periodo, monto, descripcion) => req('/credito-fiscal-manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ razon_social: razonSocial, periodo, monto, descripcion }),
  }),
  eliminarCreditoManual: (id) => req(`/credito-fiscal-manual/${id}`, { method: 'DELETE' }),
};
