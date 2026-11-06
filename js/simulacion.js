// Reglas del juego para el turno mensual. Son reglas de la partida, no datos reales:
// definen cuánto mueve cada decisión. Todo es puro (salvo el azar, inyectable) para testearlo.

export const AREAS_PRESUPUESTO = {
  fuerzas: { nombre: "Fuerzas Armadas", jemc: true },
  atlas: { nombre: "Aporte a ATLAS", jemc: true },
  fadea: { nombre: "FAdeA", jemc: true },
  pfa: { nombre: "PFA", jemc: true },
  side: { nombre: "SIDE", jemc: true },
  afi: { nombre: "AFI", jemc: true },
  obras: { nombre: "Obras públicas" },
  social: { nombre: "Desarrollo social" },
  educacion: { nombre: "Educación" },
  salud: { nombre: "Salud" },
  otros: { nombre: "Resto de la administración" },
};
export const AREAS_JEMC = Object.keys(AREAS_PRESUPUESTO).filter((k) => AREAS_PRESUPUESTO[k].jemc);

// Efectos mensuales de cada medida. "pct" = variación porcentual del valor.
export const MEDIDAS = {
  ajuste_gasto: { nombre: "Ajuste del gasto público", meses: 6, opinion: -2, mensual: { inflacion: -0.3, riesgoPais: -8, desempleo: 0.05 } },
  subsidios: { nombre: "Subsidios al consumo", meses: 6, opinion: 2, mensual: { pobreza: -0.15, inflacion: 0.2 }, pct: { recaudacion: -0.5 } },
  inversiones: { nombre: "Plan de atracción de inversiones", meses: 12, opinion: 0.5, mensual: { crecimiento: 0.1, desempleo: -0.08, riesgoPais: -4 }, pct: { reservas: 0.8 } },
  devaluacion: { nombre: "Devaluación controlada", meses: 3, opinion: -2.5, mensual: { inflacion: 0.6, crecimiento: 0.05 }, pct: { reservas: 1.5 } },
  deuda_externa: { nombre: "Emisión de deuda externa", meses: 1, opinion: 0, mensual: { riesgoPais: 25 }, pct: { reservas: 8 } },
  empleo: { nombre: "Programa de empleo", meses: 6, opinion: 1, mensual: { desempleo: -0.12, pobreza: -0.08 }, pct: { recaudacion: -0.3 } },
  suba_tasas: { nombre: "Suba de tasas de interés", meses: 3, opinion: -1, mensual: { inflacion: -0.5, crecimiento: -0.2 }, pct: { reservas: 0.5 } },
};

const LIMITES = { inflacion: [-5, 500], crecimiento: [-20, 20], desempleo: [0, 60], pobreza: [0, 100], reservas: [0, 1e9], riesgoPais: [0, 10000], recaudacion: [0, 1e9] };
const r1 = (x) => Math.round(x * 10) / 10;
export const acotar = (v, [a, b]) => Math.max(a, Math.min(b, v));

export const ALINEAMIENTO = { Aliado: 4, Neutral: 0, Opositor: -4 };
export function aprobacionProvincia(estado, p) {
  const g = estado.gobierno.opinionPublica.aprobacion;
  if (typeof g !== "number") return null;
  return r1(acotar(g + (p.ajusteAprobacion || 0) + (ALINEAMIENTO[p.alineamiento] || 0), [0, 100]));
}

export function totalPresupuesto(areas) {
  return Object.values(areas || {}).reduce((n, v) => n + (Number(v) || 0), 0);
}

function moralObjetivo(estado, area) {
  const vig = estado.presupuesto?.vigente;
  if (!vig) return 60; // sin presupuesto aprobado, las áreas funcionan a media marcha
  const pedido = Number(estado.presupuesto.pedidos?.[area]) || 0;
  const asignado = Number(vig[area]) || 0;
  if (!pedido) return 70;
  return acotar(40 + 55 * (asignado / pedido), [20, 100]);
}

