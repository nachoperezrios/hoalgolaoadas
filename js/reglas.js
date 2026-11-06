import { aplicarEfectosSimples } from "./simulacion.js";
// Reglas puras del juego. Sin acceso a red ni al DOM: se testean en Node.

export const ROLES = {
  jemc: { id: "jemc", nombre: "Jefe del Estado Mayor Conjunto", corto: "Jefe del Estado Mayor" },
  presidente: { id: "presidente", nombre: "Presidente de la Nación", corto: "Presidente" },
};
export const otroRol = (rol) => (rol === "jemc" ? "presidente" : "jemc");

// Reparto de autoridad acordado por los jugadores.
export const DOMINIOS = {
  atlas: { nombre: "ATLAS: programas, ejercicios, AT-1 y cooperación", decide: "jemc", objetable: true },
  atlas_guerra: { nombre: "ATLAS: voto argentino en decisiones de guerra", decide: "presidente" },
  fuerzas: { nombre: "Fuerzas Armadas: organización, alistamiento e inventario", decide: "jemc" },
  pfa: { nombre: "Policía Federal Argentina", decide: "jemc" },
  side: { nombre: "SIDE: personal, expedientes y misiones", decide: "jemc" },
  afi: { nombre: "AFI: personal, expedientes y misiones", decide: "jemc" },
  fadea: { nombre: "FAdeA: producción, plantas, fichas y filtraciones", decide: "jemc" },
  compras_militares: { nombre: "Compras y presupuesto militar, órdenes y nuevos modelos de FAdeA", decide: "presidente" },
  decretos: { nombre: "Decretos: ascensos al rango máximo y jefaturas", decide: "presidente" },
  carga_inicial: { nombre: "Carga inicial de datos vacíos", decide: "cualquiera" },
  ley_congreso: { nombre: "Requiere ley del Congreso", decide: "congreso" },
  economia: { nombre: "Economía, impuestos y presupuesto", decide: "presidente" },
  politica: { nombre: "Política nacional y provincias", decide: "presidente" },
  infraestructura: { nombre: "Infraestructura, vivienda, ferrocarriles y puertos", decide: "presidente" },
  exteriores: { nombre: "Relaciones exteriores fuera de ATLAS", decide: "presidente" },
};

export const AREAS = {
  economia: "Economía",
  politica: "Política y opinión pública",
  soberania: "Soberanía",
  seguridad: "Seguridad",
  infraestructura: "Infraestructura",
  industria: "Industria",
  defensa: "Defensa",
  atlas: "ATLAS",
};

// Estados de proyectos y datos. `clase` define cómo se ve en pantalla.
export const ESTADOS = {
  "Consolidado": "consolidado",
  "Aprobado": "aprobado",
  "En evaluación": "curso",
  "En negociación": "curso",
  "En búsqueda de financiamiento": "curso",
  "Prevista": "curso",
  "Pendiente": "pendiente",
  "Propuesta": "propuesta",
  "En pausa por falta de fondos": "bloqueado",
  "Cancelado": "bloqueado",
  "Sin dato confirmado": "desconocido",
};
export const claseEstado = (e) => ESTADOS[e] || "curso";

export const ESTADOS_PROPUESTA = {
  revision: "En revisión",
  devuelta: "Devuelta para cambios",
  aprobada: "Aprobada",
  financiamiento: "Aprobada, pendiente de financiamiento",
  bloqueada: "Bloqueada por falta de fondos",
  rechazada: "Rechazada",
  retirada: "Retirada",
  anulada: "Anulada",
};

export const CAMPOS_AT1 = {
  nombreDefinitivo: "Nombre definitivo",
  faseActual: "Fase de pruebas actual",
  produccion: "Producción",
  financiacion: "Financiación",
  controlExportaciones: "Control de exportaciones",
  repartoIndustrial: "Reparto industrial",
};

export const LISTAS_INVENTARIO = {
  aereo: "Fuerza Aérea",
  capacidades: "Capacidades navales y terrestres",
  pfaTerrestre: "PFA: flota terrestre",
  pfaHelicopteros: "PFA: helicópteros",
};

export const decideDominio = (dominio) => DOMINIOS[dominio]?.decide;

