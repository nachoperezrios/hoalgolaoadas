// Informes nacionales construidos solo con datos asentados en la partida.
// Lo que no tiene dato se lista como "sin dato confirmado"; nunca se completa.

import { claseEstado, fechaLarga, ESTADOS_PROPUESTA as EP, ROLES } from "./reglas.js";

const SECCIONES = [
  ["economia", "Economía"],
  ["politica", "Política y opinión pública"],
  ["soberania", "Soberanía"],
  ["seguridad", "Seguridad"],
  ["infraestructura", "Infraestructura"],
  ["industria", "Industria"],
  ["defensa", "Defensa y ATLAS"],
  ["exteriores", "Relaciones exteriores"],
];

const SECCION_DE_AREA = { economia: "economia", politica: "politica", soberania: "soberania", seguridad: "seguridad", infraestructura: "infraestructura", industria: "industria", defensa: "defensa", atlas: "defensa" };
const SECCION_DE_DOMINIO = { economia: "economia", politica: "politica", infraestructura: "infraestructura", exteriores: "exteriores", pfa: "seguridad", fuerzas: "defensa", compras_militares: "defensa", atlas: "defensa", atlas_guerra: "defensa" };

const num = (n) => n.toLocaleString("es-AR");

export function totalConocido(lista) {
  let total = 0, sinCantidad = [];
  for (const x of lista) {
    if (typeof x.cantidad === "number") total += x.cantidad;
    else sinCantidad.push(x.modelo || x.nombre);
  }
  return { total, sinCantidad };
}

