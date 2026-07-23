PRAGMA foreign_keys = ON;

-- Posiciones mensuales históricas, una fila por mes ya presentado ante ARCA (fuente: PDF F.2051).
-- saldo_tecnico_anterior y saldo_tecnico son signed: positivo = a favor del contribuyente, negativo = a favor de ARCA.
CREATE TABLE IF NOT EXISTS posiciones_historicas (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  razon_social                TEXT NOT NULL CHECK (razon_social IN ('NT', 'Target')),
  periodo                     TEXT NOT NULL, -- 'YYYY-MM'
  iva_ventas                  REAL NOT NULL, -- débito fiscal del período
  iva_compras                 REAL NOT NULL, -- crédito fiscal del período
  diferencia                  REAL NOT NULL, -- iva_ventas - iva_compras
  saldo_tecnico_anterior      REAL NOT NULL,
  saldo_tecnico               REAL NOT NULL,
  retenciones_percepciones    REAL NOT NULL DEFAULT 0,
  saldo_libre_disponibilidad  REAL NOT NULL DEFAULT 0,
  fecha_presentacion          TEXT,
  cuit                        TEXT,
  archivo_origen              TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (razon_social, periodo)
);

-- Comprobantes del mes en curso (DDJJ todavía no presentada), fuente: Mis Comprobantes Emitidos/Recibidos.
CREATE TABLE IF NOT EXISTS comprobantes (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  razon_social               TEXT NOT NULL CHECK (razon_social IN ('NT', 'Target')),
  tipo                       TEXT NOT NULL CHECK (tipo IN ('venta', 'compra')),
  periodo                    TEXT NOT NULL, -- 'YYYY-MM' derivado de fecha
  fecha                      TEXT NOT NULL, -- 'YYYY-MM-DD'
  tipo_comprobante           TEXT,
  pdv                        TEXT,
  numero_desde               TEXT,
  numero_hasta               TEXT,
  cuit_contraparte           TEXT,
  denominacion_contraparte   TEXT,
  neto_gravado               REAL NOT NULL DEFAULT 0,
  neto_no_gravado            REAL NOT NULL DEFAULT 0,
  op_exentas                 REAL NOT NULL DEFAULT 0,
  otros_tributos             REAL NOT NULL DEFAULT 0,
  iva                        REAL NOT NULL DEFAULT 0,
  total                      REAL NOT NULL DEFAULT 0,
  neto_gravado_105           REAL NOT NULL DEFAULT 0, -- desglose por alícuota
  iva_105                    REAL NOT NULL DEFAULT 0,
  neto_gravado_21            REAL NOT NULL DEFAULT 0,
  iva_21                     REAL NOT NULL DEFAULT 0,
  neto_gravado_27            REAL NOT NULL DEFAULT 0,
  iva_27                     REAL NOT NULL DEFAULT 0,
  categoria                  TEXT, -- reservado para el desglose habitual/accesoria (próxima iteración)
  archivo_origen              TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comprobantes_periodo ON comprobantes (razon_social, periodo, tipo);

-- Clasificación manual de proveedores (solo compras): si "no_corresponde", no se toma el crédito
-- fiscal de nada de lo que se le compró. Sin fila = proveedor todavía sin clasificar (nuevo).
-- Es global por CUIT: la validez de un proveedor no depende de a qué razón social le vendió.
CREATE TABLE IF NOT EXISTS proveedores (
  cuit          TEXT PRIMARY KEY,
  estado        TEXT NOT NULL CHECK (estado IN ('corresponde', 'no_corresponde')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Formulario 931 de ARCA. "Suma de Rem. 10" es la base imponible de un crédito fiscal adicional:
-- Suma de Rem. 10 × porcentaje configurable (ver tabla configuracion, clave "porcentaje_931") se
-- suma al IVA Compras del mismo período. El 931 de un mes recién está disponible cuando se paga
-- (habitualmente el día 10 del mes siguiente), así que el 931 del mes en curso normalmente todavía
-- no se puede cargar.
CREATE TABLE IF NOT EXISTS formulario_931 (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  razon_social    TEXT NOT NULL CHECK (razon_social IN ('NT', 'Target')),
  periodo         TEXT NOT NULL,
  suma_rem_10     REAL NOT NULL,
  cuit            TEXT,
  archivo_origen  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (razon_social, periodo)
);

-- Crédito fiscal manual: monto fijo por período para comprobantes que no aparecen en ARCA pero se
-- pueden tomar como crédito fiscal (ver posicionService.js, se suma al IVA Compras del período
-- igual que el crédito del Formulario 931). Se puede borrar cualquier entrada desde Cargar Datos.
CREATE TABLE IF NOT EXISTS credito_fiscal_manual (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  razon_social  TEXT NOT NULL CHECK (razon_social IN ('NT', 'Target')),
  periodo       TEXT NOT NULL,
  monto         REAL NOT NULL,
  descripcion   TEXT,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configuración editable de la app, clave-valor. Por ahora solo el porcentaje que se aplica a la
-- Suma de Rem. 10 del Formulario 931 para obtener el crédito fiscal adicional (ver formulario_931).
CREATE TABLE IF NOT EXISTS configuracion (
  clave   TEXT PRIMARY KEY,
  valor   TEXT NOT NULL
);

-- Cuentas de acceso a la app. 3 roles: gerente (solo Dashboard + Interna vs Externa),
-- administrador (todo lo operativo) y dev (todo + apartado de Configuración).
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('gerente', 'administrador', 'dev')),
  creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Historial de accesos (éxito y fracaso), visible para el rol dev en Configuración.
CREATE TABLE IF NOT EXISTS accesos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL,
  rol         TEXT,
  exito       INTEGER NOT NULL,
  fecha_hora  TEXT NOT NULL DEFAULT (datetime('now')),
  user_agent  TEXT
);

-- Conciliación: compras cargadas a mano desde el Excel de gestión interna (todavía no existe un
-- export automático desde el sistema propio), con las mismas claves para poder cruzar contra ARCA.
CREATE TABLE IF NOT EXISTS conciliacion_interna (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  razon_social              TEXT NOT NULL CHECK (razon_social IN ('NT', 'Target')),
  fecha                     TEXT,
  tipo_comprobante          TEXT,
  tipo_codigo               TEXT NOT NULL,
  pdv                       TEXT NOT NULL,
  numero                    TEXT NOT NULL,
  cuit_contraparte          TEXT NOT NULL,
  denominacion_contraparte  TEXT,
  total                     REAL NOT NULL DEFAULT 0,
  archivo_origen            TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (razon_social, cuit_contraparte, tipo_codigo, pdv, numero)
);

-- Comprobantes que el estudio contable todavía no tiene (nos manda un Excel acumulado del año cada
-- mes con lo que le falta). Cada carga nueva reemplaza por completo la lista de una razón social:
-- el estudio ya viene sacando de esa lista lo que le vamos mandando.
CREATE TABLE IF NOT EXISTS pendientes_estudio (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  razon_social              TEXT NOT NULL CHECK (razon_social IN ('NT', 'Target')),
  fecha                     TEXT,
  tipo_comprobante          TEXT,
  pdv                       TEXT,
  numero                    TEXT,
  cuit_contraparte          TEXT,
  denominacion_contraparte  TEXT,
  neto_gravado              REAL NOT NULL DEFAULT 0,
  iva                       REAL NOT NULL DEFAULT 0,
  total                     REAL NOT NULL DEFAULT 0,
  archivo_origen            TEXT,
  creado_en                 TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un envío = un PDF generado con un lote de comprobantes tildados para mandar al estudio.
CREATE TABLE IF NOT EXISTS envio_estudio (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  razon_social  TEXT NOT NULL CHECK (razon_social IN ('NT', 'Target')),
  usuario       TEXT,
  cantidad      INTEGER NOT NULL,
  fecha_hora    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Copia de los datos del comprobante al momento de enviarlo (no referencia pendientes_estudio.id):
-- así el historial no se rompe cuando una carga nueva reemplaza la lista de pendientes.
CREATE TABLE IF NOT EXISTS envio_estudio_item (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  envio_id                  INTEGER NOT NULL REFERENCES envio_estudio(id),
  fecha                     TEXT,
  tipo_comprobante          TEXT,
  pdv                       TEXT,
  numero                    TEXT,
  cuit_contraparte          TEXT,
  denominacion_contraparte  TEXT,
  neto_gravado              REAL NOT NULL DEFAULT 0,
  iva                       REAL NOT NULL DEFAULT 0,
  total                     REAL NOT NULL DEFAULT 0
);
