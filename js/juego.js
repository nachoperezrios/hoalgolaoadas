// Núcleo de la partida. Funciona igual con Firebase, con el servidor local o con
// el backend en memoria de los tests: solo usa la interfaz común del backend.
//
// Interfaz del backend:
//   uid, tipo
//   get(path) -> datos | null
//   transact(paths, fn(datosPorPath) -> {writes: {path: datos}, result}) -> result
//   onDoc(path, cb(datos|null), onError) -> desuscribir
//   onCol(path, cb([{id, ...datos}]), onError) -> desuscribir

import { estadoInicial, REGISTRO_INICIAL } from "./datos-iniciales.js";
import {
  ROLES, DOMINIOS, ESTADOS_PROPUESTA as EP, otroRol, rolQueDecide, aplicarEfectos, revertirEfectos,
  resultadoVotacion, UMBRAL_GUERRA, generarCodigo, generarPin, generarId, describirEfecto, fechaLarga,
} from "./reglas.js";
import { construirInforme } from "./informes.js";

const COLECCIONES = ["propuestas", "asuntos", "votaciones", "registro", "informes"];
const ahora = () => new Date().toISOString();

export class ErrorJuego extends Error {}
const exigir = (cond, msg) => { if (!cond) throw new ErrorJuego(msg); };

export async function crearPartida(backend, { nombre, rol }) {
  exigir(ROLES[rol], "Elegí un cargo válido");
  const codigo = generarCodigo();
  const pin = generarPin();
  const ruta = `partidas/${codigo}`;
  const fechaJuego = estadoInicial().fechaJuego;
  await backend.transact([ruta], (datos) => {
    exigir(!datos[ruta], "Ese código ya existe; probá de nuevo");
    const writes = {
      [ruta]: {
        codigo, nombre: (nombre || "Partida ATLAS").trim().slice(0, 80), creada: ahora(), version: 1,
        jugadores: { jemc: null, presidente: null, [rol]: { uid: backend.uid, pin } },
        estado: estadoInicial(),
      },
    };
    for (const r of REGISTRO_INICIAL) {
      writes[`${ruta}/registro/${r.id}`] = { ...r, fecha: ahora(), fechaJuego, rol: "acuerdo" };
    }
    return { writes };
  });
  return { codigo, pin };
}

export async function consultarPartida(backend, codigo) {
  return backend.get(`partidas/${codigo}`);
}

// Ocupa un cargo. Si ya lo ocupa otro dispositivo, hace falta su PIN.
export async function unirse(backend, codigo, rol, pinIngresado) {
  exigir(ROLES[rol], "Elegí un cargo válido");
  const ruta = `partidas/${codigo}`;
  const pinNuevo = generarPin();
  return backend.transact([ruta], (datos) => {
    const partida = datos[ruta];
    exigir(partida, "No existe una partida con ese código");
    const actual = partida.jugadores?.[rol];
    if (actual && actual.uid === backend.uid) return { writes: {}, result: { ok: true, pin: actual.pin } };
    if (actual && actual.pin !== String(pinIngresado || "").trim()) {
      return { writes: {}, result: { ok: false, motivo: "pin" } };
    }
    const pin = actual ? actual.pin : pinNuevo;
    const jugadores = { ...partida.jugadores, [rol]: { uid: backend.uid, pin } };
    return { writes: { [ruta]: { ...partida, jugadores } }, result: { ok: true, pin } };
  });
}

export class Juego {
  constructor(backend, codigo, rol) {
    this.backend = backend;
    this.codigo = codigo;
    this.rol = rol;
    this.ruta = `partidas/${codigo}`;
    this.partida = null;
    for (const c of COLECCIONES) this[c] = [];
    this.cargado = { partida: false };
    this.desuscribir = [];
  }

  get estado() { return this.partida?.estado; }

  // Se suscribe una sola vez a la partida y sus colecciones.
  conectar(onCambio, onError) {
    this.desuscribir.push(this.backend.onDoc(this.ruta, (d) => {
      this.partida = d; this.cargado.partida = true; onCambio("partida");
    }, onError));
    for (const c of COLECCIONES) {
      this.desuscribir.push(this.backend.onCol(`${this.ruta}/${c}`, (lista) => {
        this[c] = [...lista].sort((a, b) => String(b.fecha || b.creada || "").localeCompare(String(a.fecha || a.creada || "")));
        this.cargado[c] = true; onCambio(c);
      }, onError));
    }
  }

  cerrar() { this.desuscribir.forEach((f) => f && f()); this.desuscribir = []; }