// Jerarquía de la PFA en la partida, de menor a mayor.
export const RANGOS_PFA = {
  "Suboficiales y agentes": ["Agente", "Cabo", "Cabo Primero", "Sargento", "Sargento Primero", "Suboficial Escribiente", "Suboficial Auxiliar", "Suboficial Mayor"],
  "Oficiales": ["Ayudante", "Subinspector", "Inspector", "Principal", "Subcomisario", "Comisario", "Comisario Inspector", "Comisario Mayor", "Comisario General"],
};
export const RANGOS = Object.values(RANGOS_PFA).flat();
export const RANGOS_SIDE_GRUPOS = { "Escalafón de inteligencia": ["Agente", "Agente Superior", "Analista", "Analista Principal", "Oficial de Inteligencia", "Oficial Superior", "Subdirector", "Director"] };
export const RANGOS_SIDE = Object.values(RANGOS_SIDE_GRUPOS).flat();
export const INSTITUCIONES = {
  pfa: { nombre: "Policía Federal Argentina", corto: "PFA", rangos: RANGOS, grupos: RANGOS_PFA, dominio: "pfa" },
  side: { nombre: "Secretaría de Inteligencia (SIDE)", corto: "SIDE", rangos: RANGOS_SIDE, grupos: RANGOS_SIDE_GRUPOS, dominio: "side" },
  afi: { nombre: "AFI: protección de instalaciones estratégicas", corto: "AFI", rangos: RANGOS, grupos: RANGOS_PFA, dominio: "afi" },
};
// Departamentos de la PFA acordados en la partida.
export const DEPARTAMENTOS_PFA = [
  { id: "pfa-1", numero: 1, nombre: "Unidad de Tácticas y Armas Especiales" },
  { id: "pfa-2", numero: 2, nombre: "Departamento de Investigación" },
  { id: "pfa-3", numero: 3, nombre: "Departamento de Criminología" },
  { id: "pfa-4", numero: 4, nombre: "Departamento de Respuesta Rápida" },
  { id: "pfa-5", numero: 5, nombre: "Departamento de Cibercrimen" },
  { id: "pfa-6", numero: 6, nombre: "Departamento de Asuntos Internos" },
];
export const instDeUnidad = (id) => {
  const pref = String(id || "").split("-")[0];
  return INSTITUCIONES[pref] ? pref : "pfa";
};
export function nombreUnidad(estado, id) {
  const inst = instDeUnidad(id);
  const u = (estado?.unidades?.[inst] || []).find((x) => x.id === id);
  if (u) return u.numero ? `Dpto ${u.numero}: ${u.nombre}` : u.nombre;
  return NOMBRES_DIVISION[id] || id;
}
// Ascensos al rango máximo y jefaturas plenas requieren decreto presidencial.
export function requiereDecreto(inst, rango, funcion) {
  const rangos = INSTITUCIONES[inst]?.rangos || RANGOS;
  if (rango && rango === rangos[rangos.length - 1]) return true;
  return /^(jefe de departamento|director|director general|subdirector general)$/i.test(String(funcion || "").trim());
}
export const NOMBRES_DIVISION = {
  operaciones: "Operaciones Especiales", investigacion: "Investigación", uate: "UATE",
  "asuntos-internos": "Asuntos Internos", afi: "AFI", side: "SIDE",
};
export const DIVISIONES_PFA = Object.keys(NOMBRES_DIVISION);
// Límite por división: cada división se guarda en un documento de Firebase (máximo 1 MB).
export const MAX_POR_DIVISION = 5000;

// ---------- Efectos sobre el estado ----------
// Cada efecto declara qué dominio hace falta para aplicarlo.

const DOMINIOS_PRESIDENTE = new Set(["economia", "politica", "exteriores", "infraestructura"]);
const RUTAS_CARGA_INICIAL = /^(bcra\.|arca\.alicuotas\.|gobierno\.opinionPublica\.aprobacion$)/;
const LISTAS_CARGA_INICIAL = new Set(["provincias", "gabinete", "relaciones", "tratados", "congreso.bloquesDiputados", "congreso.bloquesSenado"]);
const vacioV = (v) => v === null || v === undefined || v === "";
function leerRuta(estado, ruta) { return ruta.split(".").reduce((o, k) => (o == null ? undefined : o[k]), estado); }

// Un dato vacío del Presidente lo puede cargar cualquiera; después, cambiarlo es decisión suya.
function esCargaInicial(ef, estado) {
  if (!estado) return false;
  if (ef.tipo === "indicador") return vacioV(estado.indicadores?.[ef.clave]?.valor);
  if (ef.tipo === "dato") return RUTAS_CARGA_INICIAL.test(ef.ruta) && vacioV(leerRuta(estado, ef.ruta));
  if (ef.tipo === "lista" && ef.op === "editar" && LISTAS_CARGA_INICIAL.has(ef.ruta)) {
    const item = (leerRuta(estado, ef.ruta) || []).find((x) => x.id === ef.id);
    return !!item && Object.keys(ef.cambios || {}).every((k) => vacioV(item[k]));
  }
  return false;
}

export function dominioRequerido(efecto, estado) {
  const d = dominioBase(efecto, estado);
  if (DOMINIOS_PRESIDENTE.has(d) && esCargaInicial(efecto, estado)) return "carga_inicial";
  // Las alícuotas ya cargadas solo cambian por ley del Congreso.
  if (efecto.tipo === "dato" && /^arca\.alicuotas\./.test(efecto.ruta)) return "ley_congreso";
  return d;
}

