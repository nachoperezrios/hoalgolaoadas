import { FIREBASE_CONFIG } from "./config.js";
import { crearBackendServidor } from "./backends/servidor.js";
import { Juego, crearPartida, unirse, consultarPartida, ErrorJuego } from "./juego.js";
import {
  ROLES, DOMINIOS, AREAS, ESTADOS, claseEstado, ESTADOS_PROPUESTA as EP, CAMPOS_AT1, LISTAS_INVENTARIO,
  rolQueDecide, describirEfecto, resultadoVotacion, TEXTO_RESULTADO, OPCIONES_VOTO, otroRol, fechaLarga, sumarDias,
  normalizarCodigo, UMBRAL_GUERRA, INSTITUCIONES, nombreUnidad, instDeUnidad, requiereDecreto, dominioRequerido,
  CAMPOS_FICHA, CAMPOS_FICHA_AT1, ETIQUETAS_RUTA, gastosFadea, IMPACTO_FILTRACION, MEDALLAS, DATOS_BCRA, ALICUOTAS,
} from "./reglas.js";
import { totalConocido } from "./informes.js";
import { ESCUDOS, imagenADataURL } from "./escudos.js";
import { generarNombre } from "./nombres.js";
import { MEDIDAS, AREAS_PRESUPUESTO, AREAS_JEMC, totalPresupuesto, describirEfectosCrisis, generarOfertas, aprobacionProvincia } from "./simulacion.js";

const $app = document.getElementById("app");
const $ventana = document.getElementById("ventana");
const $avisos = document.getElementById("avisos");

