import { test } from "node:test";
import assert from "node:assert/strict";
import { Almacen, crearBackendMemoria } from "../js/backends/almacen.js";
import { Juego, crearPartida, unirse, consultarPartida } from "../js/juego.js";
import { resultadoVotacion, ESTADOS_PROPUESTA as EP, generarCodigo, normalizarCodigo } from "../js/reglas.js";

const esperar = () => new Promise((r) => setTimeout(r, 5));

async function armar() {
  const almacen = new Almacen();
  const bJ = crearBackendMemoria(almacen, "uid-jemc");
  const bP = crearBackendMemoria(almacen, "uid-pres");
  const { codigo, pin } = await crearPartida(bJ, { nombre: "Prueba", rol: "jemc" });
  const r = await unirse(bP, codigo, "presidente");
  assert.equal(r.ok, true);
  const jemc = new Juego(bJ, codigo, "jemc");
  const pres = new Juego(bP, codigo, "presidente");
  const cambiosP = [];
  jemc.conectar(() => {});
  pres.conectar((t) => cambiosP.push(t));
  await esperar();
  return { almacen, codigo, pin, jemc, pres, cambiosP };
}
const prop = (j, id) => j.propuestas.find((p) => p.id === id);
const zonda = (j) => j.estado.aereo.find((a) => a.id === "zonda").cantidad;

test("códigos de invitación con formato estable", () => {
  const c = generarCodigo();
  assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(normalizarCodigo(c.toLowerCase().replace("-", " ")), c);
});

test("unirse: cargo libre, ocupado sin PIN y recuperación con PIN", async () => {
  const { almacen, codigo, pin } = await armar();
  const intruso = crearBackendMemoria(almacen, "uid-otro");
  assert.deepEqual(await unirse(intruso, codigo, "jemc", "0000"), { ok: false, motivo: "pin" });
  const ok = await unirse(intruso, codigo, "jemc", pin);
  assert.equal(ok.ok, true);
  const partida = await consultarPartida(intruso, codigo);
  assert.equal(partida.jugadores.jemc.uid, "uid-otro");
});

test("estado inicial: sin indicadores inventados y Japón fuera de ATLAS", async () => {
  const { jemc } = await armar();
  for (const ind of Object.values(jemc.estado.indicadores)) assert.equal(ind.valor, null);
  assert.equal(jemc.estado.atlas.miembros.length, 9);
  assert.ok(!jemc.estado.atlas.miembros.some((m) => m.pais === "Japón"));
  assert.equal(jemc.estado.aereo.find((a) => a.id === "kc135").cantidad, null);
  assert.equal(jemc.registro.length, 3);
});

test("decisión directa del Jefe del Estado Mayor se ve en el otro dispositivo", async () => {
  const { jemc, pres, cambiosP } = await armar();
  const r = await jemc.proponer({ titulo: "Corregir cantidad registrada", dominio: "fuerzas", efectos: [{ tipo: "inventario", lista: "aereo", itemId: "zonda", valor: 990 }] });
  assert.equal(r.decide, "jemc");
  assert.equal(r.estado, EP.aprobada);
  await esperar();
  assert.equal(zonda(pres), 990);
  assert.ok(cambiosP.includes("partida"));
});

test("sumar aviones es una compra: la autoriza el Presidente", async () => {
  const { jemc, pres } = await armar();
  const r = await jemc.proponer({ titulo: "Ampliar Zonda", dominio: "fuerzas", efectos: [{ tipo: "inventario", lista: "aereo", itemId: "zonda", valor: 1100 }] });
  assert.equal(r.decide, "presidente");
  await esperar();
  assert.equal(zonda(pres), 1000);
  await assert.rejects(jemc.decidir(r.id, "aprobar"), /otro cargo/);
  await pres.decidir(r.id, "aprobar", "Hay fondos");
  await esperar();
  assert.equal(zonda(jemc), 1100);
  assert.equal(prop(jemc, r.id).estado, EP.aprobada);
});

test("compromiso de ATLAS con costo: pide financiamiento y se bloquea si se rechaza", async () => {
  const { jemc, pres } = await armar();
  const r = await jemc.proponer({ titulo: "Fase de pruebas AT-1", dominio: "atlas", requiereFondos: true, costo: "a definir",
    efectos: [{ tipo: "at1", campo: "faseActual", valor: "Pruebas de vuelo iniciales" }] });
  assert.equal(r.estado, EP.financiamiento);
  await esperar();
  assert.equal(pres.estado.at1.decisiones.faseActual, null);
  const pedido = pres.propuestas.find((p) => p.tipo === "financiamiento");
  assert.equal(pedido.decide, "presidente");
  await pres.decidir(pedido.id, "rechazar", "No hay presupuesto");
  await esperar();
  assert.equal(prop(jemc, r.id).estado, EP.bloqueada);
  assert.equal(jemc.estado.at1.decisiones.faseActual, null);
});

