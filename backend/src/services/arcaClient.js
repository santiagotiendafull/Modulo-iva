// Cliente de "Mis Comprobantes" (ARCA): maneja un Chromium sin ventana, entra con la clave fiscal que
// está en las variables de entorno y baja los CSV de Emitidos/Recibidos de una razón social. Es la
// versión de servidor de prototipos/arca/descargar.mjs (el flujo de pantallas es el mismo).
//
// La clave fiscal sólo se lee de process.env.ARCA_CLAVE y sólo se usa para llenar el campo de
// contraseña de ARCA: nunca se loguea, se guarda ni se manda al frontend.
import fs from 'node:fs';

export const RAZONES_ARCA = {
  NT: { cuit: '20244058001' },
  Target: { cuit: '30709242497' },
};
// NT es la persona física con la que se entra; Target es una persona representada de ese mismo login.
const CUIT_LOGIN = process.env.ARCA_CUIT_LOGIN || RAZONES_ARCA.NT.cuit;
const TIPOS = ['Emitidos', 'Recibidos'];

const formatCuit = (c) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
const dd = (n) => String(n).padStart(2, '0');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

export function arcaConfigurado() {
  return Boolean(process.env.ARCA_CLAVE);
}

// "Hoy" y el mes en curso según Argentina, no según el huso del servidor (Vercel corre en UTC: pasadas
// las 21hs del último día del mes ya sería "el mes siguiente").
function fechaArgentina() {
  const [y, m, d] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).split('-').map(Number);
  return { y, m, d };
}

export function periodoActualArgentina() {
  const { y, m } = fechaArgentina();
  return `${y}-${dd(m)}`;
}

// Rango dd/mm/aaaa del período. Para el mes en curso ARCA usa "Este Mes" (hasta hoy), así que
// no hace falta rango explícito.
function rangoDelPeriodo(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  return {
    desde: `01/${dd(mes)}/${anio}`,
    hasta: `${dd(new Date(anio, mes, 0).getDate())}/${dd(mes)}/${anio}`,
  };
}

async function lanzarNavegador() {
  // Import perezoso: este módulo lo carga el server entero (importar.js), y si el navegador no se
  // pudiera cargar en algún entorno, debe fallar sólo la carga desde ARCA y no toda la API.
  const { chromium } = await import('playwright-core');
  if (process.env.VERCEL) {
    // En Vercel no hay un Chromium instalado: @sparticuz/chromium trae uno recortado para serverless.
    const { default: sparticuz } = await import('@sparticuz/chromium');
    return chromium.launch({ args: sparticuz.args, executablePath: await sparticuz.executablePath(), headless: true });
  }
  return chromium.launch({ headless: true });
}

async function login(page) {
  await page.goto('https://auth.afip.gob.ar/contribuyente_/login.xhtml', { waitUntil: 'domcontentloaded' });
  await page.locator('[id="F1:username"]').fill(CUIT_LOGIN);
  await page.locator('[id="F1:btnSiguiente"]').click();
  await page.locator('[id="F1:password"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[id="F1:password"]').fill(process.env.ARCA_CLAVE);
  await page.locator('[id="F1:btnIngresar"]').click();

  const llegoAlPortal = page.waitForURL(/portalcf\.cloud\.afip\.gob\.ar\/portal\/app/, { timeout: 45_000 }).then(() => true);
  // ARCA responde con un mensaje en la misma pantalla si la clave o el CUIT están mal. No se reintenta:
  // varios intentos fallidos seguidos bloquean la clave fiscal.
  const rechazo = page.locator('[id="F1:msg"]').filter({ hasText: /\S/ }).waitFor({ state: 'visible', timeout: 45_000 })
    .then(async () => (await page.locator('[id="F1:msg"]').innerText()).trim());
  const resultado = await Promise.race([llegoAlPortal, rechazo.catch(() => new Promise(() => {}))]).catch(() => null);
  if (resultado === true) return;
  if (typeof resultado === 'string') throw new Error(`ARCA rechazó el ingreso: ${resultado}`);
  throw new Error('ARCA no llegó al portal después del login (¿pidió un paso extra, como un segundo factor?).');
}