  // ---------- utilidades internas ----------
  rutaDe(col, id) { return `${this.ruta}/${col}/${id}`; }

  entrada(estado, { tipo, titulo, detalle = "", refs = {} }) {
    const id = generarId("reg");
    return [this.rutaDe("registro", id), {
      id, tipo, titulo, detalle, rol: this.rol, fecha: ahora(), fechaJuego: estado.fechaJuego, ...refs,
    }];
  }

  paso(accion, comentario = "") {
    return { rol: this.rol, accion, comentario: String(comentario || "").slice(0, 4000), fecha: ahora() };
  }

  // ---------- propuestas y decisiones ----------

  async proponer({ titulo, dominio, descripcion = "", justificacion = "", efectos = [], asuntoId = null, requiereFondos = false, costo = "" }) {
    exigir(String(titulo || "").trim(), "La propuesta necesita un título");
    exigir(DOMINIOS[dominio], "Elegí el área de autoridad");
    const id = generarId("prop");
    const rutaProp = this.rutaDe("propuestas", id);
    return this.backend.transact([this.ruta], (datos) => {
      const partida = datos[this.ruta];
      exigir(partida, "La partida no existe");
      const estado = partida.estado;
      const decide = rolQueDecide(dominio, efectos, estado);
      const prop = {
        id, tipo: "normal", titulo: titulo.trim().slice(0, 200), dominio, autor: this.rol, decide,
        descripcion, justificacion, efectos, efectosAplicados: [], asuntoId,
        requiereFondos: !!requiereFondos && decide === "jemc", costo,
        estado: EP.revision, creada: ahora(), fecha: ahora(), fechaJuego: estado.fechaJuego,
        historial: [this.paso("propuso", justificacion)], objeciones: [],
      };
      const writes = {};
      let nuevoEstado = estado;
      if (decide === this.rol) {
        // Decisión directa dentro de las facultades propias.
        prop.historial.push(this.paso("decision_directa"));
        nuevoEstado = this._resolverAprobacion(prop, estado, writes);
      }
      writes[rutaProp] = prop;
      if (nuevoEstado !== estado) writes[this.ruta] = { ...partida, estado: nuevoEstado };
      const [rr, entrada] = this.entrada(estado, {
        tipo: decide === this.rol ? "decision" : "propuesta",
        titulo: decide === this.rol ? `Decisión: ${prop.titulo}` : `Propuesta enviada al ${ROLES[decide].corto}: ${prop.titulo}`,
        detalle: prop.estado, refs: { propuestaId: id, asuntoId },
      });
      writes[rr] = entrada;
      return { writes, result: { id, decide, estado: prop.estado } };
    });
  }

  // Aprueba una propuesta normal: aplica efectos o abre el pedido de financiamiento.
  _resolverAprobacion(prop, estado, writes) {
    if (prop.requiereFondos) {
      prop.estado = EP.financiamiento;
      const idF = generarId("prop");
      writes[this.rutaDe("propuestas", idF)] = {
        id: idF, tipo: "financiamiento", titulo: `Financiamiento: ${prop.titulo}`, dominio: "economia",
        autor: "jemc", decide: "presidente", descripcion: `Costo estimado: ${prop.costo || "no definido"}`,
        justificacion: prop.justificacion, efectos: [], efectosAplicados: [], refId: prop.id, asuntoId: prop.asuntoId,
        requiereFondos: false, costo: prop.costo, estado: EP.revision, creada: ahora(), fecha: ahora(),
        fechaJuego: estado.fechaJuego, historial: [{ rol: "jemc", accion: "propuso", comentario: "Pedido automático de financiamiento", fecha: ahora() }],
        objeciones: [],
      };
      prop.financiamientoId = idF;
      return estado;
    }
    const { estado: nuevo, aplicados } = aplicarEfectos(estado, prop.efectos, estado.fechaJuego);
    prop.efectosAplicados = aplicados;
    prop.estado = EP.aprobada;
    return nuevo;
  }