// ---------- obras ----------
const PREFIJOS = ["Constructora", "Grupo", "Consorcio", "Ingeniería", "Obras"];
const NUCLEOS = ["Andina", "del Plata", "Austral", "Pampeana", "Litoral", "del Norte", "Patagónica", "Cuyana", "Federal", "Atlántica", "Serrana", "del Sur"];
const SUFIJOS = ["S.A.", "S.R.L.", "y Asociados S.A.", "Hermanos S.A."];
export function generarOfertas(costoBase, plazoBase, rand = Math.random) {
  const usados = new Set();
  return [0, 1, 2].map((i) => {
    let nombre;
    do nombre = `${PREFIJOS[Math.floor(rand() * PREFIJOS.length)]} ${NUCLEOS[Math.floor(rand() * NUCLEOS.length)]} ${SUFIJOS[Math.floor(rand() * SUFIJOS.length)]}`; while (usados.has(nombre));
    usados.add(nombre);
    const perfil = [{ c: 0.85, p: 1.15, riesgo: "Alto" }, { c: 1, p: 1, riesgo: "Medio" }, { c: 1.15, p: 0.9, riesgo: "Bajo" }][i];
    return {
      id: `of-${i}`, empresa: nombre, riesgo: perfil.riesgo,
      costo: Math.round(costoBase * perfil.c * (0.95 + rand() * 0.1)),
      plazo: Math.max(2, Math.round(plazoBase * perfil.p)),
    };
  });
}
const FACTOR_RIESGO = { Bajo: [0.95, 1.05], Medio: [0.85, 1.05], Alto: [0.6, 1.1] };

function val(e, k) { const v = e.indicadores?.[k]?.valor; return typeof v === "number" ? v : null; }
function moral(e, a) { return e.areas?.[a]?.moral ?? 70; }
function aprob(e) { const v = e.gobierno.opinionPublica.aprobacion; return typeof v === "number" ? v : 50; }

// Describe efectos sobre indicadores, aprobación y moral (se usa en las medidas económicas).
export function describirEfectosCrisis(ef) {
  const p = [];
  if (ef.opinion) p.push(`aprobación ${ef.opinion > 0 ? "+" : ""}${ef.opinion}`);
  if (ef.prov) p.push(`provincia ${ef.prov > 0 ? "+" : ""}${ef.prov}`);
  for (const [k, v] of Object.entries(ef.ind || {})) p.push(`${k} ${v > 0 ? "+" : ""}${v}`);
  for (const [k, v] of Object.entries(ef.pct || {})) p.push(`${k} ${v > 0 ? "+" : ""}${v}%`);
  for (const [k, v] of Object.entries(ef.moral || {})) p.push(`moral ${AREAS_PRESUPUESTO[k]?.nombre || k} ${v > 0 ? "+" : ""}${v}`);
  if (ef.renuncia) p.push("el ministro deja el cargo");
  return p.join(", ");
}

// ---------- auditorías ----------
export function resultadoAuditoria(estado, area, rand = Math.random) {
  const m = moral(estado, area);
  const graves = acotar(0.1 + (60 - m) / 200, [0.03, 0.5]);
  const x = rand();
  if (x < graves) return { resultado: "Irregularidades graves", efectos: { opinion: -2, moral: { [area]: -8 } } };
  if (x < graves + 0.35) return { resultado: "Observaciones menores", efectos: { moral: { [area]: -2 } } };
  return { resultado: "Sin observaciones", efectos: { opinion: 0.5, moral: { [area]: 2 } } };
}

// ---------- aplicar efectos simples al estado ----------
export function aplicarEfectosSimples(estado, ef, provinciaId = null) {
  const op = estado.gobierno.opinionPublica;
  if (ef.opinion && typeof op.aprobacion === "number") op.aprobacion = r1(acotar(op.aprobacion + ef.opinion, [0, 100]));
  for (const [k, d] of Object.entries(ef.ind || {})) {
    const ind = estado.indicadores[k];
    if (ind && typeof ind.valor === "number") ind.valor = r1(acotar(ind.valor + d, LIMITES[k] || [-1e9, 1e9]));
  }
  for (const [k, d] of Object.entries(ef.pct || {})) {
    const ind = estado.indicadores[k];
    if (ind && typeof ind.valor === "number") ind.valor = Math.round(acotar(ind.valor * (1 + d / 100), LIMITES[k] || [-1e9, 1e9]));
  }
  for (const [a, d] of Object.entries(ef.moral || {})) {
    estado.areas[a] ||= { moral: 70 };
    estado.areas[a].moral = r1(acotar(estado.areas[a].moral + d, [0, 100]));
  }
  if (ef.prov && provinciaId) {
    const p = estado.provincias.find((x) => x.id === provinciaId);
    if (p) p.ajusteAprobacion = r1((p.ajusteAprobacion || 0) + ef.prov);
  }
}