async function abrirMisComprobantes(context, page) {
  const nueva = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null);
  const enlace = page.getByRole('link', { name: 'Mis Comprobantes', exact: true });
  if (await enlace.count()) await enlace.first().click();
  else await page.locator('a:has-text("Mis Comprobantes")').first().click();
  const mc = (await nueva) ?? page;
  await mc.waitForURL(/fes\.afip\.gob\.ar\/mcmp/, { timeout: 60_000 });
  await mc.waitForLoadState('domcontentloaded');
  return mc;
}

// Vuelve a la lista de personas con "Cambiar persona representada". Después de una descarga ARCA recarga
// la página sola; si eso pasa justo en este momento el click se pierde, por eso se reintenta una vez.
async function abrirListaDePersonas(mc, itemLista) {
  for (let intento = 1; intento <= 2; intento++) {
    await mc.locator('a[title="Cambiar persona representada"]').click();
    try {
      await itemLista.first().waitFor({ state: 'visible', timeout: intento === 1 ? 15_000 : 30_000 });
      return;
    } catch (err) {
      if (intento === 2) throw err;
    }
  }
}

// `primera`: es la primera razón social de la sesión (todavía no se eligió ninguna persona). Las
// siguientes se eligen en la misma sesión de ARCA, sin volver a ingresar.
async function elegirPersona(mc, cuit, { primera }) {
  // Con el CUIT propio el texto aparece también en la tarjeta de arriba y en el encabezado: los ítems
  // de la lista "Representar a" son los enlaces con href="#" que quedan al final del documento.
  const itemLista = mc.locator(`a[href="#"]:has-text("${formatCuit(cuit)}")`);

  if (primera) {
    // Al entrar, Mis Comprobantes pasa por pantallas intermedias antes de mostrar la lista de personas
    // (o el menú, si ya hay una persona elegida): se espera a lo primero que aparezca en vez de
    // decidir por la URL del momento, que puede ser la de una pantalla de paso.
    const aparecio = await Promise.race([
      itemLista.first().waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'lista'),
      mc.locator('#btnEmitidos').waitFor({ state: 'attached', timeout: 45_000 }).then(() => 'menu'),
    ]);
    if (aparecio === 'menu') await abrirListaDePersonas(mc, itemLista);
  } else {
    await abrirListaDePersonas(mc, itemLista);
  }
  await itemLista.last().click();
  // Con la persona elegida ARCA muestra el menú (Emitidos / Recibidos). No se espera a que esos botones
  // estén "visibles": tienen una animación de entrada que en el Chromium de servidor no siempre termina,
  // y de todos modos son enlaces comunes — bajarCsv va directo a la dirección de cada uno.
  await mc.waitForURL(/setearContribuyente|menuPrincipal/, { timeout: 30_000 });
}