  async decidir(propId, accion, comentario = "", { votoAlternativo = "no" } = {}) {
    const rutaProp = this.rutaDe("propuestas", propId);
    const actual = await this.backend.get(rutaProp);
    exigir(actual, "La propuesta no existe");
    const extra = [];
    if (actual.refId && actual.tipo !== "normal") {
      extra.push(actual.tipo === "voto_guerra" ? this.rutaDe("votaciones", actual.refId) : this.rutaDe("propuestas", actual.refId));
    }
    return this.backend.transact([this.ruta, rutaProp, ...extra], (datos) => {
      const partida = datos[this.ruta];
      const prop = structuredClone(datos[rutaProp]);
      exigir(prop.estado === EP.revision, "Esta propuesta ya no está en revisión");
      exigir(prop.decide === this.rol, "Esta decisión le corresponde al otro cargo");
      exigir(["aprobar", "rechazar", "devolver"].includes(accion), "Acción inválida");
      let estado = partida.estado;
      const writes = {};
      prop.historial.push(this.paso(accion, comentario));
      prop.fecha = ahora();

      if (accion === "devolver") {
        prop.estado = EP.devuelta;
      } else if (prop.tipo === "normal") {
        if (accion === "aprobar") estado = this._resolverAprobacion(prop, estado, writes);
        else prop.estado = EP.rechazada;
      } else if (prop.tipo === "financiamiento") {
        const ruta = this.rutaDe("propuestas", prop.refId);
        const original = structuredClone(datos[ruta]);
        exigir(original && original.estado === EP.financiamiento, "La medida original ya no espera financiamiento");
        if (accion === "aprobar") {
          const r = aplicarEfectos(estado, original.efectos, estado.fechaJuego);
          estado = r.estado;
          original.efectosAplicados = r.aplicados;
          original.estado = EP.aprobada;
          prop.estado = EP.aprobada;
        } else {
          original.estado = EP.bloqueada;
          prop.estado = EP.rechazada;
        }
        original.historial.push(this.paso(accion === "aprobar" ? "financiada" : "sin_fondos", comentario));
        original.fecha = ahora();
        writes[ruta] = original;
      } else if (prop.tipo === "voto_guerra") {
        const ruta = this.rutaDe("votaciones", prop.refId);
        const vot = structuredClone(datos[ruta]);
        exigir(vot && vot.estado === "abierta", "La votación ya está cerrada");
        let voto = prop.voto;
        if (accion === "rechazar") voto = votoAlternativo;
        if (voto && voto !== "ninguno") {
          vot.votos = { ...vot.votos, Argentina: { voto, cargadoPor: "presidente", autorizado: accion === "aprobar", fecha: ahora() } };
          vot.confirmaciones = { jemc: false, presidente: false };
          vot.fecha = ahora();
          writes[ruta] = vot;
        }
        prop.estado = accion === "aprobar" ? EP.aprobada : EP.rechazada;
      } else if (prop.tipo === "anulacion") {
        const ruta = this.rutaDe("propuestas", prop.refId);
        const original = structuredClone(datos[ruta]);
        exigir(original && [EP.aprobada, EP.financiamiento, EP.bloqueada].includes(original.estado), "La medida ya no se puede anular");
        if (accion === "aprobar") {
          const r = revertirEfectos(estado, original.efectosAplicados || []);
          estado = r.estado;
          prop.conflictos = r.conflictos;
          original.estado = EP.anulada;
          original.anuladaPor = prop.id;
          original.historial.push(this.paso("anulada", prop.justificacion));
          original.fecha = ahora();
          writes[ruta] = original;
          prop.estado = EP.aprobada;
        } else prop.estado = EP.rechazada;
      }

      writes[rutaProp] = prop;
      if (estado !== partida.estado) writes[this.ruta] = { ...partida, estado };
      const verbos = { aprobar: "aprobó", rechazar: "rechazó", devolver: "devolvió" };
      const [rr, e] = this.entrada(partida.estado, {
        tipo: "decision", titulo: `El ${ROLES[this.rol].corto} ${verbos[accion]}: ${prop.titulo}`,
        detalle: comentario, refs: { propuestaId: prop.id, asuntoId: prop.asuntoId || null },
      });
      writes[rr] = e;
      return { writes, result: { estado: prop.estado } };
    });
  }

  async reenviar(propId, cambios) {
    const rutaProp = this.rutaDe("propuestas", propId);
    return this.backend.transact([this.ruta, rutaProp], (datos) => {
      const prop = structuredClone(datos[rutaProp]);
      exigir(prop, "La propuesta no existe");
      exigir(prop.autor === this.rol, "Solo el autor puede reenviarla");
      exigir(prop.estado === EP.devuelta, "Solo se reenvían propuestas devueltas");
      for (const k of ["titulo", "descripcion", "justificacion", "efectos", "voto", "costo"]) if (k in cambios) prop[k] = cambios[k];
      if (prop.tipo === "normal") prop.decide = rolQueDecide(prop.dominio, prop.efectos, datos[this.ruta].estado);
      prop.estado = EP.revision;
      prop.fecha = ahora();
      prop.historial.push(this.paso("reenvio", cambios.comentario || ""));
      const [rr, e] = this.entrada(datos[this.ruta].estado, { tipo: "propuesta", titulo: `Propuesta reenviada: ${prop.titulo}`, refs: { propuestaId: propId } });
      return { writes: { [rutaProp]: prop, [rr]: e } };
    });
  }

