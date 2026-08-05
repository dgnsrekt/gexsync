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
    },
    es: {
      "dyn.zoomSave": "⭳ Guardar", "dyn.zoomRecall": "⭱ Recuperar",
      "dyn.zoomSaved": "Guardado ✓", "dyn.zoomRecalled": "Recuperado ✓", "dyn.zoomNoCharts": "sin gráficos",
      "dyn.copy": "⧉ copiar", "dyn.copied": "copiado ✓",
      "dyn.savedPrefix": "🔒 Guardado · ", "dyn.unlocked": "✨ desbloqueado",
      "dyn.noLayout": "Sin diseño guardado aún", "dyn.noTabs": "sin pestañas de gexbot",
    },
  };

  function t(key, lang) {
    return (DYN[lang] && DYN[lang][key]) || (ES[key] && lang === "es" ? ES[key] : null) || DYN.en[key] || key;
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

  self.GXI18N = { t, applyI18n, normLang, ES, DYN };
})();
