// Descarga los CSV de "Mis Comprobantes" (Emitidos y Recibidos) de NT y Target desde ARCA.
// Semi-automático: el script completa el CUIT y avanza, vos escribís la clave fiscal en el navegador
// y apretás "Ingresar"; desde ahí hace todo solo. La clave nunca pasa por el script.
//
// Uso:  npm run descargar                       -> mes en curso, NT y Target
//       npm run descargar -- --periodo=2026-09  -> septiembre 2026 (rango personalizado)
//       npm run descargar -- --razones=NT       -> sólo una razón social
//
// Los archivos quedan tal cual los entrega ARCA en salida/descargas/AAAA-MM/ (zip con un CSV
// adentro), que es justo lo que ya sabe leer mesEnCursoService.js.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAZONES = {
  NT: { cuit: '20244058001' }, // también es el usuario con el que se loguea
  Target: { cuit: '30709242497' },
};
const CUIT_LOGIN = RAZONES.NT.cuit;
const TIPOS = ['Emitidos', 'Recibidos'];

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')),
);
const hoy = new Date();
const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
const periodo = args.periodo || periodoActual;
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
  console.error('--periodo debe tener formato AAAA-MM (ej. 2026-09).');
  process.exit(1);
}
const razonesElegidas = (args.razones || Object.keys(RAZONES).join(',')).split(',').map((s) => s.trim());
for (const r of razonesElegidas) {
  if (!RAZONES[r]) {
    console.error(`Razón social desconocida: ${r}. Opciones: ${Object.keys(RAZONES).join(', ')}.`);
    process.exit(1);
  }
}

const [anio, mes] = periodo.split('-').map(Number);
const ultimoDia = new Date(anio, mes, 0).getDate();
const dd = (n) => String(n).padStart(2, '0');
const desde = `01/${dd(mes)}/${anio}`;
const hasta = `${dd(ultimoDia)}/${dd(mes)}/${anio}`;
const esMesActual = periodo === periodoActual;

const raiz = path.dirname(fileURLToPath(import.meta.url));
const carpetaDescargas = path.join(raiz, 'salida', 'descargas', periodo);
const carpetaErrores = path.join(raiz, 'salida', 'errores');
fs.mkdirSync(carpetaDescargas, { recursive: true });
fs.mkdirSync(carpetaErrores, { recursive: true });

const formatCuit = (c) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  await page.goto('https://auth.afip.gob.ar/contribuyente_/login.xhtml');
  await page.locator('[id="F1:username"]').fill(CUIT_LOGIN);
  await page.locator('[id="F1:btnSiguiente"]').click();
  console.log('CUIT cargado. Escribí tu clave fiscal en el navegador y apretá "Ingresar" (tenés 5 minutos).');
  await page.waitForURL(/portalcf\.cloud\.afip\.gob\.ar\/portal\/app/, { timeout: 5 * 60_000 });
}

// "Mis Comprobantes" se abre en una pestaña nueva o en la misma según el caso: se resuelven las dos.
async function abrirMisComprobantes(context, page) {
  const nueva = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null);
  const enlace = page.getByRole('link', { name: 'Mis Comprobantes', exact: true });
  if (await enlace.count()) await enlace.first().click();
  else await page.locator('a:has-text("Mis Comprobantes")').first().click();
  const mc = (await nueva) ?? page;
  await mc.waitForURL(/fes\.afip\.gob\.ar\/mcmp/, { timeout: 60_000 });
  await mc.waitForLoadState('load');
  return mc;
}

async function elegirPersona(mc, cuit) {
  if (!mc.url().includes('seleccionIngreso')) {
    await mc.locator('a[title="Cambiar persona representada"]').click();
    await mc.waitForURL(/seleccionIngreso/, { timeout: 30_000 });
  }
  // Con el CUIT propio (NT) el texto aparece también en la tarjeta de arriba y en el encabezado, que
  // no son la lista "Representar a": ahí `.first()` clickeaba algo que no hace nada. Los ítems de la
  // lista son enlaces con href="#" y quedan al final del documento, por eso `.last()`.
  await mc.locator(`a[href="#"]:has-text("${formatCuit(cuit)}")`).last().click();
  await mc.locator('#btnEmitidos').waitFor({ timeout: 30_000 });
}

async function fijarRango(mc) {
  const campo = mc.locator('#fechaEmision');
  await campo.click();
  if (esMesActual) {
    await mc.locator('.daterangepicker:visible li[data-range-key="Este Mes"]').click();
    return;
  }
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
    throw new Error(`El rango no quedó como se esperaba: "${valor}" (se pedía ${desde} - ${hasta}).`);
  }
}

async function descargarCsv(mc, razon, tipo) {
  await mc.locator(`#btn${tipo}`).click();
  await mc.locator('#fechaEmision').waitFor();
  await fijarRango(mc);
  console.log(`  ${razon} · ${tipo}: rango "${await mc.locator('#fechaEmision').inputValue()}"`);
  await mc.locator('#buscarComprobantes').click();

  const botonCsv = mc.locator('button[title="Exportar como CSV"]');
  try {
    await botonCsv.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    console.log(`  ${razon} · ${tipo}: no apareció el botón CSV (¿sin comprobantes en el período?). Se omite.`);
    return null;
  }
  const [descarga] = await Promise.all([
    mc.waitForEvent('download', { timeout: 120_000 }),
    botonCsv.click(),
  ]);
  const destino = path.join(carpetaDescargas, descarga.suggestedFilename());
  await descarga.saveAs(destino);
  console.log(`  ${razon} · ${tipo}: ${path.relative(raiz, destino)}`);

  // Tras bajar el archivo ARCA recarga sola; se vuelve al menú principal con la persona ya elegida.
  await pausa(2500);
  await mc.goto(new URL('menuPrincipal.do', mc.url()).href);
  await mc.locator('#btnEmitidos').waitFor({ timeout: 30_000 });
  return destino;
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: null, locale: 'es-AR', acceptDownloads: true });
const page = await context.newPage();
const bajados = [];

try {
  console.log(`Período: ${periodo} (${esMesActual ? 'mes en curso' : `${desde} - ${hasta}`}) · ${razonesElegidas.join(', ')}`);
  await login(page);
  const mc = await abrirMisComprobantes(context, page);
  for (const razon of razonesElegidas) {
    console.log(`\n${razon}:`);
    await elegirPersona(mc, RAZONES[razon].cuit);
    for (const tipo of TIPOS) {
      const archivo = await descargarCsv(mc, razon, tipo);
      if (archivo) bajados.push(archivo);
    }
  }
  console.log(`\nListo: ${bajados.length} archivo(s) en ${carpetaDescargas}`);
} catch (error) {
  console.error(`\nFalló: ${error.message}`);
  for (const [i, p] of context.pages().entries()) {
    const base = path.join(carpetaErrores, `${Date.now()}_pagina${i}`);
    await p.screenshot({ path: `${base}.png` }).catch(() => {});
    fs.writeFileSync(`${base}.html`, await p.content().catch(() => ''));
    console.error(`  Captura y HTML de la pestaña ${i} (${new URL(p.url()).origin}${new URL(p.url()).pathname}) en ${carpetaErrores}`);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