  async retirar(propId) {
    const rutaProp = this.rutaDe("propuestas", propId);
    return this.backend.transact([this.ruta, rutaProp], (datos) => {
      const prop = structuredClone(datos[rutaProp]);
      exigir(prop && prop.autor === this.rol, "Solo el autor puede retirarla");
      exigir([EP.revision, EP.devuelta].includes(prop.estado), "Ya fue decidida");
      prop.estado = EP.retirada;
      prop.fecha = ahora();
      prop.historial.push(this.paso("retiro"));
      const [rr, e] = this.entrada(datos[this.ruta].estado, { tipo: "propuesta", titulo: `Propuesta retirada: ${prop.titulo}`, refs: { propuestaId: propId } });
      return { writes: { [rutaProp]: prop, [rr]: e } };
    });
  }

  // El Presidente puede objetar decisiones de ATLAS. No las bloquea: queda asentado.
  async objetar(propId, comentario) {
    exigir(String(comentario || "").trim(), "Explicá la objeción");
    const rutaProp = this.rutaDe("propuestas", propId);
    return this.backend.transact([this.ruta, rutaProp], (datos) => {
      const prop = structuredClone(datos[rutaProp]);
      exigir(prop, "La propuesta no existe");
      exigir(DOMINIOS[prop.dominio]?.objetable && prop.decide !== this.rol, "Esta medida no admite objeciones de tu cargo");
      prop.objeciones = [...(prop.objeciones || []), { id: generarId("obj"), rol: this.rol, comentario, fecha: ahora(), conocida: false }];
      prop.fecha = ahora();
      const [rr, e] = this.entrada(datos[this.ruta].estado, { tipo: "objecion", titulo: `Objeción del ${ROLES[this.rol].corto}: ${prop.titulo}`, detalle: comentario, refs: { propuestaId: propId } });
      return { writes: { [rutaProp]: prop, [rr]: e } };
    });
  }

  async tomarConocimiento(propId) {
    const rutaProp = this.rutaDe("propuestas", propId);
    return this.backend.transact([rutaProp], (datos) => {
      const prop = structuredClone(datos[rutaProp]);
      prop.objeciones = (prop.objeciones || []).map((o) => (o.rol !== this.rol ? { ...o, conocida: true } : o));
      return { writes: { [rutaProp]: prop } };
    });
  }

  // Anular una decisión: la propone uno y la aprueba el otro. El original se conserva.
  async solicitarAnulacion(propId, justificacion) {
    exigir(String(justificacion || "").trim(), "Explicá por qué se anula");
    const rutaOrig = this.rutaDe("propuestas", propId);
    const id = generarId("prop");
    return this.backend.transact([this.ruta, rutaOrig], (datos) => {
      const original = datos[rutaOrig];
      exigir(original && [EP.aprobada, EP.financiamiento, EP.bloqueada].includes(original.estado), "Solo se anulan medidas aprobadas");
      exigir(original.tipo === "normal", "Este tipo de registro no se anula");
      const estado = datos[this.ruta].estado;
      const prop = {
        id, tipo: "anulacion", titulo: `Anulación: ${original.titulo}`, dominio: original.dominio, autor: this.rol,
        decide: otroRol(this.rol), descripcion: (original.efectosAplicados || []).map((e) => `Revertir: ${describirEfecto(e, estado)}`).join("\n"),
        justificacion, efectos: [], efectosAplicados: [], refId: propId, asuntoId: original.asuntoId || null,
        requiereFondos: false, costo: "", estado: EP.revision, creada: ahora(), fecha: ahora(), fechaJuego: estado.fechaJuego,
        historial: [this.paso("propuso", justificacion)], objeciones: [],
      };
      const [rr, e] = this.entrada(estado, { tipo: "propuesta", titulo: `Pedido de anulación: ${original.titulo}`, detalle: justificacion, refs: { propuestaId: id } });
      return { writes: { [this.rutaDe("propuestas", id)]: prop, [rr]: e }, result: { id } };
    });
  }

