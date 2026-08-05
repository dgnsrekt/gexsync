---
type: Guide
title: Niveles de GEXbot en TradingView
description: Cómo conectar GexSync con TradingView para que los niveles de gamma de GEXbot se dibujen en tu gráfico — obtener una clave API de GEXbot, activar el overlay y abrir un gráfico. Incluye histograma, alertas y paquetes.
tags: [tradingview, tv, overlay, gexbot-api-key, niveles, histograma, alertas, paquetes, configuracion, español]
timestamp: 2026-08-05T00:00:00Z
---

# Niveles de GEXbot en TradingView

Nuevo en **1.16**. Introduce tu clave API de GEXbot y cualquier pestaña abierta de
**`tradingview.com/chart`** cuyo símbolo sea un ticker de GEXbot mostrará los **niveles
mayores Classic + State** de GEXbot dibujados directamente sobre el gráfico — más un
**histograma GEX** opcional por strike y **clic en un nivel → alerta de precio**. Tres pasos.

> *(English version: [tradingview.md](../tradingview.md).)*

## Lo que necesitas

- **GexSync 1.16 o posterior** instalado ([Instalación](install.md)).
- **Una clave API de GEXbot.** La obtienes desde tu cuenta de GEXbot: **suscríbete a un plan**
  (nivel Classic o superior) y luego genera la clave en **Account → API Key** en
  [gexbot.com](https://www.gexbot.com). Referencia de la API: **<https://www.gexbot.com/apidocs>**.
  Tu **nivel** decide qué se desbloquea — los niveles son acumulativos:
  **Classic ⊂ State ⊂ Orderflow ⊂ Quant**.

## Configuración

### 1 · Pega tu clave de GEXbot

Abre el popup de GexSync → pestaña **Keys** → **GEXbot Data** → pega tu clave → **Save**.
Se guarda localmente, se enmascara al guardar y solo se envía a GEXbot.

![Pestaña Keys — pega tu clave API de GEXbot en GEXbot Data](../img/tv-1-keys.png)

### 2 · Activa el overlay

Al guardar una clave aparece una nueva pestaña **TV**. Ábrela, activa **Activate GEXbot data**
y elige el **nivel de API que tiene tu clave** (lo que esté por encima de tu nivel queda
desactivado, así nada da error).

![Pestaña TV — activa GEXbot data y elige tu nivel de API](../img/tv-2-tvtab.png)

### 3 · Abre un gráfico

Abre un **`tradingview.com/chart`** con un ticker de GEXbot (SPY, QQQ, SPX, …). Los niveles se
dibujan en el gráfico y aparece una **píldora de GexSync** abajo con una cuenta atrás de
actualización en vivo. Listo.

![Gráfico de TradingView con los niveles mayores de GEXbot + la píldora de GexSync](../img/tv-3-chart.png)

## Una vez activado

Todo lo de abajo vive en la pestaña **TV** (o como accesos rápidos en la píldora):

- **Niveles** — activa cada uno y elige su color; un interruptor maestro **Show lines**.
- **Histograma GEX** — barras del perfil por strike al costado (Classic / State).
- **Paquetes** — **Latest / Next / 90 días** (o haz clic en la píldora para ciclar).
- **Alertas** — **haz clic en un nivel para crear una alerta de precio en TradingView** (uno, o todos a la vez).
- **Opacidad** y **frecuencia de actualización** (1–60 s).

## Notas

- Solo se dibuja en páginas `tradingview.com/chart` cuyo símbolo sea un ticker de GEXbot.
- La clave nunca sale de tu máquina salvo para hablar con la API de GEXbot — ver [Seguridad](../safety.md) *(en inglés)*.
- La interfaz de la extensión está en inglés por ahora; un selector Español/English llegará en una versión próxima.