// ---------- turno mensual ----------
// Devuelve el estado del mes siguiente y los eventos ocurridos (para el registro).
export function simularMes({ estado: e0, obras = [], auditorias = [], rand = Math.random }) {
  const e = JSON.parse(JSON.stringify(e0));
  const eventos = [];
  const antes = Object.fromEntries(Object.entries(e.indicadores).map(([k, i]) => [k, i.valor]));
  const ec = e.economia;

  // 1. Medidas activas
  for (const m of ec.medidas || []) {
    if (m.restante <= 0) continue;
    const M = MEDIDAS[m.tipo];
    if (!M) continue;
    aplicarEfectosSimples(e, { ind: M.mensual, pct: M.pct });
    m.restante -= 1;
    if (m.restante === 0) eventos.push({ tipo: "medida_fin", texto: `Terminó la vigencia de la medida «${M.nombre}»` });
  }
  ec.medidas = (ec.medidas || []).filter((m) => m.restante > 0);

  // 2. Déficit o superávit del presupuesto vigente
  const vig = e.presupuesto?.vigente;
  const recaud = val(e, "recaudacion");
  if (vig && typeof recaud === "number") {
    const saldo = recaud - totalPresupuesto(vig);
    if (saldo < 0) aplicarEfectosSimples(e, { ind: { riesgoPais: 3, inflacion: 0.1 } });
    else aplicarEfectosSimples(e, { ind: { riesgoPais: -2 }, pct: { reservas: 0.2 } });
  }

  // 3. Moral de las áreas según el presupuesto
  for (const a of AREAS_JEMC) {
    e.areas[a] ||= { moral: 70 };
    const obj = moralObjetivo(e, a);
    e.areas[a].moral = r1(e.areas[a].moral + (obj - e.areas[a].moral) * 0.25);
  }

  // 4. Opinión pública por la economía
  const op = e.gobierno.opinionPublica;
  if (typeof op.aprobacion === "number") {
    const d = (k) => (typeof antes[k] === "number" && typeof e.indicadores[k].valor === "number" ? e.indicadores[k].valor - antes[k] : 0);
    let delta = -0.3 * d("inflacion") - 0.5 * d("desempleo") + 0.3 * d("crecimiento");
    op.aprobacion = r1(acotar(op.aprobacion + delta, [0, 100]));
  }
  // El efecto de las obras en cada provincia se diluye con el tiempo
  for (const p of e.provincias) p.ajusteAprobacion = r1((p.ajusteAprobacion || 0) * 0.9);

  // 5. Obras en ejecución
  const enEjecucion = obras.filter((o) => o.estado === "En ejecución");
  const necesario = enEjecucion.reduce((n, o) => n + o.costo / o.plazo, 0);
  const fondos = vig ? (Number(vig.obras) || 0) / 12 : null;
  const ratio = fondos === null ? 0.6 : necesario ? Math.min(1, fondos / necesario) : 1;
  const obrasActualizadas = enEjecucion.map((o) => {
    const [a, b] = FACTOR_RIESGO[o.riesgo] || [0.9, 1.05];
    const avance = Math.min(100, r1((o.avance || 0) + (100 / o.plazo) * ratio * (a + rand() * (b - a))));
    const nueva = { ...o, avance, meses: (o.meses || 0) + 1 };
    if (avance >= 100) { nueva.estado = "Terminada"; eventos.push({ tipo: "obra_terminada", texto: `Se terminó la obra «${o.nombre}»`, obraId: o.id }); }
    return nueva;
  });
  if (enEjecucion.length && ratio < 1) eventos.push({ tipo: "obras_fondos", texto: fondos === null ? "Sin presupuesto aprobado, las obras avanzan a media marcha" : "Los fondos para obras no alcanzan: las obras avanzan más lento" });

  // 6. Auditorías que terminan
  const auditoriasActualizadas = [];
  for (const a of auditorias.filter((x) => x.estado === "En curso")) {
    const meses = (a.meses || 0) + 1;
    if (meses >= 2) {
      const r = resultadoAuditoria(e, a.area, rand);
      aplicarEfectosSimples(e, r.efectos);
      auditoriasActualizadas.push({ ...a, meses, estado: "Finalizada", resultado: r.resultado });
      eventos.push({ tipo: "auditoria", texto: `Auditoría sobre ${AREAS_PRESUPUESTO[a.area]?.nombre || a.area}: ${r.resultado.toLowerCase()}`, resultado: r.resultado, area: a.area });
    } else auditoriasActualizadas.push({ ...a, meses });
  }

  // 8. Historial mensual
  const recaudFinal = val(e, "recaudacion");
  const gastoAnual = vig ? totalPresupuesto(vig) : null;
  ec.historial = [...(ec.historial || []), {
    fecha: e.fechaJuego, aprobacion: op.aprobacion,
    ingresoMensual: typeof recaudFinal === "number" ? Math.round(recaudFinal / 12) : null,
    gastoMensual: typeof gastoAnual === "number" ? Math.round(gastoAnual / 12) : null,
    resultado: typeof recaudFinal === "number" && typeof gastoAnual === "number" ? Math.round((recaudFinal - gastoAnual) / 12) : null,
    ...Object.fromEntries(Object.entries(e.indicadores).map(([k, i]) => [k, i.valor])),
  }].slice(-36);

  return { estado: e, eventos, obras: obrasActualizadas, auditorias: auditoriasActualizadas };
}

