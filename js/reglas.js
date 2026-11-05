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
  compras_militares: { nombre: "Compras y presupuesto militar, programas de FAdeA", decide: "presidente" },
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

// ---------- Efectos sobre el estado ----------
// Cada efecto declara qué dominio hace falta para aplicarlo.

export function dominioRequerido(efecto, estado) {
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
    default:
      return null;
  }
}

// ¿Qué rol tiene que decidir una propuesta? El de mayor exigencia entre sus efectos.
export function rolQueDecide(dominio, efectos, estado) {
  const necesarios = new Set([dominio, ...efectos.map((e) => dominioRequerido(e, estado)).filter(Boolean)]);
  const roles = new Set([...necesarios].map(decideDominio));
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