function dominioBase(efecto, estado) {
  const ef = efecto;
  switch (efecto.tipo) {
    case "proyecto_estado": {
      const pr = buscarProyecto(estado, efecto.proyectoId);
      // El Presidente controla el presupuesto: puede pausar o reactivar cualquier proyecto.
      if (["En pausa por falta de fondos"].includes(efecto.valor)) return "economia";
      return pr ? pr.dominio : null;
    }
    case "proyecto_campo":
      return buscarProyecto(estado, efecto.proyectoId)?.dominio ?? null;
    case "proyecto_nuevo":
      return efecto.proyecto?.dominio ?? null;
    case "inventario": {
      if (efecto.lista === "pfaTerrestre" || efecto.lista === "pfaHelicopteros") return "pfa";
      const item = (estado[efecto.lista] || []).find((x) => x.id === efecto.itemId);
      const antes = item ? item.cantidad : null;
      // Sumar unidades a un inventario militar conocido es una compra: la autoriza el Presidente.
      if (typeof antes === "number" && typeof efecto.valor === "number" && efecto.valor > antes) return "compras_militares";
      return "fuerzas";
    }
    case "indicador":
      return "economia";
    case "at1":
      return "atlas";
    case "atlas_alta":
      return "atlas";
    case "personal": {
      if (ef.op === "condecorar") return "decretos";
      const inst = ef.inst || instDeUnidad(ef.division);
      const p = ef.op === "alta" ? ef.policia : ef.op === "editar" ? ef.cambios || {} : {};
      if (requiereDecreto(inst, p.rango, p.funcion)) return "decretos";
      return INSTITUCIONES[inst]?.dominio || "pfa";
    }
    case "dato": {
      const regla = DATOS_EDITABLES.find((d) => d.patron.test(ef.ruta));
      if (!regla) return null;
      return typeof regla.dominio === "function" ? regla.dominio(ef.ruta.match(regla.patron), estado) : regla.dominio;
    }
    case "lista": {
      const regla = LISTAS_EDITABLES[ef.ruta];
      if (!regla) return null;
      const d = ef.op === "agregar" && regla.agregar ? regla.agregar : regla.dominio;
      return typeof d === "function" ? d(ef, estado) : d;
    }
    case "doc": {
      const regla = COLECCIONES_DOC[ef.col];
      if (!regla) return null;
      const d = ef.op === "crear" ? regla.crear : regla.editar;
      return typeof d === "function" ? d(ef, estado) : d;
    }
    case "opinion":
    case "simples":
      return null;
    case "medida":
      return "economia";
    default:
      return null;
  }
}

// ¿Qué rol tiene que decidir una propuesta? El de mayor exigencia entre sus efectos.
export function rolQueDecide(dominio, efectos, estado, actor = "presidente") {
  const necesarios = new Set([dominio, ...efectos.map((e) => dominioRequerido(e, estado)).filter(Boolean)]);
  if (necesarios.has("ley_congreso")) throw new Error("Este cambio requiere una ley del Congreso");
  // Una carga inicial la hace cualquiera; si la propuesta solo carga datos vacíos, decide quien la carga.
  if (efectos.length && efectos.every((e) => ["carga_inicial", null].includes(dominioRequerido(e, estado))) && (!dominio || dominio === "carga_inicial" || decideDominio(dominio) === actor)) return actor;
  const roles = new Set([...necesarios].filter((d) => d !== "carga_inicial").map(decideDominio));
  if (!roles.size) return actor;
  if (roles.size === 1) return [...roles][0];
  // Si mezcla facultades de los dos cargos, la decisión final es presidencial
  // (decisiones estratégicas finales) y queda registrada.
  return "presidente";
}

export function buscarProyecto(estado, id) {
  return (estado.proyectos || []).find((x) => x.id === id);
}

function clonar(x) {
  return JSON.parse(JSON.stringify(x));
}

