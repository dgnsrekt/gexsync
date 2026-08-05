// GexSync i18n — tiny, no-build, manual EN↔ES toggle. Shared by the popup and (later)
// the injected content scripts. Defined on `self` so it works in the popup window and in
// both the isolated and MAIN content-script worlds.
//
// Design: English is the text authored in popup.html; applyI18n() CACHES each element's
// original English on first run, so switching to `es` swaps in the table and switching back
// to `en` restores the cached original — English never lives in the table and can't regress.
// The table carries Spanish for static UI, plus BOTH languages for the handful of strings
// popup.js sets dynamically (routed through t()).
//
// Left in English on purpose (proper nouns / match the GEXbot chart): GEXbot, TradingView,
// Classic/State/Orderflow/Quant, the level names (Zero Gamma, Major ±Vol), package labels
// (Latest/Next/90 Days), time units (1s/5s…), MV3, DTE, PDO/PDH/PDL/PDC, ticker examples.
(function () {
  "use strict";
  const ES = {
    // ---- tabs ----
    "tab.keys": "Claves",
    "tab.watchlist": "Lista",
    // ---- Sync page ----
    "sync.global": "Ajustes globales",
    "sync.crossScope": "Alcance entre páginas",
    "opt.scope.all": "Todas las pestañas (state + classic juntas)",
    "opt.scope.page": "Por página (state / classic separadas)",
    "sync.crossScope.hint": "Trata state y classic como un solo grupo o dos — rige la sincronización de paneles y el zoom en vivo.",
    "sync.watermark": "Añadir perfil a la marca de agua",
    "sync.dte": "Mostrar días a vencimiento (DTE)",
    "sync.dte.hint": "Añade el DTE del perfil a la marca de agua (<b>latest/next</b> → p. ej. <b>3DTE</b>; <b>90d</b> → <b>(AGG)</b>). Cuenta desde la fecha de actualización del gráfico, así que sigue el replay. Requiere la marca de agua activada.",
    "sync.zoomSync": "Zoom sincronizado en vivo",
    "sync.zoomSync.hint": "Los gráficos del mismo ticker mantienen el zoom igualado a través de la actualización de GEXbot. ¿Atascado? Doble clic en un gráfico para reiniciar su zoom.",
    "sync.zoomLayout": "Diseño de zoom",
    "sync.zoomLayout.none": "Sin diseño guardado aún",
    "sync.groupShot": "Captura del grupo",
    "sync.groupShot.hint": "La cámara captura cada panel sincronizado → un solo ZIP (cuadrícula + paneles + un manifiesto con la hora de datos de cada panel). Apagado → el menú de captura única de GEXbot.",
    "sync.settingsNav": "Sincronizar navegación de ajustes",
    "sync.settingsNav.hint": "Abrir Ajustes y moverte entre Alerts, History y Home se refleja en las pestañas sincronizadas (sigue el Alcance entre páginas).",
    "sync.settingsSync": "Sincronizar ajustes del gráfico",
    "sync.settingsSync.hint": "Refleja <b>Chart Type</b>, <b>Profile Alignment</b> y <b>Time Zone</b> del panel de Ajustes entre pestañas (sigue el Alcance entre páginas). Como GEXbot solo los muestra con Ajustes abierto, sincroniza <b>solo cuando cada panel en alcance está abierto</b> — un recuadro de color marca el área sincronizada; si no, un aviso «N/M paneles abiertos» explica por qué espera.",
    "sync.secrets": "✨ Secretos",
    "sync.matrix": "Lluvia Matrix",
    "sync.matrix.hint": "Lluvia digital detrás de cada panel, teñida con el color del grupo, sembrada con el ticker de este panel y el léxico de GEXbot. Puramente cosmético.",
    "sync.mode": "Modo",
    "mode.profiles": "Perfiles",
    "sync.lockNote": "🔒 Sesión de replay activa — los ajustes están bloqueados. Cambia el Modo fuera de Replay (o pulsa Exit en la barra de replay) para terminarla.",
    "replay.track": "Seguimiento de reproducción",
    "opt.track.heartbeat": "Heartbeat — el maestro envía el tiempo (~2s), ajustado",
    "opt.track.onpause": "En pausa — resincroniza solo al pausar, tranquilo",
    "replay.debug": "Debug — mostrar rol maestro/cliente en la píldora",
    "sync.lang": "Idioma",
    // ---- Keys page ----
    "keys.buzz": "Reddit buzz",
    "meta.optin.nokey": "· opcional · sin clave",
    "keys.buzz.toggle": "Mostrar ranking de menciones de Reddit",
    "keys.buzz.hint": "Añade al panel de detalles de la píldora el ranking y el conteo de menciones de Reddit del ticker actual, más su posición entre los tickers que tienes abiertos, desde <b>apewisdom.io</b> — sin registro, sin clave. Cubre aprox. los 300 tickers más mencionados, actualizado cada hora; los símbolos más tranquilos aparecen sin ranking. Apagado por defecto.",
    "keys.massive": "Datos de Massive.com",
    "meta.optin": "· opcional",
    "keys.massive.hint": "Muestra los detalles de la empresa del ticker actual (nombre, capitalización, bolsa) en un pequeño panel del gráfico. Tu clave se guarda localmente y se enmascara al guardar — solo se envía a Massive, nunca a otro sitio.",
    "keys.freeKey": "<b>Clave gratis</b> — 5 llamadas/min, datos de fin de día, 2 años de histórico. Ambos add-ons de abajo funcionan. El replay más atrás de ~2 años no muestra niveles, y abrir varios tickers nuevos a la vez puede limitarse brevemente; reintenta solo.<br><b>Clave de pago</b> — llamadas ilimitadas, histórico más largo. Mismos add-ons, sin límites.",
    "keys.gexbot": "Datos de GEXbot",
    "keys.gexbot.hint": "Dibuja los niveles mayores Classic + State de GEXbot en tus gráficos de TradingView abiertos — ver la pestaña <b>TV</b>, que aparece al guardar una clave. Tu clave se guarda localmente y se enmascara al guardar; solo se envía a GEXbot, nunca a otro sitio.",
    "keys.pd": "Niveles del día anterior",
    "pd.open": "Apertura", "pd.high": "Máximo", "pd.low": "Mínimo", "pd.close": "Cierre",
    "pd.labelLeft": "Etiqueta izq.", "pd.center": "Centro", "pd.right": "Der.",
    "keys.pd.hint": "Dibuja líneas horizontales blancas en el gráfico en la Apertura/Máximo/Mínimo/Cierre del día de negociación anterior (etiquetadas PDO/PDH/PDL/PDC). Cada una independiente; apagadas por defecto. Usa la clave de Massive y sigue el replay. Solo acciones y ETFs.",
    // ---- Tools page ----
    "tools.colors": "Colores de herramientas",
    "tools.colors.hint": "Un color por modo, de la paleta de tu grupo. <b>Line</b> tiñe su retícula, la guía de precio y las líneas; <b>Draw</b> tiñe su retícula y tus trazos. Los dos no pueden ser iguales.",
    "tools.savedLines": "Líneas guardadas",
    "tools.savedLines.hint": "Líneas horizontales que has dibujado, agrupadas por ticker — una línea aparece en los gráficos de ese ticker. Suéltalas desde el menú contextual del gráfico en modo línea.",
    "btn.clearAllLines": "Borrar todas las líneas",
    "empty.lines": "Aún no hay líneas. Activa las herramientas desde la píldora y haz clic derecho en el gráfico para soltar una.",
    // ---- TV page ----
    "tv.levels": "Niveles de TradingView",
    "tv.activate": "Activar datos de GEXbot",
    "tv.activate.hint": "Interruptor maestro — en cualquier gráfico de <b>tradingview.com</b> cuyo símbolo sea un ticker de GEXbot, obtiene los datos y muestra la píldora de estado. Las <b>líneas</b> y el <b>histograma</b> de abajo tienen sus propios interruptores (también en la píldora). Apagado = nada corre.",
    "tv.apiTier": "Nivel de API",
    "tv.tier.hint": "Elige el nivel que tiene tu clave de GEXbot — las funciones por encima quedan desactivadas (para que nada dé 401). Los niveles son acumulativos (Classic ⊂ State ⊂ Orderflow ⊂ Quant).",
    "tv.showLines": "Mostrar líneas",
    "tv.showLines.hint": "Muestra/oculta todas las líneas de nivel sin perder tus interruptores y colores por línea de abajo. También el atajo <b>≡</b> en la píldora.",
    "tv.opacity": "Opacidad de línea y etiqueta",
    "tv.package": "Paquete",
    "tv.package.hint": "Qué vencimiento de GEXbot dibujar — una sola opción, aplicada a cada nivel de arriba (Latest = vencimiento más cercano, no siempre 0dte). La píldora muestra los días a vencimiento del paquete para Latest y Next; 90 Days abarca un rango, así que no muestra ninguno.",
    "tv.gexProfile": "Perfil GEX",
    "tv.showHist": "Mostrar histograma de strikes",
    "tv.hist.hint": "GEX neto por strike como un perfil anclado a la derecha (verde +, rojo −) con los puntos de lecturas recientes, para la fuente seleccionada en el paquete actual. Una fuente a la vez.",
    "tv.histOpacity": "Opacidad del histograma",
    "tv.updates": "Actualizaciones",
    "tv.src.poll": "Sondeo",
    "tv.src.live": "En vivo · pronto",
    "tv.src.hint": "El sondeo re-obtiene en las marcas de reloj de abajo. El streaming en vivo (WebSocket) llegará más adelante.",
    "tv.refresh": "Frecuencia de actualización",
    "tv.refresh.hint": "Cada cuánto sondear, alineado al reloj (p. ej. 5s → :00/:05/:10…, 30s → :00/:30). El anillo de la píldora cuenta hasta la siguiente marca. 1s/5s sondean fuerte — cuida los límites de GEXbot.",
    // ---- Watchlist page ----
    "wl.title": "Lista de seguimiento",
    "wl.hint": "Un clic en la píldora del gráfico cicla tu grupo en modo Ticker por estos. Requiere 2+ tickers.",
    "ph.wlInput": "Añadir ticker (ej. NVDA)",
    "btn.add": "Añadir",
    "empty.wl": "Aún no hay tickers — añade 2+ para habilitar el ciclado.",
    // ---- Current state ----
    "state.label": "Estado actual · pestañas",
    "state.counting": "contando…",
    // ---- shared button words ----
    "btn.save": "Guardar", "btn.clear": "Borrar",
    // ---- placeholders / titles ----
    "ph.massive": "Clave API de Massive (Polygon)",
    "ph.gexbot": "Clave API de GEXbot",
    "title.zoomSave": "Fotografía el zoom actual de cada ticker abierto",
    "title.zoomRecall": "Restaura el zoom guardado de cada ticker",
    "title.copyState": "Copia el estado completo (ajustes + pestañas) al portapapeles",
  };

  // Strings popup.js sets dynamically — need BOTH languages (routed through t()).
  const DYN = {
    en: {
      "dyn.zoomSave": "⭳ Save", "dyn.zoomRecall": "⭱ Recall",
      "dyn.zoomSaved": "Saved ✓", "dyn.zoomRecalled": "Recalled ✓", "dyn.zoomNoCharts": "no charts",
      "dyn.copy": "⧉ copy", "dyn.copied": "copied ✓",
      "dyn.savedPrefix": "🔒 Saved · ", "dyn.unlocked": "✨ unlocked",
      "dyn.noLayout": "No saved layout yet", "dyn.noTabs": "no gexbot tabs",
      // lines.js — on-chart tool menu + zoom-lock badge (GEXbot, MAIN world)
      "lines.zoomLocked": "zoom locked", "lines.drawScope": "draw · {scope}",
      "lines.scope.page": "page", "lines.scope.tab": "tab", "lines.scope.global": "global",
      "lines.line": "Line", "lines.draw": "Draw", "lines.copyPrice": "Copy price",
      "lines.tool": "Tool", "lines.freehand": "Freehand", "lines.arrow": "Arrow",
      "lines.scopeLabel": "Scope", "lines.undoLast": "Undo last",
      "lines.clearDrawings": "Clear {scope} drawings",
      "lines.removeLine": "Remove line", "lines.addLineHere": "Add line here",
      "lines.removeWatch": "Remove from watchlist", "lines.addWatch": "Add to watchlist",
      "lines.clearLines": "Clear lines", "lines.off": "Off",
      // content.js — settings-sync box/hint, zoom HUD, chip, toasts, info panel (GEXbot, isolated)
      "scope.all": "all your GEXbot tabs", "scope.state": "your /state tabs", "scope.classic": "your /classic tabs",
      "scope.allTabs": "All tabs", "scope.byPage": "By page",
      "box.synced": "⟳ GexSync synced",
      "box.syncTitle": "GexSync is syncing these settings across {scope} (Cross-page scope: {cross}). Turn off “Sync chart settings” in the GexSync popup to stop.",
      "hint.text": "GexSync settings sync · {open}/{total} panels open",
      "hint.title": "Settings sync waits until every {tab} has its Settings panel open. Open them all to sync; turn off “Sync chart settings” in the popup to disable.",
      "hint.tabAll": "GEXbot tab", "hint.tabState": "/state tab", "hint.tabClassic": "/classic tab",
      "mode.profiles": "Profiles", "mode.ticker": "Ticker", "mode.replay": "Replay",
      "hud.master": "master", "hud.setting": "setting…", "hud.syncedTo": "synced →", "hud.syncedFrom": "← synced",
      "toast.noCharts": "GexSync: no charts captured for the group shot.",
      "toast.rateLimit": "GexSync: GEXbot rate limit ({status}) on {path} — cool off on reloads.",
      "flash.syncing": "syncing {group}", "flash.to": "to {ticker}",
      "flash.spotToFut": "spot price → {label}", "flash.futToSpot": "{label} → spot price",
      "chip.toolsLine": "Chart tools: Line — reticle + locked chart; right-click for the tool menu (click → off)",
      "chip.toolsDraw": "Chart tools: Draw — left-drag to draw on the chart; right-click for the tool menu (click → off)",
      "chip.toolsOff": "Chart tools — click to turn on; right-click the chart to switch Line/Draw, copy a price, and add marks",
      "chip.modeCycle": "GexSync mode — click to cycle (Profiles / Ticker / Replay)",
      "chip.group": "Ticker group — click to cycle color; only same-color tabs sync",
      "chip.infoDetails": "Ticker details — hover to peek, click to pin open (Esc closes)",
      "chip.sourceFailing": "A data source is failing — open for the reason",
      "chip.prevTicker": "Previous ticker: {ticker}", "chip.nextTicker": "Next ticker: {ticker}",
      "chip.tabId": "tab id",
      "chip.lockedReplay": "Locked during replay session — Exit via the replay bar",
      "role.master": "MASTER", "role.client": "client",
      "mv.noKey": "No Massive.com key added yet. Open the GexSync popup, paste your key under <b>“Massive.com data,”</b> and details appear here.",
      "mv.badKey": "Massive.com didn’t accept this API key. Re-check it copied correctly and that your Massive plan is active, then save it again in the popup.",
      "mv.rateLimited": "Massive.com is briefly throttling requests (too many at once). This clears on its own in a minute — nothing to fix.",
      "mv.noData": "No company data for <b>{tk}</b>. Massive covers <b>stocks &amp; ETFs</b> (SPY, AAPL, QQQ…), not indexes like <b>SPX</b> or <b>VIX</b>. Nothing’s broken — there’s just nothing to show for this symbol.",
      "mv.notEntitled": "Your Massive plan won’t return daily bars for <b>{tk}</b> here. On the free plan that means either an index (bars cover <b>stocks &amp; ETFs</b> only) or a replay date more than about <b>2 years</b> back. Nothing’s broken — the rest of the panel still works.",
      "mv.networkError": "Couldn’t reach Massive.com — looks like a network/connection hiccup. It’ll retry.",
      "mv.default": "Massive.com couldn’t return data ({err}).",
      "mv.noProfile": "No chart profile",
      "mv.settingsTab": "This tab is on Settings/Alerts — click the home (⌂) icon in the panel to return to the chart.",
      "mv.mktCap": "{v} mkt cap", "mv.prevDay": "Prev day", "mv.vol": "vol",
      "mvs.throttled": "throttled, retrying", "mvs.notEntitled": "not on your plan — index, or past ~2 years",
      "mvs.keyRejected": "key rejected", "mvs.noKey": "no key saved",
      "mvs.network": "network hiccup, retrying", "mvs.nothing": "nothing for this symbol",
      "bz.notTop": "Reddit · not in today's top {of}", "bz.uni": "#{rank} most-discussed of your {of} open tickers",
      "bz.of": "of", "bz.mentions": "{n} mentions",
      // tv-overlay.js — GEX pill, alert toasts + level/alert titles (TradingView, MAIN world)
      "tv.ringTitle": "next GEX refresh — click to refresh now",
      "tv.errNetwork": "{verb}: network", "tv.errStatus": "{verb} ({status})",
      "tv.noChart": "no chart", "tv.noLevels": "no levels to add",
      "tv.alertSet": "✓ alert set: {label}", "tv.alertDeleted": "✓ alert deleted: {label}",
      "tv.alertsSynced": "alerts synced ({n})",
      "tv.alertsDeleted": "✓ {n} alert{s} deleted: {ticker}",
      "tv.alertsAddedPkg": "✓ {n} alerts added: {ticker} ({pkg})", "tv.alertsAdded": "✓ {n} alerts added: {ticker}",
      "tv.alertOnOther": "alert on {fr} — switch to {fr}, or click the bell to bulk-delete",
      "tv.resyncFailed": "resync failed", "tv.resyncFailedNet": "resync failed: network",
      "tv.vAlertFailed": "alert failed", "tv.vDeleteFailed": "delete failed",
      "tv.vBulkDelFailed": "bulk delete failed", "tv.vBulkAddFailed": "bulk add failed",
      "tv.titleAlertSet": "Alert set ({pkg}) — click the trash to delete: {name}",
      "tv.titleAlertOther": "Alert set on {fr} (not {pkg}) — switch to {fr} to delete it, or click the bell to bulk-delete",
      "tv.titleCreate": "Create TradingView price alert — {name}",
      "tv.bulkDel": "Delete all {n} GexSync alert{s} for {ticker}",
      "tv.bulkAdd": "Add alerts for all shown {ticker} levels ({pkg})",
      "tv.noGexData": "no GEX data", "tv.connected": "connected",
      "tv.pkgCycle": "Click to cycle package (latest → next → 90 Days)",
      "tv.resyncTitle": "Resync alerts from TradingView",
      "tv.toggleLines": "Show/hide GEX lines (keeps your settings)", "tv.toggleHist": "Show/hide strike histogram",
      "tv.histSrc": "Histogram source: {src} — click to switch",
      // replay.js — replay transport bar, review/exit modals, panel-lock blocker (GEXbot, isolated)
      "rp.blockerTitle": "Locked by GexSync for replay sync — Exit the replay bar to unlock",
      "rp.blockerHead": "Locked for replay sync",
      "rp.blockerBody": 'GexSync locked this panel so the tabs stay in sync. Hit <b style="color:#E7E9EA">Exit</b> in the replay bar to unlock.',
      "rp.revMaster": "★ master", "rp.revClient": "client",
      "rp.convWarn": "⛔ A highlighted tab uses an <b>es-future conversion</b> (⇒). GEXbot disables deep history for converted tickers (<b>FAQ&nbsp;#41</b>) — a replay load would pull the wrong data. Switch those tabs from <b>es future</b> back to <b>spot price</b>, then reopen this.",
      "rp.liveWarn": "⚠ A highlighted tab is on a <b>live date (today)</b> — replay needs past dates. During market hours it won't finish calibrating.",
      "rp.startTitle": "Start replay session?", "rp.startBody": "Review every tab — loading locks all of these until you Exit.",
      "rp.hRole": "role", "rp.hPage": "page", "rp.hTicker": "ticker", "rp.hProfile": "profile", "rp.hDate": "date",
      "rp.confirmLoad": "Confirm &amp; load",
      "rp.exitTitle": "Exit replay session?", "rp.exitBody": "Unlocks every tab and ends the session for everyone.", "rp.exitOk": "Exit replay",
      "rp.restMaster": "★ master", "rp.clientsJoined": "{n} client{s} joined", "rp.loadAll": "Load All", "rp.exit": "Exit",
      "rp.restClient": "● client", "rp.waitingMaster": "joined — waiting for master", "rp.leave": "Leave",
      "rp.beMaster": "Be master", "rp.beMasterHint": "set this tab's ticker &amp; profile first",
      "rp.joinClient": "Join as client", "rp.joinHint": "master ready — join to sync this tab",
      "rp.inProgress": "replay in progress", "rp.notJoined": "not joined — this tab stays live",
      "rp.syncing": "syncing…", "rp.calibrating": "calibrating tabs — please wait",
      "rp.tRestart": "Restart", "rp.tBack30": "30s back", "rp.tBack1": "1s back", "rp.tPlay": "Play / pause",
      "rp.tFwd1": "1s forward", "rp.tFwd30": "30s forward", "rp.tSpeed": "Speed", "rp.tScrub": "Scrub position", "rp.tTime": "Replay time",
      "rp.following": "following", "rp.takeControl": "Take control",
      "rp.anchorTitle": "GexSync replay", "rp.syncingOverlay": "Syncing replay…",
      "rp.calSub": "loading history + building time maps — please wait", "rp.cancel": "Cancel",
    },
    es: {
      "dyn.zoomSave": "⭳ Guardar", "dyn.zoomRecall": "⭱ Recuperar",
      "dyn.zoomSaved": "Guardado ✓", "dyn.zoomRecalled": "Recuperado ✓", "dyn.zoomNoCharts": "sin gráficos",
      "dyn.copy": "⧉ copiar", "dyn.copied": "copiado ✓",
      "dyn.savedPrefix": "🔒 Guardado · ", "dyn.unlocked": "✨ desbloqueado",
      "dyn.noLayout": "Sin diseño guardado aún", "dyn.noTabs": "sin pestañas de gexbot",
      // lines.js — on-chart tool menu + zoom-lock badge (GEXbot, MAIN world)
      "lines.zoomLocked": "zoom bloqueado", "lines.drawScope": "dibujo · {scope}",
      "lines.scope.page": "página", "lines.scope.tab": "pestaña", "lines.scope.global": "global",
      "lines.line": "Línea", "lines.draw": "Dibujo", "lines.copyPrice": "Copiar precio",
      "lines.tool": "Herram.", "lines.freehand": "Libre", "lines.arrow": "Flecha",
      "lines.scopeLabel": "Alcance", "lines.undoLast": "Deshacer",
      "lines.clearDrawings": "Borrar dibujos ({scope})",
      "lines.removeLine": "Quitar línea", "lines.addLineHere": "Añadir línea aquí",
      "lines.removeWatch": "Quitar de la lista", "lines.addWatch": "Añadir a la lista",
      "lines.clearLines": "Borrar líneas", "lines.off": "Apagar",
      // content.js — settings-sync box/hint, zoom HUD, chip, toasts, info panel (GEXbot, isolated)
      "scope.all": "todas tus pestañas de GEXbot", "scope.state": "tus pestañas /state", "scope.classic": "tus pestañas /classic",
      "scope.allTabs": "Todas las pestañas", "scope.byPage": "Por página",
      "box.synced": "⟳ GexSync sincronizado",
      "box.syncTitle": "GexSync está sincronizando estos ajustes en {scope} (Alcance entre páginas: {cross}). Desactiva “Sincronizar ajustes del gráfico” en el popup de GexSync para detenerlo.",
      "hint.text": "Sincr. de ajustes de GexSync · {open}/{total} paneles abiertos",
      "hint.title": "La sincronización de ajustes espera a que cada {tab} tenga su panel de Ajustes abierto. Ábrelos todos para sincronizar; desactiva “Sincronizar ajustes del gráfico” en el popup para deshabilitar.",
      "hint.tabAll": "pestaña de GEXbot", "hint.tabState": "pestaña /state", "hint.tabClassic": "pestaña /classic",
      "mode.profiles": "Perfiles", "mode.ticker": "Ticker", "mode.replay": "Repetición",
      "hud.master": "maestro", "hud.setting": "ajustando…", "hud.syncedTo": "sincronizado →", "hud.syncedFrom": "← sincronizado",
      "toast.noCharts": "GexSync: no se capturaron gráficos para la foto grupal.",
      "toast.rateLimit": "GexSync: límite de peticiones de GEXbot ({status}) en {path} — reduce las recargas.",
      "flash.syncing": "sincronizando {group}", "flash.to": "a {ticker}",
      "flash.spotToFut": "precio spot → {label}", "flash.futToSpot": "{label} → precio spot",
      "chip.toolsLine": "Herramientas del gráfico: Línea — retícula + gráfico bloqueado; clic derecho para el menú (clic → apagar)",
      "chip.toolsDraw": "Herramientas del gráfico: Dibujo — arrastra con el botón izquierdo para dibujar; clic derecho para el menú (clic → apagar)",
      "chip.toolsOff": "Herramientas del gráfico — clic para activar; clic derecho en el gráfico para cambiar Línea/Dibujo, copiar un precio y añadir marcas",
      "chip.modeCycle": "Modo GexSync — clic para alternar (Perfiles / Ticker / Repetición)",
      "chip.group": "Grupo de ticker — clic para cambiar de color; solo se sincronizan las pestañas del mismo color",
      "chip.infoDetails": "Detalles del ticker — pasa el cursor para ver, clic para fijar (Esc cierra)",
      "chip.sourceFailing": "Una fuente de datos está fallando — ábrelo para ver el motivo",
      "chip.prevTicker": "Ticker anterior: {ticker}", "chip.nextTicker": "Ticker siguiente: {ticker}",
      "chip.tabId": "id de pestaña",
      "chip.lockedReplay": "Bloqueado durante la sesión de repetición — Sal desde la barra de repetición",
      "role.master": "MAESTRO", "role.client": "cliente",
      "mv.noKey": "Aún no has añadido una clave de Massive.com. Abre el popup de GexSync, pega tu clave en <b>“Datos de Massive.com”</b> y los detalles aparecerán aquí.",
      "mv.badKey": "Massive.com no aceptó esta clave de API. Verifica que se copió correctamente y que tu plan de Massive está activo, luego guárdala de nuevo en el popup.",
      "mv.rateLimited": "Massive.com está limitando las peticiones brevemente (demasiadas a la vez). Se resuelve solo en un minuto — nada que arreglar.",
      "mv.noData": "Sin datos de la empresa para <b>{tk}</b>. Massive cubre <b>acciones y ETFs</b> (SPY, AAPL, QQQ…), no índices como <b>SPX</b> o <b>VIX</b>. No hay ningún error — simplemente no hay nada que mostrar para este símbolo.",
      "mv.notEntitled": "Tu plan de Massive no devuelve barras diarias para <b>{tk}</b> aquí. En el plan gratuito eso significa o un índice (las barras solo cubren <b>acciones y ETFs</b>) o una fecha de repetición de hace más de unos <b>2 años</b>. No hay ningún error — el resto del panel sigue funcionando.",
      "mv.networkError": "No se pudo conectar con Massive.com — parece un fallo de red/conexión. Se reintentará.",
      "mv.default": "Massive.com no pudo devolver datos ({err}).",
      "mv.noProfile": "Sin perfil de gráfico",
      "mv.settingsTab": "Esta pestaña está en Ajustes/Alertas — haz clic en el icono de inicio (⌂) del panel para volver al gráfico.",
      "mv.mktCap": "{v} cap. de mercado", "mv.prevDay": "Día previo", "mv.vol": "vol",
      "mvs.throttled": "limitado, reintentando", "mvs.notEntitled": "no incluido en tu plan — índice, o hace más de ~2 años",
      "mvs.keyRejected": "clave rechazada", "mvs.noKey": "sin clave guardada",
      "mvs.network": "fallo de red, reintentando", "mvs.nothing": "nada para este símbolo",
      "bz.notTop": "Reddit · fuera del top {of} de hoy", "bz.uni": "#{rank} más comentado de tus {of} tickers abiertos",
      "bz.of": "de", "bz.mentions": "{n} menciones",
      // tv-overlay.js — GEX pill, alert toasts + level/alert titles (TradingView, MAIN world)
      "tv.ringTitle": "próxima actualización de GEX — clic para actualizar ahora",
      "tv.errNetwork": "{verb}: red", "tv.errStatus": "{verb} ({status})",
      "tv.noChart": "sin gráfico", "tv.noLevels": "sin niveles que añadir",
      "tv.alertSet": "✓ alerta creada: {label}", "tv.alertDeleted": "✓ alerta eliminada: {label}",
      "tv.alertsSynced": "alertas sincronizadas ({n})",
      "tv.alertsDeleted": "✓ {n} alerta{s} eliminada{s}: {ticker}",
      "tv.alertsAddedPkg": "✓ {n} alertas añadidas: {ticker} ({pkg})", "tv.alertsAdded": "✓ {n} alertas añadidas: {ticker}",
      "tv.alertOnOther": "alerta en {fr} — cambia a {fr}, o haz clic en la campana para eliminarlas todas",
      "tv.resyncFailed": "falló la resincronización", "tv.resyncFailedNet": "falló la resincronización: red",
      "tv.vAlertFailed": "falló la alerta", "tv.vDeleteFailed": "falló la eliminación",
      "tv.vBulkDelFailed": "falló la eliminación masiva", "tv.vBulkAddFailed": "falló la adición masiva",
      "tv.titleAlertSet": "Alerta creada ({pkg}) — clic en la papelera para eliminar: {name}",
      "tv.titleAlertOther": "Alerta creada en {fr} (no {pkg}) — cambia a {fr} para eliminarla, o haz clic en la campana para eliminarlas todas",
      "tv.titleCreate": "Crear alerta de precio de TradingView — {name}",
      "tv.bulkDel": "Eliminar las {n} alerta{s} de GexSync para {ticker}",
      "tv.bulkAdd": "Añadir alertas para todos los niveles mostrados de {ticker} ({pkg})",
      "tv.noGexData": "sin datos GEX", "tv.connected": "conectado",
      "tv.pkgCycle": "Clic para alternar el paquete (latest → next → 90 Days)",
      "tv.resyncTitle": "Resincronizar alertas desde TradingView",
      "tv.toggleLines": "Mostrar/ocultar líneas GEX (conserva tus ajustes)", "tv.toggleHist": "Mostrar/ocultar histograma de strikes",
      "tv.histSrc": "Fuente del histograma: {src} — clic para cambiar",
      // replay.js — replay transport bar, review/exit modals, panel-lock blocker (GEXbot, isolated)
      "rp.blockerTitle": "Bloqueado por GexSync para la sincronización de repetición — Sal de la barra de repetición para desbloquear",
      "rp.blockerHead": "Bloqueado para la sincronización de repetición",
      "rp.blockerBody": 'GexSync bloqueó este panel para que las pestañas sigan sincronizadas. Pulsa <b style="color:#E7E9EA">Salir</b> en la barra de repetición para desbloquear.',
      "rp.revMaster": "★ maestro", "rp.revClient": "cliente",
      "rp.convWarn": "⛔ Una pestaña resaltada usa una <b>conversión es-future</b> (⇒). GEXbot desactiva el historial profundo para los tickers convertidos (<b>FAQ&nbsp;#41</b>) — una carga de repetición traería datos incorrectos. Cambia esas pestañas de <b>es future</b> de vuelta a <b>spot price</b>, luego reabre esto.",
      "rp.liveWarn": "⚠ Una pestaña resaltada está en una <b>fecha en vivo (hoy)</b> — la repetición necesita fechas pasadas. Durante el horario de mercado no terminará de calibrar.",
      "rp.startTitle": "¿Iniciar sesión de repetición?", "rp.startBody": "Revisa cada pestaña — la carga bloquea todas estas hasta que salgas.",
      "rp.hRole": "rol", "rp.hPage": "página", "rp.hTicker": "ticker", "rp.hProfile": "perfil", "rp.hDate": "fecha",
      "rp.confirmLoad": "Confirmar y cargar",
      "rp.exitTitle": "¿Salir de la sesión de repetición?", "rp.exitBody": "Desbloquea cada pestaña y termina la sesión para todos.", "rp.exitOk": "Salir de la repetición",
      "rp.restMaster": "★ maestro", "rp.clientsJoined": "{n} cliente{s} conectado{s}", "rp.loadAll": "Cargar todo", "rp.exit": "Salir",
      "rp.restClient": "● cliente", "rp.waitingMaster": "conectado — esperando al maestro", "rp.leave": "Abandonar",
      "rp.beMaster": "Ser maestro", "rp.beMasterHint": "configura primero el ticker y el perfil de esta pestaña",
      "rp.joinClient": "Unirse como cliente", "rp.joinHint": "maestro listo — únete para sincronizar esta pestaña",
      "rp.inProgress": "repetición en curso", "rp.notJoined": "no unido — esta pestaña sigue en vivo",
      "rp.syncing": "sincronizando…", "rp.calibrating": "calibrando pestañas — espera por favor",
      "rp.tRestart": "Reiniciar", "rp.tBack30": "30s atrás", "rp.tBack1": "1s atrás", "rp.tPlay": "Reproducir / pausar",
      "rp.tFwd1": "1s adelante", "rp.tFwd30": "30s adelante", "rp.tSpeed": "Velocidad", "rp.tScrub": "Posición", "rp.tTime": "Tiempo de repetición",
      "rp.following": "siguiendo", "rp.takeControl": "Tomar el control",
      "rp.anchorTitle": "Repetición de GexSync", "rp.syncingOverlay": "Sincronizando repetición…",
      "rp.calSub": "cargando historial + construyendo mapas de tiempo — espera por favor", "rp.cancel": "Cancelar",
    },
  };

  function t(key, lang) {
    return (DYN[lang] && DYN[lang][key]) || (ES[key] && lang === "es" ? ES[key] : null) || DYN.en[key] || key;
  }

  // Interpolating variant for the injected UI: t() with {placeholder} substitution.
  // e.g. ti("flash.syncing", {group:"green", ticker:"NVDA"}, "es").
  function ti(key, vals, lang) {
    return String(t(key, lang)).replace(/\{(\w+)\}/g, (m, k) => (vals && k in vals ? vals[k] : m));
  }

  // Apply to a DOM subtree. Caches English on first pass; `es` swaps in the table,
  // any other lang restores the cached original.
  function applyI18n(root, lang) {
    const es = lang === "es";
    const attrs = [
      ["data-i18n", "textContent", ES],
      ["data-i18n-html", "innerHTML", ES],
    ];
    for (const [attr, prop, table] of attrs) {
      root.querySelectorAll("[" + attr + "]").forEach((el) => {
        const key = el.getAttribute(attr);
        const cacheAttr = "_i18n_" + prop;
        if (el[cacheAttr] === undefined) el[cacheAttr] = el[prop];
        el[prop] = es && table[key] != null ? table[key] : el[cacheAttr];
      });
    }
    // attribute-valued strings (placeholder / title)
    [["data-i18n-ph", "placeholder"], ["data-i18n-title", "title"]].forEach(([attr, dom]) => {
      root.querySelectorAll("[" + attr + "]").forEach((el) => {
        const key = el.getAttribute(attr);
        const cacheAttr = "_i18n_" + dom;
        if (el[cacheAttr] === undefined) el[cacheAttr] = el.getAttribute(dom) || "";
        el.setAttribute(dom, es && ES[key] != null ? ES[key] : el[cacheAttr]);
      });
    });
    if (root.documentElement) root.documentElement.dataset.lang = lang;
  }

  function normLang(l) {
    return String(l || "").toLowerCase().startsWith("es") ? "es" : "en";
  }

  self.GXI18N = { t, ti, applyI18n, normLang, ES, DYN };
})();
