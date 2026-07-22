# Módulo IVA — Tienda Full

Seguimiento de la posición de IVA de NT y Target (Diferencia y Saldo técnico), combinando:

- **Histórico** (Ene–May 2026 y en adelante): PDF F.2051 de ARCA, en `data/source/historico/{NT,Target}/`. Solo trae totales del mes, sin detalle por comprobante.
- **Mes en curso** (DDJJ todavía no presentada): Excel "Mis Comprobantes Emitidos/Recibidos" de ARCA, en `data/source/mes-en-curso/`. Trae el detalle día a día.

La app calcula la posición del mes en curso comprobante por comprobante y encadena el saldo técnico a partir del último período histórico conocido, hasta que se presente la DDJJ real (momento en el que ese mes pasa a ser "histórico" con el PDF).

## Fórmulas

- `Diferencia = IVA Ventas − IVA Compras`
- `Saldo técnico = Saldo anterior efectivo − Diferencia` (signo: positivo = a favor del contribuyente, negativo = a favor de ARCA). Verificado byte a byte contra los 10 PDF históricos reales.
- `Saldo anterior efectivo = max(Saldo técnico del mes anterior, 0)`: un saldo técnico anterior a favor de ARCA (negativo, a pagar) no se arrastra como crédito de un mes al siguiente — esa deuda se salda con la DDJJ de ese mes. Solo el saldo a favor del contribuyente (positivo) se traslada.

## Primer arranque

```bash
npm run install:all
npm run import:historico       # carga los PDF de data/source/historico
npm run import:mes-en-curso    # carga los Excel de data/source/mes-en-curso
npm run dev                    # backend en :4310, frontend en :5182
```

## Re-importar cuando lleguen archivos nuevos

- PDF nuevo de un mes ya presentado → colocarlo en `data/source/historico/{NT,Target}/` y correr `npm run import:historico` de nuevo (hace upsert por razón social + período), o subirlo desde la app.
- Excel actualizado del mes en curso → subirlo directamente desde la sección "Importar mes en curso" de la app (el nombre del archivo debe incluir "Emitidos" o "Recibidos").

## Pendiente para la próxima iteración

- Desglose habitual/accesoria (ventas) y mercadería/gastos operativos (compras) dentro del mes en curso, vía tabla de mapeo por CUIT/proveedor.
- Carga de "Mis Comprobantes" de Target (por ahora solo hay datos de NT en `data/source/mes-en-curso`).