// Aplica efectos y devuelve el nuevo estado y lo aplicado (con el valor anterior, para poder anular).
export function aplicarEfectos(estadoActual, efectos, fechaJuego) {
  const estado = clonar(estadoActual);
  const aplicados = [];
  for (const ef of efectos) {
    switch (ef.tipo) {
      case "proyecto_estado":
      case "proyecto_campo": {
        const pr = buscarProyecto(estado, ef.proyectoId);
        if (!pr) throw new Error(`No existe el proyecto ${ef.proyectoId}`);
        const campo = ef.tipo === "proyecto_estado" ? "estado" : ef.campo;
        aplicados.push({ ...ef, campo, antes: pr[campo] ?? null });
        pr[campo] = ef.valor;
        break;
      }
      case "proyecto_nuevo": {
        if (buscarProyecto(estado, ef.proyecto.id)) throw new Error("Ya existe un proyecto con ese identificador");
        estado.proyectos.push({ avance: null, obstaculos: "", pendientes: "", notas: "", presupuesto: null, ...ef.proyecto });
        aplicados.push({ ...ef, antes: null });
        break;
      }
      case "inventario": {
        const lista = estado[ef.lista];
        const item = lista && lista.find((x) => x.id === ef.itemId);
        if (!item) throw new Error(`No existe el ítem ${ef.itemId}`);
        aplicados.push({ ...ef, antes: item.cantidad ?? null });
        item.cantidad = ef.valor;
        break;
      }
      case "indicador": {
        const ind = estado.indicadores[ef.clave];
        if (!ind) throw new Error(`No existe el indicador ${ef.clave}`);
        aplicados.push({ ...ef, antes: ind.valor, antesFecha: ind.fechaCarga });
        ind.valor = ef.valor;
        ind.fechaCarga = ef.valor === null ? null : fechaJuego;
        break;
      }
      case "at1": {
        if (!(ef.campo in estado.at1.decisiones)) throw new Error("Campo del AT-1 no editable");
        aplicados.push({ ...ef, antes: estado.at1.decisiones[ef.campo] });
        estado.at1.decisiones[ef.campo] = ef.valor;
        break;
      }
      case "dato": {
        if (!DATOS_EDITABLES.some((d) => d.patron.test(ef.ruta))) throw new Error("Ese dato no es editable");
        const { padre, clave } = navegar(estado, ef.ruta, true);
        aplicados.push({ ...ef, antes: padre[clave] ?? null });
        padre[clave] = ef.valor;
        if (ef.ruta === "gobierno.opinionPublica.aprobacion") {
          const op = estado.gobierno.opinionPublica;
          op.fechaCarga = fechaJuego;
          op.historial = [...(op.historial || []), { fecha: fechaJuego, valor: ef.valor, motivo: ef.motivo || "Medición cargada" }].slice(-80);
        }
        break;
      }
      case "lista": {
        if (!LISTAS_EDITABLES[ef.ruta]) throw new Error("Esa lista no es editable");
        const { padre, clave } = navegar(estado, ef.ruta, true);
        const lista = (padre[clave] ||= []);
        if (ef.op === "agregar") {
          if (lista.some((x) => x.id === ef.item.id)) throw new Error("Ya existe un elemento con ese identificador");
          lista.push({ ...ef.item, alta: fechaJuego });
          aplicados.push({ ...ef, antes: null });
        } else if (ef.op === "editar") {
          const i = lista.findIndex((x) => x.id === ef.id);
          if (i < 0) throw new Error("No se encontró el elemento");
          aplicados.push({ ...ef, antes: lista[i] });
          lista[i] = { ...lista[i], ...ef.cambios };
        } else throw new Error("Operación inválida");
        break;
      }
      case "opinion": {
        const op = estado.gobierno.opinionPublica;
        if (typeof op.aprobacion !== "number") { aplicados.push({ ...ef, antes: null, sinEfecto: true }); break; }
        const antes = op.aprobacion;
        op.aprobacion = Math.max(0, Math.min(100, Math.round((antes + ef.delta) * 10) / 10));
        op.fechaCarga = fechaJuego;
        op.historial = [...(op.historial || []), { fecha: fechaJuego, valor: op.aprobacion, motivo: ef.motivo || "Reacción a una decisión" }].slice(-80);
        aplicados.push({ ...ef, antes });
        break;
      }
      case "medida": {
        estado.economia.medidas ||= [];
        estado.economia.medidas.push({ ...ef.medida, restante: ef.medida.meses, inicio: fechaJuego });
        aplicados.push({ ...ef, antes: null });
        break;
      }
      case "simples": {
        aplicarEfectosSimples(estado, ef.efectos, ef.provinciaId || null);
        aplicados.push({ ...ef, antes: null });
        break;
      }
      case "atlas_alta": {
        if (estado.atlas.miembros.some((x) => x.pais === ef.pais)) throw new Error(`${ef.pais} ya es miembro`);
        estado.atlas.miembros.push({ pais: ef.pais, aporte: ef.aporte || "Aporte no definido" });
        estado.atlas.enConversaciones = estado.atlas.enConversaciones.filter((x) => x.pais !== ef.pais);
        aplicados.push({ ...ef, antes: null });
        break;
      }
      default:
        throw new Error(`Efecto desconocido: ${ef.tipo}`);
    }
  }
  return { estado, aplicados };
}

// Revierte efectos aplicados. Si alguien cambió el dato después, no lo pisa y lo informa.
export function revertirEfectos(estadoActual, aplicados) {
  const estado = clonar(estadoActual);
  const conflictos = [];
  for (const ef of [...aplicados].reverse()) {
    const marcarConflicto = (desc) => conflictos.push(desc);
    switch (ef.tipo) {
      case "proyecto_estado":
      case "proyecto_campo": {
        const pr = buscarProyecto(estado, ef.proyectoId);
        if (!pr || pr[ef.campo] !== ef.valor) marcarConflicto(`${pr ? pr.nombre : ef.proyectoId}: el dato cambió después; revisalo a mano`);
        else pr[ef.campo] = ef.antes;
        break;
      }
      case "proyecto_nuevo": {
        estado.proyectos = estado.proyectos.filter((x) => x.id !== ef.proyecto.id);
        break;
      }
      case "inventario": {
        const item = (estado[ef.lista] || []).find((x) => x.id === ef.itemId);
        if (!item || item.cantidad !== ef.valor) marcarConflicto(`${item ? item.modelo : ef.itemId}: la cantidad cambió después; revisala a mano`);
        else item.cantidad = ef.antes;
        break;
      }
      case "indicador": {
        const ind = estado.indicadores[ef.clave];
        if (!ind || ind.valor !== ef.valor) marcarConflicto(`${ind ? ind.nombre : ef.clave}: el indicador cambió después`);
        else { ind.valor = ef.antes; ind.fechaCarga = ef.antesFecha ?? null; }
        break;
      }
      case "at1": {
        if (estado.at1.decisiones[ef.campo] !== ef.valor) marcarConflicto(`AT-1, ${CAMPOS_AT1[ef.campo]}: cambió después`);
        else estado.at1.decisiones[ef.campo] = ef.antes;
        break;
      }
      case "atlas_alta": {
        estado.atlas.miembros = estado.atlas.miembros.filter((x) => x.pais !== ef.pais);
        break;
      }
      case "dato": {
        const { padre, clave } = navegar(estado, ef.ruta, true);
        if (JSON.stringify(padre[clave] ?? null) !== JSON.stringify(ef.valor)) marcarConflicto(`${ef.ruta}: cambió después`);
        else padre[clave] = ef.antes;
        break;
      }
      case "lista": {
        const { padre, clave } = navegar(estado, ef.ruta, true);
        const lista = padre[clave] || [];
        if (ef.op === "agregar") padre[clave] = lista.filter((x) => x.id !== ef.item.id);
        else {
          const i = lista.findIndex((x) => x.id === ef.id);
          if (i < 0) marcarConflicto(`${ef.ruta}: el elemento ya no existe`);
          else lista[i] = ef.antes;
        }
        break;
      }
      case "medida": {
        const antes = (estado.economia.medidas || []).length;
        estado.economia.medidas = (estado.economia.medidas || []).filter((m) => m.id !== ef.medida.id);
        if (estado.economia.medidas.length === antes) marcarConflicto(`La medida «${ef.medida.nombre}» ya terminó: sus efectos no se revierten`);
        break;
      }
      case "simples":
        marcarConflicto("Los efectos de crisis o eventos ya aplicados no se revierten automáticamente");
        break;
      case "opinion": {
        if (ef.sinEfecto) break;
        const op = estado.gobierno.opinionPublica;
        op.aprobacion = Math.max(0, Math.min(100, Math.round((op.aprobacion - ef.delta) * 10) / 10));
        op.historial = [...(op.historial || []), { fecha: estado.fechaJuego, valor: op.aprobacion, motivo: `Anulación: ${ef.motivo || "decisión"}` }].slice(-80);
        break;
      }
    }
  }
  return { estado, conflictos };
}