// goto que tolera que ARCA le cambie la página justo en ese instante (su recarga automática posterior a
// una descarga): en ese caso se vuelve a pedir la dirección.
async function irA(mc, url) {
  try {
    await mc.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (err) {
    if (!/interrupted|ERR_ABORTED/i.test(String(err.message))) throw err;
    await mc.goto(url, { waitUntil: 'domcontentloaded' });
  }
}

function cronometro() {
  let desde = Date.now();
  const etapas = [];
  return {
    etapas,
    marcar(etapa) {
      const ahora = Date.now();
      etapas.push({ etapa, ms: ahora - desde });
      desde = ahora;
    },
  };
}

// Texto corto de lo que está en pantalla, para que un error diga dónde se trabó (sin datos sensibles:
// sólo la ruta de la página y el principio de su texto).
async function describirPantallas(context) {
  const partes = [];
  for (const p of context.pages()) {
    let ruta = p.url();
    try { const u = new URL(p.url()); ruta = `${u.hostname}${u.pathname}`; } catch { /* url no estándar */ }
    const texto = await p.locator('body').innerText({ timeout: 3_000 }).catch(() => '');
    // Estado de los elementos que el flujo necesita, para distinguir "no existe" de "existe pero oculto".
    const clave = await p.evaluate(() => ['#btnEmitidos', '#btnRecibidos', '#fechaEmision', '#buscarComprobantes'].map((s) => {
      const el = document.querySelector(s);
      if (!el) return `${s}:no existe`;
      const cs = getComputedStyle(el);
      return `${s}:opacity=${cs.opacity},visibility=${cs.visibility},display=${cs.display}`;
    }).join(' ')).catch(() => '');
    partes.push(`${ruta} — "${texto.replace(/\s+/g, ' ').trim().slice(0, 200)}"${clave ? ` {${clave}}` : ''}`);
  }
  return partes.join(' | ');
}

// Los errores de Playwright traen un "Call log" con códigos de color: se dejan sólo con la primera línea.
const mensajeLimpio = (err) => String(err.message).replace(/\u001b\[[0-9;]*m/g, '').split('Call log:')[0].trim();

async function fijarRango(mc, periodo, esMesActual) {
  const campo = mc.locator('#fechaEmision');
  await campo.click();
  if (esMesActual) {
    await mc.locator('.daterangepicker:visible li[data-range-key="Este Mes"]').click();
    return;
  }
  const { desde, hasta } = rangoDelPeriodo(periodo);
  const picker = mc.locator('.daterangepicker:visible');
  await picker.locator('li[data-range-key="Rango Personalizado"]').click();
  const inicio = picker.locator('input[name="daterangepicker_start"]');
  const fin = picker.locator('input[name="daterangepicker_end"]');
  await inicio.fill('');
  await inicio.pressSequentially(desde);
  await fin.fill('');
  await fin.pressSequentially(hasta);
  await picker.locator('.applyBtn').click();
  const valor = await campo.inputValue();
  if (!valor.includes(desde) || !valor.includes(hasta)) {
    throw new Error(`El rango de fechas no quedó como se esperaba: "${valor}" (se pedía ${desde} - ${hasta}).`);
  }
}

async function bajarCsv(mc, tipo, periodo, esMesActual) {
  // Equivale a clickear "Emitidos" / "Recibidos" en el menú (son enlaces a comprobantesEmitidos.do y
  // comprobantesRecibidos.do); la persona ya quedó elegida en la sesión de ARCA.
  await irA(mc, new URL(`comprobantes${tipo}.do`, mc.url()).href);
  await mc.locator('#fechaEmision').waitFor();
  await fijarRango(mc, periodo, esMesActual);
  await mc.locator('#buscarComprobantes').click();

  const botonCsv = mc.locator('button[title="Exportar como CSV"]');
  try {
    await botonCsv.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    return null; // ARCA no muestra el botón cuando no hay comprobantes en el período
  }
  const [descarga] = await Promise.all([mc.waitForEvent('download', { timeout: 120_000 }), botonCsv.click()]);
  const archivo = await descarga.path();
  // No hace falta esperar a la recarga que ARCA hace sola después de la descarga: el archivo ya está
  // completo y lo siguiente (otra pantalla o cambiar de persona) tolera esa recarga (ver irA y
  // abrirListaDePersonas).
  return { nombreArchivo: descarga.suggestedFilename(), buffer: fs.readFileSync(archivo) };
}

// El portal de ARCA embebe un video de YouTube con autoplay y carga publicidad y fuentes: nada de eso
// hace falta para bajar los CSV y, en un Chromium de servidor con poca memoria, pesa de más (una
// carga llegó a morir con "browser has been closed"). Se cortan las imágenes, los medios y esos hosts.
const HOSTS_INNECESARIOS = /youtube|ytimg|googlevideo|doubleclick|googleads|googlesyndication|google-analytics|googletagmanager|gstatic|jnn-pa\.googleapis/i;
async function bloquearInnecesario(context) {
  await context.route('**/*', (ruta) => {
    const req = ruta.request();
    if (['image', 'media', 'font'].includes(req.resourceType()) || HOSTS_INNECESARIOS.test(req.url())) return ruta.abort();
    return ruta.continue();
  });
}

const NAVEGADOR_CERRADO = /has been closed|Target closed|Browser closed|browser has been|crashed/i;

// Arma el error que se muestra: sin el "Call log" de Playwright, con el paso en que estaba y, si el
// navegador sigue vivo, qué había en pantalla. `navegadorCerrado` marca el caso en que murió el propio
// navegador (no ARCA), que es el único que justifica un reintento con uno nuevo.
async function construirError(err, browser, paso) {
  if (err.construido) return err;
  const pantallas = browser.isConnected() ? await describirPantallas(browser.contexts()[0]).catch(() => '') : '';
  const error = new Error(`${mensajeLimpio(err)} (paso: ${paso})${pantallas ? ` [Pantalla: ${pantallas}]` : ''}`);
  error.construido = true;
  error.navegadorCerrado = NAVEGADOR_CERRADO.test(String(err.message)) || !browser.isConnected();
  return error;
}

// Una sesión de ARCA: se abre el navegador, se ingresa UNA vez y se baja Emitidos y Recibidos de cada
// razón social en la misma sesión (cambiando de persona adentro de Mis Comprobantes).
async function sesionDeDescarga({ periodo, razones, esMesActual, avance }) {
  // `paso` queda en el mensaje de error: si el navegador muere de golpe no hay pantalla para describir.
  let paso = 'abriendo el navegador';
  const marcar = (texto) => { paso = texto; avance.paso(texto); };
  const sesion = cronometro();

  const browser = await lanzarNavegador();
  sesion.marcar('navegador');
  try {
    const context = await browser.newContext({ locale: 'es-AR', acceptDownloads: true, viewport: { width: 1366, height: 900 } });
    await bloquearInnecesario(context);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    marcar('ingresando a ARCA');
    await login(page);
    sesion.marcar('ingreso a ARCA');
    marcar('abriendo Mis Comprobantes');
    const mc = await abrirMisComprobantes(context, page);
    sesion.marcar('Mis Comprobantes');
    avance.sesion(sesion.etapas);

    for (const [i, { nombre, cuit }] of razones.entries()) {
      const crono = cronometro();
      avance.razonIniciada(nombre);
      try {
        marcar(`eligiendo ${nombre}`);
        await elegirPersona(mc, cuit, { primera: i === 0 });
        crono.marcar('elegir razón social');

        const descargas = [];
        for (const tipo of TIPOS) {
          marcar(`descargando ${tipo} de ${nombre}`);
          const r = await bajarCsv(mc, tipo, periodo, esMesActual);
          descargas.push(r ? { tipo: tipo.toLowerCase(), ...r } : { tipo: tipo.toLowerCase(), sinComprobantes: true });
          crono.marcar(tipo);
        }
        // Sin await: la carga en la base de esta razón social corre mientras se baja la siguiente.
        avance.razonTerminada({ razonSocial: nombre, descargas, tiempos: crono.etapas });
      } catch (err) {
        const error = await construirError(err, browser, paso);
        if (error.navegadorCerrado) throw error;
        // Un problema de una razón social (pantalla distinta, sin acceso) no frena a la siguiente.
        avance.razonTerminada({ razonSocial: nombre, error, tiempos: crono.etapas });
      }
    }
  } catch (err) {
    throw await construirError(err, browser, paso);
  } finally {
    await browser.close().catch(() => {});
  }
}

// Baja de ARCA los CSV de las razones sociales pedidas. No devuelve nada: va avisando por `avance`
//   paso(texto) · sesion(etapas) · razonIniciada(nombre) · razonTerminada({ razonSocial, descargas | error, tiempos })
// con el zip de cada tipo tal cual lo entrega ARCA ({ tipo, nombreArchivo, buffer } | { tipo, sinComprobantes }).
export async function descargarComprobantesArca({ periodo, razonesSociales, avance }) {
  if (!arcaConfigurado()) throw new Error('Falta configurar la clave fiscal de ARCA (variable de entorno ARCA_CLAVE).');
  const todas = razonesSociales.map((nombre) => {
    if (!RAZONES_ARCA[nombre]) throw new Error(`Razón social desconocida: ${nombre}`);
    return { nombre, cuit: RAZONES_ARCA[nombre].cuit };
  });
  const esMesActual = periodo === periodoActualArgentina();

  const terminadas = new Set();
  const seguimiento = { ...avance, razonTerminada: (r) => { terminadas.add(r.razonSocial); return avance.razonTerminada(r); } };
  const pendientes = () => todas.filter((r) => !terminadas.has(r.nombre));

  try {
    await sesionDeDescarga({ periodo, razones: pendientes(), esMesActual, avance: seguimiento });
  } catch (err) {
    // Si el que murió fue el navegador (no ARCA: un rechazo de clave o una pantalla distinta no entran
    // acá) se reintenta una sola vez con uno nuevo, sólo con las razones sociales que faltaban.
    if (!err.navegadorCerrado || pendientes().length === 0) throw err;
    avance.paso('reintentando');
    await pausa(3000);
    await sesionDeDescarga({ periodo, razones: pendientes(), esMesActual, avance: seguimiento });
  }
}