test("financiamiento aprobado aplica la medida original", async () => {
  const { jemc, pres } = await armar();
  const r = await jemc.proponer({ titulo: "Nombre del AT-1", dominio: "atlas", requiereFondos: true,
    efectos: [{ tipo: "at1", campo: "nombreDefinitivo", valor: "AT-1 Cóndor" }] });
  await esperar();
  const pedido = pres.propuestas.find((p) => p.tipo === "financiamiento");
  await pres.decidir(pedido.id, "aprobar");
  await esperar();
  assert.equal(jemc.estado.at1.decisiones.nombreDefinitivo, "AT-1 Cóndor");
  assert.equal(prop(jemc, r.id).estado, EP.aprobada);
});

test("la PFA la decide el Jefe del Estado Mayor; el Presidente pide coordinación", async () => {
  const { jemc, pres } = await armar();
  const r = await pres.proponer({ titulo: "Más helicópteros H145", dominio: "pfa", efectos: [{ tipo: "inventario", lista: "pfaHelicopteros", itemId: "h145", valor: 24 }] });
  assert.equal(r.decide, "jemc");
  await esperar();
  await jemc.decidir(r.id, "aprobar");
  await esperar();
  assert.equal(pres.estado.pfaHelicopteros.find((h) => h.id === "h145").cantidad, 24);
});

test("el Presidente pausa un programa por presupuesto y afecta al otro cargo", async () => {
  const { jemc, pres } = await armar();
  const r = await pres.proponer({ titulo: "Recorte", dominio: "economia", efectos: [{ tipo: "proyecto_estado", proyectoId: "atlas-naval", valor: "En pausa por falta de fondos" }] });
  assert.equal(r.estado, EP.aprobada);
  await esperar();
  assert.equal(jemc.estado.proyectos.find((p) => p.id === "atlas-naval").estado, "En pausa por falta de fondos");
});

test("devolver, reenviar y aprobar conserva el historial", async () => {
  const { jemc, pres } = await armar();
  const r = await jemc.proponer({ titulo: "Puertos", dominio: "infraestructura", efectos: [{ tipo: "proyecto_estado", proyectoId: "puertos", valor: "Aprobado" }] });
  await esperar();
  await pres.decidir(r.id, "devolver", "Falta el costo");
  await esperar();
  assert.equal(prop(jemc, r.id).estado, EP.devuelta);
  await jemc.reenviar(r.id, { descripcion: "Costo: no definido; se pide estudio", comentario: "Agregado" });
  await esperar();
  await pres.decidir(r.id, "aprobar");
  await esperar();
  const p = prop(pres, r.id);
  assert.deepEqual(p.historial.map((h) => h.accion), ["propuso", "devolver", "reenvio", "aprobar"]);
  assert.equal(pres.estado.proyectos.find((x) => x.id === "puertos").estado, "Aprobado");
});

test("anulación: la pide uno, la aprueba el otro y se conserva el original", async () => {
  const { jemc, pres } = await armar();
  const r = await pres.proponer({ titulo: "Cargar inflación", dominio: "economia", efectos: [{ tipo: "indicador", clave: "inflacion", valor: 2.1 }] });
  await esperar();
  assert.equal(jemc.estado.indicadores.inflacion.valor, 2.1);
  assert.equal(jemc.estado.indicadores.inflacion.fechaCarga, "2029-12-08");
  const a = await jemc.solicitarAnulacion(r.id, "El dato no estaba confirmado");
  await esperar();
  assert.equal(prop(pres, a.id).decide, "presidente");
  await pres.decidir(a.id, "aprobar");
  await esperar();
  assert.equal(jemc.estado.indicadores.inflacion.valor, null);
  assert.equal(prop(jemc, r.id).estado, EP.anulada);
  assert.equal(prop(jemc, r.id).titulo, "Cargar inflación");
});

test("voto de guerra: umbral del 80% y voto argentino con autorización presidencial", async () => {
  const { jemc, pres } = await armar();
  const { id } = await jemc.crearVotacion({ titulo: "Respuesta a agresión externa", tipo: "guerra" });
  await esperar();
  await assert.rejects(jemc.votar(id, "Argentina", "si"), /autorización presidencial/);
  const otros = ["Estados Unidos", "Francia", "Reino Unido", "Alemania", "Corea del Sur", "Suecia", "Israel"];
  for (const p of otros) await pres.votar(id, p, "si");
  await jemc.votar(id, "Brasil", "no");
  await esperar();
  let v = jemc.votaciones.find((x) => x.id === id);
  let res = resultadoVotacion(v);
  assert.equal(res.necesarios, 8);
  assert.equal(res.resultado, "en_curso"); // 7 a favor: depende de Argentina
  const pedido = await jemc.prepararVotoArgentino(id, "si", "Agresión externa contra un miembro");
  await esperar();
  await pres.decidir(pedido.id, "aprobar");
  await esperar();
  v = jemc.votaciones.find((x) => x.id === id);
  res = resultadoVotacion(v);
  assert.equal(v.votos.Argentina.voto, "si");
  assert.equal(res.si, 8);
  assert.equal(res.resultado, "aprobada");
  assert.ok(Math.abs(res.porcentaje - 88.888) < 0.01);
  await jemc.confirmarResultado(id);
  await pres.confirmarResultado(id);
  await esperar();
  assert.equal(jemc.votaciones.find((x) => x.id === id).estado, "cerrada");
});

