import { FIREBASE_CONFIG } from "./config.js";
import { crearBackendServidor } from "./backends/servidor.js";
import { Juego, crearPartida, unirse, consultarPartida, ErrorJuego } from "./juego.js";
import {
  ROLES, DOMINIOS, AREAS, ESTADOS, claseEstado, ESTADOS_PROPUESTA as EP, CAMPOS_AT1, LISTAS_INVENTARIO,
  rolQueDecide, describirEfecto, resultadoVotacion, TEXTO_RESULTADO, OPCIONES_VOTO, otroRol, fechaLarga, sumarDias,
  normalizarCodigo, UMBRAL_GUERRA,
} from "./reglas.js";
import { totalConocido } from "./informes.js";

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
  filtros: { area: "", estado: "", propEstado: "" },
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
  despacho: ["Mi despacho", vistaDespacho],
  situacion: ["Situación nacional", vistaSituacion],
  proyectos: ["Proyectos", vistaProyectos],
  inventarios: ["Inventarios", vistaInventarios],
  at1: ["AT-1", vistaAT1],
  atlas: ["ATLAS y votaciones", vistaAtlas],
  asuntos: ["Asuntos y reuniones", vistaAsuntos],
  registro: ["Registro de decisiones", vistaRegistro],
  informes: ["Informes", vistaInformes],
  partida: ["Partida", vistaPartida],
};

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
  const [, fnVista] = VISTAS[app.vista];
  let contenido;
  try { contenido = fnVista(); } catch (e) { console.error(e); contenido = `<p class="error">Error al mostrar esta vista: ${esc(e.message)}</p>`; }
  $app.innerHTML = `
  <div class="marco">
    <aside class="lateral">
      <div class="marca">${MARCA}<div><b>ATLAS</b><span>Centro de coordinación</span></div></div>
      <nav class="nav" aria-label="Secciones">
        ${Object.entries(VISTAS).map(([id, [nombre]]) => `<a href="#${id}"${app.vista === id ? ' aria-current="page"' : ""}><span>${esc(nombre)}</span>${contadores[id] ? `<span class="contador">${contadores[id]}</span>` : ""}</a>`).join("")}
      </nav>
      <div class="pie">Partida ${esc(j.codigo)}<br>Contenido ficticio.</div>
    </aside>
    <div>
      <header class="cabecera">
        <div>
          <div class="sub">${esc(j.partida.nombre)} · Gobierno ${esc(j.estado.gobierno.nombre)}</div>
          <div class="fecha">${esc(fechaLarga(j.estado.fechaJuego))}</div>
        </div>
        <div class="despacho-de">
          <div>Despacho del <span class="cargo">${esc(ROLES[app.rol].nombre)}</span></div>
          <div class="sub"><span class="conexion ${claseCon}">${esc(textoCon)}</span> · ${otro ? `${esc(nombreRol(otroRol(app.rol)))} en la partida` : `Falta que entre el ${esc(nombreRol(otroRol(app.rol)))}`}</div>
        </div>
      </header>
      <main class="contenido" id="contenido">${contenido}</main>
    </div>
  </div>`;
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
      <p style="margin-top:.6rem">Aprobación del gobierno: ${dato(e.gobierno.opinionPublica.aprobacion, (v) => `${esc(v)}%`)}</p>
      <div class="item-bandeja"><div><b>Federalismo</b><div class="meta">${esc(e.federalismo.propuesta)}. ${esc(e.federalismo.nota)}.</div></div>${sello(e.federalismo.estado)}</div>
    </section>
    <section class="panel"><h3>Soberanía</h3>
      ${e.soberania.map((x) => `<div class="item-bandeja"><div><b>${esc(x.tema)}</b><div class="meta">${esc(x.detalle)}</div></div>${sello(x.estado)}</div>`).join("")}
    </section>
    <section class="panel"><h3>Seguridad <small>PFA bajo el ${esc(e.pfa.autoridad)}</small></h3>
      <div class="tabla-envoltura"><table><thead><tr><th>División</th><th>Inspector en jefe</th></tr></thead>
      <tbody>${e.pfa.divisiones.map((d) => `<tr><td><b>${esc(d.nombre)}</b><div class="nota">${esc(d.funcion)}</div></td><td>${dato(d.inspector)}</td></tr>`).join("")}</tbody></table></div>
      <p class="nota" style="margin-top:.6rem">Flota terrestre: ${num(terrestre.total)} unidades. Helicópteros: ${num(helis.total)}. ${esc(e.pfa.cargas)}</p>
      <p class="nota">${esc(e.federalismo.cordoba)}</p>
    </section>
    <section class="panel"><h3>Infraestructura</h3>${listaProyectos("infraestructura")}</section>
    <section class="panel"><h3>Industria</h3><p class="nota">FAdeA produce los modelos Zonda, Bisonte, Colibrí y Dragón.</p>${listaProyectos("industria")}</section>
    <section class="panel"><h3>Defensa</h3>
      <p>Fuerza Aérea: <b>${num(aereo.total)}</b> aeronaves con cantidad registrada. Sin cantidad: ${esc(aereo.sinCantidad.join(", "))}.</p>
      <p>Buques, submarinos, destructores, portaaviones, tanques y artillería: ${sinDato("cantidad no consolidada")}</p>
      ${listaProyectos("defensa")}${listaProyectos("soberania")}
    </section>
    <section class="panel"><h3>ATLAS</h3>
      <p>${e.atlas.miembros.length} miembros. Sede en ${esc(e.atlas.sede)}. Presupuesto: ${esc(e.atlas.presupuestoAnual)}.</p>
      <p>Votaciones abiertas: <b>${abiertas}</b>. AT-1: ${esc(e.at1.estadoPrograma)}.</p>
      <div class="acciones"><a class="btn btn-chico" href="#atlas">Ver ATLAS</a><a class="btn btn-chico" href="#at1">Ficha del AT-1</a></div>
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
  const tabs = [["aereo", "Fuerza Aérea"], ["referencias", "Referencias aeronáuticas"], ["capacidades", "Naval y terrestre"], ["pfaTerrestre", "PFA: flota terrestre"], ["pfaHelicopteros", "PFA: helicópteros"]];
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
  return `${encabezado("Inventarios", "Cantidades ficticias de la partida. Cada cambio pasa por el registro, con autor y valor anterior.")}
  <div class="subtabs" role="group" aria-label="Inventario">${tabs.map(([id, t]) => `<button data-accion="subtab" data-grupo="inventario" data-valor="${id}" aria-pressed="${sub === id}">${esc(t)}</button>`).join("")}</div>${cuerpo}`;
}

