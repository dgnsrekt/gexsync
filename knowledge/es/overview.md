---
type: Overview
title: Qué es GexSync
description: Una extensión de Chrome (Manifest V3) que sincroniza pestañas de trading de GEXbot por perfiles, tickers o replay histórico.
tags: [overview, gexbot, chrome-extension, mv3, español]
timestamp: 2026-08-05T00:00:00Z
---

# Qué es GexSync

GexSync es una extensión de Chrome (Manifest V3) para traders que mantienen varias pestañas
de [GEXbot](https://www.gexbot.com) abiertas a la vez. En lugar de hacer clic en el mismo
control en cada pestaña, eliges un modo de sincronización en el popup de GexSync y la
extensión refleja esa dimensión en todas tus pestañas abiertas de GEXbot.

Funciona solo en las páginas `state` y `classic` de GEXbot
(`https://www.gexbot.com/state*` y `https://www.gexbot.com/classic*`), no tiene dependencias
ni paso de compilación — los archivos fuente se cargan directamente en Chrome.

> *(English version: [overview.md](../overview.md).)*

## Los tres modos

Solo un modo sincroniza a la vez; cambias entre ellos desde el popup.

* **Profiles** — sincroniza los perfiles GEX y de opciones (p. ej. 90 días / latest / next)
  entre pestañas. Cada pestaña mantiene su propio ticker.
* **Ticker** — sincroniza el símbolo del ticker entre pestañas `state` y `classic` que
  comparten un grupo de color. Los perfiles quedan independientes por pestaña.
* **Replay** — reproducción histórica sincronizada. Una pestaña es la maestra y las demás la
  siguen, alineadas por hora del día, para comparar el mismo instrumento en distintas fechas
  o instrumentos distintos en la misma fecha.

Funciones transversales trabajan junto al modo activo: **sincronización de paneles**
(expandir/colapsar los paneles laterales juntos), **live zoom sync** (los gráficos del mismo
ticker se mantienen igualados en zoom en tiempo real y conservan su zoom durante la
actualización periódica de GEXbot; un par Save/Recall guarda y restaura tu layout de zoom), y
**Group Shot** (un clic en la cámara de un gráfico captura cada panel sincronizado en un solo
ZIP — una cuadrícula unida, las imágenes individuales y un manifiesto con la fecha/hora de los
datos de cada panel). Un único ajuste **Cross-page scope** decide si las pestañas `state` y
`classic` se tratan como un solo grupo o por separado.

## Los datos externos son opt-in y están apagados por defecto

Sincronizar tus pestañas no necesita red, y GexSync **no hace ninguna petición saliente**
hasta que actives deliberadamente uno de los **add-ons de datos** en la página *Data keys* del
popup: detalles de la empresa y líneas de precio del día anterior (que no hacen nada hasta que
guardes tu propia clave API gratuita), y un ranking de menciones de Reddit (sin clave — el
interruptor es la única puerta). Ver [data-addons](../data-addons.md) *(en inglés)* y
[safety](../safety.md) *(en inglés)*.

Ver la guía de la **[nueva función de TradingView](tradingview.md)**, e
[Instalación](install.md) para ponerlo en marcha.