export function construirInforme({ estado, propuestas = [], registro = [], votaciones = [], personal = [], desde = null }) {
  const s = Object.fromEntries(SECCIONES.map(([id, titulo]) => [id, { id, titulo, hechos: [], enCurso: [], pendientes: [], sinDato: [] }]));

  // Economía
  for (const ind of Object.values(estado.indicadores)) {
    if (ind.valor === null || ind.valor === undefined) s.economia.sinDato.push(ind.nombre);
    else s.economia.hechos.push(`${ind.nombre}: ${num(ind.valor)} ${ind.unidad} (cargado al ${fechaLarga(ind.fechaCarga)})`);
  }
  s.economia.hechos.push(estado.economia.conduccion);
  for (const linea of estado.politicaFiscal) s.economia.hechos.push(`Política fiscal: ${linea}`);

  // Política
  s.politica.hechos.push(`Gobierno: ${estado.gobierno.nombre}. Programa de reformas vigente: ${estado.gobierno.reformas.join("; ").toLowerCase()}`);
  if (estado.gobierno.opinionPublica.aprobacion === null) s.politica.sinDato.push("Aprobación del gobierno y encuestas de opinión pública");
  else s.politica.hechos.push(`Aprobación del gobierno: ${estado.gobierno.opinionPublica.aprobacion}%`);
  s.politica.hechos.push(`Córdoba: ${estado.federalismo.cordoba}`);

  // Soberanía
  for (const x of estado.soberania) s.soberania.hechos.push(`${x.tema}: ${x.detalle}`);

  // Seguridad
  const terrestre = totalConocido(estado.pfaTerrestre);
  const helis = totalConocido(estado.pfaHelicopteros);
  s.seguridad.hechos.push(`PFA bajo la autoridad del ${estado.pfa.autoridad}. ${estado.pfa.nota}`);
  s.seguridad.hechos.push(`Flota terrestre registrada: ${num(terrestre.total)} unidades en ${estado.pfaTerrestre.length} modelos`);
  s.seguridad.hechos.push(`Helicópteros policiales registrados: ${num(helis.total)}`);
  for (const [inst, nombre] of [["pfa", "la PFA"], ["side", "la SIDE"], ["afi", "la AFI"]]) {
    const ids = new Set((estado.unidades?.[inst] || []).map((u) => u.id));
    const activos = personal.filter((d) => ids.has(d.id)).flatMap((d) => d.policias || []).filter((p) => p.estado === "Activo").length;
    if (activos) s.seguridad.hechos.push(`Personal de ${nombre}: ${num(activos)} ${activos === 1 ? "efectivo activo" : "efectivos activos"}`);
    else s.seguridad.sinDato.push(`Nómina del personal de ${nombre}`);
  }
  s.seguridad.sinDato.push("Cantidad de unidades de carga de la PFA");
  const sinInspector = estado.pfa.divisiones.filter((d) => !d.inspector).map((d) => d.nombre);
  if (sinInspector.length) s.seguridad.sinDato.push(`Inspectores en jefe de: ${sinInspector.join(", ")}`);
  s.seguridad.sinDato.push("Indicadores de delito y seguridad ciudadana");

  // Industria
  s.industria.hechos.push("FAdeA produce los modelos AR-90 Zonda, AR-78 Bisonte, AR-41 Colibrí y AR-46 Dragón");

  // Defensa y ATLAS
  const aereo = totalConocido(estado.aereo);
  s.defensa.hechos.push(`Fuerza Aérea: ${num(aereo.total)} aeronaves con cantidad registrada`);
  if (aereo.sinCantidad.length) s.defensa.sinDato.push(`Cantidades de: ${aereo.sinCantidad.join(", ")}`);
  const capSin = estado.capacidades.filter((c) => c.cantidad === null).map((c) => c.nombre);
  if (capSin.length) s.defensa.sinDato.push(`Cantidades navales y terrestres: ${capSin.join(", ")}`);
  s.defensa.hechos.push(`ATLAS: ${estado.atlas.miembros.length} miembros (${estado.atlas.miembros.map((m) => m.pais).join(", ")}). Sede en ${estado.atlas.sede}. Presupuesto: ${estado.atlas.presupuestoAnual}`);
  for (const x of estado.atlas.enConversaciones) s.defensa.enCurso.push(`${x.pais}: ${x.nota}`);
  const at1Sin = Object.entries(estado.at1.decisiones).filter(([, v]) => v === null).length;
  s.defensa.hechos.push(`AT-1: ${estado.at1.estadoPrograma}. ${at1Sin} decisiones de programa todavía sin tomar`);
  s.defensa.sinDato.push(`Especificaciones del AT-1: ${estado.at1.noDefinidos.join(", ").toLowerCase()}`);
  for (const v of votaciones.filter((v) => v.estado === "abierta")) s.defensa.pendientes.push(`Votación de ATLAS abierta: ${v.titulo}`);

  // Relaciones exteriores
  for (const r of estado.relaciones) s.exteriores.enCurso.push(`${r.pais} (${r.estado}): ${r.temas}. No equivale a acuerdos firmados`);

  // Proyectos
  for (const pr of estado.proyectos) {
    const sec = s[SECCION_DE_AREA[pr.area]] || s.defensa;
    const extra = [pr.presupuesto ? `presupuesto ${pr.presupuesto}` : null, pr.avance ? `avance ${pr.avance}` : "avance sin dato confirmado"].filter(Boolean).join("; ");
    const linea = `${pr.nombre}: ${pr.estado} (${extra})`;
    const clase = claseEstado(pr.estado);
    if (clase === "consolidado" || clase === "aprobado") sec.hechos.push(linea);
    else sec.enCurso.push(linea);
  }

  // Propuestas pendientes de decisión
  for (const p of propuestas.filter((p) => p.estado === EP.revision || p.estado === EP.financiamiento)) {
    const sec = s[SECCION_DE_DOMINIO[p.dominio]] || s.defensa;
    const quien = p.estado === EP.financiamiento ? "espera financiamiento presidencial" : `espera decisión del ${ROLES[p.decide].corto}`;
    sec.pendientes.push(`${p.titulo} (${quien})`);
  }

  const decisiones = registro
    .filter((r) => ["decision", "votacion", "fecha"].includes(r.tipo) && (!desde || r.fecha > desde))
    .slice(0, 30)
    .map((r) => `${fechaLarga(r.fechaJuego)}: ${r.titulo}`);

  return {
    titulo: `Informe nacional del ${fechaLarga(estado.fechaJuego)}`,
    secciones: SECCIONES.map(([id]) => s[id]),
    decisionesRecientes: decisiones,
    desde,
    nota: "Informe construido solo con datos asentados en la partida. Lo marcado como «sin dato confirmado» debe incorporarse por decisión de los jugadores.",
  };
}
