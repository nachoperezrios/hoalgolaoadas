// Migración de partidas. Agrega lo nuevo sin tocar el progreso existente:
// decisiones, inventarios, proyectos e historial quedan como estaban.

import { DEPARTAMENTOS_PFA } from "./reglas.js";
import { generarNombresUnicos } from "./nombres.js";
import { AREAS_PRESUPUESTO, AREAS_JEMC } from "./simulacion.js";

export const VERSION_ACTUAL = 3;

// Bancas reales de Diputados por distrito (257 en total); el Senado tiene 3 por distrito.
const BANCAS_DIPUTADOS = {
  "Buenos Aires": 70, "Ciudad Autónoma de Buenos Aires": 25, "Santa Fe": 19, "Córdoba": 18, "Mendoza": 10, "Tucumán": 9, "Entre Ríos": 9,
  "Salta": 7, "Chaco": 7, "Corrientes": 7, "Misiones": 7, "Santiago del Estero": 7, "San Juan": 6, "Jujuy": 6,
  "Río Negro": 5, "Neuquén": 5, "Formosa": 5, "Chubut": 5, "San Luis": 5, "Catamarca": 5, "La Rioja": 5, "La Pampa": 5, "Santa Cruz": 5, "Tierra del Fuego": 5,
};
const PATAGONIA = ["Neuquén", "Río Negro", "Chubut", "Santa Cruz", "Tierra del Fuego"];

// Bloques iniciales ficticios: el oficialismo arranca con mayoría propia en las dos cámaras.
const BLOQUES_INICIALES = {
  D: [["lyp", "Libertad y Progreso", 135, "Oficialista"], ["ffp", "Frente Federal Popular", 70, "Opositor"], ["adi", "Alianza del Interior", 22, "Independiente"],
    ["msu", "Movimiento Social Unido", 18, "Opositor"], ["bpa", "Bloque Patagónico", 12, "Aliado"]],
  S: [["lyp", "Libertad y Progreso", 38, "Oficialista"], ["ffp", "Frente Federal Popular", 20, "Opositor"], ["adi", "Alianza del Interior", 7, "Independiente"],
    ["msu", "Movimiento Social Unido", 4, "Opositor"], ["bpa", "Bloque Patagónico", 3, "Aliado"]],
};

function mezclar(lista, rand = Math.random) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function generarLegisladores(congreso, rand = Math.random) {
  const nombres = generarNombresUnicos(257 + 72, rand);
  let k = 0;
  const out = [];
  for (const camara of ["D", "S"]) {
    const bloques = camara === "D" ? congreso.bloquesDiputados : congreso.bloquesSenado;
    const bancas = Object.entries(BANCAS_DIPUTADOS).flatMap(([prov, n]) => Array(camara === "D" ? n : 3).fill(prov));
    let libres = mezclar(bancas, rand);
    const total = libres.length;
    const orden = [...bloques].sort((x, y) => (/patag/i.test(y.nombre) ? 1 : 0) - (/patag/i.test(x.nombre) ? 1 : 0));
    for (const b of orden) {
      let cupo = Math.max(0, Math.round(Number(b.bancas) || 0));
      // Un bloque patagónico toma sus bancas en la Patagonia.
      const preferidas = /patag/i.test(b.nombre) ? libres.filter((p) => PATAGONIA.includes(p)) : [];
      for (const prov of preferidas) {
        if (!cupo) break;
        libres.splice(libres.indexOf(prov), 1);
        out.push({ id: `leg-${camara}-${k}`, camara, nombre: nombres[k++], provincia: prov, bloque: b.id }); cupo--;
      }
      while (cupo-- > 0 && libres.length) out.push({ id: `leg-${camara}-${k}`, camara, nombre: nombres[k++], provincia: libres.shift(), bloque: b.id });
    }
    if (libres.length) {
      const id = camara === "D" ? "sin-bloque-d" : "sin-bloque-s";
      bloques.push({ id, nombre: "Sin bloque", bancas: libres.length, postura: "Independiente" });
      for (const prov of libres) out.push({ id: `leg-${camara}-${k}`, camara, nombre: nombres[k++], provincia: prov, bloque: id });
    }
    const asignadas = out.filter((l) => l.camara === camara).length;
    for (const b of bloques) b.bancas = out.filter((l) => l.camara === camara && l.bloque === b.id).length;
    if (asignadas !== total) throw new Error("Error al repartir bancas");
  }
  return out;
}

