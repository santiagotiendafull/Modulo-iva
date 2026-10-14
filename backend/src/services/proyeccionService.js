// Escenarios guardados de "Proyección": solo se guardan y se consultan. Toda la cuenta del
// simulador (saldo mes a mes, cómo llegar al objetivo) se hace en el front — acá no se recalcula
// nada, se conserva tal cual lo que el usuario vio al guardar.
import { all, get, run } from '../db.js';

const RAZONES = ['NT', 'Target'];

function numero(v, campo) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`"${campo}" tiene que ser un número.`);
  return n;
}

function validarMes(m, i) {
  if (!m || !/^\d{4}-\d{2}$/.test(m.periodo || '')) throw new Error(`Mes ${i + 1}: período inválido (formato YYYY-MM).`);
  if (!['real', 'proyectado'].includes(m.tipo)) throw new Error(`Mes ${m.periodo}: tipo inválido.`);
  return {
    periodo: m.periodo,
    tipo: m.tipo,
    editado: !!m.editado,
    debito: numero(m.debito, `${m.periodo} débito`),
    credito: numero(m.credito, `${m.periodo} crédito`),
    saldo_anterior: numero(m.saldo_anterior, `${m.periodo} saldo anterior`),
    saldo: numero(m.saldo, `${m.periodo} saldo`),
  };
}

export async function listarEscenarios(razonSocial) {
  if (!RAZONES.includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  const filas = await all(
    'SELECT * FROM proyeccion_escenario WHERE razon_social = ? ORDER BY creado_en DESC, id DESC',
    [razonSocial]
  );
  return filas.map(({ datos, ...resto }) => ({ ...resto, ...JSON.parse(datos) }));
}

export async function guardarEscenario({ razonSocial, anio, nombre, objetivo, saldoFinal, neto, palanca, ivaPendiente, compraAdicional, creditoFijo, baseModo, ajustarAlObjetivo, meses }, usuario) {
  if (!RAZONES.includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  const anioNum = Number(anio);
  if (!Number.isInteger(anioNum) || anioNum < 2000 || anioNum > 2100) throw new Error('Año inválido.');
  const nombreLimpio = (nombre || '').trim();
  if (!nombreLimpio) throw new Error('Ponele un nombre al escenario.');
  if (nombreLimpio.length > 80) throw new Error('El nombre es demasiado largo (máximo 80 caracteres).');
  if (!Array.isArray(meses) || meses.length === 0 || meses.length > 12) throw new Error('Faltan los meses del escenario.');

  const objetivoNum = objetivo == null || objetivo === '' ? null : numero(objetivo, 'objetivo');
  if (!['debito', 'credito'].includes(palanca)) throw new Error('Palanca inválida (débito o crédito).');
  const pendienteNum = ivaPendiente == null || ivaPendiente === '' ? 0 : numero(ivaPendiente, 'IVA pendiente');
  if (pendienteNum < 0) throw new Error('El IVA pendiente no puede ser negativo.');
  const compraNum = compraAdicional == null || compraAdicional === '' ? 0 : numero(compraAdicional, 'compra adicional');
  if (compraNum < 0) throw new Error('La compra adicional no puede ser negativa.');
  const fijoNum = creditoFijo == null || creditoFijo === '' ? 0 : numero(creditoFijo, 'IVA Crédito Fiscal fijo');
  if (fijoNum < 0) throw new Error('El IVA Crédito Fiscal fijo no puede ser negativo.');

  // objetivo_tipo 'neto': el objetivo es la suma de los Saldos Resultantes del año (verde suma, rojo
  // resta), no el saldo de diciembre como en los primeros escenarios guardados (sin este campo).
  const datos = {
    objetivo_tipo: 'neto',
    neto: numero(neto, 'neto'),
    palanca,
    iva_pendiente: pendienteNum,
    compra_adicional: compraNum,
    credito_fijo: fijoNum,
    base_modo: String(baseModo || ''),
    ajustar_al_objetivo: !!ajustarAlObjetivo,
    meses: meses.map(validarMes),
  };

  const result = await run(
    `INSERT INTO proyeccion_escenario (razon_social, anio, nombre, objetivo, saldo_final, usuario, datos)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [razonSocial, anioNum, nombreLimpio, objetivoNum, numero(saldoFinal, 'saldo final'), usuario ?? null, JSON.stringify(datos)]
  );
  const fila = await get('SELECT * FROM proyeccion_escenario WHERE id = ?', [Number(result.lastInsertRowid)]);
  const { datos: crudos, ...resto } = fila;
  return { ...resto, ...JSON.parse(crudos) };
}

export async function eliminarEscenario(id) {
  await run('DELETE FROM proyeccion_escenario WHERE id = ?', [id]);
}