  // ---------- asuntos ----------

  async crearAsunto({ titulo, area, texto = "", tipoIntervencion = "comentario" }) {
    exigir(String(titulo || "").trim(), "El asunto necesita un título");
    const id = generarId("asu");
    return this.backend.transact([this.ruta], (datos) => {
      const estado = datos[this.ruta].estado;
      const intervenciones = texto.trim() ? [{ id: generarId("int"), rol: this.rol, tipo: tipoIntervencion, texto, fecha: ahora(), fechaJuego: estado.fechaJuego }] : [];
      const asunto = { id, titulo: titulo.trim().slice(0, 200), area, creadoPor: this.rol, creada: ahora(), fecha: ahora(), fechaJuego: estado.fechaJuego, estado: "abierto", intervenciones };
      const [rr, e] = this.entrada(estado, { tipo: "asunto", titulo: `Nuevo asunto: ${asunto.titulo}`, refs: { asuntoId: id } });
      return { writes: { [this.rutaDe("asuntos", id)]: asunto, [rr]: e }, result: { id } };
    });
  }

  async intervenir(asuntoId, tipo, texto) {
    exigir(String(texto || "").trim(), "Escribí la intervención");
    const ruta = this.rutaDe("asuntos", asuntoId);
    return this.backend.transact([this.ruta, ruta], (datos) => {
      const asunto = structuredClone(datos[ruta]);
      exigir(asunto, "El asunto no existe");
      exigir(asunto.estado === "abierto", "El asunto está archivado");
      asunto.intervenciones.push({ id: generarId("int"), rol: this.rol, tipo, texto: texto.slice(0, 8000), fecha: ahora(), fechaJuego: datos[this.ruta].estado.fechaJuego });
      asunto.fecha = ahora();
      return { writes: { [ruta]: asunto } };
    });
  }

  async cambiarEstadoAsunto(asuntoId, nuevo) {
    const ruta = this.rutaDe("asuntos", asuntoId);
    return this.backend.transact([this.ruta, ruta], (datos) => {
      const asunto = structuredClone(datos[ruta]);
      asunto.estado = nuevo;
      asunto.fecha = ahora();
      const [rr, e] = this.entrada(datos[this.ruta].estado, { tipo: "asunto", titulo: `${nuevo === "archivado" ? "Asunto archivado" : "Asunto reabierto"}: ${asunto.titulo}`, refs: { asuntoId } });
      return { writes: { [ruta]: asunto, [rr]: e } };
    });
  }

  // ---------- votaciones de ATLAS ----------

  async crearVotacion({ titulo, descripcion = "", tipo = "guerra", umbral = 0.5, asuntoId = null }) {
    exigir(String(titulo || "").trim(), "La votación necesita un título");
    const id = generarId("vot");
    return this.backend.transact([this.ruta], (datos) => {
      const estado = datos[this.ruta].estado;
      const vot = {
        id, titulo: titulo.trim().slice(0, 200), descripcion, tipo, umbral: tipo === "guerra" ? UMBRAL_GUERRA : Number(umbral),
        miembros: estado.atlas.miembros.map((m) => m.pais), votos: {}, confirmaciones: { jemc: false, presidente: false },
        estado: "abierta", creadaPor: this.rol, creada: ahora(), fecha: ahora(), fechaJuego: estado.fechaJuego, asuntoId,
      };
      const [rr, e] = this.entrada(estado, { tipo: "votacion", titulo: `Votación de ATLAS abierta: ${vot.titulo}`, refs: { votacionId: id } });
      return { writes: { [this.rutaDe("votaciones", id)]: vot, [rr]: e }, result: { id } };
    });
  }

  async votar(votId, pais, voto) {
    const ruta = this.rutaDe("votaciones", votId);
    return this.backend.transact([this.ruta, ruta], (datos) => {
      const vot = structuredClone(datos[ruta]);
      exigir(vot && vot.estado === "abierta", "La votación está cerrada");
      exigir(vot.miembros.includes(pais), `${pais} no es miembro en esta votación`);
      if (pais === "Argentina") {
        exigir(vot.tipo !== "guerra", "En decisiones de guerra, el voto argentino necesita autorización presidencial: usá «Preparar voto argentino»");
        exigir(this.rol === "jemc", "El voto argentino en ATLAS lo emite el Jefe del Estado Mayor Conjunto");
      }
      if (voto) vot.votos = { ...vot.votos, [pais]: { voto, cargadoPor: this.rol, fecha: ahora() } };
      else { const { [pais]: _, ...resto } = vot.votos; vot.votos = resto; }
      vot.confirmaciones = { jemc: false, presidente: false };
      vot.fecha = ahora();
      return { writes: { [ruta]: vot } };
    });
  }