// Divisiones de la versión 1 -> departamentos de la versión 2.
export const MAPA_DIVISIONES = {
  uate: "pfa-1",
  investigacion: "pfa-2",
  operaciones: "pfa-4",
  "asuntos-internos": "pfa-6",
  afi: "afi-general",
  side: "side-general",
};

const PROVINCIAS = [
  "Ciudad Autónoma de Buenos Aires", "Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos",
  "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

const CARGOS_GABINETE = [
  ["jefatura", "Jefatura de Gabinete de Ministros"], ["interior", "Ministerio del Interior"], ["exteriores", "Ministerio de Relaciones Exteriores"],
  ["economia", "Ministerio de Economía"], ["defensa", "Ministerio de Defensa"], ["seguridad", "Ministerio de Seguridad"],
  ["justicia", "Ministerio de Justicia"], ["infraestructura", "Ministerio de Infraestructura"], ["educacion", "Ministerio de Educación"],
  ["salud", "Ministerio de Salud"], ["trabajo", "Ministerio de Trabajo"],
];

const slug = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function migrarEstado(estadoV1) {
  const e = JSON.parse(JSON.stringify(estadoV1));

  e.unidades ||= {
    pfa: DEPARTAMENTOS_PFA.map((d) => ({ ...d })),
    side: [{ id: "side-general", nombre: "Planta general" }],
    afi: [{ id: "afi-general", nombre: "Planta general" }],
  };

  if (!e.pfaTerrestre.some((v) => v.id === "cargas")) {
    e.pfaTerrestre.push({ id: "cargas", modelo: "Unidades de carga", cantidad: null });
  }

  e.escudos ||= { pfa: null, side: null, afi: null };
  e.fichas ||= {};

  e.fadea ||= {
    presupuestoAnual: null,
    plantas: [{
      id: "antartida", nombre: "Instalaciones industriales antárticas", ubicacion: "", estado: "Operativa",
      funcion: "Investigación, hangares, almacenamiento y desarrollo de material aeronáutico, naval y terrestre", capacidad: "",
    }],
    modelos: ["zonda", "bisonte", "colibri", "dragon"].map((id) => {
      const a = e.aereo.find((x) => x.id === id);
      return { id, nombre: a.modelo, rol: a.funcion.split(".")[0], estado: "En producción", exclusivo: "Sí", notas: "" };
    }),
    movimientos: [],
  };

  // AT-1: los datos técnicos pasan a ser cargables.
  if (!e.at1.ficha) {
    e.at1.ficha = { motor: null, materiales: null, sensores: null, dimensiones: null, alcance: null, armamento: null, cantidadesProducidas: null, cronogramaPruebas: null };
  }

  e.gobierno.opinionPublica.historial ||= [];

  e.gabinete ||= CARGOS_GABINETE.map(([id, cargo]) => ({
    id, cargo, titular: "", estado: id === "economia" ? "En funciones" : "", notas: id === "economia" ? "El Presidente también conduce la economía" : "",
  }));

  e.congreso ||= { bancasDiputados: 257, bancasSenado: 72, bloquesDiputados: [], bloquesSenado: [] };

  e.provincias ||= PROVINCIAS.map((nombre) => ({
    id: slug(nombre), nombre, gobernador: "", alineamiento: "", acuerdos: "",
    notas: nombre === "Córdoba" ? "Fuera de la unificación policial plena" : "",
  }));

  e.relaciones = e.relaciones.map((r) => ({ id: r.id || slug(r.pais), ...r }));
  e.tratados ||= [];

  // ---------- versión 3 ----------
  e.indicadores.recaudacion ||= { nombre: "Recaudación anual", unidad: "US$ millones", valor: null, fechaCarga: null };
  e.economia.medidas ||= [];
  e.economia.historial ||= [];
  e.areas ||= Object.fromEntries(AREAS_JEMC.map((a) => [a, { moral: 70 }]));
  e.presupuesto ||= {
    borrador: Object.fromEntries(Object.keys(AREAS_PRESUPUESTO).map((a) => [a, null])),
    pedidos: Object.fromEntries(AREAS_JEMC.map((a) => [a, null])),
    vigente: null, leyId: null,
  };
  e.comunicacion ||= { ultimaCadena: null };
  e.bcra ||= { tesoro: null, dolar: null, tasa: null, baseMonetaria: null };
  e.arca ||= { alicuotas: { iva: null, gananciasSociedades: null, gananciasPersonas: null, retencionesAgro: null, retencionesIndustriales: null, cheque: null, bienesPersonales: null } };
  e.escudos.bcra ??= null;
  e.escudos.arca ??= null;
  for (const p of e.provincias) {
    p.ajusteAprobacion ??= 0;
    // Corrige identificadores mal armados por versiones anteriores (tildes).
    if (p.id !== slug(p.nombre) && !e.provincias.some((q) => q.id === slug(p.nombre))) p.id = slug(p.nombre);
  }
  for (const r of e.relaciones) if (r.id !== slug(r.pais) && !e.relaciones.some((q) => q.id === slug(r.pais))) r.id = slug(r.pais);

  // Gabinete: Secretaría General de la Presidencia y nombres inventados en los cargos vacíos.
  if (!e.gabinete.some((g) => g.id === "secretaria-general")) {
    e.gabinete.unshift({ id: "secretaria-general", cargo: "Secretaría General de la Presidencia", titular: "Anastacio Montiel", estado: "En funciones", notas: "" });
  }
  const sinGobernador = e.provincias.filter((p) => !p.gobernador);
  generarNombresUnicos(sinGobernador.length).forEach((n, i) => { sinGobernador[i].gobernador = n; });
  const vacios = e.gabinete.filter((g) => !g.titular);
  const nombres = generarNombresUnicos(vacios.length);
  vacios.forEach((g, i) => { g.titular = nombres[i]; g.estado ||= "En funciones"; });

  // Congreso: bloques iniciales con mayoría propia (si los jugadores no cargaron los suyos) y legisladores con nombre.
  const c = e.congreso;
  if (!c.legisladores) {
    if (!c.bloquesDiputados.length) c.bloquesDiputados = BLOQUES_INICIALES.D.map(([id, nombre, bancas, postura]) => ({ id: `${id}-d`, nombre, bancas, postura }));
    if (!c.bloquesSenado.length) c.bloquesSenado = BLOQUES_INICIALES.S.map(([id, nombre, bancas, postura]) => ({ id: `${id}-s`, nombre, bancas, postura }));
    c.legisladores = generarLegisladores(c);
  }

  return e;
}

// Documentos que se crean al migrar (fuera del estado general).
export function documentosIniciales(fechaJuego) {
  return {
    leyes: [{
      id: "ley-autonomia-provincial",
      titulo: "Autonomía económica provincial",
      descripcion: "Ampliar la autonomía económica de las 23 provincias y la Ciudad Autónoma de Buenos Aires, con acuerdos voluntarios y administración de recursos para proyectos conjuntos.",
      origen: "Poder Ejecutivo", estado: "Presentado",
      votosDiputados: { afirmativos: null, negativos: null, abstenciones: null },
      votosSenado: { afirmativos: null, negativos: null, abstenciones: null },
      notas: "", creada: new Date().toISOString(), fechaJuego,
    }],
  };
}