export function describirEfecto(ef, estado) {
  const fmt = (x) => (x === null || x === undefined || x === "" ? "sin dato" : typeof x === "number" ? x.toLocaleString("es-AR") : String(x));
  switch (ef.tipo) {
    case "proyecto_estado": {
      const pr = buscarProyecto(estado, ef.proyectoId);
      return `${pr ? pr.nombre : ef.proyectoId}: estado pasa a «${ef.valor}»`;
    }
    case "proyecto_campo": {
      const pr = buscarProyecto(estado, ef.proyectoId);
      return `${pr ? pr.nombre : ef.proyectoId}: ${ef.campo} pasa a «${fmt(ef.valor)}»`;
    }
    case "proyecto_nuevo":
      return `Nuevo proyecto: ${ef.proyecto.nombre} (${ef.proyecto.estado})`;
    case "inventario": {
      const item = (estado[ef.lista] || []).find((x) => x.id === ef.itemId);
      return `${item ? item.modelo || item.nombre : ef.itemId}: cantidad ${fmt(item?.cantidad)} → ${fmt(ef.valor)}`;
    }
    case "indicador":
      return `${estado.indicadores[ef.clave]?.nombre || ef.clave}: ${fmt(ef.valor)} ${estado.indicadores[ef.clave]?.unidad || ""}`.trim();
    case "at1":
      return `AT-1, ${CAMPOS_AT1[ef.campo]}: «${fmt(ef.valor)}»`;
    case "atlas_alta":
      return `Incorporación de ${ef.pais} como miembro de ATLAS`;
    case "personal":
      return describirPersonal(ef, estado);
    case "dato":
      return `${ETIQUETAS_RUTA(ef.ruta, estado)}: «${fmt(ef.valor)}»`;
    case "lista":
      return ef.op === "agregar" ? `${LISTAS_EDITABLES[ef.ruta]?.nombre || ef.ruta}: alta de «${ef.item.nombre || ef.item.cargo || ef.item.pais || ef.item.concepto || ef.item.id}»` : `${LISTAS_EDITABLES[ef.ruta]?.nombre || ef.ruta}: cambios en «${ef.nombre || ef.id}»`;
    case "doc":
      return `${COLECCIONES_DOC[ef.col]?.nombre || ef.col}: ${ef.op === "crear" ? "alta de" : "cambios en"} «${ef.titulo || ef.datos?.titulo || ef.id}»`;
    case "opinion":
      return `Opinión pública: ${ef.delta > 0 ? "+" : ""}${String(ef.delta).replace(".", ",")} puntos`;
    case "medida":
      return `Medida económica: ${ef.medida.nombre} (${ef.medida.meses} ${ef.medida.meses === 1 ? "mes" : "meses"})`;
    case "simples":
      return `Consecuencias: ${ef.descripcion || "efectos de la decisión"}`;
    default:
      return ef.tipo;
  }
}

// ---------- Votaciones de ATLAS ----------

export const UMBRAL_GUERRA = 0.8;
export const OPCIONES_VOTO = { si: "A favor", no: "En contra", abstencion: "Abstención" };

// El umbral se mide sobre el total de miembros: hace falta superarlo estrictamente.
export function resultadoVotacion(votacion) {
  const miembros = votacion.miembros;
  const n = miembros.length;
  let si = 0, no = 0, abst = 0, pendientes = 0;
  for (const pais of miembros) {
    const v = votacion.votos?.[pais]?.voto;
    if (v === "si") si++;
    else if (v === "no") no++;
    else if (v === "abstencion") abst++;
    else pendientes++;
  }
  const umbral = votacion.umbral;
  const necesarios = Math.floor(umbral * n) + 1; // mínimo de votos a favor para superar el umbral
  const porcentaje = n ? (si / n) * 100 : 0;
  let resultado;
  if (si >= necesarios) resultado = "aprobada";
  else if (si + pendientes < necesarios) resultado = "rechazada";
  else resultado = "en_curso";
  return { n, si, no, abst, pendientes, porcentaje, necesarios, resultado };
}