  async prepararVotoArgentino(votId, voto, justificacion) {
    exigir(this.rol === "jemc", "El voto argentino lo prepara el Jefe del Estado Mayor Conjunto");
    exigir(["si", "no", "abstencion"].includes(voto), "Elegí el voto recomendado");
    const ruta = this.rutaDe("votaciones", votId);
    const id = generarId("prop");
    return this.backend.transact([this.ruta, ruta], (datos) => {
      const vot = datos[ruta];
      exigir(vot && vot.estado === "abierta" && vot.tipo === "guerra", "La votación no admite este pedido");
      const estado = datos[this.ruta].estado;
      const prop = {
        id, tipo: "voto_guerra", titulo: `Voto argentino en ATLAS: ${vot.titulo}`, dominio: "atlas_guerra", autor: "jemc", decide: "presidente",
        descripcion: vot.descripcion, justificacion, voto, efectos: [], efectosAplicados: [], refId: votId, asuntoId: vot.asuntoId || null,
        requiereFondos: false, costo: "", estado: EP.revision, creada: ahora(), fecha: ahora(), fechaJuego: estado.fechaJuego,
        historial: [this.paso("propuso", justificacion)], objeciones: [],
      };
      const [rr, e] = this.entrada(estado, { tipo: "propuesta", titulo: `Pedido de autorización del voto argentino: ${vot.titulo}`, detalle: justificacion, refs: { propuestaId: id, votacionId: votId } });
      return { writes: { [this.rutaDe("propuestas", id)]: prop, [rr]: e }, result: { id } };
    });
  }

  async confirmarResultado(votId) {
    const ruta = this.rutaDe("votaciones", votId);
    return this.backend.transact([this.ruta, ruta], (datos) => {
      const vot = structuredClone(datos[ruta]);
      exigir(vot && vot.estado === "abierta", "La votación ya está cerrada");
      const res = resultadoVotacion(vot);
      exigir(res.resultado !== "en_curso", "Todavía faltan votos para que el resultado sea definitivo");
      vot.confirmaciones = { ...vot.confirmaciones, [this.rol]: true };
      const writes = {};
      if (vot.confirmaciones.jemc && vot.confirmaciones.presidente) {
        vot.estado = "cerrada";
        vot.resultadoFinal = { ...res };
        const [rr, e] = this.entrada(datos[this.ruta].estado, {
          tipo: "votacion", titulo: `Votación de ATLAS cerrada: ${vot.titulo}`,
          detalle: `${res.resultado === "aprobada" ? "Aprobada" : "Rechazada"} con ${res.si} de ${res.n} votos a favor (${res.porcentaje.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%)`,
          refs: { votacionId: votId },
        });
        writes[rr] = e;
      }
      vot.fecha = ahora();
      writes[ruta] = vot;
      return { writes, result: { estado: vot.estado } };
    });
  }

  // ---------- informes, fecha y datos generales ----------

  async generarInforme() {
    const id = generarId("inf");
    return this.backend.transact([this.ruta], (datos) => {
      const estado = datos[this.ruta].estado;
      const anterior = this.informes[0] || null;
      const informe = construirInforme({ estado, propuestas: this.propuestas, registro: this.registro, votaciones: this.votaciones, desde: anterior?.creada || null });
      const doc = { id, ...informe, generadoPor: this.rol, creada: ahora(), fecha: ahora(), fechaJuego: estado.fechaJuego };
      const [rr, e] = this.entrada(estado, { tipo: "informe", titulo: doc.titulo });
      return { writes: { [this.rutaDe("informes", id)]: doc, [rr]: e }, result: { id } };
    });
  }

  async cambiarFecha(nuevaFecha, motivo = "") {
    exigir(/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha), "Fecha inválida");
    return this.backend.transact([this.ruta], (datos) => {
      const partida = datos[this.ruta];
      exigir(nuevaFecha >= partida.estado.fechaJuego, "La fecha de juego no retrocede");
      const estado = { ...partida.estado, fechaJuego: nuevaFecha };
      const [rr, e] = this.entrada(estado, { tipo: "fecha", titulo: `La partida avanza al ${fechaLarga(nuevaFecha)}`, detalle: motivo });
      return { writes: { [this.ruta]: { ...partida, estado }, [rr]: e } };
    });
  }
}