// ---------- utilidades de presentación ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => (typeof n === "number" ? n.toLocaleString("es-AR") : "");
const pct = (n) => `${n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const sinDato = (t = "Sin dato confirmado") => `<span class="sin-dato">${esc(t)}</span>`;
const vacio = (v) => v === null || v === undefined || v === "";
const dato = (v, f = esc) => (vacio(v) ? sinDato() : f(v));
const sello = (e) => `<span class="sello sello-${claseEstado(e)}">${esc(e)}</span>`;
const CLASE_PROP = {
  [EP.revision]: "pendiente", [EP.devuelta]: "propuesta", [EP.aprobada]: "aprobado", [EP.financiamiento]: "curso",
  [EP.bloqueada]: "bloqueado", [EP.rechazada]: "bloqueado", [EP.retirada]: "desconocido", [EP.anulada]: "bloqueado",
};
const selloProp = (e) => `<span class="sello sello-${CLASE_PROP[e] || "curso"}">${esc(e)}</span>`;
const nombreRol = (r) => (r === "acuerdo" ? "Acuerdo inicial" : ROLES[r]?.corto || r);
const rolTag = (r) => `<span class="rol-tag ${esc(r)}">${esc(nombreRol(r))}</span>`;
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "");
const opciones = (pares, sel) => pares.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(sel ?? "") ? " selected" : ""}>${esc(t)}</option>`).join("");
const leerLocal = (k, def = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const guardarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const parsearNumero = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const MARCA = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="1" opacity=".55"/><path d="M32 6 36.5 27.5 58 32 36.5 36.5 32 58 27.5 36.5 6 32 27.5 27.5Z" fill="currentColor"/><path d="M32 16 34 30 48 32 34 34 32 48 30 34 16 32 30 30Z" fill="var(--papel)" opacity=".9"/></svg>`;

const app = {
  backend: null, juego: null, rol: null, vista: "despacho",
  sub: { inventario: "aereo", registro: "propuestas", asuntos: "abierto" },
  filtros: { area: "", estado: "", propEstado: "", pDiv: "", pRango: "", pEstado: "Activo", pTexto: "", pPagina: 0 },
  modal: null, conexion: "conectado", vistos: null, informeAbierto: null, renderPendiente: false,
};

// ---------- arranque ----------
async function elegirBackend() {
  const forzado = new URLSearchParams(location.search).get("backend");
  if (forzado !== "firebase") {
    try {
      const r = await fetch("api/ping", { cache: "no-store" });
      if (r.ok && (await r.json()).ok) return crearBackendServidor("");
    } catch {}
  }
  if (FIREBASE_CONFIG) {
    const { crearBackendFirebase } = await import("./backends/firebase.js");
    return crearBackendFirebase(FIREBASE_CONFIG);
  }
  return null;
}

async function iniciar() {
  try {
    app.backend = await elegirBackend();
  } catch (e) {
    $app.innerHTML = pantallaMensaje("No se pudo conectar con Firebase", `<p>${esc(e.message || e)}</p><p>Revisá la configuración en <code>js/config.js</code>, que el login anónimo esté habilitado y que la base Firestore esté creada.</p>`);
    return;
  }
  if (!app.backend) { $app.innerHTML = pantallaConfigurar(); return; }
  app.backend.alCambiarConexion?.((e) => { app.conexion = e; programarRender(); });
  window.addEventListener("online", () => { app.conexion = "conectado"; programarRender(); });
  window.addEventListener("offline", () => { app.conexion = "sin conexión"; programarRender(); });
  window.addEventListener("hashchange", () => { app.vista = vistaDesdeHash(); app.informeAbierto = null; render(); window.scrollTo(0, 0); });

  const codigoUrl = normalizarCodigo(new URLSearchParams(location.search).get("p"));
  const sesion = leerLocal("atlas.sesion");
  if (sesion && (!codigoUrl || codigoUrl === sesion.codigo)) {
    try {
      const partida = await consultarPartida(app.backend, sesion.codigo);
      if (partida?.jugadores?.[sesion.rol]?.uid === app.backend.uid) return entrar(sesion.codigo, sesion.rol, partida.nombre);
    } catch {}
  }
  pantallaInicio(codigoUrl);
}

function vistaDesdeHash() {
  const h = location.hash.replace("#", "");
  if (h === "at1") { app.sub.atlas = "at1"; return "atlas"; }
  return VISTAS[h] ? h : "despacho";
}

function entrar(codigo, rol, nombre) {
  app.juego?.cerrar();
  app.rol = rol;
  app.juego = new Juego(app.backend, codigo, rol);
  app.vistos = null;
  document.body.classList.toggle("rol-presidente", rol === "presidente");
  guardarLocal("atlas.sesion", { codigo, rol });
  const recientes = leerLocal("atlas.recientes", []).filter((r) => r.codigo !== codigo);
  guardarLocal("atlas.recientes", [{ codigo, rol, nombre: nombre || codigo }, ...recientes].slice(0, 6));
  app.juego.conectar(alCambiar, (e) => aviso(`Error de sincronización: ${e.message || e.code || e}`));
  app.vista = vistaDesdeHash();
  render();
}

function alCambiar(tipo) {
  const j = app.juego;
  if (tipo === "registro") {
    if (!app.vistos) app.vistos = new Set(j.registro.map((r) => r.id));
    else {
      for (const r of j.registro) {
        if (!app.vistos.has(r.id)) {
          app.vistos.add(r.id);
          if (r.rol && r.rol !== app.rol && r.rol !== "acuerdo") {
            const quien = r.titulo.includes(nombreRol(r.rol)) ? "" : `<b>${esc(nombreRol(r.rol))}:</b> `;
            aviso(`${quien}${esc(r.titulo)}`, true);
          }
        }
      }
    }
  }
  programarRender();
}

function programarRender() {
  if (app.renderPendiente) return;
  app.renderPendiente = true;
  requestAnimationFrame(() => { app.renderPendiente = false; render(); refrescarVentana(); });
}

function aviso(html, delOtro = false) {
  // Con una ventana abierta, los avisos van dentro de ella para quedar visibles.
  let caja = $avisos;
  if ($ventana.open) {
    caja = $ventana.querySelector(".avisos") || $ventana.appendChild(Object.assign(document.createElement("div"), { className: "avisos" }));
  }
  const el = document.createElement("div");
  el.className = "aviso" + (delOtro ? " del-otro" : "");
  el.innerHTML = html;
  caja.append(el);
  while (caja.children.length > 3) caja.firstElementChild.remove();
  setTimeout(() => el.remove(), delOtro ? 9000 : 5000);
}

async function ejecutar(fn, ok) {
  try {
    const r = await fn();
    if (ok) aviso(esc(typeof ok === "function" ? ok(r) : ok));
    return r;
  } catch (e) {
    aviso(`<span class="error">${esc(e instanceof ErrorJuego ? e.message : `No se pudo completar: ${e.message || e}`)}</span>`);
    try { e.mostrado = true; } catch {}
    throw e;
  }
}

// ---------- pantallas sin partida ----------
function pantallaMensaje(titulo, html) {
  return `<div class="inicio"><div class="inicio-caja"><div class="inicio-titulo">${MARCA}<div><h1>ATLAS</h1><p>${esc(titulo)}</p></div></div><div class="panel">${html}</div></div></div>`;
}

function pantallaConfigurar() {
  return pantallaMensaje("Falta conectar un servidor para jugar", `
    <h3>La partida necesita un lugar donde guardarse</h3>
    <p>Esta copia no encontró el servidor local ni una configuración de Firebase.</p>
    <ul class="lista-simple">
      <li><b>Para jugar online desde dos dispositivos:</b> completá <code>js/config.js</code> con los datos de tu proyecto de Firebase y volvé a publicar el sitio. Los pasos están en el README.</li>
      <li><b>Para probar en esta computadora o en la misma red Wi-Fi:</b> ejecutá <code>node servidor-local.mjs</code> y abrí la dirección que muestra.</li>
    </ul>`);
}

function pantallaInicio(codigoPrefill = null, mensaje = "") {
  document.body.classList.remove("rol-presidente");
  const recientes = leerLocal("atlas.recientes", []);
  $app.innerHTML = `
  <div class="inicio"><div class="inicio-caja">
    <div class="inicio-titulo">${MARCA}<div><h1>ATLAS</h1><p>Centro de coordinación ficticio para dos jugadores: el Jefe del Estado Mayor Conjunto y el Presidente de la Nación. Historia alternativa; ningún dato es real.</p></div></div>
    ${mensaje ? `<p class="error">${esc(mensaje)}</p>` : ""}
    <div class="grilla">
      <form class="panel" data-form="crear">
        <h3>Crear una partida</h3>
        <label class="campo">Nombre de la partida<input type="text" name="nombre" value="Partida ATLAS" maxlength="80"></label>
        <p class="nota" style="margin-bottom:.4rem">Tu cargo</p>
        <div class="opciones-rol">
          <label class="opcion-rol"><input type="radio" name="rol" value="jemc" checked>${esc(ROLES.jemc.nombre)}<small>ATLAS, Fuerzas Armadas y PFA</small></label>
          <label class="opcion-rol"><input type="radio" name="rol" value="presidente">${esc(ROLES.presidente.nombre)}<small>Economía, política nacional, infraestructura y exteriores</small></label>
        </div>
        <button class="btn btn-primario" type="submit">Crear partida</button>
        <p class="nota" style="margin-top:.7rem">La partida arranca el 8 de diciembre de 2029 con el estado acordado.</p>
      </form>
      <div class="panel">
        <form data-form="buscar">
        <h3>Unirme con un código</h3>
        <label class="campo">Código de invitación<input type="text" name="codigo" placeholder="ABCD-1234" value="${esc(codigoPrefill || "")}" autocomplete="off" required></label>
        <button class="btn btn-primario" type="submit">Buscar partida</button>
        </form>
        <div id="resultado-busqueda"></div>
        ${recientes.length ? `<hr class="separador"><h3 style="margin-bottom:.4rem">Partidas recientes en este dispositivo</h3>
          ${recientes.map((r) => `<div class="item-bandeja"><div><b>${esc(r.nombre)}</b><div class="meta">${esc(r.codigo)} · ${esc(nombreRol(r.rol))}</div></div><button class="btn btn-chico" type="button" data-accion="reanudar" data-codigo="${esc(r.codigo)}" data-rol="${esc(r.rol)}">Abrir</button></div>`).join("")}` : ""}
      </div>
    </div>
  </div></div>`;
  if (codigoPrefill) $app.querySelector('[data-form="buscar"]').requestSubmit();
}

async function mostrarBusqueda(codigo) {
  const caja = document.getElementById("resultado-busqueda");
  caja.innerHTML = `<p class="nota">Buscando…</p>`;
  const partida = await consultarPartida(app.backend, codigo).catch(() => null);
  if (!partida) { caja.innerHTML = `<p class="error">No existe una partida con el código ${esc(codigo)}. Revisá que esté bien escrito.</p>`; return; }
  const uid = app.backend.uid;
  const preferido = ["jemc", "presidente"].find((r) => partida.jugadores?.[r]?.uid === uid)
    || ["jemc", "presidente"].find((r) => !partida.jugadores?.[r]) || "jemc";
  const filas = ["jemc", "presidente"].map((r) => {
    const j = partida.jugadores?.[r];
    const estado = !j ? "Libre" : j.uid === uid ? "Ocupado por este dispositivo" : "Ocupado por otro dispositivo";
    return `<label class="opcion-rol${j && j.uid !== uid ? " ocupado" : ""}"><input type="radio" name="rol" value="${r}"${r === preferido ? " checked" : ""}>${esc(ROLES[r].nombre)}<small>${estado}</small></label>`;
  });
  caja.innerHTML = `<hr class="separador"><form data-form="unirse" data-codigo="${esc(codigo)}">
    <h3 style="margin-bottom:.5rem">${esc(partida.nombre)}</h3>
    <div class="opciones-rol">${filas.join("")}</div>
    <label class="campo">PIN del cargo <small>Solo si el cargo ya está ocupado y querés recuperarlo desde este dispositivo</small><input type="text" name="pin" inputmode="numeric" maxlength="4" autocomplete="off"></label>
    <button class="btn btn-primario" type="submit">Entrar al despacho</button>
  </form>`;
}

function pantallaInvitacion(codigo, pin, rol, nombre) {
  const link = enlaceInvitacion(codigo);
  $app.innerHTML = pantallaMensaje("Partida creada", `
    <h3>Invitá a tu compañero de juego</h3>
    <p>Pasale este código o el enlace. Él elige el cargo de ${esc(ROLES[otroRol(rol)].nombre)}.</p>
    <p class="codigo">${esc(codigo)}</p>
    <div class="acciones" style="margin-bottom:1rem"><input type="text" readonly value="${esc(link)}" style="max-width:520px"><button class="btn" data-accion="copiar" data-texto="${esc(link)}">Copiar enlace</button></div>
    <p><b>Tu PIN de cargo: ${esc(pin)}.</b> Guardalo: lo necesitás para recuperar tu cargo desde otro dispositivo o navegador.</p>
    <button class="btn btn-primario" data-accion="entrar-nueva" data-codigo="${esc(codigo)}" data-rol="${esc(rol)}" data-nombre="${esc(nombre)}">Entrar al despacho</button>`);
}

const enlaceInvitacion = (codigo) => `${location.origin}${location.pathname}?p=${encodeURIComponent(codigo)}`;

// ---------- marco principal ----------
const VISTAS = {
  despacho: ["Mi despacho", vistaDespacho, "comun"],
  situacion: ["Situación nacional", vistaSituacion, "comun"],
  proyectos: ["Proyectos", vistaProyectos, "comun"],
  asuntos: ["Asuntos y reuniones", vistaAsuntos, "comun"],
  registro: ["Registro de decisiones", vistaRegistro, "comun"],
  informes: ["Informes", vistaInformes, "comun"],
  economia: ["Economía", () => vistaEconomia(), "presidente"],
  cuentas: ["Cuentas públicas", () => vistaCuentas(), "presidente"],
  bcra: ["Banco Central", () => vistaBCRA(), "presidente"],
  arca: ["ARCA", () => vistaARCA(), "presidente"],
  obras: ["Obras", () => vistaObras(), "presidente"],
  gobierno: ["Gobierno", () => vistaGobierno(), "presidente"],
  inventarios: ["Inventarios", vistaInventarios, "jemc"],
  fadea: ["FAdeA", () => vistaFadea(), "jemc"],
  atlas: ["ATLAS y AT-1", vistaAtlas, "jemc"],
  pfa: ["PFA", () => vistaInstitucion("pfa"), "jemc"],
  side: ["SIDE", () => vistaInstitucion("side"), "jemc"],
  afi: ["AFI", () => vistaInstitucion("afi"), "jemc"],
  partida: ["Partida", vistaPartida, "partida"],
};
const GRUPOS_NAV = { comun: "Compartido", presidente: "Presidente", jemc: "Jefe del Estado Mayor", partida: "" };

function bandeja() {
  const j = app.juego, r = app.rol;
  const props = j.propuestas;
  return {
    paraDecidir: props.filter((p) => p.estado === EP.revision && p.decide === r),
    devueltas: props.filter((p) => p.estado === EP.devuelta && p.autor === r),
    objeciones: props.filter((p) => p.decide === r && (p.objeciones || []).some((o) => !o.conocida && o.rol !== r)),
    votaciones: j.votaciones.filter((v) => v.estado === "abierta" && resultadoVotacion(v).resultado !== "en_curso" && !v.confirmaciones?.[r]),
    enEspera: props.filter((p) => p.autor === r && ((p.estado === EP.revision && p.decide !== r) || p.estado === EP.financiamiento)),
  };
}

function render() {
  const j = app.juego;
  if (!j) return;
  if (!j.cargado.partida) { $app.innerHTML = `<div class="inicio"><p class="nota">Conectando con la partida…</p></div>`; return; }
  if (!j.partida) { app.juego.cerrar(); app.juego = null; guardarLocal("atlas.sesion", null); pantallaInicio(null, "La partida ya no existe."); return; }
  const b = bandeja();
  const pendientes = b.paraDecidir.length + b.devueltas.length + b.objeciones.length + b.votaciones.length;
  document.title = `${pendientes ? `(${pendientes}) ` : ""}ATLAS · ${j.partida.nombre}`;
  const contadores = { despacho: pendientes, atlas: j.votaciones.filter((v) => v.estado === "abierta").length };
  const otro = j.partida.jugadores?.[otroRol(app.rol)];
  const claseCon = app.conexion === "conectado" ? "" : app.conexion === "reconectando" ? "medio" : "mal";
  const textoCon = { conectado: app.backend.tipo === "firebase" ? "Sincronizado online" : "Sincronizado con el servidor local", reconectando: "Reconectando…" }[app.conexion] || "Sin conexión";
  const foco = document.activeElement?.dataset?.foco ? { id: document.activeElement.dataset.foco, ini: document.activeElement.selectionStart } : null;
  const [, fnVista] = VISTAS[app.vista];
  let contenido;
  try { contenido = fnVista(); } catch (e) { console.error(e); contenido = `<p class="error">Error al mostrar esta vista: ${esc(e.message)}</p>`; }
  $app.innerHTML = `
  <div class="marco">
    <aside class="lateral">
      <div class="marca">${MARCA}<div><b>ATLAS</b><span>Centro de coordinación</span></div></div>
      <nav class="nav" aria-label="Secciones">
        ${Object.entries(GRUPOS_NAV).map(([g, titulo]) => `${titulo ? `<div class="nav-grupo">${esc(titulo)}</div>` : `<div class="nav-grupo"></div>`}${Object.entries(VISTAS).filter(([, v]) => v[2] === g).map(([id, [nombre]]) => `<a href="#${id}"${app.vista === id ? ' aria-current="page"' : ""}><span>${esc(nombre)}</span>${contadores[id] ? `<span class="contador">${contadores[id]}</span>` : ""}</a>`).join("")}`).join("")}
      </nav>
      <div class="pie">Partida ${esc(j.codigo)}<br>Contenido ficticio.</div>
    </aside>
    <div>
      <header class="cabecera">
        <div>
          <div class="sub">${esc(j.partida.nombre)} · Gobierno ${esc(j.estado.gobierno.nombre)}</div>
          <div class="fecha">${esc(fechaLarga(j.estado.fechaJuego))} <button class="btn btn-chico" data-accion="avanzar-mes" title="Calcula economía, presupuesto, obras, auditorías y opinión pública">Avanzar mes</button></div>
        </div>
        <div class="despacho-de">
          <div>Despacho del <span class="cargo">${esc(ROLES[app.rol].nombre)}</span></div>
          <div class="sub"><span class="conexion ${claseCon}">${esc(textoCon)}</span> · ${otro ? `${esc(nombreRol(otroRol(app.rol)))} en la partida` : `Falta que entre el ${esc(nombreRol(otroRol(app.rol)))}`}</div>
        </div>
      </header>
      <main class="contenido" id="contenido">${contenido}</main>
    </div>
  </div>`;
  if (foco) {
    const el = $app.querySelector(`[data-foco="${foco.id}"]`);
    if (el) { el.focus(); try { el.setSelectionRange(foco.ini, foco.ini); } catch {} }
  }
}

const encabezado = (titulo, texto = "", acciones = "") =>
  `<div class="encabezado-vista"><div><h2>${esc(titulo)}</h2>${texto ? `<p>${texto}</p>` : ""}</div><div class="acciones">${acciones}</div></div>`;

const leyenda = () => `<div class="leyenda">${sello("Consolidado")}${sello("Aprobado")}${sello("En evaluación")}${sello("Pendiente")}${sello("Propuesta")}${sello("Sin dato confirmado")}</div>`;

// ---------- vistas ----------
function filaPropuesta(p, accion = "Abrir") {
  return `<div class="item-bandeja"><div><b>${esc(p.titulo)}</b> ${selloProp(p.estado)}
    <div class="meta">${esc(DOMINIOS[p.dominio]?.nombre || p.dominio)} · de ${rolTag(p.autor)} · ${esc(fechaLarga(p.fechaJuego))}</div></div>
    <button class="btn btn-chico" data-accion="ver-propuesta" data-id="${esc(p.id)}">${esc(accion)}</button></div>`;
}

function vistaDespacho() {
  const j = app.juego, b = bandeja(), otro = otroRol(app.rol);
  const novedades = j.registro.filter((r) => r.rol === otro).slice(0, 8);
  const facultades = Object.entries(DOMINIOS).map(([id, d]) => `<tr><td>${esc(d.nombre)}</td><td>${d.decide === app.rol ? "<b>Vos decidís</b>" : `Decide el ${esc(nombreRol(d.decide))}`}</td></tr>`).join("");
  const total = b.paraDecidir.length + b.devueltas.length + b.objeciones.length + b.votaciones.length;
  return `${encabezado(`Despacho del ${ROLES[app.rol].corto}`, "Lo que espera tu decisión, lo que enviaste y lo último que hizo el otro cargo.",
    `<button class="btn btn-primario" data-accion="nueva-propuesta">Nueva propuesta</button><button class="btn" data-accion="nuevo-asunto">Abrir asunto</button><button class="btn" data-accion="nueva-votacion">Votación de ATLAS</button>`)}
  <div class="grilla">
    <section class="panel"><h3>Bandeja de entrada <small>${total ? `${total} pendientes` : "al día"}</small></h3>
      ${!total ? `<p class="vacio">No hay nada esperando tu decisión.</p>` : ""}
      ${b.paraDecidir.map((p) => filaPropuesta(p, "Decidir")).join("")}
      ${b.devueltas.map((p) => filaPropuesta(p, "Revisar")).join("")}
      ${b.objeciones.map((p) => `<div class="item-bandeja"><div><b>Objeción a: ${esc(p.titulo)}</b><div class="meta">El ${esc(nombreRol(otro))} objetó una decisión tuya</div></div><button class="btn btn-chico" data-accion="ver-propuesta" data-id="${esc(p.id)}">Leer</button></div>`).join("")}
      ${b.votaciones.map((v) => `<div class="item-bandeja"><div><b>Confirmar resultado: ${esc(v.titulo)}</b><div class="meta">${esc(TEXTO_RESULTADO[resultadoVotacion(v).resultado])}</div></div><button class="btn btn-chico" data-accion="ver-votacion" data-id="${esc(v.id)}">Abrir</button></div>`).join("")}
    </section>
    <section class="panel"><h3>Enviado y en espera</h3>
      ${b.enEspera.length ? b.enEspera.map((p) => filaPropuesta(p)).join("") : `<p class="vacio">No tenés pedidos esperando respuesta.</p>`}
    </section>
    <section class="panel"><h3>Últimos movimientos del ${esc(nombreRol(otro))}</h3>
      ${novedades.length ? novedades.map((r) => `<div class="item-bandeja"><div>${esc(r.titulo)}<div class="meta">${esc(fechaLarga(r.fechaJuego))} · ${esc(fechaHora(r.fecha))}</div></div></div>`).join("") : `<p class="vacio">Todavía no hay movimientos del otro cargo.</p>`}
    </section>
    <section class="panel"><h3>Reparto de autoridad</h3>
      <div class="tabla-envoltura"><table><thead><tr><th>Área</th><th>Quién decide</th></tr></thead><tbody>${facultades}</tbody></table></div>
      <p class="nota" style="margin-top:.6rem">El Presidente puede objetar decisiones de ATLAS. Los compromisos de ATLAS con costo piden financiamiento presidencial.</p>
    </section>
  </div>`;
}

function listaProyectos(area) {
  const ps = app.juego.estado.proyectos.filter((p) => p.area === area);
  if (!ps.length) return `<p class="vacio">Sin proyectos registrados.</p>`;
  return ps.map((p) => `<div class="item-bandeja"><div><b>${esc(p.nombre)}</b><div class="meta">${esc(p.responsable)}</div></div><div>${sello(p.estado)} <button class="btn btn-chico" data-accion="ver-proyecto" data-id="${esc(p.id)}">Ver</button></div></div>`).join("");
}

function vistaSituacion() {
  const e = app.juego.estado;
  const aereo = totalConocido(e.aereo);
  const terrestre = totalConocido(e.pfaTerrestre);
  const helis = totalConocido(e.pfaHelicopteros);
  const abiertas = app.juego.votaciones.filter((v) => v.estado === "abierta").length;
  return `${encabezado("Situación nacional", "Estado asentado de la partida. Lo rayado no tiene dato confirmado y solo se completa por decisión de los jugadores.", leyenda())}
  <div class="grilla">
    <section class="panel"><h3>Economía <button class="btn btn-chico" data-accion="nueva-propuesta" data-dominio="economia" data-efecto="indicador">Cargar indicador</button></h3>
      <div class="tabla-envoltura"><table><tbody>${Object.values(e.indicadores).map((i) => `<tr><td>${esc(i.nombre)}</td><td class="num">${vacio(i.valor) ? sinDato() : `${num(i.valor)} ${esc(i.unidad)}`}</td><td class="nota">${i.fechaCarga ? `al ${esc(fechaLarga(i.fechaCarga))}` : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="nota" style="margin-top:.6rem">${esc(e.economia.conduccion)}. ${esc(e.economia.ministro)}.</p>
      <h3 style="margin:.8rem 0 .4rem">Política fiscal establecida</h3>
      <ul class="lista-simple">${e.politicaFiscal.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${listaProyectos("economia")}
    </section>
    <section class="panel"><h3>Política y opinión pública</h3>
      <p>Gobierno <b>${esc(e.gobierno.nombre)}</b>. Programa de reformas:</p>
      <ul class="lista-simple">${e.gobierno.reformas.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p style="margin-top:.6rem">Aprobación del gobierno: ${cargable(e.gobierno.opinionPublica.aprobacion, "gobierno.opinionPublica.aprobacion", "Aprobación del gobierno (%)", "numero", (v) => `<b>${String(v).replace(".", ",")}%</b>`)}</p>
      <div class="item-bandeja"><div><b>Federalismo</b><div class="meta">${esc(e.federalismo.propuesta)}. ${esc(e.federalismo.nota)}.</div></div>${sello(e.federalismo.estado)}</div>
    </section>
    <section class="panel"><h3>Soberanía</h3>
      ${e.soberania.map((x) => `<div class="item-bandeja"><div><b>${esc(x.tema)}</b><div class="meta">${esc(x.detalle)}</div></div>${sello(x.estado)}</div>`).join("")}
    </section>
    <section class="panel"><h3>Seguridad <small>PFA, SIDE y AFI bajo el ${esc(e.pfa.autoridad)}</small></h3>
      <div class="tabla-envoltura"><table><thead><tr><th>Departamento de la PFA</th><th class="num">Activos</th></tr></thead>
      <tbody>${(e.unidades.pfa || []).map((u) => `<tr><td>${esc(nombreUnidad(e, u.id))}</td><td class="num">${num(personalDe("pfa").filter((p) => p.division === u.id && p.estado === "Activo").length)}</td></tr>`).join("")}</tbody></table></div>
      <p class="nota" style="margin-top:.6rem">Flota terrestre: ${num(terrestre.total)} unidades. Helicópteros: ${num(helis.total)}. SIDE: ${num(personalDe("side").filter((p) => p.estado === "Activo").length)} agentes. AFI: ${num(personalDe("afi").filter((p) => p.estado === "Activo").length)} agentes.</p>
      <div class="acciones"><a class="btn btn-chico" href="#pfa">PFA</a><a class="btn btn-chico" href="#side">SIDE</a><a class="btn btn-chico" href="#afi">AFI</a></div>
      <p class="nota">${esc(e.federalismo.cordoba)}</p>
    </section>
    <section class="panel"><h3>Infraestructura</h3>${listaProyectos("infraestructura")}</section>
    <section class="panel"><h3>Industria</h3><p class="nota">FAdeA produce los modelos Zonda, Bisonte, Colibrí y Dragón. <a href="#fadea">Administrar FAdeA</a></p>${listaProyectos("industria")}</section>
    <section class="panel"><h3>Defensa</h3>
      <p>Fuerza Aérea: <b>${num(aereo.total)}</b> aeronaves con cantidad registrada. Sin cantidad: ${esc(aereo.sinCantidad.join(", "))}.</p>
      <p>Buques, submarinos, destructores, portaaviones, tanques y artillería: <a class="btn btn-chico" href="#inventarios" data-accion="subtab" data-grupo="inventario" data-valor="capacidades">Cargar cantidades</a></p>
      ${listaProyectos("defensa")}${listaProyectos("soberania")}
    </section>
    <section class="panel"><h3>ATLAS</h3>
      <p>${e.atlas.miembros.length} miembros. Sede en ${esc(e.atlas.sede)}. Presupuesto: ${esc(e.atlas.presupuestoAnual)}.</p>
      <p>Votaciones abiertas: <b>${abiertas}</b>. AT-1: ${esc(e.at1.estadoPrograma)}.</p>
      <div class="acciones"><a class="btn btn-chico" href="#atlas">Ver ATLAS</a><a class="btn btn-chico" href="#at1">Ficha del AT-1</a><a class="btn btn-chico" href="#fadea">FAdeA</a></div>
    </section>
    <section class="panel"><h3>Relaciones exteriores</h3>
      ${e.relaciones.map((r) => `<div class="item-bandeja"><div><b>${esc(r.pais)}</b><div class="meta">${esc(r.temas)}</div></div>${sello(r.estado)}</div>`).join("")}
      <p class="nota" style="margin-top:.5rem">Las conversaciones no equivalen a contratos firmados ni a inversiones desembolsadas.</p>
    </section>
  </div>`;
}

function vistaProyectos() {
  const e = app.juego.estado;
  const f = app.filtros;
  const lista = e.proyectos.filter((p) => (!f.area || p.area === f.area) && (!f.estado || p.estado === f.estado));
  return `${encabezado("Proyectos", "Responsable, estado, presupuesto estimado y avance confirmado. El avance solo figura si los jugadores lo cargaron.",
    `<button class="btn btn-primario" data-accion="nueva-propuesta" data-efecto="proyecto_nuevo">Proponer proyecto</button>`)}
  <div class="filtros">
    <select data-cambio="filtro" data-campo="area" aria-label="Filtrar por área"><option value="">Todas las áreas</option>${opciones(Object.entries(AREAS), f.area)}</select>
    <select data-cambio="filtro" data-campo="estado" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${opciones(Object.keys(ESTADOS).map((x) => [x, x]), f.estado)}</select>
    ${leyenda()}
  </div>
  <div class="panel tabla-envoltura"><table>
    <thead><tr><th>Proyecto</th><th>Área</th><th>Responsable</th><th>Estado</th><th>Presupuesto estimado</th><th>Avance confirmado</th></tr></thead>
    <tbody>${lista.map((p) => `<tr class="clic" data-accion="ver-proyecto" data-id="${esc(p.id)}" tabindex="0"><td><b>${esc(p.nombre)}</b></td><td>${esc(AREAS[p.area] || p.area)}</td><td>${esc(p.responsable)}</td><td>${sello(p.estado)}</td><td>${dato(p.presupuesto)}</td><td>${dato(p.avance)}</td></tr>`).join("") || `<tr><td colspan="6" class="vacio">No hay proyectos con ese filtro.</td></tr>`}</tbody>
  </table></div>`;
}

const ETIQUETA_REF = {
  propio: "Aeronave real del inventario",
  analogia: "Analogía conceptual",
  no_fijada: "Inspiración no fijada",
};

function vistaInventarios() {
  const e = app.juego.estado, sub = app.sub.inventario;
  const tabs = [["aereo", "Fuerza Aérea"], ["referencias", "Referencias aeronáuticas"], ["capacidades", "Naval y terrestre"]];
  let cuerpo = "";
  const btnEditar = (lista, id) => `<button class="btn btn-chico" data-accion="editar-cantidad" data-lista="${lista}" data-id="${esc(id)}">Cambiar</button>`;
  if (sub === "aereo") {
    const t = totalConocido(e.aereo);
    cuerpo = `<div class="panel tabla-envoltura"><table>
      <thead><tr><th>Modelo</th><th class="num">Cantidad</th><th>Función general</th><th>Fabricante</th><th>Referencia</th><th></th></tr></thead>
      <tbody>${e.aereo.map((a) => `<tr class="clic" data-accion="ver-aeronave" data-id="${esc(a.id)}" tabindex="0"><td><b>${esc(a.modelo)}</b></td>
        <td class="num">${vacio(a.cantidad) ? sinDato("No consolidada") : num(a.cantidad)}${a.previstos ? `<div class="nota">${num(a.previstos)} previstos</div>` : ""}</td>
        <td>${esc(a.funcion.split(".")[0])}</td><td>${esc(a.fabricante)}</td>
        <td><span class="ref-${esc(a.tipoReferencia)}">${esc(ETIQUETA_REF[a.tipoReferencia])}</span><div class="nota">${esc(a.referencia)}</div></td><td>${btnEditar("aereo", a.id)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Total con cantidad registrada</td><td class="num">${num(t.total)}</td><td colspan="4" class="nota">Fuera del total: ${esc(t.sinCantidad.join(", "))}</td></tr></tfoot>
    </table></div>
    <div class="panel"><h3>${esc(e.transportePresidencial.modelo)}</h3><p>${esc(e.transportePresidencial.referencia)}. ${esc(e.transportePresidencial.nota)}</p></div>
    <p class="nota">Sumar unidades a un modelo con cantidad conocida es una compra: la autoriza el Presidente. Corregir o reducir cantidades lo decide el Jefe del Estado Mayor.</p>`;
  } else if (sub === "referencias") {
    cuerpo = `<div class="panel tabla-envoltura"><table><thead><tr><th>Modelo de la partida</th><th>Aeronave real</th><th>Relación con la partida</th></tr></thead>
      <tbody>${e.referenciasAereas.map((r) => `<tr><td><b>${esc(r.modelo)}</b></td><td>${esc(r.aeronaveReal)}</td><td>${esc(r.descripcion)}</td></tr>`).join("")}</tbody></table>
      <p class="nota" style="margin-top:.6rem">Estas aeronaves no integran el inventario argentino. Las descripciones son de contexto: la aplicación no agrega especificaciones técnicas.</p></div>`;
  } else if (sub === "capacidades") {
    cuerpo = `<div class="panel tabla-envoltura"><table><thead><tr><th>Capacidad</th><th>Rama</th><th class="num">Cantidad</th><th></th></tr></thead>
      <tbody>${e.capacidades.map((c) => `<tr><td><b>${esc(c.nombre)}</b></td><td>${esc(c.rama)}</td><td class="num">${vacio(c.cantidad) ? sinDato("No consolidada") : num(c.cantidad)}</td><td>${btnEditar("capacidades", c.id)}</td></tr>`).join("")}</tbody></table>
      <p class="nota" style="margin-top:.6rem">ATLAS tiene programas industriales conjuntos para buques, submarinos, destructores, tanques y artillería. Ninguna cantidad está consolidada.</p></div>`;
  } else {
    const lista = e[sub];
    const t = totalConocido(lista);
    cuerpo = `<div class="panel tabla-envoltura"><table><thead><tr><th>Modelo</th><th class="num">Cantidad</th><th></th></tr></thead>
      <tbody>${lista.map((v) => `<tr><td>${esc(v.modelo)}</td><td class="num">${vacio(v.cantidad) ? sinDato() : num(v.cantidad)}</td><td>${btnEditar(sub, v.id)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${num(t.total)}</td><td></td></tr></tfoot></table>
      <p class="nota" style="margin-top:.6rem">${sub === "pfaTerrestre" ? esc(e.pfa.cargas) : "Los UH-60 Black Hawk son militares y no se cuentan como helicópteros policiales."}</p></div>`;
  }
  return `${encabezado("Inventarios", "Cantidades ficticias de la partida. Cada cambio pasa por el registro, con autor y valor anterior. La flota de la PFA está en su pestaña.")}
  <div class="subtabs" role="group" aria-label="Inventario">${tabs.map(([id, t]) => `<button data-accion="subtab" data-grupo="inventario" data-valor="${id}" aria-pressed="${sub === id}">${esc(t)}</button>`).join("")}</div>${cuerpo}`;
}

function bloqueAT1() {
  const at = app.juego.estado.at1;
  const relacionadas = app.juego.propuestas.filter((p) => (p.efectos || []).some((e) => e.tipo === "at1") || /AT-1/.test(p.titulo));
  return `<p style="margin-bottom:1rem"><b>AT-1: avión de combate conjunto de ATLAS.</b> Dirección: ${esc(at.direccion)}. ${sello(at.estadoPrograma === "Producción iniciada" ? "Consolidado" : at.estadoPrograma)} ${esc(at.estadoPrograma)}</p>
  <div class="grilla">
    <section class="panel"><h3>Propósito</h3><p>${esc(at.proposito)}</p><p class="nota">Proyecto conjunto de ATLAS: no es un modelo exclusivo de FAdeA.</p>
      <h3 style="margin:.8rem 0 .4rem">Países miembros</h3><p>${esc(app.juego.estado.atlas.miembros.map((m) => m.pais).join(", "))}</p></section>
    <section class="panel"><h3>Decisiones del programa</h3>
      <div class="tabla-envoltura"><table><tbody>${Object.entries(CAMPOS_AT1).map(([k, t]) => `<tr><td>${esc(t)}</td><td>${vacio(at.decisiones[k]) ? sinDato("No definido") : `<b>${esc(at.decisiones[k])}</b>`}</td><td><button class="btn btn-chico" data-accion="nueva-propuesta" data-dominio="atlas" data-efecto="at1" data-campo="${k}">Proponer</button></td></tr>`).join("")}</tbody></table></div>
    </section>
    <section class="panel"><h3>Plataformas de referencia</h3>
      <div class="tabla-envoltura"><table><thead><tr><th>Miembro</th><th>Plataforma</th></tr></thead><tbody>${at.plataformas.map((p) => `<tr><td>${esc(p.pais)}</td><td>${esc(p.plataforma)}</td></tr>`).join("")}</tbody></table></div>
      <p class="nota" style="margin-top:.6rem">${esc(at.aclaracion)}</p></section>
    <section class="panel"><h3>Ficha técnica</h3>
      ${fichaTecnica("at1", CAMPOS_FICHA_AT1, "at1.ficha")}
      <p class="nota" style="margin-top:.6rem">La completan los jugadores con decisiones de ATLAS; la aplicación no agrega datos por su cuenta.</p></section>
    <section class="panel"><h3>Decisiones registradas sobre el AT-1</h3>
      ${relacionadas.length ? relacionadas.map((p) => filaPropuesta(p)).join("") : `<p class="vacio">Todavía no hay decisiones nuevas sobre el programa.</p>`}</section>
  </div>`;
}

function vistaAtlas() {
  const at = app.juego.estado.atlas;
  const vots = app.juego.votaciones;
  const tabs = [["miembros", "Miembros y votaciones"], ["at1", "AT-1"]];
  const sub = subActual("atlas", tabs);
  const cabecera = `${encabezado("ATLAS", `Sede central en ${esc(at.sede)}. Presupuesto: ${esc(at.presupuestoAnual)}.`, `<button class="btn btn-primario" data-accion="nueva-votacion">Abrir votación</button>`)}${subtabs("atlas", tabs)}`;
  if (sub === "at1") return cabecera + bloqueAT1();
  return `${cabecera}
  <section class="panel"><h3>Votaciones</h3>
    ${vots.length ? `<div class="tabla-envoltura"><table><thead><tr><th>Asunto</th><th>Tipo</th><th class="num">A favor</th><th>Resultado</th><th>Estado</th></tr></thead><tbody>
    ${vots.map((v) => { const r = resultadoVotacion(v); return `<tr class="clic" data-accion="ver-votacion" data-id="${esc(v.id)}" tabindex="0"><td><b>${esc(v.titulo)}</b><div class="nota">${esc(fechaLarga(v.fechaJuego))}</div></td><td>${v.tipo === "guerra" ? "Decisión de guerra" : "General"}</td><td class="num">${r.si} de ${r.n} (${pct(r.porcentaje)})</td><td><span class="resultado ${r.resultado}">${esc(TEXTO_RESULTADO[r.resultado].split(":")[0])}</span></td><td>${v.estado === "abierta" ? sello("Pendiente") : sello("Consolidado")}</td></tr>`; }).join("")}
    </tbody></table></div>` : `<p class="vacio">No hay votaciones. Las decisiones de guerra requieren más del 80% de los miembros.</p>`}
  </section>
  <div class="grilla">
    <section class="panel"><h3>Miembros establecidos <small>${at.miembros.length}</small></h3>
      <div class="tabla-envoltura"><table><thead><tr><th>Miembro</th><th>Participación</th></tr></thead><tbody>${at.miembros.map((m) => `<tr><td><b>${esc(m.pais)}</b></td><td>${esc(m.aporte)}</td></tr>`).join("")}</tbody></table></div>
      <p class="nota" style="margin-top:.6rem">No hay porcentajes de financiación ni compromisos cuantitativos por país definidos.</p></section>
    <section class="panel"><h3>Principios</h3><ul class="lista-simple">${at.principios.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3 style="margin:.8rem 0 .4rem">En conversaciones</h3>
      ${at.enConversaciones.length ? at.enConversaciones.map((x) => `<div class="item-bandeja"><div><b>${esc(x.pais)}</b><div class="meta">${esc(x.nota)}</div></div><button class="btn btn-chico" data-accion="nueva-propuesta" data-dominio="atlas" data-efecto="atlas_alta" data-pais="${esc(x.pais)}">Proponer incorporación</button></div>`).join("") : `<p class="vacio">Ningún país en conversaciones.</p>`}
    </section>
  </div>`;
}

// ---------- formularios genéricos ----------
// Cualquier dato, lista o expediente se carga con el mismo mecanismo: arma una
// propuesta, muestra en vivo quién decide y respeta el reparto de autoridad.
const IMPACTOS = [["0", "Sin impacto"], ["5", "+5 puntos"], ["3", "+3 puntos"], ["1", "+1 punto"], ["-1", "−1 punto"], ["-3", "−3 puntos"], ["-5", "−5 puntos"]];
const nuevoId = (prefijo) => `${prefijo}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const obtener = (obj, ruta) => ruta.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const listaOpciones = (ops) => (typeof ops === "function" ? ops() : ops || []).map((o) => (Array.isArray(o) ? o : [o, o]));

function campoHTML(c, valor) {
  const v = valor ?? "";
  const req = c.req ? " required" : "";
  const ayuda = c.ayuda ? ` <small>${esc(c.ayuda)}</small>` : "";
  let control;
  if (c.tipo === "select") control = `<select name="${c.k}"${req}>${c.req ? "" : `<option value="">Sin cargar</option>`}${opciones(listaOpciones(c.opciones), v)}</select>`;
  else if (c.tipo === "area") control = `<textarea name="${c.k}"${req}>${esc(v)}</textarea>`;
  else if (c.tipo === "numero") control = `<input type="text" inputmode="decimal" name="${c.k}" value="${esc(typeof v === "number" ? String(v).replace(".", ",") : v)}"${req}>`;
  else control = `<input type="text" name="${c.k}" value="${esc(v)}" maxlength="${c.max || 300}"${req}>`;
  if (c.generar) control = `<span class="acciones" style="flex-wrap:nowrap">${control}<button class="btn btn-chico" type="button" data-accion="generar-nombre" data-campo="${c.k}">Generar nombre</button></span>`;
  return `<label class="campo">${esc(c.l)}${ayuda}${control}</label>`;
}

function leerCampo(c, fd) {
  const t = String(fd.get(c.k) ?? "").trim();
  if (c.req && !t) throw new ErrorJuego(`Falta completar: ${c.l}`);
  if (c.tipo === "numero") {
    if (!t) return null;
    const n = parsearNumero(t);
    if (Number.isNaN(n)) throw new ErrorJuego(`${c.l}: tiene que ser un número`);
    return n;
  }
  return t;
}
const valoresDe = (campos, fd) => Object.fromEntries(campos.map((c) => [c.k, leerCampo(c, fd)]));
const distinto = (a, b) => JSON.stringify(a ?? "") !== JSON.stringify(b ?? "");

function construirConImpacto(fd) {
  const r = app.formActual.construir(fd);
  const imp = Number(fd.get("impacto") || 0);
  if (imp) r.efectos = [...r.efectos, { tipo: "opinion", delta: imp, motivo: r.titulo }];
  r.dominio ||= dominioRequerido(r.efectos[0], app.juego.estado) || "politica";
  return r;
}

function abrirFormulario({ titulo, subtitulo = "", campos, valores = {}, construir, textoBoton, conImpacto = true, extraHTML = "" }) {
  app.formActual = { construir };
  abrirVentana({ titulo, subtitulo, estatico: `<form data-form="generico">
    <div class="fila-campos">${campos.filter((c) => c.tipo !== "area").map((c) => campoHTML(c, valores[c.k])).join("")}</div>
    ${campos.filter((c) => c.tipo === "area").map((c) => campoHTML(c, valores[c.k])).join("")}
    ${extraHTML}
    <label class="campo">Justificación <small>Opcional</small><textarea name="justificacion" style="min-height:3.5em"></textarea></label>
    ${conImpacto ? `<label class="campo">Impacto en la opinión pública <small>Lo ve quien decide; se aplica si se aprueba</small><select name="impacto">${opciones(IMPACTOS, "0")}</select></label>` : ""}
    <div class="aviso-decide" data-aviso-generico></div>
    <button class="btn btn-primario" type="submit">${esc(textoBoton || "Registrar")}</button></form>` });
  const form = $ventana.querySelector('[data-form="generico"]');
  const actualizar = () => {
    const caja = form.querySelector("[data-aviso-generico]");
    try {
      const { dominio, efectos } = construirConImpacto(new FormData(form));
      const decide = rolQueDecide(dominio, efectos, app.juego.estado, app.rol);
      const decreto = efectos.some((e) => dominioRequerido(e, app.juego.estado) === "decretos");
      caja.textContent = decide === app.rol
        ? "Está dentro de tus facultades: se aplica al registrarlo y el otro cargo lo ve al instante."
        : `${decreto ? "Requiere decreto presidencial. " : ""}Le corresponde al ${nombreRol(decide)}: le llega como pedido y se aplica si lo aprueba.`;
    } catch (e) { caja.textContent = e.message; }
  };
  form.addEventListener("input", actualizar);
  form.addEventListener("change", actualizar);
  actualizar();
}

// Un valor que se puede cargar o editar desde donde se muestra.
function cargable(valor, ruta, titulo, tipo = "texto", formato = esc) {
  const btn = (t) => `<button class="btn btn-chico" data-accion="dato" data-ruta="${esc(ruta)}" data-titulo="${esc(titulo)}" data-tipo="${tipo}">${t}</button>`;
  return vacio(valor) ? btn("Cargar") : `${formato(valor)} ${btn("Editar")}`;
}

function abrirDato(ruta, titulo, tipo = "texto") {
  const actual = obtener(app.juego.estado, ruta);
  abrirFormulario({
    titulo, campos: [{ k: "valor", l: titulo, tipo: tipo === "numero" ? "numero" : tipo === "area" ? "area" : "texto" }], valores: { valor: actual },
    construir: (fd) => {
      let v = leerCampo({ k: "valor", l: titulo, tipo }, fd);
      if (v === "") v = null;
      if (!distinto(v, actual)) throw new ErrorJuego("Escribí un valor distinto al actual");
      return { titulo: ETIQUETAS_RUTA(ruta, app.juego.estado), efectos: [{ tipo: "dato", ruta, valor: v }] };
    },
  });
}

// ---------- esquemas de listas (estado general) ----------
const ESTADOS_PLANTA = ["Operativa", "En construcción", "En ampliación", "En mantenimiento", "Inactiva"];
const ESTADOS_MODELO = ["Concepto", "En desarrollo", "Prototipo", "En pruebas", "En producción", "Retirado"];
const ESQUEMAS = {
  planta: { ruta: "fadea.plantas", nombre: "Planta de FAdeA", nuevo: "Nueva planta o instalación", prefijo: "pla", campos: [
    { k: "nombre", l: "Nombre", req: true }, { k: "ubicacion", l: "Ubicación" }, { k: "estado", l: "Estado", tipo: "select", opciones: ESTADOS_PLANTA },
    { k: "capacidad", l: "Capacidad" }, { k: "funcion", l: "Función", tipo: "area" }] },
  modelo: { ruta: "fadea.modelos", nombre: "Modelo de FAdeA", nuevo: "Nuevo modelo (requiere autorización presidencial)", prefijo: "mod", campos: [
    { k: "nombre", l: "Designación y nombre", req: true, ayuda: "Ej.: AR-99 Pampero" }, { k: "rol", l: "Rol" },
    { k: "estado", l: "Estado del programa", tipo: "select", opciones: ESTADOS_MODELO }, { k: "exclusivo", l: "Uso exclusivo argentino", tipo: "select", opciones: ["Sí", "No"] },
    { k: "notas", l: "Notas", tipo: "area" }] },
  movimiento: { ruta: "fadea.movimientos", nombre: "Finanzas de FAdeA", nuevo: "Registrar movimiento", prefijo: "mov", campos: [
    { k: "concepto", l: "Concepto", req: true }, { k: "tipo", l: "Tipo", tipo: "select", opciones: ["Gasto", "Ingreso"], req: true },
    { k: "monto", l: "Monto (US$ millones)", tipo: "numero", req: true }, { k: "estado", l: "Estado", tipo: "select", opciones: ["Registrado", "Anulado"], req: true },
    { k: "notas", l: "Notas", tipo: "area" }] },
  gabinete: { ruta: "gabinete", nombre: "Gabinete", nuevo: "Nuevo cargo de gabinete", prefijo: "gab", campos: [
    { k: "cargo", l: "Cargo", req: true }, { k: "titular", l: "Titular", generar: true },
    { k: "estado", l: "Estado", tipo: "select", opciones: ["En funciones", "Interino", "Vacante", "Renunció", "Removido"] }, { k: "notas", l: "Notas", tipo: "area" }] },
  provincia: { ruta: "provincias", nombre: "Provincias", nuevo: "Nueva jurisdicción", prefijo: "prov", campos: [
    { k: "nombre", l: "Jurisdicción", req: true }, { k: "gobernador", l: "Gobernador o gobernadora", generar: true },
    { k: "alineamiento", l: "Relación con el Gobierno", tipo: "select", opciones: ["Aliado", "Neutral", "Opositor"] },
    { k: "acuerdos", l: "Acuerdos con la Nación", tipo: "area" }, { k: "notas", l: "Notas", tipo: "area" }] },
  relacion: { ruta: "relaciones", nombre: "Relaciones exteriores", nuevo: "Nueva relación bilateral", prefijo: "rel", campos: [
    { k: "pais", l: "País", req: true }, { k: "estado", l: "Estado", tipo: "select", opciones: ["En negociación", "Cooperación activa", "Aliado estratégico", "Tensa", "Congelada"] },
    { k: "temas", l: "Temas", tipo: "area" }] },
  tratado: { ruta: "tratados", nombre: "Tratados", nuevo: "Nuevo tratado o acuerdo", prefijo: "tra", campos: [
    { k: "nombre", l: "Nombre", req: true }, { k: "partes", l: "Partes" },
    { k: "tipo", l: "Tipo", tipo: "select", opciones: ["Comercial", "Cooperación", "Defensa", "Tecnológico", "Energía", "Otro"] },
    { k: "estado", l: "Estado", tipo: "select", opciones: ["En negociación", "Firmado", "Ratificado por el Congreso", "Suspendido", "Denunciado"] },
    { k: "notas", l: "Notas", tipo: "area" }] },
  bloqueDiputados: { ruta: "congreso.bloquesDiputados", nombre: "Bloques de Diputados", nuevo: "Nuevo bloque en Diputados", prefijo: "bdi", campos: [
    { k: "nombre", l: "Bloque", req: true },
    { k: "postura", l: "Postura", tipo: "select", opciones: ["Oficialista", "Aliado", "Independiente", "Opositor"] }] },
  bloqueSenado: { ruta: "congreso.bloquesSenado", nombre: "Bloques del Senado", nuevo: "Nuevo bloque en el Senado", prefijo: "bse", campos: [
    { k: "nombre", l: "Bloque", req: true },
    { k: "postura", l: "Postura", tipo: "select", opciones: ["Oficialista", "Aliado", "Independiente", "Opositor"] }] },
};
for (const inst of ["pfa", "side", "afi"]) {
  ESQUEMAS[`unidad-${inst}`] = { ruta: `unidades.${inst}`, nombre: `Departamentos de ${INSTITUCIONES[inst].corto}`, nuevo: "Nuevo departamento", prefijo: inst, campos: [
    { k: "nombre", l: "Nombre del departamento", req: true }, ...(inst === "pfa" ? [{ k: "numero", l: "Número", tipo: "numero" }] : [])] };
}

function abrirItem(esq, id = null, iniciales = {}) {
  const E = ESQUEMAS[esq];
  const lista = obtener(app.juego.estado, E.ruta) || [];
  const actual = id ? lista.find((x) => x.id === id) : null;
  const clave = E.campos[0].k;
  abrirFormulario({
    titulo: actual ? `${actual[clave]}` : E.nuevo, subtitulo: esc(E.nombre), campos: E.campos, valores: actual || iniciales,
    textoBoton: actual ? "Guardar cambios" : "Registrar",
    construir: (fd) => {
      const v = valoresDe(E.campos, fd);
      if (actual) {
        const cambios = Object.fromEntries(Object.entries(v).filter(([k, x]) => distinto(x, actual[k])));
        if (!Object.keys(cambios).length) throw new ErrorJuego("No cambiaste ningún dato");
        return { titulo: `${E.nombre}: ${actual[clave]}`, efectos: [{ tipo: "lista", ruta: E.ruta, op: "editar", id, nombre: actual[clave], cambios }] };
      }
      const nid = esq.startsWith("unidad-") ? `${E.prefijo}-${normalizar(v.nombre).slice(0, 24) || "dpto"}-${Date.now().toString(36).slice(-4)}` : nuevoId(E.prefijo);
      return { titulo: `${E.nombre}: alta de ${v[clave]}`, efectos: [{ tipo: "lista", ruta: E.ruta, op: "agregar", item: { id: nid, ...v } }] };
    },
  });
}

// ---------- esquemas de documentos (colecciones) ----------
const CLASIFICACIONES = ["Reservado", "Confidencial", "Secreto", "Estrictamente secreto"];
const unidadesDe = (inst) => (app.juego.estado.unidades[inst] || []).map((u) => [u.id, u.numero ? `Dpto ${u.numero}: ${u.nombre}` : u.nombre]);
const votos = (pref) => [["Af", "afirmativos"], ["Ne", "negativos"], ["Ab", "abstenciones"]].map(([s, n]) => ({ k: `${pref}${s}`, l: `${pref === "dip" ? "Diputados" : "Senado"}: ${n}`, tipo: "numero", campoVoto: n }));
const ESQ_DOCS = {
  orden: {
    col: "ordenes", nombre: "Orden de producción", prefijo: "ord", dominio: "fadea",
    campos: () => [
      { k: "modelo", l: "Modelo", tipo: "select", req: true, opciones: () => app.juego.estado.fadea.modelos.map((m) => [m.id, m.nombre]) },
      { k: "cantidad", l: "Cantidad ordenada", tipo: "numero", req: true }, { k: "entregadas", l: "Entregadas", tipo: "numero" },
      { k: "planta", l: "Planta", tipo: "select", opciones: () => app.juego.estado.fadea.plantas.map((p) => [p.id, p.nombre]) },
      { k: "estado", l: "Estado", tipo: "select", req: true, opciones: ["Autorizada", "En producción", "Entregada", "Suspendida"] },
      { k: "fechaEstimada", l: "Entrega estimada" }, { k: "notas", l: "Notas", tipo: "area" }],
    inicial: () => ({ estado: "Autorizada", entregadas: 0 }),
    aDatos: (v) => {
      if (!Number.isInteger(v.cantidad) || v.cantidad <= 0) throw new ErrorJuego("La cantidad tiene que ser un entero positivo");
      const entregadas = v.entregadas || 0;
      let estado = v.estado;
      if (entregadas >= v.cantidad) estado = "Entregada";
      else if (entregadas > 0 && estado === "Autorizada") estado = "En producción";
      return { ...v, estado, entregadas, titulo: `${app.juego.estado.fadea.modelos.find((m) => m.id === v.modelo)?.nombre || v.modelo} × ${v.cantidad}` };
    },
  },
  filtracion: {
    col: "filtraciones", nombre: "Filtración de datos", prefijo: "fil", dominio: "fadea",
    campos: () => [
      { k: "titulo", l: "Título", req: true }, { k: "gravedad", l: "Gravedad", tipo: "select", req: true, opciones: Object.keys(IMPACTO_FILTRACION) },
      { k: "estado", l: "Estado", tipo: "select", req: true, opciones: ["Detectada", "En investigación", "Contenida", "Cerrada"] },
      { k: "origen", l: "Origen sospechado" }, { k: "trascendio", l: "¿Trascendió públicamente?", tipo: "select", req: true, opciones: ["No", "Sí"] },
      { k: "informacion", l: "Información comprometida", tipo: "area" }, { k: "medidas", l: "Medidas tomadas", tipo: "area" }],
    inicial: () => ({ estado: "Detectada", trascendio: "No", gravedad: "Media" }),
    // Si trasciende, la opinión pública reacciona según la gravedad.
    extra: (d, actual) => (d.trascendio === "Sí" && actual?.trascendio !== "Sí" ? [{ tipo: "opinion", delta: IMPACTO_FILTRACION[d.gravedad] || -3, motivo: `Filtración: ${d.titulo}` }] : []),
  },
  expediente: {
    col: "inteligencia", nombre: "Expediente clasificado", prefijo: "exp",
    campos: (inst) => [
      { k: "titulo", l: "Carátula", req: true }, { k: "clasificacion", l: "Clasificación", tipo: "select", req: true, opciones: CLASIFICACIONES },
      { k: "estado", l: "Estado", tipo: "select", req: true, opciones: ["Abierto", "En análisis", "Elevado", "Cerrado", "Archivado"] },
      { k: "unidad", l: "Departamento a cargo", tipo: "select", opciones: () => unidadesDe(inst) }, { k: "responsable", l: "Responsable" },
      { k: "resumen", l: "Resumen", tipo: "area" }, { k: "notas", l: "Notas", tipo: "area" }],
    inicial: () => ({ estado: "Abierto", clasificacion: "Confidencial" }),
  },
  mision: {
    col: "inteligencia", nombre: "Misión", prefijo: "mis",
    campos: (inst) => [
      { k: "titulo", l: "Nombre en clave", req: true }, { k: "estado", l: "Estado", tipo: "select", req: true, opciones: ["Planificada", "En curso", "Suspendida", "Completada", "Fallida"] },
      { k: "riesgo", l: "Riesgo", tipo: "select", opciones: ["Bajo", "Medio", "Alto"] }, { k: "clasificacion", l: "Clasificación", tipo: "select", opciones: CLASIFICACIONES },
      { k: "unidad", l: "Departamento a cargo", tipo: "select", opciones: () => unidadesDe(inst) }, { k: "responsable", l: "Responsable" },
      { k: "objetivo", l: "Objetivo", tipo: "area" }, { k: "agentes", l: "Agentes asignados", tipo: "area" }, { k: "notas", l: "Notas", tipo: "area" }],
    inicial: () => ({ estado: "Planificada", riesgo: "Medio", clasificacion: "Secreto" }),
  },
  ley: {
    col: "leyes", nombre: "Proyecto de ley", prefijo: "ley", dominio: "politica",
    campos: () => [
      { k: "titulo", l: "Título", req: true }, { k: "origen", l: "Origen", tipo: "select", opciones: ["Poder Ejecutivo", "Cámara de Diputados", "Senado"] },
      { k: "estado", l: "Estado", tipo: "select", req: true, opciones: ["Presentado", "En comisión", "Media sanción", "Sancionada", "Rechazada", "Vetada", "Promulgada"] },
      ...votos("dip"), ...votos("sen"), { k: "descripcion", l: "Descripción", tipo: "area" }, { k: "notas", l: "Notas", tipo: "area" }],
    inicial: () => ({ estado: "Presentado", origen: "Poder Ejecutivo" }),
    aValores: (l) => ({ ...l, dipAf: l.votosDiputados?.afirmativos, dipNe: l.votosDiputados?.negativos, dipAb: l.votosDiputados?.abstenciones,
      senAf: l.votosSenado?.afirmativos, senNe: l.votosSenado?.negativos, senAb: l.votosSenado?.abstenciones }),
    aDatos: (v) => {
      const { dipAf, dipNe, dipAb, senAf, senNe, senAb, ...resto } = v;
      return { ...resto, votosDiputados: { afirmativos: dipAf, negativos: dipNe, abstenciones: dipAb }, votosSenado: { afirmativos: senAf, negativos: senNe, abstenciones: senAb } };
    },
  },
};

function abrirDoc(esq, id = null, inst = null) {
  const E = ESQ_DOCS[esq];
  const actual = id ? app.juego[E.col].find((x) => x.id === id) : null;
  inst = inst || actual?.inst || null;
  const campos = E.campos(inst);
  const valores = actual ? (E.aValores ? E.aValores(actual) : actual) : (E.inicial ? E.inicial() : {});
  const dominio = E.dominio || inst;
  abrirFormulario({
    titulo: actual ? actual.titulo : `Nuevo: ${E.nombre.toLowerCase()}`, subtitulo: esc(inst ? `${E.nombre} · ${INSTITUCIONES[inst].corto}` : E.nombre),
    campos, valores, textoBoton: actual ? "Guardar cambios" : "Registrar",
    construir: (fd) => {
      const v = valoresDe(campos, fd);
      const datos = E.aDatos ? E.aDatos(v) : v;
      const extra = E.extra ? E.extra(datos, actual) : [];
      if (actual) {
        const cambios = Object.fromEntries(Object.entries(datos).filter(([k, x]) => distinto(x, actual[k])));
        if (!Object.keys(cambios).length) throw new ErrorJuego("No cambiaste ningún dato");
        return { titulo: `${E.nombre}: ${actual.titulo}`, dominio, efectos: [{ tipo: "doc", col: E.col, id, op: "editar", inst, titulo: actual.titulo, cambios }, ...extra] };
      }
      const fijos = E.col === "inteligencia" ? { inst, tipo: esq } : {};
      return { titulo: `${E.nombre}: ${datos.titulo}`, dominio, efectos: [{ tipo: "doc", col: E.col, id: nuevoId(E.prefijo), op: "crear", inst, titulo: datos.titulo, datos: { ...datos, ...fijos } }, ...extra] };
    },
  });
}

function tablaDocs(items, columnas, esq, inst = null, vacioTexto = "No hay registros.") {
  if (!items.length) return `<p class="vacio">${esc(vacioTexto)}</p>`;
  return `<div class="tabla-envoltura"><table><thead><tr>${columnas.map(([, t]) => `<th>${esc(t)}</th>`).join("")}</tr></thead><tbody>
    ${items.map((d) => `<tr class="clic" data-accion="doc" data-esq="${esq}" data-id="${esc(d.id)}"${inst ? ` data-inst="${inst}"` : ""} tabindex="0">${columnas.map(([k], i) => {
      const v = typeof k === "function" ? k(d) : esc(d[k] ?? "");
      return `<td>${i === 0 ? `<b>${v}</b>` : v || `<span class="nota">—</span>`}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function tablaItems(items, columnas, esq) {
  if (!items.length) return `<p class="vacio">Todavía no hay registros.</p>`;
  return `<div class="tabla-envoltura"><table><thead><tr>${columnas.map(([, t]) => `<th>${esc(t)}</th>`).join("")}<th></th></tr></thead><tbody>
    ${items.map((d) => `<tr>${columnas.map(([k], i) => {
      const v = typeof k === "function" ? k(d) : esc(d[k] ?? "");
      return `<td>${i === 0 ? `<b>${v}</b>` : v || `<button class="btn btn-chico" data-accion="item" data-esq="${esq}" data-id="${esc(d.id)}">Cargar</button>`}</td>`;
    }).join("")}<td><button class="btn btn-chico" data-accion="item" data-esq="${esq}" data-id="${esc(d.id)}">Editar</button></td></tr>`).join("")}</tbody></table></div>`;
}

const subtabs = (grupo, tabs) => {
  const actual = app.sub[grupo] || tabs[0][0];
  return `<div class="subtabs" role="group">${tabs.map(([id, t]) => `<button data-accion="subtab" data-grupo="${grupo}" data-valor="${id}" aria-pressed="${actual === id}">${esc(t)}</button>`).join("")}</div>`;
};
const subActual = (grupo, tabs) => (tabs.some(([id]) => id === app.sub[grupo]) ? app.sub[grupo] : tabs[0][0]);

// ---------- personal (PFA, SIDE, AFI) ----------
const ordenRango = (inst) => Object.fromEntries(INSTITUCIONES[inst].rangos.map((r, i) => [r, i]));
const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const selectRango = (inst, sel, nombre = "rango") => `<select name="${nombre}">${Object.entries(INSTITUCIONES[inst].grupos).map(([g, rs]) => `<optgroup label="${esc(g)}">${opciones(rs.map((r) => [r, r]), sel)}</optgroup>`).join("")}</select>`;
const POR_PAGINA = 50;
const CANTIDAD_SUGERIDA = { pfa: 500, side: 400, afi: 800 };

function filtrosDe(inst) {
  app.filtrosInst ||= {};
  return (app.filtrosInst[inst] ||= { pDiv: "", pRango: "", pEstado: "Activo", pTexto: "", pPagina: 0 });
}
function personalDe(inst) {
  const ids = new Set((app.juego.estado.unidades[inst] || []).map((u) => u.id));
  return app.juego.personal.filter((d) => ids.has(d.id)).flatMap((d) => (d.policias || []).map((p) => ({ ...p, division: d.id })));
}
const esJefe = (p) => /^jefe de departamento/i.test(p.funcion || "");

function vistaPersonal(inst) {
  const f = filtrosDe(inst);
  const orden = ordenRango(inst);
  const todos = personalDe(inst);
  const activos = todos.filter((p) => p.estado === "Activo");
  const texto = normalizar(f.pTexto);
  const lista = todos
    .filter((p) => (!f.pDiv || p.division === f.pDiv) && (!f.pRango || p.rango === f.pRango) && (!f.pEstado || p.estado === f.pEstado)
      && (!texto || normalizar(p.nombre).includes(texto) || normalizar(p.funcion).includes(texto)))
    .sort((a, b) => orden[b.rango] - orden[a.rango] || a.nombre.localeCompare(b.nombre, "es"));
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const pagina = Math.min(f.pPagina, paginas - 1);
  const visibles = lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const porRango = INSTITUCIONES[inst].rangos.map((r) => [r, activos.filter((p) => p.rango === r).length]).filter(([, n]) => n).reverse();
  const jefe = app.rol === "jemc";
  return `<div class="grilla" style="margin-bottom:1.1rem">
    <section class="panel"><h3>Efectivos <small>${num(activos.length)} activos · ${num(todos.length - activos.length)} de baja</small></h3>
      <div class="tabla-envoltura"><table><tbody>${unidadesDe(inst).map(([id, n]) => `<tr><td>${esc(n)}</td><td class="num">${num(activos.filter((p) => p.division === id).length)}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="panel"><h3>Pirámide de rangos</h3>
      ${porRango.length ? `<div class="tabla-envoltura"><table><tbody>${porRango.map(([r, c]) => `<tr><td>${esc(r)}</td><td class="num">${num(c)}</td><td style="width:45%"><div class="barra-voto" style="margin:0"><div class="lleno" style="width:${Math.max(1, (c / Math.max(...porRango.map((x) => x[1]))) * 100)}%"></div></div></td></tr>`).join("")}</tbody></table></div>` : `<p class="vacio">Todavía no hay personal. ${jefe ? "Usá «Generar plantel» para crearlo con nombres inventados." : ""}</p>`}</section>
  </div>
  <div class="acciones" style="margin-bottom:.9rem">
    <button class="btn btn-primario" data-accion="policia-alta" data-inst="${inst}">${jefe ? "Agregar agente" : "Pedir alta"}</button>
    ${jefe ? `<button class="btn" data-accion="generar-plantel" data-inst="${inst}">Generar plantel</button>
    <button class="btn" data-accion="carga-masiva" data-inst="${inst}">Carga masiva</button>
    ${todos.length ? `<button class="btn" data-accion="renombrar-todos" data-inst="${inst}">Regenerar todos los nombres</button>` : ""}` : ""}
  </div>
  <div class="filtros">
    <input type="text" data-foco="buscar-${inst}" data-cambio-texto="pTexto" data-inst="${inst}" placeholder="Buscar por nombre o función" value="${esc(f.pTexto)}" style="max-width:260px" aria-label="Buscar">
    <select data-cambio="filtro-personal" data-inst="${inst}" data-campo="pDiv" aria-label="Departamento"><option value="">Todos los departamentos</option>${opciones(unidadesDe(inst), f.pDiv)}</select>
    <select data-cambio="filtro-personal" data-inst="${inst}" data-campo="pRango" aria-label="Rango"><option value="">Todos los rangos</option>${opciones(INSTITUCIONES[inst].rangos.map((r) => [r, r]), f.pRango)}</select>
    <select data-cambio="filtro-personal" data-inst="${inst}" data-campo="pEstado" aria-label="Estado">${opciones([["Activo", "Activos"], ["Baja", "De baja"], ["", "Todos"]], f.pEstado)}</select>
  </div>
  <div class="panel tabla-envoltura"><table>
    <thead><tr><th>Nombre</th><th>Rango</th><th>Función</th><th>Departamento</th><th>Estado</th><th></th></tr></thead>
    <tbody>${visibles.map((p) => `<tr><td><b>${esc(p.nombre)}</b>${p.notas ? `<div class="nota">${esc(p.notas)}</div>` : ""}</td><td>${esc(p.rango)}</td>
      <td>${p.funcion ? esc(p.funcion) : `<button class="btn btn-chico" data-accion="policia-editar" data-div="${esc(p.division)}" data-id="${esc(p.id)}">Asignar</button>`}</td>
      <td>${esc(nombreUnidad(app.juego.estado, p.division))}</td>
      <td><span class="sello sello-${p.estado === "Activo" ? "consolidado" : "bloqueado"}">${p.estado === "Activo" ? "Activo" : "Baja"}</span></td>
      <td><button class="btn btn-chico" data-accion="policia-editar" data-div="${esc(p.division)}" data-id="${esc(p.id)}">${jefe ? "Editar" : "Pedir cambio"}</button></td></tr>`).join("") || `<tr><td colspan="6" class="vacio">${todos.length ? "Nadie coincide con el filtro." : "No hay personal cargado todavía."}</td></tr>`}</tbody>
  </table>
  <div class="acciones" style="margin-top:.8rem;justify-content:space-between"><span class="nota">${num(lista.length)} resultados${paginas > 1 ? ` · página ${pagina + 1} de ${paginas}` : ""}</span>
  ${paginas > 1 ? `<span class="acciones"><button class="btn btn-chico" data-accion="pagina-personal" data-inst="${inst}" data-valor="${pagina - 1}"${pagina === 0 ? " disabled" : ""}>Anterior</button>
    <button class="btn btn-chico" data-accion="pagina-personal" data-inst="${inst}" data-valor="${pagina + 1}"${pagina >= paginas - 1 ? " disabled" : ""}>Siguiente</button></span>` : ""}</div>
  </div>
  <p class="nota">Los ascensos al rango máximo y las jefaturas plenas de departamento requieren decreto presidencial. El plantel generado deja un jefe interino por departamento.</p>`;
}

function avisoDecretoHTML() { return `<div class="aviso-decide" data-aviso-policia></div>`; }
function engancharAvisoPolicia(form, inst) {
  const caja = form.querySelector("[data-aviso-policia]");
  const actualizar = () => {
    const rango = form.querySelector('[name="rango"]')?.value, funcion = form.querySelector('[name="funcion"]')?.value;
    if (requiereDecreto(inst, rango, funcion)) caja.textContent = "Requiere decreto presidencial: le llega al Presidente para firmar.";
    else caja.textContent = app.rol === "jemc" ? "Está dentro de tus facultades: se aplica al guardar y queda en el registro." : "Le llega al Jefe del Estado Mayor como pedido y se aplica si lo aprueba.";
  };
  form.addEventListener("input", actualizar); form.addEventListener("change", actualizar); actualizar();
}

function abrirAltaPolicia(inst) {
  abrirVentana({ titulo: app.rol === "jemc" ? "Agregar agente" : "Pedir alta", subtitulo: esc(INSTITUCIONES[inst].nombre), estatico: `<form data-form="policia-alta" data-inst="${inst}">
    <label class="campo">Nombre y apellido<span class="acciones" style="flex-wrap:nowrap"><input type="text" name="nombre" required maxlength="120"><button class="btn btn-chico" type="button" data-accion="generar-nombre" data-campo="nombre">Generar nombre</button></span></label>
    <div class="fila-campos"><label class="campo">Rango${selectRango(inst, INSTITUCIONES[inst].rangos[0])}</label>
    <label class="campo">Departamento<select name="division">${opciones(unidadesDe(inst))}</select></label></div>
    <label class="campo">Función<input type="text" name="funcion" maxlength="120"></label>
    <label class="campo">Notas <small>Opcional</small><input type="text" name="notas" maxlength="300"></label>
    <label class="campo">Justificación <small>Opcional</small><textarea name="justificacion" style="min-height:3.5em"></textarea></label>
    ${avisoDecretoHTML()}
    <button class="btn btn-primario" type="submit">${app.rol === "jemc" ? "Dar de alta" : "Enviar pedido"}</button></form>` });
  engancharAvisoPolicia($ventana.querySelector("form"), inst);
}

function abrirEditarPolicia(div, id) {
  const inst = instDeUnidad(div);
  const p = (app.juego.personal.find((d) => d.id === div)?.policias || []).find((x) => x.id === id);
  if (!p) return aviso("Ese agente ya no está en ese departamento.");
  const pendiente = app.juego.propuestas.some((x) => x.estado === EP.revision && (x.efectos || []).some((e) => e.tipo === "personal" && e.id === id));
  abrirVentana({ titulo: p.nombre, subtitulo: `${esc(p.rango)} · ${esc(nombreUnidad(app.juego.estado, div))} · alta el ${esc(fechaLarga(p.alta))}`, estatico: `
    ${pendiente ? `<p class="aviso-decide">Hay un pedido en revisión sobre este agente.</p>` : ""}
    <form data-form="policia-editar" data-div="${esc(div)}" data-id="${esc(id)}">
    <label class="campo">Nombre y apellido<input type="text" name="nombre" value="${esc(p.nombre)}" required maxlength="120"></label>
    <div class="fila-campos"><label class="campo">Rango${selectRango(inst, p.rango)}</label>
    <label class="campo">Departamento<select name="division">${opciones(unidadesDe(inst), div)}</select></label></div>
    <label class="campo">Función<input type="text" name="funcion" value="${esc(p.funcion || "")}" maxlength="120"></label>
    <label class="campo">Notas<input type="text" name="notas" value="${esc(p.notas || "")}" maxlength="300"></label>
    <label class="campo">Justificación <small>Opcional</small><textarea name="justificacion" style="min-height:3.5em"></textarea></label>
    ${avisoDecretoHTML()}
    <div class="acciones"><button class="btn btn-primario" type="submit">${app.rol === "jemc" ? "Guardar cambios" : "Enviar pedido"}</button>
    <button class="btn btn-peligro" type="button" data-accion="policia-estado" data-div="${esc(div)}" data-id="${esc(id)}" data-op="${p.estado === "Activo" ? "baja" : "reincorporar"}">${p.estado === "Activo" ? "Dar de baja" : "Reincorporar"}</button></div></form>` });
  engancharAvisoPolicia($ventana.querySelector("form"), inst);
}

function abrirGenerarPlantel(inst) {
  const unidades = unidadesDe(inst);
  const opcionesUnidad = inst === "pfa" ? [["__todos", "Todos los departamentos"], ...unidades] : unidades;
  abrirVentana({ titulo: "Generar plantel", subtitulo: esc(INSTITUCIONES[inst].nombre), estatico: `<form data-form="generar-plantel" data-inst="${inst}">
    <p>Crea agentes con nombres inventados (combinaciones al azar de nombres y apellidos comunes), rangos repartidos en pirámide y funciones según el departamento. El de mayor rango de cada departamento queda como jefe interino.</p>
    <div class="fila-campos"><label class="campo">Departamento<select name="unidad">${opciones(opcionesUnidad, opcionesUnidad[0]?.[0])}</select></label>
    <label class="campo">Cantidad <small>Por departamento</small><input type="number" name="cantidad" min="1" max="5000" value="${CANTIDAD_SUGERIDA[inst]}"></label></div>
    <button class="btn btn-primario" type="submit">Generar</button></form>` });
}

function abrirCargaMasiva(inst) {
  abrirVentana({ titulo: "Carga masiva", subtitulo: esc(INSTITUCIONES[inst].nombre), estatico: `<form data-form="carga-masiva" data-inst="${inst}">
    <p>Pegá una línea por agente con <b>nombre; rango; departamento; función</b>, separados por punto y coma o por tabulación. La función es opcional. El departamento puede ir por número (por ejemplo, 2) o por nombre.</p>
    <pre class="nota" style="background:var(--papel-2);padding:.6rem;border-radius:6px;overflow-x:auto">Nombre Inventado; ${esc(INSTITUCIONES[inst].rangos[0])}; ${esc(unidadesDe(inst)[0]?.[1] || "")}; Función</pre>
    <label class="campo">Lista<textarea name="lista" style="min-height:12em" required></textarea></label>
    <p class="nota">Rangos válidos: ${esc(INSTITUCIONES[inst].rangos.join(", "))}.<br>Departamentos: ${esc(unidadesDe(inst).map(([, n]) => n).join("; "))}.</p>
    <div data-errores></div>
    <button class="btn btn-primario" type="submit">Revisar y cargar</button></form>` });
}

function parsearLista(texto, inst) {
  const rangos = Object.fromEntries(INSTITUCIONES[inst].rangos.map((r) => [normalizar(r), r]));
  const unidades = {};
  for (const u of app.juego.estado.unidades[inst]) {
    unidades[normalizar(u.nombre)] = u.id;
    if (u.numero) { unidades[String(u.numero)] = u.id; unidades[normalizar(`dpto ${u.numero}`)] = u.id; unidades[normalizar(`Dpto ${u.numero}: ${u.nombre}`)] = u.id; }
  }
  const filas = [], errores = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const [nombre, rango, dpto, funcion = "", notas = ""] = linea.split(linea.includes("\t") ? "\t" : ";").map((x) => x.trim());
    const r = rangos[normalizar(rango)], d = unidades[normalizar(dpto)];
    if (!nombre || !r || !d) errores.push(`Línea ${i + 1}: ${!nombre ? "falta el nombre" : !r ? `rango «${rango || ""}» no reconocido` : `departamento «${dpto || ""}» no reconocido`}`);
    else if (requiereDecreto(inst, r, funcion)) errores.push(`Línea ${i + 1}: ${r}${funcion ? ` / ${funcion}` : ""} requiere decreto presidencial; cargalo individualmente`);
    else filas.push({ nombre: nombre.slice(0, 120), rango: r, division: d, funcion: funcion.slice(0, 120), notas: notas.slice(0, 300) });
  });
  return { filas, errores };
}

// ---------- pestañas de institución ----------
function encabezadoInstitucion(inst, texto) {
  const I = INSTITUCIONES[inst], img = app.juego.estado.escudos?.[inst];
  const jefe = app.rol === "jemc";
  return `<div class="encabezado-inst">
    <div class="escudo">${img ? `<img src="${esc(img)}" alt="Escudo de ${esc(I.corto)}">` : ESCUDOS[inst]}</div>
    <div><h2>${esc(I.nombre)}</h2><p>${texto}</p>
      <div class="acciones" style="margin-top:.5rem">
        <label class="btn btn-chico">${jefe ? "Cambiar escudo" : "Proponer otro escudo"}<input type="file" accept="image/*" data-escudo="${inst}" hidden></label>
        ${img ? `<button class="btn btn-chico" data-accion="escudo-original" data-inst="${inst}">Volver al escudo original</button>` : ""}
      </div></div></div>`;
}

function tablaUnidades(inst) {
  const activos = personalDe(inst).filter((p) => p.estado === "Activo");
  const filas = (app.juego.estado.unidades[inst] || []).map((u) => {
    const de = activos.filter((p) => p.division === u.id);
    const jefe = de.find(esJefe);
    return `<tr><td><b>${esc(u.numero ? `Dpto ${u.numero}` : "")}</b></td><td>${esc(u.nombre)}</td><td class="num">${num(de.length)}</td>
      <td>${jefe ? `${esc(jefe.rango)} ${esc(jefe.nombre)}<div class="nota">${esc(jefe.funcion)}</div>` : `<span class="nota">Sin jefe asignado</span>`}</td>
      <td><button class="btn btn-chico" data-accion="item" data-esq="unidad-${inst}" data-id="${esc(u.id)}">Editar</button></td></tr>`;
  }).join("");
  return `<div class="panel tabla-envoltura"><h3>Departamentos <button class="btn btn-chico" data-accion="item" data-esq="unidad-${inst}">Agregar departamento</button></h3>
    <table><thead><tr><th></th><th>Departamento</th><th class="num">Activos</th><th>Jefatura</th><th></th></tr></thead><tbody>${filas}</tbody></table>
    <p class="nota" style="margin-top:.6rem">Para designar la jefatura, editá al agente y poné «Jefe de Departamento» como función: requiere decreto presidencial.</p></div>`;
}

function tablaVehiculos(sub) {
  const lista = app.juego.estado[sub];
  const t = totalConocido(lista);
  return `<div class="panel tabla-envoltura"><table><thead><tr><th>Modelo</th><th class="num">Cantidad</th><th></th></tr></thead>
    <tbody>${lista.map((v) => `<tr><td>${esc(v.modelo)}</td><td class="num">${vacio(v.cantidad) ? `<button class="btn btn-chico" data-accion="editar-cantidad" data-lista="${sub}" data-id="${esc(v.id)}">Cargar</button>` : num(v.cantidad)}</td>
      <td><button class="btn btn-chico" data-accion="editar-cantidad" data-lista="${sub}" data-id="${esc(v.id)}">Cambiar</button></td></tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${num(t.total)}</td><td></td></tr></tfoot></table>
    ${sub === "pfaHelicopteros" ? `<p class="nota" style="margin-top:.6rem">Los UH-60 Black Hawk son militares y no se cuentan como helicópteros policiales.</p>` : ""}</div>`;
}

function vistaInstitucion(inst) {
  const e = app.juego.estado;
  if (inst === "pfa") {
    const tabs = [["personal", "Personal"], ["departamentos", "Departamentos"], ["terrestre", "Flota terrestre"], ["helicopteros", "Helicópteros"]];
    const sub = subActual("pfa", tabs);
    const cuerpo = sub === "personal" ? vistaPersonal("pfa") : sub === "departamentos" ? tablaUnidades("pfa") : tablaVehiculos(sub === "terrestre" ? "pfaTerrestre" : "pfaHelicopteros");
    return `${encabezadoInstitucion("pfa", `${esc(e.pfa.nota)} Bajo la autoridad del ${esc(e.pfa.autoridad)}.`)}${subtabs("pfa", tabs)}${cuerpo}
      ${sub === "departamentos" ? `<p class="nota">${esc(e.federalismo.cordoba)}</p>` : ""}`;
  }
  const tabs = [["personal", "Personal"], ["departamentos", "Departamentos"], ["expedientes", "Expedientes clasificados"], ["misiones", "Misiones"]];
  const sub = subActual(inst, tabs);
  const docs = app.juego.inteligencia.filter((d) => d.inst === inst && !d.anulado);
  let cuerpo;
  if (sub === "personal") cuerpo = vistaPersonal(inst);
  else if (sub === "departamentos") cuerpo = tablaUnidades(inst);
  else if (sub === "expedientes") {
    const exps = docs.filter((d) => d.tipo === "expediente");
    cuerpo = `<div class="acciones" style="margin-bottom:.9rem"><button class="btn btn-primario" data-accion="doc" data-esq="expediente" data-inst="${inst}">Nuevo expediente</button></div>
      <div class="panel">${tablaDocs(exps, [["titulo", "Carátula"], [(d) => `<span class="sello sello-${d.clasificacion === "Estrictamente secreto" || d.clasificacion === "Secreto" ? "bloqueado" : "pendiente"}">${esc(d.clasificacion || "")}</span>`, "Clasificación"], ["estado", "Estado"], [(d) => esc(d.unidad ? nombreUnidad(e, d.unidad) : ""), "Departamento"], ["responsable", "Responsable"], [(d) => esc(fechaLarga(d.fechaJuego)), "Apertura"]], "expediente", inst, "No hay expedientes. Abrí el primero.")}</div>`;
  } else {
    const mis = docs.filter((d) => d.tipo === "mision");
    const enCurso = mis.filter((m) => m.estado === "En curso" || m.estado === "Planificada");
    cuerpo = `<div class="acciones" style="margin-bottom:.9rem"><button class="btn btn-primario" data-accion="doc" data-esq="mision" data-inst="${inst}">Nueva misión</button><span class="nota">${enCurso.length} en curso o planificadas</span></div>
      <div class="panel">${tablaDocs(mis, [["titulo", "Nombre en clave"], ["estado", "Estado"], ["riesgo", "Riesgo"], [(d) => esc(d.unidad ? nombreUnidad(e, d.unidad) : ""), "Departamento"], ["responsable", "Responsable"], [(d) => esc(fechaLarga(d.fechaJuego)), "Inicio"]], "mision", inst, "No hay misiones registradas.")}</div>`;
  }
  const textos = { side: "Inteligencia y contrainteligencia. Bajo la autoridad del Jefe del Estado Mayor Conjunto.", afi: "Protección de instalaciones estratégicas y controles de acceso. Bajo la autoridad del Jefe del Estado Mayor Conjunto." };
  return `${encabezadoInstitucion(inst, textos[inst])}${subtabs(inst, tabs)}${cuerpo}`;
}

// ---------- FAdeA ----------
function fichaTecnica(id, campos = CAMPOS_FICHA, base = `fichas.${id}`) {
  const f = obtener(app.juego.estado, base) || {};
  return `<div class="tabla-envoltura"><table><tbody>${Object.entries(campos).map(([k, t]) => `<tr><td>${esc(t)}</td><td>${cargable(f[k], `${base}.${k}`, t)}</td></tr>`).join("")}</tbody></table></div>`;
}

function verModelo(id) {
  const vivo = () => {
    const m = app.juego.estado.fadea.modelos.find((x) => x.id === id);
    if (!m) return `<p class="vacio">El modelo ya no existe.</p>`;
    const inv = app.juego.estado.aereo.find((a) => a.id === id);
    return `${ficha([["Rol", esc(m.rol || "")], ["Estado del programa", sello(m.estado === "En producción" ? "Consolidado" : m.estado === "Retirado" ? "Cancelado" : "En evaluación").replace(/>[^<]*</, `>${esc(m.estado || "Sin estado")}<`)],
      ["En inventario", inv ? num(inv.cantidad ?? 0) : "Todavía no hay unidades entregadas"], ["Uso exclusivo argentino", esc(m.exclusivo || "")], m.notas ? ["Notas", esc(m.notas)] : null])}
      <div class="acciones" style="margin-bottom:1rem"><button class="btn" data-accion="item" data-esq="modelo" data-id="${esc(id)}">Editar datos del modelo</button></div>
      <h3 style="margin-bottom:.5rem">Ficha técnica</h3>${fichaTecnica(id)}
      <p class="nota" style="margin-top:.6rem">La ficha es ficticia y la completan los jugadores; la aplicación no agrega datos por su cuenta.</p>`;
  };
  abrirVentana({ titulo: () => app.juego.estado.fadea.modelos.find((x) => x.id === id)?.nombre || "Modelo", vivo });
}

function vistaFadea() {
  const e = app.juego.estado, F = e.fadea;
  const tabs = [["resumen", "Resumen"], ["produccion", "Producción y entregas"], ["plantas", "Plantas"], ["modelos", "Modelos y fichas"], ["finanzas", "Finanzas"], ["filtraciones", "Filtraciones"]];
  const sub = subActual("fadea", tabs);
  const ordenes = app.juego.ordenes.filter((o) => !o.anulado);
  const filtr = app.juego.filtraciones.filter((f) => !f.anulado);
  const gastado = gastosFadea(e);
  const pres = F.presupuestoAnual;
  const nombreModelo = (id) => F.modelos.find((m) => m.id === id)?.nombre || id;
  let cuerpo;
  if (sub === "resumen") {
    cuerpo = `<div class="grilla">
      <section class="panel"><h3>Modelos en producción</h3>${F.modelos.filter((m) => m.estado === "En producción").map((m) => `<div class="item-bandeja"><div><b>${esc(m.nombre)}</b><div class="meta">${esc(m.rol || "")}</div></div><div>${num(e.aereo.find((a) => a.id === m.id)?.cantidad ?? 0)} en servicio</div></div>`).join("") || `<p class="vacio">Ninguno.</p>`}</section>
      <section class="panel"><h3>Órdenes activas</h3>${ordenes.filter((o) => o.estado !== "Entregada").map((o) => `<div class="item-bandeja"><div><b>${esc(nombreModelo(o.modelo))}</b><div class="meta">${num(o.entregadas || 0)} de ${num(o.cantidad)} entregadas</div></div>${sello(o.estado === "Suspendida" ? "Cancelado" : "En evaluación").replace(/>[^<]*</, `>${esc(o.estado)}<`)}</div>`).join("") || `<p class="vacio">No hay órdenes activas.</p>`}</section>
      <section class="panel"><h3>Finanzas</h3><p>Presupuesto anual: ${cargable(pres, "fadea.presupuestoAnual", "Presupuesto anual de FAdeA (US$ millones)", "numero", (v) => `<b>US$ ${num(v)} millones</b>`)}</p>
        <p>Gastado: <b>US$ ${num(gastado)} millones</b>${typeof pres === "number" ? ` · saldo: <b>US$ ${num(pres - gastado)} millones</b>` : ""}</p></section>
      <section class="panel"><h3>Filtraciones abiertas</h3>${filtr.filter((f) => f.estado !== "Cerrada").map((f) => `<div class="item-bandeja"><div><b>${esc(f.titulo)}</b><div class="meta">${esc(f.gravedad)} · ${esc(f.estado)}</div></div></div>`).join("") || `<p class="vacio">Ninguna.</p>`}</section>
    </div>`;
  } else if (sub === "produccion") {
    cuerpo = `<div class="acciones" style="margin-bottom:.9rem"><button class="btn btn-primario" data-accion="doc" data-esq="orden">Nueva orden de producción</button></div>
      <div class="panel">${tablaDocs(ordenes, [[(o) => esc(nombreModelo(o.modelo)), "Modelo"], [(o) => `${num(o.entregadas || 0)} / ${num(o.cantidad)}`, "Entregadas"], [(o) => esc(F.plantas.find((p) => p.id === o.planta)?.nombre || ""), "Planta"], ["estado", "Estado"], ["fechaEstimada", "Entrega estimada"]], "orden", null, "No hay órdenes de producción.")}</div>
      <p class="nota">Una orden nueva es una compra: la autoriza el Presidente. Una vez autorizada, registrar entregas lo decidís vos y cada entrega suma al inventario de la Fuerza Aérea.</p>`;
  } else if (sub === "plantas") {
    cuerpo = `<div class="acciones" style="margin-bottom:.9rem"><button class="btn btn-primario" data-accion="item" data-esq="planta">Agregar planta o instalación</button></div>
      <div class="panel">${tablaItems(F.plantas, [["nombre", "Planta"], ["ubicacion", "Ubicación"], ["estado", "Estado"], ["capacidad", "Capacidad"], ["funcion", "Función"]], "planta")}</div>`;
  } else if (sub === "modelos") {
    cuerpo = `<div class="acciones" style="margin-bottom:.9rem"><button class="btn btn-primario" data-accion="item" data-esq="modelo">Proponer modelo nuevo</button></div>
      <div class="panel tabla-envoltura"><table><thead><tr><th>Modelo</th><th>Rol</th><th>Estado</th><th class="num">En servicio</th><th>Ficha técnica</th></tr></thead><tbody>
      ${F.modelos.map((m) => { const f = e.fichas?.[m.id] || {}; const cargados = Object.keys(CAMPOS_FICHA).filter((k) => !vacio(f[k])).length;
        return `<tr class="clic" data-accion="ver-modelo" data-id="${esc(m.id)}" tabindex="0"><td><b>${esc(m.nombre)}</b></td><td>${esc(m.rol || "")}</td><td>${esc(m.estado || "")}</td><td class="num">${num(e.aereo.find((a) => a.id === m.id)?.cantidad ?? 0)}</td><td>${cargados} de ${Object.keys(CAMPOS_FICHA).length} campos</td></tr>`; }).join("")}
      </tbody></table></div><p class="nota">Un modelo nuevo es un programa nuevo de FAdeA: lo autoriza el Presidente. Las fichas técnicas las cargás vos.</p>`;
  } else if (sub === "finanzas") {
    const movs = [...F.movimientos].reverse();
    cuerpo = `<div class="grilla" style="margin-bottom:1.1rem"><section class="panel"><h3>Presupuesto anual</h3><p>${cargable(pres, "fadea.presupuestoAnual", "Presupuesto anual de FAdeA (US$ millones)", "numero", (v) => `<b>US$ ${num(v)} millones</b>`)}</p>
      <p>Gastado: <b>US$ ${num(gastado)} millones</b>${typeof pres === "number" ? ` · saldo <b>US$ ${num(pres - gastado)} millones</b>` : ""}</p>
      <p class="nota">El presupuesto lo fija el Presidente. Los gastos dentro del saldo los registrás vos; si lo superan, o si no hay presupuesto fijado, necesitan su autorización.</p></section></div>
      <div class="acciones" style="margin-bottom:.9rem"><button class="btn btn-primario" data-accion="item" data-esq="movimiento">Registrar movimiento</button></div>
      <div class="panel">${tablaItems(movs, [["concepto", "Concepto"], ["tipo", "Tipo"], [(m) => `US$ ${num(m.monto)} M`, "Monto"], ["estado", "Estado"], [(m) => esc(fechaLarga(m.alta)), "Fecha"]], "movimiento")}</div>`;
  } else {
    cuerpo = `<div class="acciones" style="margin-bottom:.9rem"><button class="btn btn-primario" data-accion="doc" data-esq="filtracion">Registrar filtración</button></div>
      <div class="panel">${tablaDocs(filtr, [["titulo", "Filtración"], [(f) => `<span class="sello sello-${f.gravedad === "Crítica" || f.gravedad === "Alta" ? "bloqueado" : "pendiente"}">${esc(f.gravedad)}</span>`, "Gravedad"], ["estado", "Estado"], ["trascendio", "Trascendió"], ["origen", "Origen sospechado"], [(f) => esc(fechaLarga(f.fechaJuego)), "Fecha"]], "filtracion", null, "No hay filtraciones registradas.")}</div>
      <p class="nota">Si una filtración trasciende públicamente, la aprobación del gobierno baja según la gravedad: ${Object.entries(IMPACTO_FILTRACION).map(([g, d]) => `${g} ${d}`).join(", ")} puntos.</p>`;
  }
  return `${encabezado("FAdeA", "Fábrica Argentina de Aviones en la partida. La administra el Jefe del Estado Mayor Conjunto; órdenes, modelos nuevos y gastos fuera de presupuesto los autoriza el Presidente.")}${subtabs("fadea", tabs)}${cuerpo}`;
}

// ---------- Gobierno ----------
function vistaGobierno() {
  const e = app.juego.estado;
  const tabs = [["opinion", "Opinión pública"], ["gabinete", "Gabinete"], ["congreso", "Congreso"], ["provincias", "Provincias"], ["exteriores", "Exteriores y tratados"], ["comunicacion", "Comunicación"], ["control", "Control"], ["ceremonias", "Ceremonias"]];
  const sub = subActual("gobierno", tabs);
  let cuerpo;
  if (sub === "opinion") {
    const op = e.gobierno.opinionPublica;
    const hist = [...(op.historial || [])].reverse();
    cuerpo = `<div class="grilla"><section class="panel"><h3>Aprobación del gobierno</h3>
      <p class="codigo">${typeof op.aprobacion === "number" ? `${String(op.aprobacion).replace(".", ",")}%` : ""}</p>
      <p>${cargable(op.aprobacion, "gobierno.opinionPublica.aprobacion", "Aprobación del gobierno (%)", "numero", () => "Medición actual")}</p>
      <p class="nota">Las propuestas pueden llevar un impacto en la opinión pública, que se aplica si se aprueban. Las filtraciones que trascienden bajan la aprobación según su gravedad.${typeof op.aprobacion === "number" ? "" : " Hasta que se cargue una medición inicial, los impactos no se aplican."}</p></section>
      ${mapaProvincias()}
      <section class="panel"><h3>Historial</h3>${hist.length ? `<div class="tabla-envoltura"><table><tbody>${hist.map((h) => `<tr><td>${esc(fechaLarga(h.fecha))}</td><td class="num"><b>${String(h.valor).replace(".", ",")}%</b></td><td>${esc(h.motivo)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="vacio">Sin mediciones todavía.</p>`}</section></div>`;
  } else if (sub === "gabinete") {
    cuerpo = `<div class="acciones" style="margin-bottom:.9rem"><button class="btn btn-primario" data-accion="item" data-esq="gabinete">Agregar cargo</button></div>
      <div class="panel">${tablaItems(e.gabinete, [["cargo", "Cargo"], ["titular", "Titular"], ["estado", "Estado"], ["notas", "Notas"]], "gabinete")}</div>
      <p class="nota">Los nombres son inventados: usá «Generar nombre» al nombrar a alguien.</p>`;
  } else if (sub === "congreso") {
    cuerpo = vistaCongreso();
  } else if (sub === "comunicacion") {
    cuerpo = vistaComunicacion();
  } else if (sub === "control") {
    cuerpo = vistaControl();
  } else if (sub === "ceremonias") {
    cuerpo = vistaCeremonias();
  } else if (sub === "provincias") {
    cuerpo = `${mapaProvincias()}<div class="panel">${tablaItems(e.provincias, [["nombre", "Jurisdicción"], ["gobernador", "Gobernador/a"], ["alineamiento", "Relación"], [(p) => { const v = aprobacionProvincia(e, p); return v === null ? "" : `${fmt1(v)}%`; }, "Aprobación"], ["acuerdos", "Acuerdos"]], "provincia")}</div>`;
  } else {
    cuerpo = `<div class="acciones" style="margin-bottom:.9rem"><button class="btn btn-primario" data-accion="item" data-esq="relacion">Nueva relación bilateral</button><button class="btn" data-accion="item" data-esq="tratado">Nuevo tratado</button></div>
      <div class="panel"><h3>Relaciones bilaterales</h3>${tablaItems(e.relaciones, [["pais", "País"], ["estado", "Estado"], ["temas", "Temas"]], "relacion")}</div>
      <div class="panel"><h3>Tratados y acuerdos</h3>${tablaItems(e.tratados, [["nombre", "Tratado"], ["partes", "Partes"], ["tipo", "Tipo"], ["estado", "Estado"], ["notas", "Notas"]], "tratado")}</div>
      <p class="nota">Las conversaciones no equivalen a acuerdos firmados: el estado de cada tratado lo definen los jugadores.</p>`;
  }
  return `${encabezado("Gobierno", "Conducción del Presidente: gabinete, Congreso, provincias y relaciones exteriores. El Jefe del Estado Mayor puede proponer y el Presidente decide.")}${subtabs("gobierno", tabs)}${cuerpo}`;
}

// ---------- versión 3: economía, presupuesto, obras y Congreso ----------
const esPresidente = () => app.rol === "presidente";
const fmt1 = (n) => (typeof n === "number" ? n.toLocaleString("es-AR", { maximumFractionDigits: 1 }) : "");
const usd = (n) => (typeof n === "number" ? `US$ ${n.toLocaleString("es-AR")} M` : "");
const barra = (v, max = 100, color = "var(--s-aprobado)") => `<div class="barra-voto" style="margin:0;min-width:80px"><div class="lleno" style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%;background:${color}"></div></div>`;
const colorMoral = (m) => (m >= 70 ? "var(--s-consolidado)" : m >= 50 ? "var(--s-curso)" : "var(--s-bloqueado)");

// ---------- Economía ----------
function tendencia(clave) {
  const h = (app.juego.estado.economia.historial || []).slice(-6).map((x) => x[clave]).filter((x) => typeof x === "number");
  return h.length > 1 ? h.map(fmt1).join(" → ") : "";
}

function vistaEconomia() {
  const e = app.juego.estado;
  const tabs = [["indicadores", "Indicadores"], ["medidas", "Medidas económicas"], ["presupuesto", "Presupuesto"]];
  const sub = subActual("economia", tabs);
  const pres = esPresidente();
  let cuerpo;
  if (sub === "indicadores") {
    const faltan = Object.entries(e.indicadores).filter(([k, i]) => k !== "reservas" && typeof i.valor !== "number").length;
    cuerpo = `${faltan ? `<p class="aviso-decide">${pres ? "Cargá los valores iniciales de los indicadores" : "El Presidente tiene que cargar los valores iniciales de los indicadores"}: desde ahí se mueven solos con las medidas y el turno mensual. Faltan ${faltan}.</p>` : ""}
      <div class="panel tabla-envoltura"><table><thead><tr><th>Indicador</th><th class="num">Valor</th><th>Últimos meses</th><th>Cargado</th><th></th></tr></thead><tbody>
      ${Object.entries(e.indicadores).filter(([k]) => k !== "reservas").map(([k, i]) => `<tr><td><b>${esc(i.nombre)}</b></td><td class="num">${typeof i.valor === "number" ? `${fmt1(i.valor)} ${esc(i.unidad)}` : ""}</td><td class="nota">${esc(tendencia(k))}</td><td class="nota">${i.fechaCarga ? esc(fechaLarga(i.fechaCarga)) : ""}</td>
        <td><button class="btn btn-chico" data-accion="indicador" data-clave="${k}">${typeof i.valor === "number" ? "Corregir" : "Cargar"}</button></td></tr>`).join("")}
      <tr><td><b>Aprobación del gobierno</b></td><td class="num">${typeof e.gobierno.opinionPublica.aprobacion === "number" ? `${fmt1(e.gobierno.opinionPublica.aprobacion)}%` : ""}</td><td class="nota">${esc(tendencia("aprobacion"))}</td><td></td>
        <td><button class="btn btn-chico" data-accion="dato" data-ruta="gobierno.opinionPublica.aprobacion" data-titulo="Aprobación del gobierno (%)" data-tipo="numero">${typeof e.gobierno.opinionPublica.aprobacion === "number" ? "Corregir" : "Cargar"}</button></td></tr>
      </tbody></table></div>
      <p class="nota">Las reservas están en la pestaña Banco Central. Inflación, crecimiento, desempleo y pobreza en % anual. Los valores son de la partida: los cargan los jugadores y después los mueven las reglas del juego.</p>`;
  } else if (sub === "medidas") {
    const activas = e.economia.medidas || [];
    cuerpo = `${activas.length ? `<div class="panel"><h3>Medidas vigentes</h3>${activas.map((m) => `<div class="item-bandeja"><div><b>${esc(MEDIDAS[m.tipo]?.nombre || m.tipo)}</b><div class="meta">Desde el ${esc(fechaLarga(m.inicio))}</div></div><div>${m.restante} ${m.restante === 1 ? "mes" : "meses"} restantes</div></div>`).join("")}</div>` : ""}
      <div class="grilla">${Object.entries(MEDIDAS).map(([k, M]) => `<section class="panel"><h3>${esc(M.nombre)} <small>${M.meses} ${M.meses === 1 ? "mes" : "meses"}</small></h3>
        <p class="nota">Por mes: ${esc(describirEfectosCrisis({ ind: M.mensual, pct: M.pct }))}.${M.opinion ? ` Al anunciarla: aprobación ${M.opinion > 0 ? "+" : ""}${fmt1(M.opinion)}.` : ""}</p>
        <button class="btn btn-chico${pres ? " btn-primario" : ""}" data-accion="medida" data-tipo="${k}">${pres ? "Aplicar" : "Proponer al Presidente"}</button></section>`).join("")}</div>`;
  } else {
    const P = e.presupuesto;
    const vig = P.vigente;
    const recaud = e.indicadores.recaudacion?.valor;
    const total = totalPresupuesto(P.borrador);
    const ley = P.leyId ? app.juego.leyes.find((l) => l.id === P.leyId) : null;
    cuerpo = `<div class="acciones" style="margin-bottom:.9rem">
      ${pres ? `<button class="btn btn-primario" data-accion="editar-presupuesto">Editar presupuesto propuesto</button><button class="btn" data-accion="enviar-presupuesto">Enviar al Congreso</button>` : `<button class="btn btn-primario" data-accion="pedir-fondos">Pedir fondos para mis áreas</button>`}
      ${ley ? `<span class="nota">Último proyecto: ${esc(ley.titulo)} · ${esc(ley.estado)}</span>` : ""}</div>
      <div class="panel tabla-envoltura"><table><thead><tr><th>Área</th><th class="num">Pedido del Jefe del Estado Mayor</th><th class="num">Propuesto</th><th class="num">Vigente</th><th>Moral</th></tr></thead><tbody>
      ${Object.entries(AREAS_PRESUPUESTO).map(([k, a]) => { const m = e.areas?.[k]?.moral;
        return `<tr><td><b>${esc(a.nombre)}</b></td><td class="num">${a.jemc ? usd(P.pedidos?.[k]) : `<span class="nota">—</span>`}</td><td class="num">${usd(P.borrador[k])}</td><td class="num">${vig ? usd(vig[k]) : ""}</td>
          <td>${typeof m === "number" ? `<div class="acciones" style="flex-wrap:nowrap">${barra(m, 100, colorMoral(m))}<span class="nota">${fmt1(m)}</span></div>` : ""}</td></tr>`; }).join("")}
      </tbody><tfoot><tr><td>Total</td><td class="num">${usd(totalPresupuesto(P.pedidos))}</td><td class="num">${usd(total)}</td><td class="num">${vig ? usd(totalPresupuesto(vig)) : ""}</td><td></td></tr></tfoot></table>
      <p class="nota" style="margin-top:.6rem">Recaudación anual: ${typeof recaud === "number" ? `<b>${usd(recaud)}</b> · ${recaud - total >= 0 ? `superávit propuesto de ${usd(recaud - total)}` : `déficit propuesto de ${usd(total - recaud)}`}` : "cargala en Indicadores para ver el saldo"}.</p></div>
      <p class="nota">${vig ? "Rige el presupuesto aprobado por el Congreso." : "Todavía no hay presupuesto aprobado: tus áreas funcionan a media marcha y las obras avanzan más lento."} El Jefe del Estado Mayor pide fondos para sus áreas, el Presidente arma el reparto y lo manda al Congreso. Cada mes, la moral de cada área se acerca a lo que recibió frente a lo que pidió. Un déficit sube el riesgo país y la inflación.</p>`;
  }
  return `${encabezado("Economía", "Conducción del Presidente. Las medidas y el presupuesto mueven los indicadores en cada turno mensual.")}${subtabs("economia", tabs)}${cuerpo}`;
}

function abrirIndicador(clave) {
  const ind = app.juego.estado.indicadores[clave];
  abrirFormulario({
    titulo: ind.nombre, campos: [{ k: "valor", l: `${ind.nombre} (${ind.unidad})`, tipo: "numero", req: true }], valores: { valor: ind.valor }, conImpacto: false,
    construir: (fd) => ({ titulo: `${ind.nombre}: ${fd.get("valor")}`, efectos: [{ tipo: "indicador", clave, valor: leerCampo({ k: "valor", l: ind.nombre, tipo: "numero", req: true }, fd) }] }),
  });
}

function abrirMedida(tipo) {
  const M = MEDIDAS[tipo];
  abrirFormulario({
    titulo: M.nombre, campos: [{ k: "meses", l: "Duración (meses)", tipo: "numero", req: true }], valores: { meses: M.meses }, conImpacto: false,
    textoBoton: esPresidente() ? "Aplicar medida" : "Proponer",
    construir: (fd) => {
      const meses = leerCampo({ k: "meses", l: "Duración", tipo: "numero", req: true }, fd);
      if (!Number.isInteger(meses) || meses < 1 || meses > 24) throw new ErrorJuego("La duración va de 1 a 24 meses");
      const efectos = [{ tipo: "medida", medida: { id: nuevoId("med"), tipo, nombre: M.nombre, meses } }];
      if (M.opinion) efectos.push({ tipo: "opinion", delta: M.opinion, motivo: M.nombre });
      return { titulo: `Medida económica: ${M.nombre}`, dominio: "economia", efectos };
    },
  });
}

function abrirPresupuesto(modo) {
  const P = app.juego.estado.presupuesto;
  const areas = modo === "pedido" ? AREAS_JEMC : Object.keys(AREAS_PRESUPUESTO);
  const base = modo === "pedido" ? P.pedidos : P.borrador;
  const raiz = modo === "pedido" ? "presupuesto.pedidos" : "presupuesto.borrador";
  abrirFormulario({
    titulo: modo === "pedido" ? "Pedido de fondos" : "Presupuesto propuesto", subtitulo: "Montos anuales en US$ millones", conImpacto: false,
    campos: areas.map((a) => ({ k: a, l: AREAS_PRESUPUESTO[a].nombre, tipo: "numero" })), valores: base,
    construir: (fd) => {
      const efectos = areas.map((a) => [a, leerCampo({ k: a, l: AREAS_PRESUPUESTO[a].nombre, tipo: "numero" }, fd)])
        .filter(([a, v]) => distinto(v, base[a])).map(([a, v]) => ({ tipo: "dato", ruta: `${raiz}.${a}`, valor: v }));
      if (!efectos.length) throw new ErrorJuego("No cambiaste ningún monto");
      // El pedido de cada área lo decide quien la conduce: todas las de este formulario son del Jefe del Estado Mayor.
      return { titulo: modo === "pedido" ? "Pedido de fondos del Jefe del Estado Mayor" : "Presupuesto propuesto por el Presidente", dominio: modo === "pedido" ? "fuerzas" : "economia", efectos };
    },
  });
}

// ---------- Obras ----------
const TIPOS_OBRA = ["Ruta", "Ferrocarril", "Subte", "Puerto", "Vivienda", "Escuela", "Hospital", "Energía", "Agua y cloacas", "Otra"];

function vistaObras() {
  const e = app.juego.estado;
  const tabs = [["licitaciones", "Licitaciones"], ["ejecucion", "En ejecución"], ["terminadas", "Terminadas e inauguradas"]];
  const sub = subActual("obras", tabs);
  const obras = app.juego.obras.filter((o) => !o.anulado);
  const pres = esPresidente();
  const vig = e.presupuesto.vigente;
  const necesario = obras.filter((o) => o.estado === "En ejecución").reduce((n, o) => n + o.costo / o.plazo, 0);
  const fondos = vig ? (Number(vig.obras) || 0) / 12 : null;
  let cuerpo;
  if (sub === "licitaciones") {
    const lic = obras.filter((o) => o.estado === "En licitación");
    cuerpo = `<div class="acciones" style="margin-bottom:.9rem">${pres ? `<button class="btn btn-primario" data-accion="nueva-licitacion">Nueva licitación</button>` : `<button class="btn" data-accion="nueva-licitacion">Proponer una obra</button>`}</div>
      <div class="panel">${lic.length ? `<div class="tabla-envoltura"><table><thead><tr><th>Obra</th><th>Tipo</th><th>Provincia</th><th>Ofertas</th><th></th></tr></thead><tbody>
      ${lic.map((o) => `<tr><td><b>${esc(o.nombre)}</b></td><td>${esc(o.tipo)}</td><td>${esc(o.provincia)}</td><td>${(o.ofertas || []).length}</td><td><button class="btn btn-chico" data-accion="ver-licitacion" data-id="${esc(o.id)}">Ver ofertas</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="vacio">No hay licitaciones abiertas.</p>`}</div>`;
  } else if (sub === "ejecucion") {
    const ej = obras.filter((o) => o.estado === "En ejecución");
    cuerpo = `<p class="aviso-decide">${fondos === null ? "Sin presupuesto aprobado: las obras avanzan al 60% del ritmo previsto." : `Fondos mensuales para obras: ${usd(Math.round(fondos))}; necesarios: ${usd(Math.round(necesario))}. ${fondos >= necesario ? "Alcanzan." : "No alcanzan: las obras avanzan más lento."}`}</p>
      <div class="panel">${ej.length ? `<div class="tabla-envoltura"><table><thead><tr><th>Obra</th><th>Provincia</th><th>Empresa</th><th>Avance</th><th class="num">Meses</th><th class="num">Costo</th></tr></thead><tbody>
      ${ej.map((o) => `<tr><td><b>${esc(o.nombre)}</b><div class="nota">${esc(o.tipo)}</div></td><td>${esc(o.provincia)}</td><td>${esc(o.empresa)}<div class="nota">Riesgo ${esc(String(o.riesgo).toLowerCase())}</div></td>
        <td><div class="acciones" style="flex-wrap:nowrap">${barra(o.avance || 0)}<span class="nota">${fmt1(o.avance || 0)}%</span></div></td><td class="num">${o.meses || 0} de ${o.plazo}</td><td class="num">${usd(o.costo)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="vacio">No hay obras en ejecución.</p>`}</div>`;
  } else {
    const ter = obras.filter((o) => o.estado === "Terminada" || o.estado === "Inaugurada");
    cuerpo = `<div class="panel">${ter.length ? ter.map((o) => `<div class="item-bandeja"><div><b>${esc(o.nombre)}</b><div class="meta">${esc(o.provincia)} · ${esc(o.empresa || "")}</div></div>
      ${o.estado === "Inaugurada" ? sello("Consolidado").replace(">Consolidado<", ">Inaugurada<") : pres ? `<button class="btn btn-chico btn-primario" data-accion="inaugurar" data-id="${esc(o.id)}">Inaugurar</button>` : `<span class="nota">Lista para inaugurar</span>`}</div>`).join("") : `<p class="vacio">Todavía no hay obras terminadas.</p>`}</div>
      <p class="nota">Inaugurar sube 1,5 puntos la aprobación nacional y 5 la de la provincia.</p>`;
  }
  return `${encabezado("Obras públicas", "Conducción del Presidente: licitaciones con empresas ficticias, avance mensual según los fondos e inauguraciones.")}${subtabs("obras", tabs)}${cuerpo}`;
}

function abrirLicitacion() {
  const provincias = app.juego.estado.provincias.map((p) => [p.id, p.nombre]);
  abrirFormulario({
    titulo: "Nueva licitación", conImpacto: false, textoBoton: esPresidente() ? "Abrir licitación" : "Proponer al Presidente",
    campos: [{ k: "nombre", l: "Obra", req: true }, { k: "tipo", l: "Tipo", tipo: "select", req: true, opciones: TIPOS_OBRA },
      { k: "provinciaId", l: "Provincia", tipo: "select", req: true, opciones: provincias },
      { k: "costo", l: "Costo estimado (US$ millones)", tipo: "numero", req: true }, { k: "plazo", l: "Plazo estimado (meses)", tipo: "numero", req: true },
      { k: "descripcion", l: "Descripción", tipo: "area" }],
    construir: (fd) => {
      const v = valoresDe([{ k: "nombre", l: "Obra", req: true }, { k: "tipo", l: "Tipo", req: true }, { k: "provinciaId", l: "Provincia", req: true },
        { k: "costo", l: "Costo", tipo: "numero", req: true }, { k: "plazo", l: "Plazo", tipo: "numero", req: true }, { k: "descripcion", l: "Descripción" }], fd);
      if (!(v.costo > 0) || !Number.isInteger(v.plazo) || v.plazo < 1) throw new ErrorJuego("Costo positivo y plazo en meses enteros");
      const provincia = app.juego.estado.provincias.find((p) => p.id === v.provinciaId)?.nombre;
      return { titulo: `Licitación: ${v.nombre}`, dominio: "infraestructura", efectos: [{ tipo: "doc", col: "obras", id: nuevoId("obra"), op: "crear", titulo: v.nombre,
        datos: { ...v, provincia, titulo: v.nombre, estado: "En licitación", ofertas: generarOfertas(v.costo, v.plazo) } }] };
    },
  });
}

function verLicitacion(id) {
  const vivo = () => {
    const o = app.juego.obras.find((x) => x.id === id);
    if (!o) return `<p class="vacio">La licitación ya no existe.</p>`;
    return `${ficha([["Tipo", esc(o.tipo)], ["Provincia", esc(o.provincia)], ["Costo estimado", usd(o.costo)], ["Plazo estimado", `${o.plazo} meses`], o.descripcion ? ["Descripción", esc(o.descripcion)] : null])}
      <div class="tabla-envoltura"><table><thead><tr><th>Empresa</th><th class="num">Oferta</th><th class="num">Plazo</th><th>Riesgo de demora</th><th></th></tr></thead><tbody>
      ${(o.ofertas || []).map((of) => `<tr><td><b>${esc(of.empresa)}</b></td><td class="num">${usd(of.costo)}</td><td class="num">${of.plazo} meses</td><td>${esc(of.riesgo)}</td>
        <td>${o.estado === "En licitación" && esPresidente() ? `<button class="btn btn-chico btn-primario" data-accion="adjudicar" data-id="${esc(id)}" data-oferta="${esc(of.id)}">Adjudicar</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div><p class="nota" style="margin-top:.6rem">Las empresas son ficticias. Una oferta barata con riesgo alto puede demorarse; una cara con riesgo bajo suele cumplir.</p>`;
  };
  abrirVentana({ titulo: () => app.juego.obras.find((x) => x.id === id)?.nombre || "Licitación", vivo });
}

// ---------- Congreso ----------
function filtrosCongreso() { return (app.filtrosCongreso ||= { camara: "D", bloque: "", provincia: "", texto: "", pagina: 0 }); }

function composicion(camara) {
  const c = app.juego.estado.congreso;
  const bloques = camara === "D" ? c.bloquesDiputados : c.bloquesSenado;
  const leg = (c.legisladores || []).filter((l) => l.camara === camara);
  const total = leg.length || 1;
  const colores = { Oficialista: "var(--presidente)", Aliado: "var(--s-curso)", Independiente: "var(--s-desconocido)", Opositor: "var(--s-propuesta)" };
  const conteo = bloques.map((b) => [b, leg.filter((l) => l.bloque === b.id).length]);
  const mayoria = Math.floor(total / 2) + 1;
  const ofi = conteo.filter(([b]) => b.postura === "Oficialista").reduce((n, [, x]) => n + x, 0);
  return `<section class="panel"><h3>${camara === "D" ? "Cámara de Diputados" : "Senado"} <small>${total} bancas · mayoría: ${mayoria}</small></h3>
    <div class="hemiciclo">${conteo.map(([b, n]) => `<span style="flex:${n};background:${colores[b.postura] || colores.Independiente}" title="${esc(b.nombre)}: ${n}"></span>`).join("")}</div>
    <div class="tabla-envoltura"><table><tbody>${conteo.map(([b, n]) => `<tr><td><span class="punto" style="background:${colores[b.postura] || colores.Independiente}"></span><b>${esc(b.nombre)}</b></td><td>${esc(b.postura || "")}</td><td class="num">${n}</td>
      <td><button class="btn btn-chico" data-accion="item" data-esq="${camara === "D" ? "bloqueDiputados" : "bloqueSenado"}" data-id="${esc(b.id)}">Editar</button></td></tr>`).join("")}</tbody></table></div>
    <p class="nota" style="margin-top:.5rem">El oficialismo tiene ${ofi} bancas propias${ofi >= mayoria ? ": mayoría propia." : "."}</p></section>`;
}

function vistaCongreso() {
  const e = app.juego.estado, c = e.congreso, f = filtrosCongreso();
  const bloques = f.camara === "D" ? c.bloquesDiputados : c.bloquesSenado;
  const texto = normalizar(f.texto);
  const lista = (c.legisladores || []).filter((l) => l.camara === f.camara && (!f.bloque || l.bloque === f.bloque) && (!f.provincia || l.provincia === f.provincia) && (!texto || normalizar(l.nombre).includes(texto)))
    .sort((a, b) => a.provincia.localeCompare(b.provincia, "es") || a.nombre.localeCompare(b.nombre, "es"));
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA)), pagina = Math.min(f.pagina, paginas - 1);
  const nombreBloque = (id) => bloques.find((b) => b.id === id)?.nombre || "";
  const leyes = app.juego.leyes.filter((l) => !l.anulado);
  const pres = esPresidente();
  const votos = (v) => (v && typeof v.afirmativos === "number" ? `${v.afirmativos} a ${v.negativos}` : "");
  return `<div class="grilla" style="margin-bottom:1.1rem">${composicion("D")}${composicion("S")}</div>
    <div class="acciones" style="margin-bottom:.9rem"><button class="btn btn-primario" data-accion="doc" data-esq="ley">Nuevo proyecto de ley</button>
      <button class="btn" data-accion="item" data-esq="bloqueDiputados">Nuevo bloque en Diputados</button><button class="btn" data-accion="item" data-esq="bloqueSenado">Nuevo bloque en el Senado</button></div>
    <div class="panel tabla-envoltura"><h3>Proyectos de ley</h3>${leyes.length ? `<table><thead><tr><th>Proyecto</th><th>Estado</th><th>Diputados</th><th>Senado</th><th></th></tr></thead><tbody>
      ${leyes.map((l) => { const votable = ["Presentado", "En comisión", "Media sanción"].includes(l.estado);
        const camara = l.estado === "Media sanción" ? (/senado/i.test(l.origen || "") ? "Diputados" : "el Senado") : (/senado/i.test(l.origen || "") ? "el Senado" : "Diputados");
        return `<tr><td><b>${esc(l.titulo)}</b>${l.negociaciones?.length ? `<div class="nota">Negociado con: ${esc(l.negociaciones.map((n) => n.bloqueNombre).join(", "))}</div>` : ""}</td><td>${esc(l.estado)}</td><td>${votos(l.votosDiputados)}</td><td>${votos(l.votosSenado)}</td>
        <td><div class="acciones">${pres && votable ? `<button class="btn btn-chico btn-primario" data-accion="votar-ley" data-id="${esc(l.id)}">Votar en ${camara}</button><button class="btn btn-chico" data-accion="negociar" data-id="${esc(l.id)}">Negociar</button>` : ""}
          ${l.detalle ? `<button class="btn btn-chico" data-accion="ver-votacion-ley" data-id="${esc(l.id)}">Ver votación</button>` : ""}
          <button class="btn btn-chico" data-accion="doc" data-esq="ley" data-id="${esc(l.id)}">Editar</button></div></td></tr>`; }).join("")}
    </tbody></table>` : `<p class="vacio">No hay proyectos.</p>`}
    <p class="nota" style="margin-top:.6rem">Al votar, cada legislador decide según su bloque, la aprobación del gobierno, la de su provincia y lo negociado. Una ley necesita aprobación en las dos cámaras.</p></div>
    <div class="panel"><h3>Legisladores</h3>
      <div class="filtros"><select data-cambio="filtro-congreso" data-campo="camara" aria-label="Cámara">${opciones([["D", "Diputados"], ["S", "Senado"]], f.camara)}</select>
        <select data-cambio="filtro-congreso" data-campo="bloque" aria-label="Bloque"><option value="">Todos los bloques</option>${opciones(bloques.map((b) => [b.id, b.nombre]), f.bloque)}</select>
        <select data-cambio="filtro-congreso" data-campo="provincia" aria-label="Provincia"><option value="">Todas las provincias</option>${opciones(e.provincias.map((p) => [p.nombre, p.nombre]), f.provincia)}</select>
        <input type="text" data-foco="buscar-legislador" data-texto-congreso placeholder="Buscar por nombre" value="${esc(f.texto)}" style="max-width:220px" aria-label="Buscar legislador"></div>
      <div class="tabla-envoltura"><table><thead><tr><th>Nombre</th><th>Provincia</th><th>Bloque</th><th></th></tr></thead><tbody>
      ${lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA).map((l) => `<tr><td><b>${esc(l.nombre)}</b></td><td>${esc(l.provincia)}</td><td>${esc(nombreBloque(l.bloque))}</td><td><button class="btn btn-chico" data-accion="legislador" data-id="${esc(l.id)}">Pase de bloque</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="acciones" style="margin-top:.8rem;justify-content:space-between"><span class="nota">${lista.length} legisladores${paginas > 1 ? ` · página ${pagina + 1} de ${paginas}` : ""}</span>
      ${paginas > 1 ? `<span class="acciones"><button class="btn btn-chico" data-accion="pagina-congreso" data-valor="${pagina - 1}"${pagina === 0 ? " disabled" : ""}>Anterior</button><button class="btn btn-chico" data-accion="pagina-congreso" data-valor="${pagina + 1}"${pagina >= paginas - 1 ? " disabled" : ""}>Siguiente</button></span>` : ""}</div>
      <p class="nota">Los nombres son inventados. Los pases de bloque los decide el Presidente.</p></div>`;
}

function abrirLegislador(id) {
  const c = app.juego.estado.congreso;
  const l = c.legisladores.find((x) => x.id === id);
  const bloques = l.camara === "D" ? c.bloquesDiputados : c.bloquesSenado;
  abrirFormulario({
    titulo: l.nombre, subtitulo: `${l.camara === "D" ? "Diputado/a" : "Senador/a"} por ${esc(l.provincia)}`, conImpacto: false, textoBoton: "Registrar pase",
    campos: [{ k: "bloque", l: "Bloque", tipo: "select", req: true, opciones: bloques.map((b) => [b.id, b.nombre]) }], valores: { bloque: l.bloque },
    construir: (fd) => {
      const bloque = fd.get("bloque");
      if (bloque === l.bloque) throw new ErrorJuego("Elegí otro bloque");
      return { titulo: `Pase de bloque: ${l.nombre}`, dominio: "politica", efectos: [{ tipo: "lista", ruta: "congreso.legisladores", op: "editar", id, nombre: l.nombre, cambios: { bloque } }] };
    },
  });
}

function abrirNegociar(id) {
  const ley = app.juego.leyes.find((x) => x.id === id);
  const c = app.juego.estado.congreso;
  const bloques = [...c.bloquesDiputados.map((b) => [b.id, `Diputados: ${b.nombre}`]), ...c.bloquesSenado.map((b) => [b.id, `Senado: ${b.nombre}`])].filter(([bid]) => !(ley.negociaciones || []).some((n) => n.bloqueId === bid));
  abrirFormulario({
    titulo: `Negociar: ${ley.titulo}`, conImpacto: true, textoBoton: "Cerrar acuerdo",
    campos: [{ k: "bloqueId", l: "Bloque", tipo: "select", req: true, opciones: bloques }, { k: "concesion", l: "A cambio de", req: true, ayuda: "Por ejemplo, una obra en su provincia" }],
    construir: (fd) => {
      const v = valoresDe([{ k: "bloqueId", l: "Bloque", req: true }, { k: "concesion", l: "Concesión", req: true }], fd);
      const nombre = [...c.bloquesDiputados, ...c.bloquesSenado].find((b) => b.id === v.bloqueId)?.nombre;
      return { titulo: `Acuerdo con ${nombre} por «${ley.titulo}»`, dominio: "politica", efectos: [{ tipo: "doc", col: "leyes", id, op: "editar", titulo: ley.titulo,
        cambios: { negociaciones: [...(ley.negociaciones || []), { bloqueId: v.bloqueId, bloqueNombre: nombre, concesion: v.concesion, fecha: app.juego.estado.fechaJuego }] } }] };
    },
  });
}

function verVotacionLey(id) {
  const ley = app.juego.leyes.find((x) => x.id === id);
  const c = app.juego.estado.congreso;
  const tabla = (cam) => {
    const d = ley.detalle?.[cam];
    if (!d) return "";
    const bloques = cam === "D" ? c.bloquesDiputados : c.bloquesSenado;
    return `<h3 style="margin:.8rem 0 .4rem">${cam === "D" ? "Diputados" : "Senado"}</h3><div class="tabla-envoltura"><table><thead><tr><th>Bloque</th><th class="num">A favor</th><th class="num">En contra</th><th class="num">Abst.</th><th class="num">Ausentes</th></tr></thead><tbody>
      ${Object.entries(d).map(([b, v]) => `<tr><td>${esc(bloques.find((x) => x.id === b)?.nombre || b)}</td><td class="num">${v.afirmativos}</td><td class="num">${v.negativos}</td><td class="num">${v.abstenciones}</td><td class="num">${v.ausentes}</td></tr>`).join("")}</tbody></table></div>`;
  };
  abrirVentana({ titulo: `Votación: ${ley.titulo}`, subtitulo: esc(ley.estado), estatico: tabla("D") + tabla("S") });
}

// ---------- Provincias: mapa ----------
const MAPA = [
  ["jujuy", 1, 0], ["salta", 2, 0], ["formosa", 3, 0], ["misiones", 5, 0],
  ["catamarca", 1, 1], ["tucuman", 2, 1], ["santiago-del-estero", 3, 1], ["chaco", 4, 1], ["corrientes", 5, 1],
  ["san-juan", 0, 2], ["la-rioja", 1, 2], ["cordoba", 2, 2], ["santa-fe", 3, 2], ["entre-rios", 4, 2],
  ["mendoza", 0, 3], ["san-luis", 1, 3], ["la-pampa", 2, 3], ["buenos-aires", 3, 3], ["ciudad-autonoma-de-buenos-aires", 4, 3],
  ["neuquen", 0, 4], ["rio-negro", 1, 4], ["chubut", 1, 5], ["santa-cruz", 1, 6], ["tierra-del-fuego", 2, 7],
];
const ABREV = { jujuy: "JUJ", salta: "SAL", formosa: "FOR", misiones: "MIS", catamarca: "CAT", tucuman: "TUC", "santiago-del-estero": "SDE", chaco: "CHA", corrientes: "COR", "san-juan": "SJU", "la-rioja": "LRJ", cordoba: "CBA", "santa-fe": "SFE", "entre-rios": "ERI", mendoza: "MZA", "san-luis": "SLU", "la-pampa": "LPA", "buenos-aires": "BUE", "ciudad-autonoma-de-buenos-aires": "CABA", neuquen: "NQN", "rio-negro": "RNE", chubut: "CHU", "santa-cruz": "SCR", "tierra-del-fuego": "TDF" };
function colorAprob(v) {
  if (v === null) return "var(--papel-2)";
  const t = Math.max(0, Math.min(1, (v - 20) / 50));
  return `hsl(${Math.round(t * 120)} 55% ${45}%)`;
}
function mapaProvincias() {
  const e = app.juego.estado;
  const celdas = MAPA.map(([id, x, y]) => {
    const p = e.provincias.find((q) => q.id === id);
    if (!p) return "";
    const v = aprobacionProvincia(e, p);
    return `<button class="celda-mapa" style="grid-column:${x + 1};grid-row:${y + 1};background:${colorAprob(v)}" data-accion="item" data-esq="provincia" data-id="${esc(id)}" title="${esc(p.nombre)}${v !== null ? `: ${fmt1(v)}%` : ""}">
      <b>${ABREV[id]}</b><span>${v !== null ? `${Math.round(v)}%` : "–"}</span></button>`;
  }).join("");
  return `<section class="panel"><h3>Aprobación por provincia <small>mapa esquemático</small></h3>
    <div class="mapa-provincias">${celdas}</div>
    <p class="nota" style="margin-top:.6rem">${typeof e.gobierno.opinionPublica.aprobacion === "number" ? "Cada provincia parte de la aprobación nacional y se mueve con su alineamiento y las obras inauguradas." : "Se calcula cuando el Presidente carga la aprobación nacional."} Tocá una provincia para editarla.</p></section>`;
}

// ---------- Comunicación, control y ceremonias ----------
const POSTURAS = {
  anunciar: { texto: "Anunciar un logro del Gobierno", extra: 0 },
  defender: { texto: "Defender una decisión del Jefe del Estado Mayor", extra: 0, moral: 2 },
  despegarse: { texto: "Despegarse de una decisión del Jefe del Estado Mayor", extra: 1, moral: -3 },
};
function vistaComunicacion() {
  const e = app.juego.estado;
  const mes = e.fechaJuego.slice(0, 7);
  const usada = e.comunicacion?.ultimaCadena === mes;
  const lista = [...app.juego.comunicados].sort((a, b) => String(b.creada).localeCompare(String(a.creada)));
  return `<div class="acciones" style="margin-bottom:.9rem">${esPresidente() ? `<button class="btn btn-primario" data-accion="comunicar" data-tipo="cadena"${usada ? " disabled" : ""}>Cadena nacional</button><button class="btn" data-accion="comunicar" data-tipo="conferencia">Conferencia de prensa</button>` : ""}
    <span class="nota">${usada ? "Ya hubo cadena nacional este mes." : "Una cadena nacional por mes."}</span></div>
    <div class="panel">${lista.length ? lista.map((c) => `<div class="item-bandeja"><div><b>${esc(c.titularDiario)}</b><div class="meta">${esc(fechaLarga(c.fechaJuego))}${c.mensaje ? ` · «${esc(c.mensaje)}»` : ""}</div></div></div>`).join("") : `<p class="vacio">Todavía no hubo comunicaciones oficiales.</p>`}</div>
    <p class="nota">Cadena nacional: +1,5 de aprobación; conferencia: +0,5. Defender una decisión del Jefe del Estado Mayor sube la moral de las Fuerzas Armadas; despegarse suma aprobación pero la baja.</p>`;
}
function abrirComunicar(tipo) {
  const decisiones = app.juego.registro.filter((r) => r.rol === "jemc" && r.tipo === "decision").slice(0, 25).map((r) => [r.titulo, r.titulo]);
  abrirFormulario({
    titulo: tipo === "cadena" ? "Cadena nacional" : "Conferencia de prensa", conImpacto: false, textoBoton: "Hablar",
    campos: [{ k: "postura", l: "Postura", tipo: "select", req: true, opciones: Object.entries(POSTURAS).map(([k, p]) => [k, p.texto]) },
      { k: "decision", l: "Decisión a la que se refiere", tipo: "select", opciones: decisiones }, { k: "mensaje", l: "Mensaje", tipo: "area" }],
    construir: (fd) => {
      const v = valoresDe([{ k: "postura", l: "Postura", req: true }, { k: "decision", l: "Decisión" }, { k: "mensaje", l: "Mensaje" }], fd);
      if (v.postura !== "anunciar" && !v.decision) throw new ErrorJuego("Elegí la decisión del Jefe del Estado Mayor");
      const P = POSTURAS[v.postura];
      const base = tipo === "cadena" ? 1.5 : 0.5;
      const sobre = v.decision ? v.decision.replace(/^[^:]*:\s*/, "") : "";
      const titularDiario = `${tipo === "cadena" ? "Cadena nacional" : "Conferencia"}: ${v.postura === "anunciar" ? "el Presidente anunció logros del Gobierno" : v.postura === "defender" ? `el Presidente respaldó «${sobre}»` : `el Presidente se despegó de «${sobre}»`}`;
      const efectos = [
        { tipo: "doc", col: "comunicados", id: nuevoId("com"), op: "crear", titulo: titularDiario, datos: { tipo, postura: v.postura, decision: v.decision, mensaje: v.mensaje, titulo: titularDiario, titularDiario } },
        { tipo: "opinion", delta: base + P.extra, motivo: titularDiario },
      ];
      if (P.moral) efectos.push({ tipo: "simples", efectos: { moral: { fuerzas: P.moral } }, descripcion: `moral de las Fuerzas Armadas ${P.moral > 0 ? "+" : ""}${P.moral}` });
      if (tipo === "cadena") efectos.push({ tipo: "dato", ruta: "comunicacion.ultimaCadena", valor: app.juego.estado.fechaJuego.slice(0, 7) });
      return { titulo: titularDiario, dominio: "politica", efectos };
    },
  });
}

function vistaControl() {
  const lista = [...app.juego.auditorias].sort((a, b) => String(b.creada).localeCompare(String(a.creada)));
  return `<div class="acciones" style="margin-bottom:.9rem">${esPresidente() ? `<button class="btn btn-primario" data-accion="auditoria">Ordenar auditoría</button>` : ""}</div>
    <div class="panel">${lista.length ? `<div class="tabla-envoltura"><table><thead><tr><th>Área</th><th>Motivo</th><th>Estado</th><th>Resultado</th><th>Inicio</th></tr></thead><tbody>
      ${lista.map((a) => `<tr><td><b>${esc(a.areaNombre)}</b></td><td>${esc(a.motivo || "")}</td><td>${esc(a.estado)}</td><td>${a.resultado ? `<span class="sello sello-${a.resultado === "Irregularidades graves" ? "bloqueado" : a.resultado === "Sin observaciones" ? "consolidado" : "curso"}">${esc(a.resultado)}</span>` : ""}</td><td>${esc(fechaLarga(a.fechaJuego))}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="vacio">No hay auditorías.</p>`}</div>
    <p class="nota">Una auditoría dura dos meses. Cuanto más baja la moral del área, más probable que aparezcan irregularidades graves, que restan aprobación y moral.</p>`;
}
function abrirAuditoria() {
  abrirFormulario({
    titulo: "Ordenar auditoría", conImpacto: false, textoBoton: "Ordenar",
    campos: [{ k: "area", l: "Área", tipo: "select", req: true, opciones: AREAS_JEMC.map((a) => [a, AREAS_PRESUPUESTO[a].nombre]) }, { k: "motivo", l: "Motivo", tipo: "area" }],
    construir: (fd) => {
      const v = valoresDe([{ k: "area", l: "Área", req: true }, { k: "motivo", l: "Motivo" }], fd);
      const areaNombre = AREAS_PRESUPUESTO[v.area].nombre;
      return { titulo: `Auditoría sobre ${areaNombre}`, dominio: "politica", efectos: [{ tipo: "doc", col: "auditorias", id: nuevoId("aud"), op: "crear", titulo: `Auditoría sobre ${areaNombre}`, datos: { ...v, areaNombre, estado: "En curso", meses: 0, titulo: `Auditoría sobre ${areaNombre}` } }] };
    },
  });
}

function vistaCeremonias() {
  const f = (app.filtroCeremonia ||= "");
  const todos = ["pfa", "side", "afi"].flatMap((inst) => personalDe(inst).map((p) => ({ ...p, inst })));
  const condecorados = todos.filter((p) => p.condecoraciones?.length);
  const texto = normalizar(f);
  const resultados = texto.length >= 2 ? todos.filter((p) => p.estado === "Activo" && normalizar(p.nombre).includes(texto)).slice(0, 15) : [];
  return `<div class="panel"><h3>Condecorar</h3>
    <div class="filtros"><input type="text" data-foco="buscar-condecorar" data-texto-ceremonia placeholder="Buscar agente por nombre (PFA, SIDE o AFI)" value="${esc(f)}" style="max-width:340px" aria-label="Buscar agente"></div>
    ${resultados.map((p) => `<div class="item-bandeja"><div><b>${esc(p.rango)} ${esc(p.nombre)}</b><div class="meta">${esc(INSTITUCIONES[p.inst].corto)} · ${esc(nombreUnidad(app.juego.estado, p.division))} · ${esc(p.funcion || "")}</div></div>
      <button class="btn btn-chico btn-primario" data-accion="condecorar" data-div="${esc(p.division)}" data-id="${esc(p.id)}">Condecorar</button></div>`).join("") || `<p class="vacio">${texto.length >= 2 ? "Nadie coincide." : "Escribí al menos dos letras."}</p>`}
    <p class="nota">Una condecoración la firma el Presidente por decreto: sube 2 puntos la moral de la institución y 0,3 la aprobación.</p></div>
    <div class="panel"><h3>Condecorados</h3>${condecorados.length ? condecorados.map((p) => `<div class="item-bandeja"><div><b>${esc(p.rango)} ${esc(p.nombre)}</b><div class="meta">${esc(INSTITUCIONES[p.inst].corto)} · ${esc(p.condecoraciones.map((c) => `${c.medalla} (${fechaLarga(c.fecha)})`).join("; "))}</div></div></div>`).join("") : `<p class="vacio">Todavía nadie fue condecorado.</p>`}</div>`;
}
function abrirCondecorar(div, id) {
  const inst = instDeUnidad(div);
  const p = (app.juego.personal.find((d) => d.id === div)?.policias || []).find((x) => x.id === id);
  abrirFormulario({
    titulo: `Condecorar a ${p.nombre}`, subtitulo: `${esc(p.rango)} · ${esc(INSTITUCIONES[inst].corto)}`, conImpacto: false, textoBoton: "Firmar decreto",
    campos: [{ k: "medalla", l: "Condecoración", tipo: "select", req: true, opciones: MEDALLAS }, { k: "motivo", l: "Motivo", tipo: "area" }],
    construir: (fd) => {
      const medalla = fd.get("medalla");
      return { titulo: `${medalla} para ${p.nombre}`, dominio: "decretos", efectos: [
        { tipo: "personal", op: "condecorar", inst, division: div, id, nombre: p.nombre, medalla },
        { tipo: "simples", efectos: { moral: { [inst]: 2 }, opinion: 0.3 }, descripcion: `moral de ${INSTITUCIONES[inst].corto} +2, aprobación +0,3` },
      ] };
    },
  });
}

// ---------- Cuentas públicas, Banco Central y ARCA ----------
const LOGOS = { bcra: { nombre: "Banco Central", corto: "Banco Central", dominio: "economia" }, arca: { nombre: "ARCA", corto: "ARCA", dominio: "economia" } };

function encabezadoLogo(clave, texto) {
  const img = app.juego.estado.escudos?.[clave];
  return `<div class="encabezado-inst">
    <div class="escudo">${img ? `<img src="${esc(img)}" alt="Logo de ${esc(LOGOS[clave].nombre)}">` : ESCUDOS[clave]}</div>
    <div><h2>${esc(LOGOS[clave].nombre)}</h2><p>${texto}</p>
      <div class="acciones" style="margin-top:.5rem">
        <label class="btn btn-chico">${esPresidente() ? "Cambiar logo" : "Proponer otro logo"}<input type="file" accept="image/*" data-escudo="${clave}" hidden></label>
        ${img ? `<button class="btn btn-chico" data-accion="escudo-original" data-inst="${clave}">Volver al logo original</button>` : ""}
      </div></div></div>`;
}
const AVISO_CARGA = "Los datos vacíos los puede cargar cualquiera de los dos; una vez cargados, cambiarlos es decisión del Presidente.";

function vistaCuentas() {
  const e = app.juego.estado;
  const recaud = e.indicadores.recaudacion?.valor;
  const vig = e.presupuesto.vigente;
  const ingreso = typeof recaud === "number" ? Math.round(recaud / 12) : null;
  const gasto = vig ? Math.round(totalPresupuesto(vig) / 12) : null;
  const resultado = ingreso !== null && gasto !== null ? ingreso - gasto : null;
  const hist = [...(e.economia.historial || [])].reverse();
  const signo = (r) => (r === null || r === undefined ? "" : `<span style="color:${r >= 0 ? "var(--s-consolidado)" : "var(--s-bloqueado)"};font-weight:700">${r >= 0 ? "Superávit" : "Déficit"} ${usd(Math.abs(r))}</span>`);
  return `${encabezado("Cuentas públicas", "Ingresos y gastos mensuales del Tesoro Nacional.")}
  <div class="grilla" style="margin-bottom:1.1rem">
    <section class="panel"><h3>Ingreso por mes</h3><p class="codigo">${ingreso !== null ? usd(ingreso) : ""}</p>
      <p class="nota">${ingreso !== null ? "Recaudación anual dividida por 12." : "Falta cargar la recaudación anual."} <button class="btn btn-chico" data-accion="indicador" data-clave="recaudacion">${ingreso !== null ? "Editar" : "Cargar"}</button></p></section>
    <section class="panel"><h3>Gasto por mes</h3><p class="codigo">${gasto !== null ? usd(gasto) : ""}</p>
      <p class="nota">${gasto !== null ? "Presupuesto vigente dividido por 12." : "Todavía no hay presupuesto aprobado por el Congreso."}</p></section>
    <section class="panel"><h3>Resultado mensual</h3><p class="codigo" style="font-size:1.4rem">${signo(resultado)}</p>
      <p class="nota">${resultado === null ? "Se calcula con la recaudación y el presupuesto vigente." : "Ingreso menos gasto del mes."}</p></section>
  </div>
  <div class="panel tabla-envoltura"><h3>Historial mensual</h3>${hist.some((h) => h.ingresoMensual != null || h.resultado != null) ? `<table><thead><tr><th>Mes</th><th class="num">Ingreso</th><th class="num">Gasto</th><th>Resultado</th></tr></thead><tbody>
    ${hist.map((h) => `<tr><td>${esc(fechaLarga(h.fecha))}</td><td class="num">${usd(h.ingresoMensual)}</td><td class="num">${usd(h.gastoMensual)}</td><td>${signo(h.resultado)}</td></tr>`).join("")}</tbody></table>` : `<p class="vacio">El historial se completa al avanzar cada mes.</p>`}</div>`;
}

function vistaBCRA() {
  const e = app.juego.estado;
  const res = e.indicadores.reservas;
  const fila = (nombre, unidad, valor, boton) => `<tr><td><b>${esc(nombre)}</b><div class="nota">${esc(unidad)}</div></td><td class="num">${typeof valor === "number" ? `<b>${fmt1(valor)}</b>` : ""}</td><td>${boton}</td></tr>`;
  return `${encabezadoLogo("bcra", "Banco Central de la República Argentina en la partida.")}
  <div class="panel tabla-envoltura"><table><thead><tr><th>Dato</th><th class="num">Valor</th><th></th></tr></thead><tbody>
    ${fila("Reservas", res.unidad, res.valor, `<button class="btn btn-chico" data-accion="indicador" data-clave="reservas">${typeof res.valor === "number" ? "Editar" : "Cargar"}</button>`)}
    ${Object.entries(DATOS_BCRA).map(([k, d]) => fila(d.nombre, d.unidad, e.bcra[k], `<button class="btn btn-chico" data-accion="dato" data-ruta="bcra.${k}" data-titulo="${esc(d.nombre)} (${esc(d.unidad)})" data-tipo="numero">${typeof e.bcra[k] === "number" ? "Editar" : "Cargar"}</button>`)).join("")}
  </tbody></table><p class="nota" style="margin-top:.6rem">${esc(AVISO_CARGA)}</p></div>`;
}

function vistaARCA() {
  const e = app.juego.estado;
  const A = e.arca.alicuotas;
  const recaud = e.indicadores.recaudacion?.valor;
  const leyes = app.juego.leyes.filter((l) => l.tipo === "impuestos" && !l.anulado);
  return `${encabezadoLogo("arca", "Agencia de Recaudación y Control Aduanero en la partida: impuestos y retenciones.")}
  <div class="grilla" style="margin-bottom:1.1rem"><section class="panel"><h3>Recaudación anual</h3><p class="codigo">${typeof recaud === "number" ? usd(recaud) : ""}</p>
    <p><button class="btn btn-chico" data-accion="indicador" data-clave="recaudacion">${typeof recaud === "number" ? "Editar" : "Cargar"}</button></p></section></div>
  <div class="panel tabla-envoltura"><h3>Impuestos y retenciones <button class="btn btn-chico btn-primario" data-accion="reforma-tributaria">Proyecto de reforma tributaria</button></h3>
    <table><thead><tr><th>Impuesto</th><th class="num">Alícuota</th><th></th></tr></thead><tbody>
    ${Object.entries(ALICUOTAS).map(([k, a]) => `<tr><td><b>${esc(a.nombre)}</b></td><td class="num">${typeof A[k] === "number" ? `<b>${fmt1(A[k])}%</b>` : ""}</td>
      <td>${typeof A[k] === "number" ? `<span class="nota">Se cambia por ley</span>` : `<button class="btn btn-chico" data-accion="dato" data-ruta="arca.alicuotas.${k}" data-titulo="${esc(a.nombre)} (%)" data-tipo="numero">Cargar</button>`}</td></tr>`).join("")}
    </tbody></table>
    <p class="nota" style="margin-top:.6rem">Las alícuotas vacías las puede cargar cualquiera de los dos. Una vez cargadas, solo cambian con una ley sancionada por el Congreso; al sancionarse, la recaudación se ajusta.</p></div>
  ${leyes.length ? `<div class="panel"><h3>Reformas tributarias</h3>${leyes.map((l) => `<div class="item-bandeja"><div><b>${esc(l.titulo)}</b><div class="meta">${esc(l.descripcion || "")}</div></div><span>${esc(l.estado)}</span></div>`).join("")}
    <p class="nota">Se votan en Gobierno → Congreso.</p></div>` : ""}`;
}

function abrirReforma() {
  const A = app.juego.estado.arca.alicuotas;
  const campos = Object.entries(ALICUOTAS).map(([k, a]) => ({ k, l: `${a.nombre} (%)`, tipo: "numero" }));
  abrirFormulario({
    titulo: "Proyecto de reforma tributaria", subtitulo: "Las alícuotas cambian solo si el Congreso lo sanciona", conImpacto: false, textoBoton: "Enviar al Congreso",
    campos: [{ k: "titulo", l: "Nombre del proyecto", req: true }, ...campos], valores: { titulo: "Reforma tributaria", ...A },
    construir: (fd) => {
      const titulo = leerCampo({ k: "titulo", l: "Nombre", req: true }, fd);
      const alicuotas = {};
      for (const c of campos) { const v = leerCampo(c, fd); if (typeof v === "number" && v !== A[c.k]) alicuotas[c.k] = v; }
      if (!Object.keys(alicuotas).length) throw new ErrorJuego("No cambiaste ninguna alícuota");
      const descripcion = Object.entries(alicuotas).map(([k, v]) => `${ALICUOTAS[k].nombre}: ${typeof A[k] === "number" ? `${fmt1(A[k])}% → ` : ""}${fmt1(v)}%`).join("; ");
      return { titulo: `Proyecto de ley: ${titulo}`, dominio: "politica", efectos: [{ tipo: "doc", col: "leyes", id: nuevoId("ley"), op: "crear", titulo,
        datos: { tipo: "impuestos", titulo, descripcion, alicuotas, origen: "Poder Ejecutivo", estado: "Presentado", negociaciones: [],
          votosDiputados: { afirmativos: null, negativos: null, abstenciones: null }, votosSenado: { afirmativos: null, negativos: null, abstenciones: null } } }] };
    },
  });
}

const TIPOS_INTERVENCION = { hecho: "Hecho establecido", incertidumbre: "Incertidumbre", opcion: "Opción", consecuencia: "Consecuencia posible", comentario: "Debate" };
const GRUPOS_INTERVENCION = { hecho: "Hechos establecidos", incertidumbre: "Incertidumbres", opcion: "Opciones", consecuencia: "Consecuencias posibles", comentario: "Debate" };

function vistaAsuntos() {
  const filtro = app.sub.asuntos;
  const lista = app.juego.asuntos.filter((a) => a.estado === filtro);
  return `${encabezado("Asuntos y reuniones", "Cada asunto reúne intervenciones de los dos cargos, separadas en hechos, incertidumbres, opciones y consecuencias.", `<button class="btn btn-primario" data-accion="nuevo-asunto">Abrir asunto</button>`)}
  <div class="subtabs" role="group" aria-label="Estado de los asuntos">${[["abierto", "Abiertos"], ["archivado", "Archivados"]].map(([id, t]) => `<button data-accion="subtab" data-grupo="asuntos" data-valor="${id}" aria-pressed="${filtro === id}">${t}</button>`).join("")}</div>
  <div class="panel tabla-envoltura"><table><thead><tr><th>Asunto</th><th>Carpeta</th><th>Abierto por</th><th class="num">Intervenciones</th><th>Última actividad</th></tr></thead>
  <tbody>${lista.map((a) => `<tr class="clic" data-accion="ver-asunto" data-id="${esc(a.id)}" tabindex="0"><td><b>${esc(a.titulo)}</b></td><td>${esc(AREAS[a.area] || a.area)}</td><td>${rolTag(a.creadoPor)}</td><td class="num">${a.intervenciones.length}</td><td>${esc(fechaHora(a.fecha))}</td></tr>`).join("") || `<tr><td colspan="5" class="vacio">${filtro === "abierto" ? "No hay asuntos abiertos. Abrí uno para debatir un tema." : "No hay asuntos archivados."}</td></tr>`}</tbody></table></div>`;
}

function vistaRegistro() {
  const sub = app.sub.registro;
  let cuerpo;
  if (sub === "propuestas") {
    const f = app.filtros.propEstado;
    const lista = app.juego.propuestas.filter((p) => !f || p.estado === f);
    cuerpo = `<div class="filtros"><select data-cambio="filtro" data-campo="propEstado" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${opciones(Object.values(EP).map((x) => [x, x]), f)}</select></div>
    <div class="panel tabla-envoltura"><table><thead><tr><th>Fecha de juego</th><th>Medida</th><th>Área</th><th>Autor</th><th>Decide</th><th>Estado</th></tr></thead>
    <tbody>${lista.map((p) => `<tr class="clic" data-accion="ver-propuesta" data-id="${esc(p.id)}" tabindex="0"><td>${esc(fechaLarga(p.fechaJuego))}</td><td><b>${esc(p.titulo)}</b></td><td>${esc(DOMINIOS[p.dominio]?.nombre || "")}</td><td>${rolTag(p.autor)}</td><td>${rolTag(p.decide)}</td><td>${selloProp(p.estado)}</td></tr>`).join("") || `<tr><td colspan="6" class="vacio">No hay propuestas con ese filtro.</td></tr>`}</tbody></table></div>`;
  } else {
    cuerpo = `<div class="panel tabla-envoltura"><table><thead><tr><th>Fecha de juego</th><th>Quién</th><th>Movimiento</th><th>Registrado</th></tr></thead>
    <tbody>${app.juego.registro.map((r) => `<tr${r.propuestaId ? ` class="clic" data-accion="ver-propuesta" data-id="${esc(r.propuestaId)}"` : ""}><td>${esc(fechaLarga(r.fechaJuego))}</td><td>${rolTag(r.rol)}</td><td><b>${esc(r.titulo)}</b>${r.detalle ? `<div class="nota">${esc(r.detalle)}</div>` : ""}</td><td>${esc(fechaHora(r.fecha))}</td></tr>`).join("")}</tbody></table></div>`;
  }
  return `${encabezado("Registro de decisiones", "Historial completo: nada se borra. Las anulaciones conservan la medida original marcada como anulada.")}
  <div class="subtabs" role="group" aria-label="Registro">${[["propuestas", "Propuestas y decisiones"], ["bitacora", "Bitácora completa"]].map(([id, t]) => `<button data-accion="subtab" data-grupo="registro" data-valor="${id}" aria-pressed="${sub === id}">${t}</button>`).join("")}</div>${cuerpo}`;
}

function vistaInformes() {
  const lista = app.juego.informes;
  if (app.informeAbierto) {
    const inf = lista.find((i) => i.id === app.informeAbierto);
    if (inf) return `<div class="acciones" style="margin-bottom:1rem"><button class="btn" data-accion="cerrar-informe">Volver a la lista</button><button class="btn" data-accion="imprimir">Imprimir</button></div>${htmlInforme(inf)}`;
  }
  return `${encabezado("Informes nacionales", "Cada informe toma una foto del estado asentado. Nunca completa datos desconocidos.", `<button class="btn btn-primario" data-accion="generar-informe">Generar informe del ${esc(fechaLarga(app.juego.estado.fechaJuego))}</button>`)}
  <div class="panel">${lista.length ? lista.map((i) => `<div class="item-bandeja"><div><b>${esc(i.titulo)}</b><div class="meta">Generado por ${rolTag(i.generadoPor)} · ${esc(fechaHora(i.creada))}</div></div><button class="btn btn-chico" data-accion="abrir-informe" data-id="${esc(i.id)}">Leer</button></div>`).join("") : `<p class="vacio">Todavía no hay informes. Generá el primero para tener la foto del estado actual.</p>`}</div>`;
}

function htmlInforme(inf) {
  const bloque = (titulo, items, clase = "") => (items.length ? `<h4>${esc(titulo)}</h4><ul class="${clase}">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  return `<article class="informe">
    <h2>${esc(inf.titulo)}</h2>
    <p class="nota">Generado por el ${esc(nombreRol(inf.generadoPor))}. ${esc(inf.nota)}</p>
    ${inf.decisionesRecientes.length ? `<section><h3>${inf.desde ? "Decisiones desde el informe anterior" : "Decisiones registradas"}</h3><ul>${inf.decisionesRecientes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
    ${inf.secciones.map((s) => `<section><h3>${esc(s.titulo)}</h3>
      ${bloque("Hechos establecidos", s.hechos)}${bloque("En curso o en evaluación", s.enCurso)}${bloque("Pendiente de decisión", s.pendientes)}${bloque("Sin dato confirmado", s.sinDato, "sin-dato-lista")}
      ${!s.hechos.length && !s.enCurso.length && !s.pendientes.length && !s.sinDato.length ? `<p class="vacio">Sin novedades asentadas.</p>` : ""}</section>`).join("")}
  </article>`;
}

function vistaPartida() {
  const j = app.juego, p = j.partida;
  const miPin = p.jugadores?.[app.rol]?.pin;
  const link = enlaceInvitacion(j.codigo);
  return `${encabezado("Partida", "Invitación, cargos, fecha de juego y copia de seguridad.")}
  <div class="grilla">
    <section class="panel"><h3>Código de invitación</h3><p class="codigo">${esc(j.codigo)}</p>
      <div class="acciones"><input type="text" readonly value="${esc(link)}"><button class="btn" data-accion="copiar" data-texto="${esc(link)}">Copiar enlace</button></div>
      <p class="nota" style="margin-top:.6rem">Cualquiera con el código puede entrar a ver y jugar: compartilo solo con tu compañero.</p></section>
    <section class="panel"><h3>Cargos</h3>
      ${["jemc", "presidente"].map((r) => `<div class="item-bandeja"><div><b>${esc(ROLES[r].nombre)}</b><div class="meta">${!p.jugadores?.[r] ? "Libre" : r === app.rol ? "Vos, en este dispositivo" : "Ocupado"}</div></div></div>`).join("")}
      <p style="margin-top:.6rem">Tu PIN de cargo: <b>${esc(miPin || "—")}</b></p>
      <p class="nota">Con el código y este PIN recuperás tu cargo desde otro dispositivo.</p></section>
    <section class="panel"><h3>Fecha de juego</h3><p>${esc(fechaLarga(j.estado.fechaJuego))}</p>
      <div class="acciones" style="margin-bottom:.8rem">${[[1, "Un día"], [7, "Una semana"], [30, "Un mes"]].map(([d, t]) => `<button class="btn btn-chico" data-accion="avanzar-fecha" data-dias="${d}">Avanzar ${t.toLowerCase()}</button>`).join("")}</div>
      <form data-form="fecha" class="acciones"><input type="date" name="fecha" min="${esc(j.estado.fechaJuego)}" value="${esc(j.estado.fechaJuego)}" style="width:auto"><button class="btn btn-chico" type="submit">Fijar fecha</button></form>
      <p class="nota" style="margin-top:.6rem">Cualquiera de los dos puede avanzar la fecha; queda registrado. No retrocede.</p></section>
    <section class="panel"><h3>Conexión y datos</h3>
      <p>${app.backend.tipo === "firebase" ? "Partida online en Firebase: los cambios llegan solos a los dos dispositivos." : "Servidor local: los dispositivos tienen que estar conectados a esta computadora."}</p>
      <div class="acciones"><button class="btn" data-accion="exportar">Descargar copia (JSON)</button><button class="btn" data-accion="salir">Salir de la partida</button></div></section>
  </div>`;
}

// ---------- ventanas de detalle ----------
function abrirVentana({ titulo, subtitulo = "", vivo = null, estatico = "" }) {
  const tituloFn = typeof titulo === "function" ? titulo : () => titulo;
  app.modal = { vivo, tituloFn };
  $ventana.innerHTML = `<div class="ventana-cabeza"><div><h2 id="ventana-titulo">${esc(tituloFn())}</h2>${subtitulo ? `<div class="nota">${subtitulo}</div>` : ""}</div><button class="btn btn-chico" data-accion="cerrar-ventana">Cerrar</button></div>
  <div class="ventana-cuerpo"><div data-vivo>${vivo ? vivo() : ""}</div>${estatico}</div>`;
  if (!$ventana.open) $ventana.showModal();
  // Los avisos visibles pasan a la capa de la ventana para no quedar tapados.
  if ($avisos.children.length) {
    const caja = $ventana.appendChild(Object.assign(document.createElement("div"), { className: "avisos" }));
    caja.append(...$avisos.children);
  }
}
function refrescarVentana() {
  if (!app.modal?.vivo || !$ventana.open) return;
  const c = $ventana.querySelector("[data-vivo]");
  const t = $ventana.querySelector("#ventana-titulo");
  try { if (t) t.textContent = app.modal.tituloFn(); c.innerHTML = app.modal.vivo(); } catch (e) { c.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
function cerrarVentana() { if ($ventana.open) $ventana.close(); app.modal = null; }
$ventana.addEventListener("close", () => { app.modal = null; });

const ficha = (pares) => `<dl class="ficha">${pares.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;

function verProyecto(id) {
  const vivo = () => {
    const p = app.juego.estado.proyectos.find((x) => x.id === id);
    if (!p) return `<p class="vacio">El proyecto ya no existe.</p>`;
    const rel = app.juego.propuestas.filter((x) => (x.efectos || []).some((e) => e.proyectoId === id));
    return `${ficha([
      ["Estado", sello(p.estado)], ["Área", esc(AREAS[p.area])], ["Autoridad", `${esc(DOMINIOS[p.dominio]?.nombre)} (decide el ${esc(nombreRol(DOMINIOS[p.dominio]?.decide))})`],
      ["Responsable", dato(p.responsable)], ["Presupuesto estimado", dato(p.presupuesto)], ["Avance confirmado", dato(p.avance)],
      p.empleos ? ["Empleos o capacitación", esc(p.empleos)] : null,
      ["Obstáculos", dato(p.obstaculos)], ["Decisiones pendientes", dato(p.pendientes)], ["Notas", dato(p.notas)],
    ])}
    <div class="acciones"><button class="btn btn-primario" data-accion="nueva-propuesta" data-efecto="proyecto_estado" data-proyecto="${esc(id)}">Proponer cambio de estado</button>
    <button class="btn" data-accion="nueva-propuesta" data-efecto="proyecto_campo" data-proyecto="${esc(id)}">Actualizar un dato</button></div>
    ${rel.length ? `<hr class="separador"><h3>Decisiones relacionadas</h3>${rel.map((x) => filaPropuesta(x)).join("")}` : ""}`;
  };
  abrirVentana({ titulo: () => app.juego.estado.proyectos.find((x) => x.id === id)?.nombre || "Proyecto", vivo });
}

function verAeronave(id) {
  const vivo = () => {
    const a = app.juego.estado.aereo.find((x) => x.id === id);
    if (!a) return `<p class="vacio">La aeronave ya no existe.</p>`;
    const explicacion = {
      propio: "Es una aeronave real dentro del inventario de la partida: la referencia es el propio modelo.",
      analogia: "El modelo de la partida es ficticio. La aeronave real es solo una analogía conceptual, no una fuente técnica.",
      no_fijada: "No hay una inspiración fijada en el canon de la partida.",
    }[a.tipoReferencia];
    return `${ficha([
      ["Cantidad", vacio(a.cantidad) ? sinDato("No consolidada") : `<b>${num(a.cantidad)}</b>${a.previstos ? ` (${num(a.previstos)} previstos)` : ""}`],
      ["Función general", esc(a.funcion)], ["Fabricante", esc(a.fabricante)], ["País de referencia", esc(a.pais)],
      ["Referencia", `${esc(a.referencia)}<div class="ref-${esc(a.tipoReferencia)}">${esc(ETIQUETA_REF[a.tipoReferencia])}</div><div class="nota">${esc(explicacion)}</div>`],
      a.nota ? ["Nota", esc(a.nota)] : null,
    ])}<button class="btn btn-primario" data-accion="editar-cantidad" data-lista="aereo" data-id="${esc(id)}">Proponer cambio de cantidad</button>
    <h3 style="margin:1.1rem 0 .5rem">Ficha técnica</h3>${fichaTecnica(id)}
    <p class="nota" style="margin-top:.6rem">Ficticia: la completan los jugadores. La aplicación no agrega datos por su cuenta.</p>`;
  };
  abrirVentana({ titulo: app.juego.estado.aereo.find((x) => x.id === id)?.modelo || "Aeronave", vivo });
}

function verPropuesta(id) {
  const vivo = () => {
    const p = app.juego.propuestas.find((x) => x.id === id);
    if (!p) return `<p class="vacio">Cargando la propuesta…</p>`;
    const e = app.juego.estado, r = app.rol;
    const efectos = p.efectosAplicados?.length
      ? p.efectosAplicados.map((ef) => `<li>${esc(describirEfecto(ef, e))} <span class="nota">(antes: ${esc(vacio(ef.antes) ? "sin dato" : ef.antes)})</span></li>`)
      : (p.efectos || []).map((ef) => `<li>${esc(describirEfecto(ef, e))}</li>`);
    const original = p.refId && p.tipo !== "voto_guerra" ? app.juego.propuestas.find((x) => x.id === p.refId) : null;
    const anulacionPendiente = app.juego.propuestas.some((x) => x.tipo === "anulacion" && x.refId === p.id && x.estado === EP.revision);
    const botones = [];
    if (p.estado === EP.revision && p.decide === r) {
      botones.push(`<button class="btn btn-primario" data-accion="decidir" data-id="${esc(id)}" data-que="aprobar">Aprobar</button>`,
        `<button class="btn btn-peligro" data-accion="decidir" data-id="${esc(id)}" data-que="rechazar">Rechazar</button>`,
        `<button class="btn" data-accion="decidir" data-id="${esc(id)}" data-que="devolver">Devolver para cambios</button>`);
    }
    if (p.autor === r && p.estado === EP.devuelta) botones.push(`<button class="btn btn-primario" data-accion="reenviar" data-id="${esc(id)}">Editar y reenviar</button>`);
    if (p.autor === r && [EP.revision, EP.devuelta].includes(p.estado) && p.decide !== r) botones.push(`<button class="btn" data-accion="retirar" data-id="${esc(id)}">Retirar</button>`);
    if (DOMINIOS[p.dominio]?.objetable && p.tipo === "normal" && p.decide !== r && [EP.aprobada, EP.financiamiento].includes(p.estado)) botones.push(`<button class="btn" data-accion="objetar" data-id="${esc(id)}">Objetar</button>`);
    if (p.decide === r && (p.objeciones || []).some((o) => !o.conocida && o.rol !== r)) botones.push(`<button class="btn" data-accion="conocimiento" data-id="${esc(id)}">Tomar conocimiento</button>`);
    if (p.tipo === "normal" && [EP.aprobada, EP.financiamiento, EP.bloqueada].includes(p.estado) && !anulacionPendiente) botones.push(`<button class="btn btn-peligro" data-accion="anular" data-id="${esc(id)}">Pedir anulación</button>`);
    return `${ficha([
      ["Estado", selloProp(p.estado)], ["Área de autoridad", esc(DOMINIOS[p.dominio]?.nombre)],
      ["Autor", rolTag(p.autor)], ["Decide", rolTag(p.decide)], ["Fecha de juego", esc(fechaLarga(p.fechaJuego))],
      p.tipo === "voto_guerra" ? ["Voto recomendado", `<b>${esc(OPCIONES_VOTO[p.voto])}</b>`] : null,
      p.requiereFondos || p.costo ? ["Costo estimado", dato(p.costo)] : null,
      original ? ["Medida original", `<button class="btn btn-chico" data-accion="ver-propuesta" data-id="${esc(original.id)}">${esc(original.titulo)}</button>`] : null,
      p.anuladaPor ? ["Anulada por", `<button class="btn btn-chico" data-accion="ver-propuesta" data-id="${esc(p.anuladaPor)}">Ver la anulación</button>`] : null,
      ["Descripción", p.descripcion ? `<span style="white-space:pre-wrap">${esc(p.descripcion)}</span>` : sinDato("Sin descripción")],
      ["Justificación", p.justificacion ? `<span style="white-space:pre-wrap">${esc(p.justificacion)}</span>` : sinDato("Sin justificación")],
      ["Efectos sobre el estado", efectos.length ? `<ul class="lista-simple">${efectos.join("")}</ul>` : `<span class="nota">Decisión sin cambios automáticos en el estado</span>`],
      p.conflictos?.length ? ["Para revisar a mano", `<ul class="lista-simple">${p.conflictos.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`] : null,
    ])}
    ${(p.objeciones || []).length ? `<h3>Objeciones</h3>${p.objeciones.map((o) => `<div class="intervencion ${esc(o.rol)}"><div class="meta">${rolTag(o.rol)} · ${esc(fechaHora(o.fecha))}${o.conocida ? " · leída" : ""}</div><p>${esc(o.comentario)}</p></div>`).join("")}` : ""}
    <h3 style="margin:.6rem 0 .4rem">Historial</h3>
    ${p.historial.map((h) => `<div class="intervencion ${esc(h.rol)}"><div class="meta">${rolTag(h.rol)} · ${esc(TEXTO_ACCION[h.accion] || h.accion)} · ${esc(fechaHora(h.fecha))}</div>${h.comentario ? `<p>${esc(h.comentario)}</p>` : ""}</div>`).join("")}
    ${botones.length ? `<hr class="separador"><div class="acciones">${botones.join("")}</div>` : ""}`;
  };
  const p = app.juego.propuestas.find((x) => x.id === id);
  const estatico = `<label class="campo" style="margin-top:1rem">Comentario <small>Se usa al decidir, objetar o pedir una anulación</small><textarea id="comentario-decision"></textarea></label>
    ${p?.tipo === "voto_guerra" && p.decide === app.rol ? `<label class="campo">Si rechazás, Argentina vota<select id="voto-alternativo">${opciones([["no", "En contra"], ["abstencion", "Abstención"], ["ninguno", "Sin emitir voto por ahora"]], "no")}</select></label>` : ""}`;
  abrirVentana({ titulo: () => app.juego.propuestas.find((x) => x.id === id)?.titulo || "Propuesta", vivo, estatico });
}

const TEXTO_ACCION = { propuso: "propuso", decision_directa: "decidió dentro de sus facultades", aprobar: "aprobó", rechazar: "rechazó", devolver: "devolvió para cambios", reenvio: "reenvió", retiro: "retiró", financiada: "financiamiento aprobado", sin_fondos: "financiamiento rechazado", anulada: "anulada" };

function verAsunto(id) {
  const vivo = () => {
    const a = app.juego.asuntos.find((x) => x.id === id);
    if (!a) return `<p class="vacio">Cargando el asunto…</p>`;
    const grupos = Object.entries(GRUPOS_INTERVENCION).map(([tipo, titulo]) => {
      const items = a.intervenciones.filter((i) => i.tipo === tipo);
      return items.length ? `<div class="bloque-informe"><h4>${esc(titulo)}</h4>${items.map((i) => `<div class="intervencion ${esc(i.rol)}"><div class="meta">${rolTag(i.rol)} · ${esc(fechaLarga(i.fechaJuego))} · ${esc(fechaHora(i.fecha))}</div><p>${esc(i.texto)}</p></div>`).join("")}</div>` : "";
    }).join("");
    const props = app.juego.propuestas.filter((p) => p.asuntoId === id);
    const vots = app.juego.votaciones.filter((v) => v.asuntoId === id);
    return `<p>${a.estado === "abierto" ? sello("En evaluación") : sello("Consolidado")} <span class="nota">Carpeta: ${esc(AREAS[a.area] || a.area)} · abierto por el ${esc(nombreRol(a.creadoPor))}</span></p>
      ${grupos || `<p class="vacio">Todavía no hay intervenciones.</p>`}
      ${props.length ? `<h3>Propuestas del asunto</h3>${props.map((p) => filaPropuesta(p)).join("")}` : ""}
      ${vots.length ? `<h3 style="margin-top:.6rem">Votaciones del asunto</h3>${vots.map((v) => `<div class="item-bandeja"><div><b>${esc(v.titulo)}</b></div><button class="btn btn-chico" data-accion="ver-votacion" data-id="${esc(v.id)}">Abrir</button></div>`).join("")}` : ""}
      <hr class="separador"><div class="acciones">
        ${a.estado === "abierto" ? `<button class="btn btn-primario" data-accion="nueva-propuesta" data-asunto="${esc(id)}" data-dominio="${esc(DOMINIO_DE_AREA[a.area] || "politica")}">Proponer una decisión</button>
        <button class="btn" data-accion="nueva-votacion" data-asunto="${esc(id)}">Abrir votación de ATLAS</button>
        <button class="btn" data-accion="estado-asunto" data-id="${esc(id)}" data-valor="archivado">Archivar</button>` : `<button class="btn" data-accion="estado-asunto" data-id="${esc(id)}" data-valor="abierto">Reabrir</button>`}
      </div>`;
  };
  const estatico = `<form data-form="intervenir" data-id="${esc(id)}"><hr class="separador"><h3 style="margin-bottom:.5rem">Intervenir como ${esc(ROLES[app.rol].corto)}</h3>
    <label class="campo">Tipo<select name="tipo">${opciones(Object.entries(TIPOS_INTERVENCION), "comentario")}</select></label>
    <label class="campo">Texto<textarea name="texto" required></textarea></label>
    <button class="btn btn-primario" type="submit">Agregar intervención</button></form>`;
  abrirVentana({ titulo: () => app.juego.asuntos.find((x) => x.id === id)?.titulo || "Asunto", vivo, estatico });
}

const DOMINIO_DE_AREA = { economia: "economia", politica: "politica", soberania: "fuerzas", seguridad: "pfa", infraestructura: "infraestructura", industria: "economia", defensa: "fuerzas", atlas: "atlas" };

function verVotacion(id) {
  const vivo = () => {
    const v = app.juego.votaciones.find((x) => x.id === id);
    if (!v) return `<p class="vacio">Cargando la votación…</p>`;
    const r = resultadoVotacion(v), abierta = v.estado === "abierta";
    const pedidoArg = app.juego.propuestas.find((p) => p.tipo === "voto_guerra" && p.refId === id && [EP.revision, EP.devuelta].includes(p.estado));
    const filas = v.miembros.map((pais) => {
      const actual = v.votos?.[pais];
      let control;
      const esArg = pais === "Argentina";
      const puede = abierta && (!esArg || (v.tipo !== "guerra" && app.rol === "jemc"));
      if (puede) control = `<select data-cambio="voto" data-id="${esc(id)}" data-pais="${esc(pais)}" aria-label="Voto de ${esc(pais)}"><option value="">Sin voto</option>${opciones(Object.entries(OPCIONES_VOTO), actual?.voto)}</select>`;
      else control = actual ? `<b>${esc(OPCIONES_VOTO[actual.voto])}</b>` : sinDato("Sin voto");
      let nota = actual ? `Cargado por ${rolTag(actual.cargadoPor)}${esArg && v.tipo === "guerra" ? (actual.autorizado ? " con autorización presidencial" : " al rechazar la recomendación") : ""}` : "";
      if (esArg && v.tipo === "guerra" && abierta) {
        if (pedidoArg) nota += `${nota ? "<br>" : ""}<button class="btn btn-chico" data-accion="ver-propuesta" data-id="${esc(pedidoArg.id)}">Pedido de autorización: ${esc(pedidoArg.estado)}</button>`;
        else if (app.rol === "jemc") nota += `${nota ? "<br>" : ""}<button class="btn btn-chico${actual ? "" : " btn-primario"}" data-accion="preparar-voto" data-id="${esc(id)}">${actual ? "Pedir cambio del voto argentino" : "Preparar voto argentino"}</button>`;
        else if (!actual) nota = `Espera la recomendación del Jefe del Estado Mayor`;
      }
      return `<tr><td><b>${esc(pais)}</b></td><td>${control}</td><td class="nota">${nota}</td></tr>`;
    }).join("");
    const conf = v.confirmaciones || {};
    return `<p class="nota">Abierta el ${esc(fechaLarga(v.fechaJuego))} por el ${esc(nombreRol(v.creadaPor))}</p>${v.descripcion ? `<p style="white-space:pre-wrap">${esc(v.descripcion)}</p>` : ""}
      <p><b>${v.tipo === "guerra" ? "Decisión de guerra" : "Decisión general"}:</b> se aprueba con más del ${Math.round(v.umbral * 100)}% de los ${r.n} miembros, es decir, al menos ${r.necesarios} votos a favor.${v.tipo !== "guerra" ? " Umbral fijado por los jugadores al abrir la votación." : ""}</p>
      <div class="barra-voto" role="img" aria-label="${r.si} de ${r.n} a favor"><div class="lleno" style="width:${r.porcentaje}%"></div><div class="umbral" style="left:${v.umbral * 100}%"></div></div>
      <p>${r.si} a favor · ${r.no} en contra · ${r.abst} abstenciones · ${r.pendientes} sin voto · <b>${pct(r.porcentaje)} a favor</b></p>
      <p class="resultado ${r.resultado}">${esc(v.estado === "cerrada" ? `Resultado final: ${v.resultadoFinal.resultado === "aprobada" ? "aprobada" : "rechazada"}` : TEXTO_RESULTADO[r.resultado])}</p>
      <div class="tabla-envoltura"><table><thead><tr><th>Miembro</th><th>Voto</th><th>Registro</th></tr></thead><tbody>${filas}</tbody></table></div>
      ${abierta ? `<hr class="separador"><p class="nota">Confirmación del resultado: Jefe del Estado Mayor ${conf.jemc ? "confirmó" : "pendiente"} · Presidente ${conf.presidente ? "confirmó" : "pendiente"}. Si cambia un voto, las confirmaciones se reinician.</p>
        ${r.resultado !== "en_curso" && !conf[app.rol] ? `<button class="btn btn-primario" data-accion="confirmar-votacion" data-id="${esc(id)}">Confirmar resultado</button>` : ""}` : ""}`;
  };
  abrirVentana({ titulo: () => app.juego.votaciones.find((x) => x.id === id)?.titulo || "Votación de ATLAS", vivo });
}

// ---------- formularios ----------
const TIPOS_EFECTO = {
  "": "Sin cambio automático (decisión de texto)",
  proyecto_estado: "Cambiar el estado de un proyecto",
  proyecto_campo: "Actualizar un dato de un proyecto",
  proyecto_nuevo: "Crear un proyecto",
  inventario: "Cambiar una cantidad de inventario",
  indicador: "Cargar un indicador económico",
  at1: "Decidir un aspecto del AT-1",
  atlas_alta: "Incorporar un miembro a ATLAS",
};
const CAMPOS_PROYECTO = { responsable: "Responsable", presupuesto: "Presupuesto estimado", avance: "Avance confirmado", obstaculos: "Obstáculos", pendientes: "Decisiones pendientes", notas: "Notas" };

function subformEfecto(tipo, pre = {}) {
  const e = app.juego.estado;
  const proyectos = e.proyectos.map((p) => [p.id, p.nombre]);
  switch (tipo) {
    case "proyecto_estado":
      return `<div class="fila-campos"><label class="campo">Proyecto<select name="ef_proyecto">${opciones(proyectos, pre.proyecto)}</select></label>
        <label class="campo">Nuevo estado<select name="ef_valor">${opciones(Object.keys(ESTADOS).filter((x) => x !== "Sin dato confirmado").map((x) => [x, x]), pre.valor)}</select></label></div>`;
    case "proyecto_campo":
      return `<div class="fila-campos"><label class="campo">Proyecto<select name="ef_proyecto">${opciones(proyectos, pre.proyecto)}</select></label>
        <label class="campo">Dato<select name="ef_campo">${opciones(Object.entries(CAMPOS_PROYECTO), pre.campo)}</select></label></div>
        <label class="campo">Nuevo valor <small>Dejalo vacío para marcarlo como sin dato confirmado</small><input type="text" name="ef_valor"></label>`;
    case "proyecto_nuevo":
      return `<label class="campo">Nombre del proyecto<input type="text" name="ef_nombre" required></label>
        <div class="fila-campos"><label class="campo">Área<select name="ef_area">${opciones(Object.entries(AREAS), "infraestructura")}</select></label>
        <label class="campo">Estado inicial<select name="ef_estado">${opciones([["Propuesta", "Propuesta"], ["En evaluación", "En evaluación"], ["Aprobado", "Aprobado"], ["Pendiente", "Pendiente"]], "Propuesta")}</select></label></div>
        <div class="fila-campos"><label class="campo">Responsable<input type="text" name="ef_responsable"></label><label class="campo">Presupuesto estimado <small>Opcional</small><input type="text" name="ef_presupuesto"></label></div>`;
    case "inventario": {
      const lista = pre.lista || "aereo";
      return `<div class="fila-campos"><label class="campo">Inventario<select name="ef_lista" data-cambio="lista-inventario">${opciones(Object.entries(LISTAS_INVENTARIO), lista)}</select></label>
        <label class="campo">Ítem<select name="ef_item">${opcionesInventario(lista, pre.item)}</select></label></div>
        <label class="campo">Nueva cantidad <small>Vacía = sin dato confirmado</small><input type="number" name="ef_valor" min="0" step="1" value="${esc(pre.valor ?? "")}"></label>`;
    }
    case "indicador":
      return `<div class="fila-campos"><label class="campo">Indicador<select name="ef_clave">${opciones(Object.entries(e.indicadores).map(([k, i]) => [k, `${i.nombre} (${i.unidad})`]), pre.clave)}</select></label>
        <label class="campo">Valor <small>Vacío = sin dato</small><input type="text" name="ef_valor" inputmode="decimal"></label></div>
        <p class="nota">Se guarda con la fecha de juego actual para no confundirlo con datos viejos.</p>`;
    case "at1":
      return `<div class="fila-campos"><label class="campo">Aspecto<select name="ef_campo">${opciones(Object.entries(CAMPOS_AT1), pre.campo)}</select></label>
        <label class="campo">Decisión<input type="text" name="ef_valor" required></label></div>
        <p class="nota">Las especificaciones técnicas (motor, sensores, armamento, alcance) no se cargan desde acá.</p>`;
    case "atlas_alta":
      return `<div class="fila-campos"><label class="campo">País<input type="text" name="ef_pais" value="${esc(pre.pais || "")}" required></label>
        <label class="campo">Participación acordada<input type="text" name="ef_aporte"></label></div>`;
    default:
      return "";
  }
}

function opcionesInventario(lista, sel) {
  return opciones((app.juego.estado[lista] || []).map((x) => [x.id, `${x.modelo || x.nombre} (${vacio(x.cantidad) ? "sin dato" : num(x.cantidad)})`]), sel);
}

function leerEfecto(fd, dominio) {
  const tipo = fd.get("ef_tipo");
  const t = (k) => String(fd.get(k) ?? "").trim();
  switch (tipo) {
    case "proyecto_estado": return { tipo, proyectoId: t("ef_proyecto"), valor: t("ef_valor") };
    case "proyecto_campo": return { tipo, proyectoId: t("ef_proyecto"), campo: t("ef_campo"), valor: t("ef_valor") || null };
    case "proyecto_nuevo": {
      if (!t("ef_nombre")) throw new ErrorJuego("El proyecto necesita un nombre");
      const id = t("ef_nombre").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + Date.now().toString(36);
      return { tipo, proyecto: { id, nombre: t("ef_nombre"), area: t("ef_area"), dominio: dominio === "atlas_guerra" ? "atlas" : dominio, responsable: t("ef_responsable") || "No definido", estado: t("ef_estado"), presupuesto: t("ef_presupuesto") || null } };
    }
    case "inventario": {
      const v = parsearNumero(fd.get("ef_valor"));
      if (Number.isNaN(v) || (v !== null && (v < 0 || !Number.isInteger(v)))) throw new ErrorJuego("La cantidad tiene que ser un número entero");
      return { tipo, lista: t("ef_lista"), itemId: t("ef_item"), valor: v };
    }
    case "indicador": {
      const v = parsearNumero(fd.get("ef_valor"));
      if (Number.isNaN(v)) throw new ErrorJuego("El indicador tiene que ser un número");
      return { tipo, clave: t("ef_clave"), valor: v };
    }
    case "at1": return { tipo, campo: t("ef_campo"), valor: t("ef_valor") || null };
    case "atlas_alta": {
      if (!t("ef_pais")) throw new ErrorJuego("Indicá el país");
      return { tipo, pais: t("ef_pais"), aporte: t("ef_aporte") };
    }
    default: return null;
  }
}

function actualizarAvisoDecide(form) {
  const caja = form.querySelector("[data-aviso-decide]");
  if (!caja) return;
  const fd = new FormData(form);
  const dominio = fd.get("dominio");
  let efecto = null;
  try { efecto = leerEfecto(fd, dominio); } catch {}
  let decide;
  try { decide = rolQueDecide(dominio, efecto ? [efecto] : [], app.juego.estado, app.rol); } catch (e) { caja.textContent = e.message; return; }
  const fondos = form.querySelector("[data-fondos]");
  fondos.classList.toggle("oculto", decide !== "jemc");
  const conFondos = decide === "jemc" && fd.get("requiereFondos");
  let texto;
  if (decide === app.rol) texto = conFondos ? "Está dentro de tus facultades, pero tiene costo: queda aprobada y se le pide financiamiento al Presidente. Se aplica cuando él lo apruebe." : "Está dentro de tus facultades: se aplica apenas la registres y el otro cargo la ve al instante.";
  else texto = `Le corresponde al ${nombreRol(decide)}: le llega como pedido y queda en revisión hasta que decida.`;
  if (efecto?.tipo === "inventario" && decide === "presidente" && dominio !== "compras_militares") texto += " Sumar unidades es una compra militar.";
  caja.textContent = texto;
}

function abrirNuevaPropuesta(pre = {}) {
  const dominios = Object.entries(DOMINIOS).filter(([k]) => k !== "atlas_guerra").map(([k, d]) => [k, `${d.nombre} (decide ${nombreRol(d.decide)})`]);
  const dominioInicial = pre.dominio || (app.rol === "jemc" ? "fuerzas" : "economia");
  const estatico = `<form data-form="propuesta">
    <input type="hidden" name="asuntoId" value="${esc(pre.asunto || "")}">
    <label class="campo">Título<input type="text" name="titulo" maxlength="200" value="${esc(pre.titulo || "")}" required></label>
    <label class="campo">Área de autoridad<select name="dominio">${opciones(dominios, dominioInicial)}</select></label>
    <label class="campo">Descripción<textarea name="descripcion"></textarea></label>
    <label class="campo">Justificación<textarea name="justificacion"></textarea></label>
    <label class="campo">Efecto sobre el estado<select name="ef_tipo" data-cambio="tipo-efecto">${opciones(Object.entries(TIPOS_EFECTO), pre.efecto || "")}</select></label>
    <div data-subform>${subformEfecto(pre.efecto || "", pre)}</div>
    <div data-fondos>
      <label class="check"><input type="checkbox" name="requiereFondos"> <span>Tiene costo y necesita financiamiento presidencial</span></label>
      <label class="campo">Costo estimado <small>Opcional. Si no está definido, dejalo vacío</small><input type="text" name="costo"></label>
    </div>
    <div class="aviso-decide" data-aviso-decide></div>
    <button class="btn btn-primario" type="submit">Registrar propuesta</button>
  </form>`;
  abrirVentana({ titulo: "Nueva propuesta", subtitulo: `Como ${esc(ROLES[app.rol].nombre)}`, estatico });
  const form = $ventana.querySelector('[data-form="propuesta"]');
  form.addEventListener("input", () => actualizarAvisoDecide(form));
  form.addEventListener("change", () => actualizarAvisoDecide(form));
  actualizarAvisoDecide(form);
}

function abrirEdicionReenvio(id) {
  const p = app.juego.propuestas.find((x) => x.id === id);
  abrirVentana({ titulo: `Reenviar: ${p.titulo}`, estatico: `<form data-form="reenviar" data-id="${esc(id)}">
    <label class="campo">Título<input type="text" name="titulo" value="${esc(p.titulo)}" required></label>
    <label class="campo">Descripción<textarea name="descripcion">${esc(p.descripcion)}</textarea></label>
    <label class="campo">Justificación<textarea name="justificacion">${esc(p.justificacion)}</textarea></label>
    ${p.tipo === "voto_guerra" ? `<label class="campo">Voto recomendado<select name="voto">${opciones(Object.entries(OPCIONES_VOTO), p.voto)}</select></label>` : ""}
    <label class="campo">Respuesta a la devolución<textarea name="comentario"></textarea></label>
    <p class="nota">Los efectos sobre el estado se mantienen. Si querés cambiarlos, retirá la propuesta y registrá una nueva.</p>
    <button class="btn btn-primario" type="submit">Reenviar</button></form>` });
}

function abrirNuevoAsunto() {
  abrirVentana({ titulo: "Abrir asunto", estatico: `<form data-form="asunto">
    <label class="campo">Título<input type="text" name="titulo" required maxlength="200"></label>
    <label class="campo">Carpeta<select name="area">${opciones(Object.entries(AREAS), app.rol === "jemc" ? "defensa" : "economia")}</select></label>
    <label class="campo">Primera intervención <small>Opcional</small><select name="tipo">${opciones(Object.entries(TIPOS_INTERVENCION), "comentario")}</select></label>
    <label class="campo">Texto<textarea name="texto"></textarea></label>
    <button class="btn btn-primario" type="submit">Abrir asunto</button></form>` });
}

function abrirNuevaVotacion(asuntoId = "") {
  abrirVentana({ titulo: "Abrir votación de ATLAS", estatico: `<form data-form="votacion">
    <input type="hidden" name="asuntoId" value="${esc(asuntoId)}">
    <label class="campo">Asunto a votar<input type="text" name="titulo" required maxlength="200"></label>
    <label class="campo">Descripción<textarea name="descripcion"></textarea></label>
    <label class="campo">Tipo de decisión<select name="tipo">${opciones([["guerra", `Decisión de guerra (más del ${UMBRAL_GUERRA * 100}%)`], ["general", "Decisión general de la alianza"]], "guerra")}</select></label>
    <label class="campo">Umbral para decisiones generales <small>La regla del 80% es solo para guerra. Para el resto, acuerden el umbral.</small><select name="umbral">${opciones([["0.5", "Más del 50%"], ["0.6667", "Más de dos tercios"], ["0.8", "Más del 80%"]], "0.5")}</select></label>
    <p class="nota">Votan los ${app.juego.estado.atlas.miembros.length} miembros establecidos. En decisiones de guerra, el voto argentino necesita autorización presidencial.</p>
    <button class="btn btn-primario" type="submit">Abrir votación</button></form>` });
}

function abrirPrepararVoto(id) {
  const v = app.juego.votaciones.find((x) => x.id === id);
  abrirVentana({ titulo: "Preparar voto argentino", subtitulo: esc(v.titulo), estatico: `<form data-form="preparar-voto" data-id="${esc(id)}">
    <p>Tu recomendación le llega al Presidente como pedido de autorización. Si la aprueba, se emite el voto; si la rechaza, él define el voto argentino.</p>
    <label class="campo">Voto recomendado<select name="voto">${opciones(Object.entries(OPCIONES_VOTO), "si")}</select></label>
    <label class="campo">Fundamento militar<textarea name="justificacion" required></textarea></label>
    <button class="btn btn-primario" type="submit">Enviar al Presidente</button></form>` });
}

function abrirEditarCantidad(lista, id) {
  const item = app.juego.estado[lista].find((x) => x.id === id);
  const dominio = lista.startsWith("pfa") ? "pfa" : "fuerzas";
  abrirNuevaPropuesta({ dominio, efecto: "inventario", lista, item: id, valor: item.cantidad, titulo: `Cantidad de ${item.modelo || item.nombre}` });
}

// ---------- eventos ----------
const comentario = () => $ventana.querySelector("#comentario-decision")?.value.trim() || "";

const ACCIONES = {
  "cerrar-ventana": cerrarVentana,
  "reanudar": async (d) => {
    const partida = await consultarPartida(app.backend, d.codigo).catch(() => null);
    if (partida?.jugadores?.[d.rol]?.uid === app.backend.uid) entrar(d.codigo, d.rol, partida.nombre);
    else pantallaInicio(d.codigo, partida ? "Este dispositivo ya no tiene ese cargo. Ingresá el PIN para recuperarlo." : "No se encontró la partida.");
  },
  "entrar-nueva": (d) => { history.replaceState(null, "", location.pathname + "#despacho"); entrar(d.codigo, d.rol, d.nombre); },
  "copiar": async (d, el) => { try { await navigator.clipboard.writeText(d.texto); el.textContent = "Copiado"; } catch { aviso("No se pudo copiar: seleccioná el texto y copialo a mano."); } },
  "subtab": (d, el) => { app.sub[d.grupo] = d.valor; const h = el.getAttribute("href"); if (h && location.hash !== h) location.hash = h; else render(); },
  "nueva-propuesta": (d) => abrirNuevaPropuesta({ dominio: d.dominio, efecto: d.efecto, proyecto: d.proyecto, campo: d.campo, pais: d.pais, asunto: d.asunto }),
  "nuevo-asunto": abrirNuevoAsunto,
  "nueva-votacion": (d) => abrirNuevaVotacion(d.asunto || ""),
  "ver-proyecto": (d) => verProyecto(d.id),
  "ver-aeronave": (d) => verAeronave(d.id),
  "ver-propuesta": (d) => verPropuesta(d.id),
  "ver-asunto": (d) => verAsunto(d.id),
  "ver-votacion": (d) => verVotacion(d.id),
  "editar-cantidad": (d, el, ev) => { ev.stopPropagation(); abrirEditarCantidad(d.lista, d.id); },
  "decidir": async (d) => {
    const alt = $ventana.querySelector("#voto-alternativo")?.value || "no";
    const txt = { aprobar: "Aprobada", rechazar: "Rechazada", devolver: "Devuelta para cambios" }[d.que];
    await ejecutar(() => app.juego.decidir(d.id, d.que, comentario(), { votoAlternativo: alt }), txt).catch(() => {});
  },
  "reenviar": (d) => abrirEdicionReenvio(d.id),
  "retirar": async (d) => { if (confirm("¿Retirar la propuesta? Queda en el registro como retirada.")) await ejecutar(() => app.juego.retirar(d.id), "Propuesta retirada").catch(() => {}); },
  "objetar": async (d) => {
    if (!comentario()) return aviso("Escribí la objeción en el campo de comentario.");
    await ejecutar(() => app.juego.objetar(d.id, comentario()), "Objeción registrada").catch(() => {});
  },
  "conocimiento": async (d) => ejecutar(() => app.juego.tomarConocimiento(d.id), "Objeción leída").catch(() => {}),
  "anular": async (d) => {
    if (!comentario()) return aviso("Explicá en el comentario por qué se anula.");
    await ejecutar(() => app.juego.solicitarAnulacion(d.id, comentario()), `Pedido de anulación enviado al ${nombreRol(otroRol(app.rol))}`).catch(() => {});
  },
  "estado-asunto": async (d) => ejecutar(() => app.juego.cambiarEstadoAsunto(d.id, d.valor), d.valor === "archivado" ? "Asunto archivado" : "Asunto reabierto").catch(() => {}),
  "preparar-voto": (d) => abrirPrepararVoto(d.id),
  "confirmar-votacion": async (d) => ejecutar(() => app.juego.confirmarResultado(d.id), (r) => (r.estado === "cerrada" ? "Votación cerrada" : "Resultado confirmado; falta el otro cargo")).catch(() => {}),
  "generar-informe": async () => {
    const r = await ejecutar(() => app.juego.generarInforme(), "Informe generado").catch(() => null);
    if (r) { app.informeAbierto = r.id; setTimeout(render, 50); }
  },
  "abrir-informe": (d) => { app.informeAbierto = d.id; render(); window.scrollTo(0, 0); },
  "cerrar-informe": () => { app.informeAbierto = null; render(); },
  "imprimir": () => window.print(),
  "avanzar-fecha": async (d) => ejecutar(() => app.juego.cambiarFecha(sumarDias(app.juego.estado.fechaJuego, Number(d.dias))), "Fecha actualizada").catch(() => {}),
  "exportar": () => {
    const j = app.juego;
    const datos = { exportado: new Date().toISOString(), partida: j.partida, propuestas: j.propuestas, asuntos: j.asuntos, votaciones: j.votaciones, registro: j.registro, informes: j.informes };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" }));
    a.download = `atlas-${j.codigo}-${j.estado.fechaJuego}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  "policia-alta": (d) => abrirAltaPolicia(d.inst),
  "carga-masiva": (d) => abrirCargaMasiva(d.inst),
  "generar-plantel": (d) => abrirGenerarPlantel(d.inst),
  "renombrar-todos": async (d) => {
    if (!confirm(`¿Reemplazar los nombres de todo el personal de ${INSTITUCIONES[d.inst].corto} por nombres generados? Rangos, funciones y departamentos no cambian.`)) return;
    await ejecutar(() => app.juego.renombrarTodos(d.inst), (r) => `${r.total.toLocaleString("es-AR")} nombres regenerados`).catch(() => {});
  },
  "policia-editar": (d) => abrirEditarPolicia(d.div, d.id),
  "pagina-personal": (d) => { filtrosDe(d.inst).pPagina = Math.max(0, Number(d.valor)); render(); },
  "item": (d) => abrirItem(d.esq, d.id || null),
  "doc": (d) => abrirDoc(d.esq, d.id || null, d.inst || null),
  "dato": (d) => abrirDato(d.ruta, d.titulo, d.tipo),
  "ver-modelo": (d) => verModelo(d.id),
  "generar-nombre": (d, el) => { const input = el.closest("form").querySelector(`[name="${d.campo}"]`); input.value = generarNombre(); input.dispatchEvent(new Event("input", { bubbles: true })); },
  "escudo-original": async (d) => { const I = INSTITUCIONES[d.inst] || LOGOS[d.inst]; await ejecutar(() => app.juego.proponer({ titulo: `Imagen original de ${I.corto}`, dominio: I.dominio, efectos: [{ tipo: "dato", ruta: `escudos.${d.inst}`, valor: null }] }), (r) => (r.decide === app.rol ? "Imagen original restablecida" : `Pedido enviado al ${nombreRol(r.decide)}`)).catch(() => {}); },
  "reforma-tributaria": () => abrirReforma(),
  "policia-estado": async (d, el) => {
    const justificacion = el.closest("form")?.querySelector('[name="justificacion"]')?.value.trim() || "";
    const nombre = el.closest("form")?.querySelector('[name="nombre"]')?.value || "";
    const inst = instDeUnidad(d.div);
    const r = await ejecutar(() => app.juego.proponer({
      titulo: `${d.op === "baja" ? "Baja" : "Reincorporación"} de ${nombre} (${INSTITUCIONES[inst].corto})`, dominio: INSTITUCIONES[inst].dominio, justificacion,
      efectos: [{ tipo: "personal", op: d.op, inst, division: d.div, id: d.id, nombre }],
    }), (r) => (r.decide === app.rol ? (d.op === "baja" ? "Baja registrada" : "Reincorporación registrada") : "Pedido enviado al Jefe del Estado Mayor")).catch(() => null);
    if (r) cerrarVentana();
  },
  "avanzar-mes": async () => {
    if (!confirm(`¿Avanzar al mes siguiente? Se calculan economía, presupuesto, obras, auditorías y opinión pública.`)) return;
    const r = await ejecutar(() => app.juego.avanzarMes(app.juego.estado.fechaJuego)).catch(() => null);
    if (r) aviso(`Nuevo mes: ${esc(fechaLarga(app.juego.estado.fechaJuego))}. Los detalles están en el Registro de decisiones.`);
  },
  "indicador": (d) => abrirIndicador(d.clave),
  "medida": (d) => abrirMedida(d.tipo),
  "editar-presupuesto": () => abrirPresupuesto("borrador"),
  "pedir-fondos": () => abrirPresupuesto("pedido"),
  "enviar-presupuesto": async () => {
    if (!confirm("¿Enviar el presupuesto propuesto al Congreso?")) return;
    const r = await ejecutar(() => app.juego.enviarPresupuesto(), "Presupuesto enviado al Congreso").catch(() => null);
    if (r) { app.sub.gobierno = "congreso"; location.hash = "#gobierno"; }
  },
  "nueva-licitacion": abrirLicitacion,
  "ver-licitacion": (d) => verLicitacion(d.id),
  "adjudicar": async (d) => {
    const o = app.juego.obras.find((x) => x.id === d.id);
    const of = o.ofertas.find((x) => x.id === d.oferta);
    await ejecutar(() => app.juego.proponer({ titulo: `Adjudicación: ${o.nombre} a ${of.empresa}`, dominio: "infraestructura",
      efectos: [{ tipo: "doc", col: "obras", id: o.id, op: "editar", titulo: o.nombre, cambios: { estado: "En ejecución", empresa: of.empresa, costo: of.costo, plazo: of.plazo, riesgo: of.riesgo, avance: 0, meses: 0 } }] }), "Obra adjudicada").catch(() => {});
    cerrarVentana();
  },
  "inaugurar": async (d) => {
    const o = app.juego.obras.find((x) => x.id === d.id);
    await ejecutar(() => app.juego.proponer({ titulo: `Inauguración: ${o.nombre}`, dominio: "infraestructura", efectos: [
      { tipo: "doc", col: "obras", id: o.id, op: "editar", titulo: o.nombre, cambios: { estado: "Inaugurada" } },
      { tipo: "simples", efectos: { opinion: 1.5, prov: 5 }, provinciaId: o.provinciaId, descripcion: `aprobación +1,5; ${o.provincia} +5` },
    ] }), "Obra inaugurada").catch(() => {});
  },
  "votar-ley": async (d) => {
    const r = await ejecutar(() => app.juego.votarLey(d.id)).catch(() => null);
    if (r) aviso(`${r.aprobada ? "Aprobada" : "Rechazada"}: ${r.afirmativos} a favor, ${r.negativos} en contra. Estado: ${esc(r.estado)}.`);
  },
  "negociar": (d) => abrirNegociar(d.id),
  "ver-votacion-ley": (d) => verVotacionLey(d.id),
  "legislador": (d) => abrirLegislador(d.id),
  "pagina-congreso": (d) => { filtrosCongreso().pagina = Math.max(0, Number(d.valor)); render(); },
  "comunicar": (d) => abrirComunicar(d.tipo),
  "auditoria": abrirAuditoria,
  "condecorar": (d) => abrirCondecorar(d.div, d.id),
  "salir": () => { app.juego?.cerrar(); app.juego = null; guardarLocal("atlas.sesion", null); history.replaceState(null, "", location.pathname); pantallaInicio(); },
};

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-accion]");
  if (!el || el.tagName === "SELECT") return;
  const f = ACCIONES[el.dataset.accion];
  if (f) { ev.preventDefault(); f(el.dataset, el, ev); }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.matches("tr.clic")) ev.target.click();
});

document.addEventListener("change", async (ev) => {
  const el = ev.target;
  const tipo = el.dataset?.cambio;
  if (tipo === "filtro") { app.filtros[el.dataset.campo] = el.value; render(); }
  else if (tipo === "filtro-congreso") { const f = filtrosCongreso(); f[el.dataset.campo] = el.value; f.pagina = 0; if (el.dataset.campo === "camara") f.bloque = ""; render(); }
  else if (tipo === "filtro-personal") { const f = filtrosDe(el.dataset.inst); f[el.dataset.campo] = el.value; f.pPagina = 0; render(); }
  else if (el.dataset?.escudo) {
    const inst = el.dataset.escudo, archivo = el.files?.[0];
    if (!archivo) return;
    const I = INSTITUCIONES[inst] || LOGOS[inst];
    try {
      const url = await imagenADataURL(archivo);
      await ejecutar(() => app.juego.proponer({ titulo: `Nuevo ${LOGOS[inst] ? "logo" : "escudo"} de ${I.corto}`, dominio: I.dominio, efectos: [{ tipo: "dato", ruta: `escudos.${inst}`, valor: url }] }),
        (r) => (r.decide === app.rol ? "Imagen actualizada" : `Pedido enviado al ${nombreRol(r.decide)}`));
    } catch (e) { if (!e.mostrado) aviso(`<span class="error">${esc(e.message)}</span>`); }
    el.value = "";
  }
  else if (tipo === "tipo-efecto") {
    const form = el.closest("form");
    form.querySelector("[data-subform]").innerHTML = subformEfecto(el.value);
    actualizarAvisoDecide(form);
  } else if (tipo === "lista-inventario") {
    el.closest("form").querySelector('[name="ef_item"]').innerHTML = opcionesInventario(el.value);
  } else if (tipo === "voto") {
    await ejecutar(() => app.juego.votar(el.dataset.id, el.dataset.pais, el.value || null), `Voto de ${el.dataset.pais} registrado`).catch(() => refrescarVentana());
  }
});

document.addEventListener("input", (ev) => {
  if (ev.target.dataset?.textoCongreso !== undefined) { const f = filtrosCongreso(); f.texto = ev.target.value; f.pagina = 0; render(); return; }
  if (ev.target.dataset?.textoCeremonia !== undefined) { app.filtroCeremonia = ev.target.value; render(); return; }
  const campo = ev.target.dataset?.cambioTexto;
  if (!campo) return;
  const f = filtrosDe(ev.target.dataset.inst);
  f[campo] = ev.target.value;
  f.pPagina = 0;
  render();
});

document.addEventListener("submit", async (ev) => {
  const form = ev.target;
  const tipo = form.dataset.form;
  if (!tipo) return;
  ev.preventDefault();
  const fd = new FormData(form);
  const t = (k) => String(fd.get(k) ?? "").trim();
  const boton = form.querySelector('[type="submit"]');
  if (boton) boton.disabled = true;
  try {
    switch (tipo) {
      case "crear": {
        const rol = fd.get("rol");
        const { codigo, pin } = await ejecutar(() => crearPartida(app.backend, { nombre: t("nombre"), rol }));
        pantallaInvitacion(codigo, pin, rol, t("nombre"));
        break;
      }
      case "buscar": {
        const codigo = normalizarCodigo(t("codigo"));
        if (!codigo) { document.getElementById("resultado-busqueda").innerHTML = `<p class="error">El código tiene 8 caracteres, por ejemplo ABCD-1234.</p>`; break; }
        await mostrarBusqueda(codigo);
        break;
      }
      case "unirse": {
        const codigo = form.dataset.codigo, rol = fd.get("rol");
        const r = await ejecutar(() => unirse(app.backend, codigo, rol, t("pin")));
        if (!r.ok) { aviso(`<span class="error">Ese cargo ya está ocupado. Para recuperarlo, ingresá su PIN.</span>`); break; }
        const partida = await consultarPartida(app.backend, codigo);
        history.replaceState(null, "", location.pathname + "#despacho");
        entrar(codigo, rol, partida?.nombre);
        if (r.pin) aviso(`Tu PIN de cargo es <b>${esc(r.pin)}</b>. Lo ves también en la sección Partida.`);
        break;
      }
      case "propuesta": {
        const dominio = t("dominio");
        const efecto = leerEfecto(fd, dominio);
        const r = await ejecutar(() => app.juego.proponer({
          titulo: t("titulo"), dominio, descripcion: t("descripcion"), justificacion: t("justificacion"),
          efectos: efecto ? [efecto] : [], asuntoId: t("asuntoId") || null, requiereFondos: !!fd.get("requiereFondos"), costo: t("costo"),
        }), (r) => (r.decide === app.rol ? `Registrada: ${r.estado}` : `Enviada al ${nombreRol(r.decide)}`));
        verPropuesta(r.id);
        break;
      }
      case "reenviar": {
        const cambios = { titulo: t("titulo"), descripcion: t("descripcion"), justificacion: t("justificacion"), comentario: t("comentario") };
        if (fd.get("voto")) cambios.voto = fd.get("voto");
        await ejecutar(() => app.juego.reenviar(form.dataset.id, cambios), "Propuesta reenviada");
        verPropuesta(form.dataset.id);
        break;
      }
      case "asunto": {
        const r = await ejecutar(() => app.juego.crearAsunto({ titulo: t("titulo"), area: t("area"), texto: t("texto"), tipoIntervencion: t("tipo") }), "Asunto abierto");
        verAsunto(r.id);
        break;
      }
      case "intervenir": {
        await ejecutar(() => app.juego.intervenir(form.dataset.id, t("tipo"), t("texto")));
        form.querySelector("textarea").value = "";
        break;
      }
      case "votacion": {
        const r = await ejecutar(() => app.juego.crearVotacion({ titulo: t("titulo"), descripcion: t("descripcion"), tipo: t("tipo"), umbral: Number(t("umbral")), asuntoId: t("asuntoId") || null }), "Votación abierta");
        verVotacion(r.id);
        break;
      }
      case "preparar-voto": {
        await ejecutar(() => app.juego.prepararVotoArgentino(form.dataset.id, t("voto"), t("justificacion")), "Pedido enviado al Presidente");
        verVotacion(form.dataset.id);
        break;
      }
      case "policia-alta": {
        const inst = form.dataset.inst;
        const r = await ejecutar(() => app.juego.proponer({
          titulo: `Alta de ${t("nombre")} (${INSTITUCIONES[inst].corto})`, dominio: INSTITUCIONES[inst].dominio, justificacion: t("justificacion"),
          efectos: [{ tipo: "personal", op: "alta", inst, division: t("division"), policia: { id: nuevoId("pol"), nombre: t("nombre"), rango: t("rango"), funcion: t("funcion"), notas: t("notas") } }],
        }), (r) => (r.decide === app.rol ? "Alta registrada" : `Pedido enviado al ${nombreRol(r.decide)}`));
        if (r) cerrarVentana();
        break;
      }
      case "policia-editar": {
        const div = form.dataset.div, id = form.dataset.id;
        const p = (app.juego.personal.find((d) => d.id === div)?.policias || []).find((x) => x.id === id);
        if (!p) throw new ErrorJuego("Ese policía ya no está en esa división");
        const cambios = {};
        if (t("nombre") !== p.nombre) cambios.nombre = t("nombre");
        if (t("rango") !== p.rango) cambios.rango = t("rango");
        if (t("division") !== div) cambios.division = t("division");
        if (t("notas") !== (p.notas || "")) cambios.notas = t("notas");
        if (t("funcion") !== (p.funcion || "")) cambios.funcion = t("funcion");
        if (!Object.keys(cambios).length) throw new ErrorJuego("No cambiaste ningún dato");
        const inst = instDeUnidad(div), orden = ordenRango(inst);
        const r = await ejecutar(() => app.juego.proponer({
          titulo: `${cambios.rango ? (orden[cambios.rango] > orden[p.rango] ? "Ascenso" : "Cambio de rango") : cambios.funcion !== undefined ? "Cambio de función" : "Cambio de datos"}: ${p.nombre} (${INSTITUCIONES[inst].corto})`,
          dominio: INSTITUCIONES[inst].dominio, justificacion: t("justificacion"),
          efectos: [{ tipo: "personal", op: "editar", inst, division: div, id, nombre: p.nombre, cambios }],
        }), (r) => (r.decide === app.rol ? "Cambio registrado" : `Pedido enviado al ${nombreRol(r.decide)}`));
        if (r) cerrarVentana();
        break;
      }
      case "carga-masiva": {
        const { filas, errores } = parsearLista(fd.get("lista") || "", form.dataset.inst);
        const caja = form.querySelector("[data-errores]");
        if (errores.length) {
          caja.innerHTML = `<div class="error"><b>Hay ${errores.length} líneas con problemas; no se cargó nada.</b><ul class="lista-simple">${errores.slice(0, 12).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>${errores.length > 12 ? `<p>Y ${errores.length - 12} más.</p>` : ""}</div>`;
          break;
        }
        if (!filas.length) throw new ErrorJuego("La lista está vacía");
        if (!confirm(`¿Cargar ${filas.length.toLocaleString("es-AR")} policías?`)) break;
        await ejecutar(() => app.juego.cargaMasiva(filas, `Carga masiva (${INSTITUCIONES[form.dataset.inst].corto})`), `${filas.length.toLocaleString("es-AR")} agentes cargados`);
        cerrarVentana();
        break;
      }
      case "generar-plantel": {
        const inst = form.dataset.inst, cantidad = Number(t("cantidad"));
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 5000) throw new ErrorJuego("Elegí una cantidad entre 1 y 5.000");
        const unidades = t("unidad") === "__todos" ? app.juego.estado.unidades[inst].map((u) => u.id) : [t("unidad")];
        if (!confirm(`¿Generar ${(cantidad * unidades.length).toLocaleString("es-AR")} agentes con nombres inventados?`)) break;
        for (const u of unidades) await ejecutar(() => app.juego.generarPlantel(u, cantidad));
        aviso(`${(cantidad * unidades.length).toLocaleString("es-AR")} agentes generados`);
        cerrarVentana();
        break;
      }
      case "generico": {
        const r = construirConImpacto(fd);
        await ejecutar(() => app.juego.proponer({ titulo: r.titulo, dominio: r.dominio, efectos: r.efectos, justificacion: t("justificacion") }),
          (res) => (res.decide === app.rol ? "Registrado" : `Pedido enviado al ${nombreRol(res.decide)}`));
        cerrarVentana();
        break;
      }
      case "fecha": {
        await ejecutar(() => app.juego.cambiarFecha(t("fecha")), "Fecha actualizada");
        break;
      }
    }
  } catch (e) {
    if (!e?.mostrado) aviso(`<span class="error">${esc(e instanceof ErrorJuego ? e.message : `No se pudo completar: ${e.message || e}`)}</span>`);
    if (!(e instanceof ErrorJuego)) console.error(e);
  } finally {
    if (boton && boton.isConnected) boton.disabled = false;
  }
});

iniciar();