export const TEXTO_RESULTADO = {
  aprobada: "Aprobada: supera el umbral",
  rechazada: "Rechazada: ya no puede alcanzar el umbral",
  en_curso: "En curso: el resultado depende de los votos pendientes",
};

// ---------- Utilidades ----------

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generarCodigo(rand = Math.random) {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[Math.floor(rand() * ALFABETO.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
export function generarPin(rand = Math.random) {
  return String(Math.floor(rand() * 9000) + 1000);
}
export function generarId(prefijo = "id", rand = Math.random) {
  return `${prefijo}-${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}
export function normalizarCodigo(c) {
  const s = String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function fechaLarga(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}
export function sumarDias(iso, dias) {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

// ---------- Personal de la PFA ----------
// Los policías se guardan en un documento por división, fuera del estado general.

export function describirPersonal(ef, estado) {
  const nombre = ef.policia?.nombre || ef.nombre || "Agente";
  switch (ef.op) {
    case "alta": return `Alta de ${ef.policia.rango} ${nombre} en ${nombreUnidad(estado, ef.division)}${ef.policia.funcion ? ` como ${ef.policia.funcion}` : ""}`;
    case "editar": {
      const c = ef.cambios || {};
      const partes = [];
      if (c.rango) partes.push(`rango ${c.rango}`);
      if (c.division && c.division !== ef.division) partes.push(`pasa a ${nombreUnidad(estado, c.division)}`);
      if (c.funcion !== undefined) partes.push(`función ${c.funcion || "sin asignar"}`);
      if (c.nombre) partes.push(`nombre ${c.nombre}`);
      if ("notas" in c) partes.push("notas actualizadas");
      return `${nombre}: ${partes.join(", ") || "sin cambios"}`;
    }
    case "baja": return `Baja de ${nombre}`;
    case "reincorporar": return `Reincorporación de ${nombre}`;
    case "condecorar": return `${ef.medalla} para ${nombre}`;
    default: return "Cambio de personal";
  }
}

const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function validarPolicia(p, inst = "pfa") {
  if (!String(p.nombre || "").trim()) throw new Error("Falta el nombre");
  const rangos = INSTITUCIONES[inst]?.rangos || RANGOS;
  if (!rangos.includes(p.rango)) throw new Error(`Rango inválido: ${p.rango}`);
}

// docs: {divisionId: {division, policias: []}} (copias que se pueden modificar)
export function aplicarPersonal(docs, efectos, fechaJuego, estado = null) {
  const aplicados = [];
  const doc = (div) => {
    const inst = instDeUnidad(div);
    const valida = estado?.unidades ? (estado.unidades[inst] || []).some((u) => u.id === div) : DIVISIONES_PFA.includes(div);
    if (!valida) throw new Error(`Departamento inválido: ${div}`);
    return (docs[div] ||= { division: div, policias: [] });
  };
  for (const ef of efectos) {
    const origen = doc(ef.division);
    if (ef.op === "alta") {
      const p = { notas: "", funcion: "", ...ef.policia, nombre: String(ef.policia.nombre).trim(), estado: "Activo", alta: fechaJuego, actualizado: fechaJuego };
      validarPolicia(p, instDeUnidad(ef.division));
      if (origen.policias.some((x) => x.id === p.id)) throw new Error("Ese policía ya existe");
      origen.policias.push(p);
      aplicados.push({ ...ef, antes: null, despues: p });
      continue;
    }
    const i = origen.policias.findIndex((x) => x.id === ef.id);
    if (i < 0) throw new Error("No se encontró el policía en esa división");
    const antes = origen.policias[i];
    let despues = { ...antes, actualizado: fechaJuego };
    let destino = ef.division;
    if (ef.op === "editar") {
      const { division, ...resto } = ef.cambios || {};
      despues = { ...despues, ...resto };
      if (division) {
        if (instDeUnidad(division) !== instDeUnidad(ef.division)) throw new Error("No se puede pasar personal entre instituciones");
        destino = division;
      }
      validarPolicia(despues, instDeUnidad(ef.division));
    } else if (ef.op === "baja") {
      if (antes.estado === "Baja") throw new Error(`${antes.nombre} ya está de baja`);
      despues.estado = "Baja";
    } else if (ef.op === "reincorporar") {
      if (antes.estado !== "Baja") throw new Error(`${antes.nombre} está activo`);
      despues.estado = "Activo";
    } else if (ef.op === "condecorar") {
      if (antes.estado !== "Activo") throw new Error("Solo se condecora a personal activo");
      despues.condecoraciones = [...(antes.condecoraciones || []), { medalla: ef.medalla, fecha: fechaJuego }];
    } else throw new Error(`Operación inválida: ${ef.op}`);
    origen.policias.splice(i, 1);
    doc(destino).policias.push(despues);
    aplicados.push({ ...ef, nombre: antes.nombre, destino, antes, despues });
  }
  for (const d of Object.values(docs)) {
    if (d.policias.length > MAX_POR_DIVISION) throw new Error(`Una división no puede superar ${MAX_POR_DIVISION} registros`);
  }
  return { docs, aplicados };
}

export function revertirPersonal(docs, aplicados) {
  const conflictos = [];
  const doc = (div) => (docs[div] ||= { division: div, policias: [] });
  for (const ef of [...aplicados].reverse()) {
    const destino = ef.op === "alta" ? ef.division : ef.destino;
    const lista = doc(destino).policias;
    const i = lista.findIndex((x) => x.id === ef.despues.id);
    if (i < 0 || !iguales(lista[i], ef.despues)) {
      conflictos.push(`${ef.despues.nombre}: el registro cambió después; revisalo a mano`);
      continue;
    }
    lista.splice(i, 1);
    if (ef.antes) doc(ef.division).policias.push(ef.antes);
  }
  return { docs, conflictos };
}

export const divisionesDeEfectos = (efectos) => {
  const out = new Set();
  for (const ef of efectos || []) {
    if (ef.tipo !== "personal") continue;
    out.add(ef.division);
    if (ef.cambios?.division) out.add(ef.cambios.division);
    if (ef.destino) out.add(ef.destino);
  }
  return [...out];
};

// ---------- Datos, listas y documentos editables ----------

const SEGURO = /^[A-Za-z0-9_-]+$/;
function navegar(estado, ruta, crear = false) {
  const partes = ruta.split(".");
  if (!partes.every((p) => SEGURO.test(p) && p !== "__proto__" && p !== "constructor" && p !== "prototype")) throw new Error("Ruta inválida");
  let obj = estado;
  for (const p of partes.slice(0, -1)) {
    if (obj[p] === undefined || obj[p] === null) {
      if (!crear) throw new Error("Ruta inexistente");
      obj[p] = {};
    }
    obj = obj[p];
  }
  return { padre: obj, clave: partes[partes.length - 1] };
}

export const CAMPOS_FICHA = {
  motor: "Motor", velocidad: "Velocidad máxima", alcance: "Alcance", techo: "Techo de servicio", dimensiones: "Dimensiones",
  tripulacion: "Tripulación", sensores: "Sensores", armamento: "Armamento", materiales: "Materiales", observaciones: "Observaciones",
};
export const CAMPOS_FICHA_AT1 = {
  motor: "Motor", materiales: "Materiales", sensores: "Sensores", dimensiones: "Dimensiones", alcance: "Alcance",
  armamento: "Armamento", cantidadesProducidas: "Cantidades producidas", cronogramaPruebas: "Cronograma de pruebas",
};

const esModeloFadea = (id, estado) => (estado?.fadea?.modelos || []).some((m) => m.id === id);

export const DATOS_EDITABLES = [
  { patron: /^fichas\.([A-Za-z0-9-]+)\.([A-Za-z]+)$/, dominio: (m, estado) => (esModeloFadea(m[1], estado) ? "fadea" : "fuerzas") },
  { patron: /^at1\.ficha\.([A-Za-z]+)$/, dominio: "atlas" },
  { patron: /^fadea\.presupuestoAnual$/, dominio: "compras_militares" },
  { patron: /^gobierno\.opinionPublica\.aprobacion$/, dominio: "politica" },
  { patron: /^escudos\.(pfa|side|afi)$/, dominio: (m) => m[1] },
  { patron: /^escudos\.(bcra|arca)$/, dominio: "economia" },
  { patron: /^atlas\.presupuestoAnual$/, dominio: "atlas" },
  { patron: /^presupuesto\.borrador\.([a-z]+)$/, dominio: "economia" },
  { patron: /^comunicacion\.ultimaCadena$/, dominio: "politica" },
  { patron: /^bcra\.(tesoro|dolar|tasa|baseMonetaria)$/, dominio: "economia" },
  { patron: /^arca\.alicuotas\.([A-Za-z]+)$/, dominio: "economia" },
  { patron: /^presupuesto\.pedidos\.([a-z]+)$/, dominio: (m) => ({ fuerzas: "fuerzas", atlas: "atlas", fadea: "fadea", pfa: "pfa", side: "side", afi: "afi" })[m[1]] || "economia" },
];

export function ETIQUETAS_RUTA(ruta, estado) {
  let m;
  if ((m = ruta.match(/^fichas\.([A-Za-z0-9-]+)\.([A-Za-z]+)$/))) {
    const nombre = (estado?.aereo || []).find((a) => a.id === m[1])?.modelo || (estado?.fadea?.modelos || []).find((x) => x.id === m[1])?.nombre || m[1];
    return `Ficha de ${nombre}, ${CAMPOS_FICHA[m[2]] || m[2]}`;
  }
  if ((m = ruta.match(/^at1\.ficha\.([A-Za-z]+)$/))) return `AT-1, ${CAMPOS_FICHA_AT1[m[1]] || m[1]}`;
  if ((m = ruta.match(/^arca\.alicuotas\.([A-Za-z]+)$/))) return `ARCA, ${ALICUOTAS[m[1]]?.nombre || m[1]}`;
  if ((m = ruta.match(/^bcra\.([A-Za-z]+)$/))) return `Banco Central, ${DATOS_BCRA[m[1]]?.nombre || m[1]}`;
  if ((m = ruta.match(/^presupuesto\.(borrador|pedidos)\.([a-z]+)$/))) return `${m[1] === "borrador" ? "Presupuesto propuesto" : "Pedido de fondos"}: ${NOMBRES_AREA[m[2]] || m[2]}`;
  return { "fadea.presupuestoAnual": "Presupuesto anual de FAdeA", "gobierno.opinionPublica.aprobacion": "Aprobación del gobierno",
    "escudos.pfa": "Escudo de la PFA", "escudos.side": "Escudo de la SIDE", "escudos.afi": "Escudo de la AFI", "atlas.presupuestoAnual": "Presupuesto de ATLAS" }[ruta] || ruta;
}

export function gastosFadea(estado) {
  return (estado?.fadea?.movimientos || []).filter((m) => m.tipo === "Gasto" && m.estado !== "Anulado").reduce((n, m) => n + (Number(m.monto) || 0), 0);
}

export const LISTAS_EDITABLES = {
  "fadea.plantas": { nombre: "Plantas de FAdeA", dominio: "fadea" },
  "fadea.modelos": { nombre: "Modelos de FAdeA", dominio: "fadea", agregar: "compras_militares" },
  "fadea.movimientos": {
    nombre: "Finanzas de FAdeA", dominio: "fadea",
    // Un gasto que supera el presupuesto asignado (o sin presupuesto) lo autoriza el Presidente.
    agregar: (ef, estado) => {
      if (ef.item.tipo !== "Gasto") return "fadea";
      const pres = estado?.fadea?.presupuestoAnual;
      return typeof pres === "number" && gastosFadea(estado) + Number(ef.item.monto || 0) <= pres ? "fadea" : "compras_militares";
    },
  },
  gabinete: { nombre: "Gabinete", dominio: "politica" },
  provincias: { nombre: "Provincias", dominio: "politica" },
  relaciones: { nombre: "Relaciones exteriores", dominio: "exteriores" },
  tratados: { nombre: "Tratados", dominio: "exteriores" },
  "congreso.bloquesDiputados": { nombre: "Bloques de Diputados", dominio: "politica" },
  "congreso.bloquesSenado": { nombre: "Bloques del Senado", dominio: "politica" },
  "congreso.legisladores": { nombre: "Legisladores", dominio: "politica" },
  "unidades.pfa": { nombre: "Departamentos de la PFA", dominio: "pfa" },
  "unidades.side": { nombre: "Departamentos de la SIDE", dominio: "side" },
  "unidades.afi": { nombre: "Departamentos de la AFI", dominio: "afi" },
};

export const COLECCIONES_DOC = {
  ordenes: { nombre: "Orden de producción FAdeA", crear: "compras_militares", editar: "fadea" },
  filtraciones: { nombre: "Filtración de datos", crear: "fadea", editar: "fadea" },
  inteligencia: { nombre: "Inteligencia", crear: (ef) => ef.inst || ef.datos?.inst, editar: (ef) => ef.inst },
  leyes: { nombre: "Proyecto de ley", crear: "politica", editar: "politica" },
  obras: { nombre: "Obra pública", crear: "infraestructura", editar: "infraestructura" },
  crisis: { nombre: "Crisis", crear: "politica", editar: (ef) => ef.apoyo || "politica" },
  auditorias: { nombre: "Auditoría", crear: "politica", editar: "politica" },
  comunicados: { nombre: "Comunicación oficial", crear: "politica", editar: "politica" },
};
const NOMBRES_AREA = { fuerzas: "Fuerzas Armadas", atlas: "Aporte a ATLAS", fadea: "FAdeA", pfa: "PFA", side: "SIDE", afi: "AFI", obras: "Obras públicas", social: "Desarrollo social", educacion: "Educación", salud: "Salud", otros: "Resto de la administración" };
// Datos del Banco Central (las reservas son el indicador «reservas»).
export const DATOS_BCRA = {
  tesoro: { nombre: "Depósitos del Tesoro", unidad: "US$ millones" },
  dolar: { nombre: "Cotización del dólar oficial", unidad: "$ por US$" },
  tasa: { nombre: "Tasa de política monetaria", unidad: "% anual" },
  baseMonetaria: { nombre: "Base monetaria", unidad: "$ millones" },
};
// Alícuotas de ARCA. `peso`: variación % de la recaudación por punto de alícuota (regla del juego).
export const ALICUOTAS = {
  iva: { nombre: "IVA", peso: 2.5 },
  gananciasSociedades: { nombre: "Ganancias de sociedades", peso: 0.6 },
  gananciasPersonas: { nombre: "Ganancias de personas", peso: 0.5 },
  retencionesAgro: { nombre: "Retenciones al agro", peso: 0.4 },
  retencionesIndustriales: { nombre: "Retenciones industriales", peso: 0.2 },
  cheque: { nombre: "Impuesto al cheque", peso: 3 },
  bienesPersonales: { nombre: "Bienes Personales", peso: 0.8 },
};
export const MEDALLAS = ["Medalla al Valor", "Orden al Mérito Federal", "Distinción por Servicio Distinguido", "Cruz de Honor"];

// Impacto en la opinión pública de una filtración que trasciende.
export const IMPACTO_FILTRACION = { Baja: -1, Media: -3, Alta: -5, "Crítica": -8 };
