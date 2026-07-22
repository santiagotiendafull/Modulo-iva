const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4310/api';

async function req(path, opts) {
  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

export const api = {
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
  urlFaltantesPdf: (razonSocial) => `${BASE_URL}/conciliacion/faltantes.pdf?razon_social=${razonSocial}`,
  obtenerPorcentaje931: () => req('/configuracion/porcentaje-931'),
  establecerPorcentaje931: (valor) => req('/configuracion/porcentaje-931', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ valor }),
  }),
};
