---
type: Guide
title: Instalar GexSync
description: Carga la extensión sin empaquetar en Chrome desde un clon local, actualízala y resuelve problemas comunes.
tags: [install, chrome, load-unpacked, actualizar, español]
timestamp: 2026-08-05T00:00:00Z
---

# Instalar GexSync

GexSync no está en la Chrome Web Store, así que se instala como extensión "sin empaquetar"
directamente desde este repositorio. No hay paso de compilación — los archivos que descargas
son los que Chrome ejecuta.

> *(English version: [install.md](../install.md).)*

## Pasos

1. **Obtén los archivos.** Cualquiera de las dos:
   * clona con git: `git clone https://github.com/dgnsrekt/gexsync.git`, o
   * en la página de GitHub haz clic en el botón verde **Code** → **Download ZIP**, y
     descomprímelo en un lugar que vayas a conservar (no lo instales desde una carpeta
     temporal — si la borras, la extensión deja de funcionar).
2. Abre Chrome y ve a `chrome://extensions`.
3. Activa el **Modo de desarrollador** con el interruptor de la esquina superior derecha.
4. Haz clic en **Cargar descomprimida** (Load unpacked) y elige la carpeta `gexsync` — la que
   contiene `manifest.json`.
5. GexSync aparece en tu lista de extensiones y su icono en la barra. Abre una página de GEXbot
   (`https://www.gexbot.com/state` o `/classic`) y haz clic en el icono de GexSync para elegir
   un modo.

## Actualizar

Cuando llega una versión nueva:

1. Actualiza tu copia local — `git pull` en la carpeta, o descarga un ZIP nuevo y reemplaza los
   archivos.
2. Ve a `chrome://extensions` y haz clic en el icono de **recargar** (flecha circular) de la
   tarjeta de GexSync.
3. Recarga cualquier pestaña de GEXbot ya abierta para que tome los nuevos content scripts.

## Solución de problemas

* **El icono no hace nada / no hay sincronización.** GexSync solo se activa en páginas
  `https://www.gexbot.com/state*` y `/classic*`. En cualquier otro sitio está inactivo a propósito.
* **Recién instalado pero una pestaña de GEXbot abierta no sincroniza.** Recarga esa pestaña.
  Los content scripts solo se inyectan al cargar la página.
* **Tras una actualización, el comportamiento parece viejo.** Te saltaste el paso 2 o 3 — recarga
  la extensión y luego las pestañas de GEXbot.
* **"Cargar descomprimida" está en gris o no aparece.** El Modo de desarrollador no está activado (paso 3).

Ver [seguridad](../safety.md) *(en inglés)* para saber exactamente a qué puede acceder la
extensión, y la guía de **[niveles en TradingView](tradingview.md)** para la nueva función.