test("si el Presidente rechaza el voto, se registra su alternativa", async () => {
  const { jemc, pres } = await armar();
  const { id } = await jemc.crearVotacion({ titulo: "Operación conjunta", tipo: "guerra" });
  const pedido = await jemc.prepararVotoArgentino(id, "si", "Recomendación militar");
  await esperar();
  await pres.decidir(pedido.id, "rechazar", "No hay consenso político", { votoAlternativo: "abstencion" });
  await esperar();
  const v = jemc.votaciones.find((x) => x.id === id);
  assert.equal(v.votos.Argentina.voto, "abstencion");
  assert.equal(v.votos.Argentina.autorizado, false);
});

test("7 de 9 a favor no alcanza el 80%", () => {
  const miembros = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const votos = Object.fromEntries(miembros.map((m, i) => [m, { voto: i < 7 ? "si" : "no" }]));
  const r = resultadoVotacion({ miembros, votos, umbral: 0.8 });
  assert.equal(r.resultado, "rechazada");
});

test("objeción del Presidente a una decisión de ATLAS", async () => {
  const { jemc, pres } = await armar();
  const r = await jemc.proponer({ titulo: "Ejercicio conjunto en el Atlántico Sur", dominio: "atlas" });
  await esperar();
  await pres.objetar(r.id, "Quiero que se informe antes al Congreso");
  await esperar();
  const p = prop(jemc, r.id);
  assert.equal(p.estado, EP.aprobada);
  assert.equal(p.objeciones.length, 1);
  await jemc.tomarConocimiento(r.id);
  await esperar();
  assert.equal(prop(pres, r.id).objeciones[0].conocida, true);
  await assert.rejects(jemc.objetar(r.id, "x"), /no admite/);
});

test("Japón solo entra a ATLAS por decisión registrada", async () => {
  const { jemc, pres } = await armar();
  await jemc.proponer({ titulo: "Incorporar a Japón", dominio: "atlas", efectos: [{ tipo: "atlas_alta", pais: "Japón", aporte: "Ferrocarriles e industria" }] });
  await esperar();
  assert.equal(pres.estado.atlas.miembros.length, 10);
  assert.equal(pres.estado.atlas.enConversaciones.length, 0);
});

test("asuntos con intervenciones de ambos cargos y archivo", async () => {
  const { jemc, pres } = await armar();
  const { id } = await pres.crearAsunto({ titulo: "Corredor Córdoba–Salta", area: "infraestructura", texto: "Hay estudios en curso", tipoIntervencion: "hecho" });
  await esperar();
  await jemc.intervenir(id, "opcion", "Priorizar el tramo con carga militar");
  await esperar();
  assert.equal(pres.asuntos.find((a) => a.id === id).intervenciones.length, 2);
  await pres.cambiarEstadoAsunto(id, "archivado");
  await esperar();
  await assert.rejects(jemc.intervenir(id, "comentario", "x"), /archivado/);
});

test("informe con fecha en el título y sin datos inventados", async () => {
  const { jemc } = await armar();
  await jemc.generarInforme();
  await esperar();
  const inf = jemc.informes[0];
  assert.equal(inf.titulo, "Informe nacional del 8 de diciembre de 2029");
  const eco = inf.secciones.find((s) => s.id === "economia");
  assert.ok(eco.sinDato.includes("Inflación"));
  assert.ok(!eco.hechos.some((h) => h.startsWith("Inflación")));
  const titulos = inf.secciones.map((s) => s.titulo);
  for (const t of ["Economía", "Política y opinión pública", "Soberanía", "Seguridad", "Infraestructura", "Industria"]) assert.ok(titulos.includes(t));
});

test("acciones simultáneas de los dos jugadores no se pisan", async () => {
  const { jemc, pres } = await armar();
  await Promise.all([
    jemc.proponer({ titulo: "A", dominio: "fuerzas", efectos: [{ tipo: "inventario", lista: "aereo", itemId: "f14", valor: 340 }] }),
    pres.proponer({ titulo: "B", dominio: "economia", efectos: [{ tipo: "indicador", clave: "reservas", valor: 50000 }] }),
  ]);
  await esperar();
  assert.equal(jemc.estado.aereo.find((a) => a.id === "f14").cantidad, 340);
  assert.equal(jemc.estado.indicadores.reservas.valor, 50000);
});

test("la fecha de juego avanza y no retrocede", async () => {
  const { jemc, pres } = await armar();
  await pres.cambiarFecha("2029-12-15", "Pasó una semana");
  await esperar();
  assert.equal(jemc.estado.fechaJuego, "2029-12-15");
  await assert.rejects(jemc.cambiarFecha("2029-12-01"), /no retrocede/);
});