function vistaAT1() {
  const at = app.juego.estado.at1;
  const relacionadas = app.juego.propuestas.filter((p) => (p.efectos || []).some((e) => e.tipo === "at1") || /AT-1/.test(p.titulo));
  return `${encabezado("AT-1: avión de combate conjunto de ATLAS", `Dirección: ${esc(at.direccion)}. ${sello(at.estadoPrograma === "Producción iniciada" ? "Consolidado" : at.estadoPrograma)} ${esc(at.estadoPrograma)}`)}
  <div class="grilla">
    <section class="panel"><h3>Propósito</h3><p>${esc(at.proposito)}</p><p class="nota">Proyecto conjunto de ATLAS: no es un modelo exclusivo de FAdeA.</p>
      <h3 style="margin:.8rem 0 .4rem">Países miembros</h3><p>${esc(app.juego.estado.atlas.miembros.map((m) => m.pais).join(", "))}</p></section>
    <section class="panel"><h3>Decisiones del programa</h3>
      <div class="tabla-envoltura"><table><tbody>${Object.entries(CAMPOS_AT1).map(([k, t]) => `<tr><td>${esc(t)}</td><td>${vacio(at.decisiones[k]) ? sinDato("No definido") : `<b>${esc(at.decisiones[k])}</b>`}</td><td><button class="btn btn-chico" data-accion="nueva-propuesta" data-dominio="atlas" data-efecto="at1" data-campo="${k}">Proponer</button></td></tr>`).join("")}</tbody></table></div>
    </section>
    <section class="panel"><h3>Plataformas de referencia</h3>
      <div class="tabla-envoltura"><table><thead><tr><th>Miembro</th><th>Plataforma</th></tr></thead><tbody>${at.plataformas.map((p) => `<tr><td>${esc(p.pais)}</td><td>${esc(p.plataforma)}</td></tr>`).join("")}</tbody></table></div>
      <p class="nota" style="margin-top:.6rem">${esc(at.aclaracion)}</p></section>
    <section class="panel"><h3>Datos técnicos no definidos</h3>
      <ul class="lista-simple">${at.noDefinidos.map((x) => `<li>${esc(x)}: ${sinDato("No definido")}</li>`).join("")}</ul>
      <p class="nota" style="margin-top:.6rem">La aplicación no completa estos datos por su cuenta.</p></section>
    <section class="panel"><h3>Decisiones registradas sobre el AT-1</h3>
      ${relacionadas.length ? relacionadas.map((p) => filaPropuesta(p)).join("") : `<p class="vacio">Todavía no hay decisiones nuevas sobre el programa.</p>`}</section>
  </div>`;
}

function vistaAtlas() {
  const at = app.juego.estado.atlas;
  const vots = app.juego.votaciones;
  return `${encabezado("ATLAS", `Sede central en ${esc(at.sede)}. Presupuesto: ${esc(at.presupuestoAnual)}.`, `<button class="btn btn-primario" data-accion="nueva-votacion">Abrir votación</button>`)}
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
      ["Especificaciones técnicas", sinDato("No definidas en la partida")],
    ])}<button class="btn btn-primario" data-accion="editar-cantidad" data-lista="aereo" data-id="${esc(id)}">Proponer cambio de cantidad</button>`;
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
  const decide = rolQueDecide(dominio, efecto ? [efecto] : [], app.juego.estado);
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
  "subtab": (d) => { app.sub[d.grupo] = d.valor; render(); },
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
