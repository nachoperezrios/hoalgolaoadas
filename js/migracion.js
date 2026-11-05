// Migración de partidas. Agrega lo nuevo sin tocar el progreso existente:
// decisiones, inventarios, proyectos e historial quedan como estaban.

import { DEPARTAMENTOS_PFA } from "./reglas.js";

export const VERSION_ACTUAL = 2;

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

const slug = (t) => String(t).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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
