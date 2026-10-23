// Prototipo de exploración de "Mis Comprobantes" (ARCA). Abre un Chromium visible, vos te logueás y
// navegás a mano hasta bajar el CSV/Excel; mientras tanto el script registra qué se clickea, qué
// páginas se visitan, qué requests se hacen y guarda el HTML de cada pantalla y los archivos
// descargados. Con eso se arma después la versión automática.
//
// Qué NO registra: ninguna tecla escrita ni valor de campo en el login (auth.afip.gob.ar), nunca el
// contenido de campos de contraseña, ni los query strings de las URLs (ARCA mete tokens ahí) — de
// las URLs sólo guarda los nombres de los parámetros.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const salida = path.join(raiz, 'salida');
const htmlDir = path.join(salida, 'html');
const descargasDir = path.join(salida, 'descargas');
fs.mkdirSync(htmlDir, { recursive: true });
fs.mkdirSync(descargasDir, { recursive: true });
const logPath = path.join(salida, 'eventos.jsonl');
fs.writeFileSync(logPath, '');

const MAX_SNAPSHOTS = 80;
let nSnapshot = 0;

function log(evento) {
  fs.appendFileSync(logPath, JSON.stringify({ t: new Date().toISOString(), ...evento }) + '\n');
}

// "https://x.afip.gob.ar/a/b?token=1&sign=2" -> "https://x.afip.gob.ar/a/b?token&sign"
function urlSinValores(url) {
  try {
    const u = new URL(url);
    const params = [...u.searchParams.keys()];
    return `${u.origin}${u.pathname}${params.length ? '?' + params.join('&') : ''}`;
  } catch {
    return url;
  }
}

// Corre dentro de cada página/frame. Sólo describe elementos; no manda teclas ni valores del login.
function instrumentar() {
  const enLogin = () => location.hostname === 'auth.afip.gob.ar';
  const corto = (s, n = 80) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const camino = (el) => {
    const partes = [];
    for (let n = el; n && n.nodeType === 1 && partes.length < 4; n = n.parentElement) {
      const id = n.id ? `#${n.id}` : '';
      const cls = !id && typeof n.className === 'string' && n.className.trim()
        ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
      partes.unshift(n.tagName.toLowerCase() + id + cls);
    }
    return partes.join(' > ');
  };
  const describir = (el) => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    name: el.getAttribute('name') || undefined,
    type: el.getAttribute('type') || undefined,
    role: el.getAttribute('role') || undefined,
    texto: corto(el.innerText || el.value || el.getAttribute('aria-label') || el.title),
    href: el.getAttribute('href') ? el.getAttribute('href').split('?')[0] : undefined,
    camino: camino(el),
  });
  const enviar = (d) => { try { window.__log(d); } catch { /* binding aún no disponible */ } };

  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const el = e.target.closest('a,button,input,select,label,li,[role=button],[role=tab],[role=menuitem]') || e.target;
    enviar({ tipo: 'click', url: location.origin + location.pathname, ...(enLogin() ? { tag: el.tagName.toLowerCase(), id: el.id || undefined } : describir(el)) });
  }, true);

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!(el instanceof Element) || enLogin() || el.getAttribute('type') === 'password') return;
    enviar({ tipo: 'cambio', url: location.origin + location.pathname, ...describir(el), valor: corto(el.value, 60) });
  }, true);
}

// HEADLESS=1 sólo para probar el script sin abrir ventana; en uso normal se ve el navegador.
const browser = await chromium.launch({ headless: process.env.HEADLESS === '1' });
const context = await browser.newContext({ viewport: null, locale: 'es-AR', acceptDownloads: true });

await context.exposeBinding('__log', async ({ page }, datos) => {
  log({ ...datos });
  if (datos.tipo === 'click') programarSnapshot(page, 'click');
});
await context.addInitScript(instrumentar);

const timers = new WeakMap();
function programarSnapshot(page, motivo) {
  clearTimeout(timers.get(page));
  timers.set(page, setTimeout(() => snapshot(page, motivo), 1500));
}

async function snapshot(page, motivo) {
  if (page.isClosed() || nSnapshot >= MAX_SNAPSHOTS) return;
  try {
    const html = await page.content();
    const nombre = `${String(++nSnapshot).padStart(2, '0')}_${motivo}.html`;
    fs.writeFileSync(path.join(htmlDir, nombre), html);
    log({ tipo: 'snapshot', archivo: nombre, url: urlSinValores(page.url()) });
  } catch { /* la página navegó mientras se leía */ }
}

function observar(page) {
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) log({ tipo: 'navegacion', url: urlSinValores(frame.url()) });
  });
  page.on('load', () => programarSnapshot(page, 'load'));
  page.on('response', (res) => {
    const req = res.request();
    if (!['document', 'xhr', 'fetch'].includes(req.resourceType())) return;
    log({ tipo: 'request', metodo: req.method(), recurso: req.resourceType(), status: res.status(), url: urlSinValores(res.url()) });
  });
  page.on('download', async (descarga) => {
    const destino = path.join(descargasDir, descarga.suggestedFilename());
    await descarga.saveAs(destino);
    log({ tipo: 'descarga', archivo: path.basename(destino), url: urlSinValores(descarga.url()) });
    console.log(`Descarga guardada: ${destino}`);
  });
}

context.on('page', observar); // incluye las pestañas nuevas que abre ARCA al entrar a un servicio
const page = await context.newPage();

await page.goto('https://auth.afip.gob.ar/contribuyente_/login.xhtml');
console.log('Navegador abierto. Logueate y recorré el camino hasta bajar el archivo de Mis Comprobantes.');
console.log('Cuando termines, cerrá la ventana del navegador.');
console.log(`Registro: ${logPath}`);

// Cerrar la ventana del navegador desconecta el browser y termina el script.
if (process.env.HEADLESS === '1') setTimeout(() => browser.close(), Number(process.env.AUTOCLOSE_MS || 8000));
await new Promise((resolve) => browser.on('disconnected', resolve));
console.log(`Listo. ${nSnapshot} pantallas guardadas en ${htmlDir}`);