// ---------- Congreso ----------
const BASE_VOTO = { Oficialista: 0.96, Aliado: 0.8, Independiente: 0.45, Opositor: 0.12 };

export function votarCamara({ estado, camara, negociaciones = [], rand = Math.random }) {
  const bloques = camara === "D" ? estado.congreso.bloquesDiputados : estado.congreso.bloquesSenado;
  const legisladores = (estado.congreso.legisladores || []).filter((l) => l.camara === camara);
  const g = aprob(estado);
  const negociados = new Set(negociaciones.map((n) => n.bloqueId));
  const detalle = {};
  let af = 0, ne = 0, ab = 0, au = 0;
  for (const l of legisladores) {
    const b = bloques.find((x) => x.id === l.bloque);
    const postura = b?.postura || "Independiente";
    let p = BASE_VOTO[postura] ?? 0.45;
    if (postura !== "Oficialista") p += (g - 50) / 150;
    const prov = estado.provincias.find((x) => x.nombre === l.provincia);
    const ap = prov ? aprobacionProvincia(estado, prov) : null;
    if (ap !== null) p += (ap - g) / 200;
    if (negociados.has(l.bloque)) p += 0.35;
    p = acotar(p, [0.02, 0.99]);
    const d = (detalle[l.bloque] ||= { afirmativos: 0, negativos: 0, abstenciones: 0, ausentes: 0 });
    const x = rand();
    if (x < 0.03) { au++; d.ausentes++; continue; }
    if (rand() < 0.04) { ab++; d.abstenciones++; continue; }
    if (x < 0.03 + (1 - 0.03) * p) { af++; d.afirmativos++; } else { ne++; d.negativos++; }
  }
  const presentes = af + ne + ab;
  const quorum = presentes > legisladores.length / 2;
  return { afirmativos: af, negativos: ne, abstenciones: ab, ausentes: au, quorum, aprobada: quorum && af > ne, detalle };
}

export function avanzarMesFecha(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m, Math.min(d, 28)));
  return f.toISOString().slice(0, 10);
}
