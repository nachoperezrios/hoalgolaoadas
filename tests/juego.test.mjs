import { test } from "node:test";
import assert from "node:assert/strict";
import { Almacen, crearBackendMemoria } from "../js/backends/almacen.js";
import { Juego, crearPartida, unirse, consultarPartida } from "../js/juego.js";
import { resultadoVotacion, ESTADOS_PROPUESTA as EP, generarCodigo, normalizarCodigo, RANGOS, RANGOS_SIDE } from "../js/reglas.js";
import { estadoInicial } from "../js/datos-iniciales.js";
import { repartirRangos, generarPlantel, FUNCION_JEFE_INTERINO } from "../js/nombres.js";

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


// ---------- Personal (versión 2: departamentos) ----------
const policias = (j, div) => j.personal.find((d) => d.id === div)?.policias || [];
const alta = (division, nombre, rango, funcion = "") => ({ tipo: "personal", op: "alta", division, policia: { id: `pol-${nombre}`, nombre, rango, funcion } });

test("partida nueva: 6 departamentos PFA, SIDE y AFI, FAdeA y gobierno", async () => {
  const { jemc } = await armar();
  assert.equal(jemc.partida.version, 3);
  assert.deepEqual(jemc.estado.unidades.pfa.map((u) => u.numero), [1, 2, 3, 4, 5, 6]);
  assert.equal(jemc.estado.unidades.pfa[4].nombre, "Departamento de Cibercrimen");
  assert.equal(jemc.estado.fadea.modelos.length, 4);
  assert.equal(jemc.estado.provincias.length, 24);
  assert.ok(jemc.leyes.some((l) => l.id === "ley-autonomia-provincial"));
});

test("migración: una partida de la versión 1 conserva su progreso y reubica al personal", async () => {
  const almacen = new Almacen();
  const b = crearBackendMemoria(almacen, "uid-jemc");
  const estado = estadoInicial();
  estado.aereo.find((a) => a.id === "f14").cantidad = 340;
  const ruta = "partidas/VIEJ-A123";
  almacen.confirmar({}, {
    [ruta]: { codigo: "VIEJ-A123", nombre: "Vieja", version: 1, jugadores: { jemc: { uid: "uid-jemc", pin: "1111" }, presidente: null }, estado },
    [`${ruta}/personal/uate`]: { division: "uate", policias: [{ id: "p1", nombre: "Ana Uno", rango: "Inspector", estado: "Activo", alta: "2029-12-08" }] },
    [`${ruta}/personal/asuntos-internos`]: { division: "asuntos-internos", policias: [{ id: "p2", nombre: "Beto Dos", rango: "Cabo", estado: "Activo", alta: "2029-12-08" }] },
    [`${ruta}/personal/side`]: { division: "side", policias: [{ id: "p3", nombre: "Ceci Tres", rango: "Agente", estado: "Activo", alta: "2029-12-08" }] },
    [`${ruta}/propuestas/prop-1`]: { id: "prop-1", titulo: "Decisión vieja", estado: "Aprobada", fecha: "2029" },
  });
  const j = new Juego(b, "VIEJ-A123", "jemc");
  j.conectar(() => {});
  await esperar(); await esperar(); await esperar();
  assert.equal(j.partida.version, 3);
  assert.equal(j.estado.aereo.find((a) => a.id === "f14").cantidad, 340);
  assert.equal(policias(j, "pfa-1")[0].nombre, "Ana Uno");
  assert.ok(policias(j, "pfa-1")[0].funcion);
  assert.equal(policias(j, "pfa-6")[0].nombre, "Beto Dos");
  assert.equal(policias(j, "side-general")[0].nombre, "Ceci Tres");
  assert.equal(policias(j, "uate").length, 0);
  assert.ok(j.propuestas.some((p) => p.id === "prop-1"));
  assert.ok(j.registro.some((r) => r.titulo.includes("versión 3")));
  // Segunda migración: no hace nada
  await j.migrar();
  await esperar();
  assert.equal(policias(j, "pfa-1").length, 1);
});

test("personal: alta directa, pedido del Presidente y pase entre departamentos", async () => {
  const { jemc, pres } = await armar();
  await jemc.proponer({ titulo: "Alta", dominio: "pfa", efectos: [alta("pfa-2", "Sosa", "Subinspector", "Detective")] });
  await esperar();
  assert.equal(policias(pres, "pfa-2")[0].funcion, "Detective");
  const r = await pres.proponer({ titulo: "Pase", dominio: "pfa", efectos: [{ tipo: "personal", op: "editar", division: "pfa-2", id: "pol-Sosa", cambios: { division: "pfa-5", rango: "Inspector" } }] });
  assert.equal(r.decide, "jemc");
  await esperar();
  await jemc.decidir(r.id, "aprobar");
  await esperar();
  assert.equal(policias(pres, "pfa-5")[0].rango, "Inspector");
  await assert.rejects(jemc.proponer({ titulo: "x", dominio: "pfa", efectos: [{ tipo: "personal", op: "editar", division: "pfa-5", id: "pol-Sosa", cambios: { division: "side-general" } }] }), /entre instituciones/);
});

test("decreto: rango máximo y jefatura plena los firma el Presidente", async () => {
  const { jemc, pres } = await armar();
  await jemc.proponer({ titulo: "Alta", dominio: "pfa", efectos: [alta("pfa-1", "Luna", "Comisario Mayor", FUNCION_JEFE_INTERINO)] });
  const asc = await jemc.proponer({ titulo: "Ascenso", dominio: "pfa", efectos: [{ tipo: "personal", op: "editar", division: "pfa-1", id: "pol-Luna", cambios: { rango: "Comisario General" } }] });
  assert.equal(asc.decide, "presidente");
  const jefe = await jemc.proponer({ titulo: "Jefatura", dominio: "pfa", efectos: [{ tipo: "personal", op: "editar", division: "pfa-1", id: "pol-Luna", cambios: { funcion: "Jefe de Departamento" } }] });
  assert.equal(jefe.decide, "presidente");
  const sideDir = await jemc.proponer({ titulo: "Director SIDE", dominio: "side", efectos: [alta("side-general", "Vera", "Director")] });
  assert.equal(sideDir.decide, "presidente");
  await pres.decidir(asc.id, "aprobar");
  await esperar();
  assert.equal(policias(jemc, "pfa-1")[0].rango, "Comisario General");
});

test("generador: pirámide de rangos, jefe interino y nombres sin repetir", () => {
  const rep = repartirRangos("pfa", RANGOS, 3000);
  const cuenta = Object.fromEntries(rep);
  assert.equal(rep.reduce((n, [, c]) => n + c, 0), 3000);
  assert.ok(cuenta.Agente > cuenta.Sargento && cuenta.Sargento > cuenta.Comisario);
  assert.equal(cuenta["Comisario General"], 0);
  const filas = generarPlantel({ inst: "side", unidadId: "side-general", rangos: RANGOS_SIDE, cantidad: 400 });
  assert.equal(filas.length, 400);
  assert.equal(filas.filter((f) => f.funcion === FUNCION_JEFE_INTERINO).length, 1);
  assert.ok(!filas.some((f) => f.rango === "Director"));
  assert.ok(new Set(filas.map((f) => f.nombre)).size > 390);
});

test("generar plantel y renombrar a todos", async () => {
  const { jemc, pres } = await armar();
  await jemc.generarPlantel("pfa-3", 500);
  await jemc.generarPlantel("afi-general", 800);
  await esperar();
  assert.equal(policias(pres, "pfa-3").length, 500);
  assert.equal(policias(pres, "afi-general").length, 800);
  assert.ok(policias(pres, "afi-general").every((p) => p.funcion));
  const antes = policias(pres, "pfa-3").map((p) => p.nombre).join();
  await jemc.renombrarTodos("pfa");
  await esperar();
  assert.notEqual(policias(pres, "pfa-3").map((p) => p.nombre).join(), antes);
  assert.equal(policias(pres, "pfa-3").length, 500);
  await assert.rejects(pres.renombrarTodos("pfa"), /Jefe del Estado Mayor/);
});

test("FAdeA: orden autorizada por el Presidente y entregas que suman al inventario", async () => {
  const { jemc, pres } = await armar();
  const r = await jemc.proponer({ titulo: "Orden Zonda", dominio: "fadea", efectos: [{ tipo: "doc", col: "ordenes", id: "ord-1", op: "crear", datos: { modelo: "zonda", cantidad: 50, entregadas: 0, estado: "Autorizada" } }] });
  assert.equal(r.decide, "presidente");
  await esperar();
  assert.equal(jemc.ordenes.length, 0);
  await pres.decidir(r.id, "aprobar");
  await esperar();
  assert.equal(jemc.ordenes.length, 1);
  const ent = await jemc.proponer({ titulo: "Entrega", dominio: "fadea", efectos: [{ tipo: "doc", col: "ordenes", id: "ord-1", op: "editar", cambios: { entregadas: 20, estado: "En producción" } }] });
  assert.equal(ent.decide, "jemc");
  await esperar();
  assert.equal(pres.estado.aereo.find((a) => a.id === "zonda").cantidad, 1020);
  await assert.rejects(jemc.proponer({ titulo: "x", dominio: "fadea", efectos: [{ tipo: "doc", col: "ordenes", id: "ord-1", op: "editar", cambios: { entregadas: 60 } }] }), /más de lo ordenado/);
});

test("FAdeA: gastos dentro del presupuesto los decide el Jefe; si se excede, el Presidente", async () => {
  const { jemc, pres } = await armar();
  const gasto = (id, monto) => ({ tipo: "lista", ruta: "fadea.movimientos", op: "agregar", item: { id, concepto: "Insumos", tipo: "Gasto", monto, estado: "Registrado" } });
  assert.equal((await jemc.proponer({ titulo: "g", dominio: "fadea", efectos: [gasto("g0", 10)] })).decide, "presidente"); // sin presupuesto asignado
  await pres.proponer({ titulo: "Presupuesto", dominio: "compras_militares", efectos: [{ tipo: "dato", ruta: "fadea.presupuestoAnual", valor: 1000 }] });
  await esperar();
  assert.equal((await jemc.proponer({ titulo: "g", dominio: "fadea", efectos: [gasto("g1", 800)] })).decide, "jemc");
  await esperar();
  assert.equal((await jemc.proponer({ titulo: "g", dominio: "fadea", efectos: [gasto("g2", 300)] })).decide, "presidente");
});

test("FAdeA: modelo nuevo lo autoriza el Presidente; las fichas las carga el Jefe", async () => {
  const { jemc, pres } = await armar();
  const r = await jemc.proponer({ titulo: "Nuevo modelo", dominio: "fadea", efectos: [{ tipo: "lista", ruta: "fadea.modelos", op: "agregar", item: { id: "ar-99", nombre: "AR-99 Pampero", rol: "Entrenador avanzado", estado: "Concepto" } }] });
  assert.equal(r.decide, "presidente");
  const f = await jemc.proponer({ titulo: "Ficha", dominio: "fadea", efectos: [{ tipo: "dato", ruta: "fichas.zonda.motor", valor: "Turbofán de diseño propio" }] });
  assert.equal(f.decide, "jemc");
  await esperar();
  assert.equal(pres.estado.fichas.zonda.motor, "Turbofán de diseño propio");
});

test("opinión pública: filtración que trasciende baja la aprobación", async () => {
  const { jemc, pres } = await armar();
  await pres.proponer({ titulo: "Encuesta", dominio: "politica", efectos: [{ tipo: "dato", ruta: "gobierno.opinionPublica.aprobacion", valor: 55 }] });
  await jemc.proponer({ titulo: "Filtración", dominio: "fadea", efectos: [
    { tipo: "doc", col: "filtraciones", id: "fil-1", op: "crear", datos: { titulo: "Planos filtrados", gravedad: "Alta", trascendio: true, estado: "En investigación" } },
    { tipo: "opinion", delta: -5, motivo: "Filtración en FAdeA" },
  ] });
  await esperar();
  assert.equal(pres.estado.gobierno.opinionPublica.aprobacion, 50);
  assert.equal(pres.estado.gobierno.opinionPublica.historial.length, 2);
});

test("SIDE y AFI: expedientes y misiones bajo la autoridad del Jefe del Estado Mayor", async () => {
  const { jemc, pres } = await armar();
  const r = await pres.proponer({ titulo: "Expediente", dominio: "side", efectos: [{ tipo: "doc", col: "inteligencia", id: "int-1", op: "crear", inst: "side", datos: { inst: "side", tipo: "expediente", titulo: "Operación Albatros", clasificacion: "Secreto", estado: "Abierto" } }] });
  assert.equal(r.decide, "jemc");
  const m = await jemc.proponer({ titulo: "Misión", dominio: "afi", efectos: [{ tipo: "doc", col: "inteligencia", id: "int-2", op: "crear", inst: "afi", datos: { inst: "afi", tipo: "mision", titulo: "Custodia Ushuaia", estado: "En curso" } }] });
  assert.equal(m.estado, EP.aprobada);
  await esperar();
  assert.equal(pres.inteligencia.length, 1);
});

test("Gobierno: gabinete, provincias y leyes los decide el Presidente", async () => {
  const { jemc, pres } = await armar();
  const g = await pres.proponer({ titulo: "Nombramiento", dominio: "politica", efectos: [{ tipo: "lista", ruta: "gabinete", op: "editar", id: "defensa", cambios: { titular: "Rosa Inventada", estado: "En funciones" } }] });
  assert.equal(g.estado, EP.aprobada);
  const pedido = await jemc.proponer({ titulo: "Pedido", dominio: "politica", efectos: [{ tipo: "lista", ruta: "provincias", op: "editar", id: "cordoba", cambios: { alineamiento: "Aliado" } }] });
  assert.equal(pedido.decide, "presidente");
  await pres.proponer({ titulo: "Ley", dominio: "politica", efectos: [{ tipo: "doc", col: "leyes", id: "ley-autonomia-provincial", op: "editar", cambios: { estado: "Media sanción", votosDiputados: { afirmativos: 140, negativos: 100, abstenciones: 17 } } }] });
  await esperar();
  assert.equal(jemc.estado.gabinete.find((x) => x.id === "defensa").titular, "Rosa Inventada");
  assert.equal(jemc.leyes.find((l) => l.id === "ley-autonomia-provincial").estado, "Media sanción");
});

test("anulación de una entrega de FAdeA descuenta el inventario", async () => {
  const { jemc, pres } = await armar();
  const r = await jemc.proponer({ titulo: "Orden", dominio: "fadea", efectos: [{ tipo: "doc", col: "ordenes", id: "ord-2", op: "crear", datos: { modelo: "colibri", cantidad: 10, entregadas: 0, estado: "Autorizada" } }] });
  await esperar(); await pres.decidir(r.id, "aprobar"); await esperar();
  const ent = await jemc.proponer({ titulo: "Entrega", dominio: "fadea", efectos: [{ tipo: "doc", col: "ordenes", id: "ord-2", op: "editar", cambios: { entregadas: 4 } }] });
  await esperar();
  assert.equal(jemc.estado.aereo.find((a) => a.id === "colibri").cantidad, 754);
  const an = await pres.solicitarAnulacion(ent.id, "Entrega mal cargada");
  await esperar(); await jemc.decidir(an.id, "aprobar"); await esperar();
  assert.equal(jemc.estado.aereo.find((a) => a.id === "colibri").cantidad, 750);
  assert.equal(jemc.ordenes.find((o) => o.id === "ord-2").entregadas, 0);
});

test("el informe cuenta efectivos activos", async () => {
  const { jemc } = await armar();
  await jemc.cargaMasiva([{ nombre: "A", rango: "Agente", division: "pfa-1" }, { nombre: "B", rango: "Cabo", division: "afi-general" }]);
  await esperar();
  await jemc.generarInforme();
  await esperar();
  const seg = jemc.informes[0].secciones.find((s) => s.id === "seguridad");
  assert.ok(seg.hechos.some((h) => h.includes("la PFA: 1 efectivo activo")));
  assert.ok(seg.hechos.some((h) => h.includes("la AFI: 1 efectivo activo")));
});

// ---------- Versión 3 ----------
const cargarIndicadores = async (pres) => {
  const vals = { inflacion: 30, crecimiento: 2, desempleo: 7, pobreza: 30, reservas: 40000, riesgoPais: 800, recaudacion: 120000 };
  await pres.proponer({ titulo: "Indicadores iniciales", dominio: "economia", efectos: [
    ...Object.entries(vals).map(([clave, valor]) => ({ tipo: "indicador", clave, valor })),
    { tipo: "dato", ruta: "gobierno.opinionPublica.aprobacion", valor: 50 },
  ] });
  await esperar();
};

test("v3: Congreso con 329 legisladores, gabinete completo con Anastacio Montiel", async () => {
  const { jemc } = await armar();
  const e = jemc.estado;
  assert.equal(e.congreso.legisladores.length, 329);
  assert.equal(e.congreso.bloquesDiputados.find((b) => b.postura === "Oficialista").bancas, 135);
  const sg = e.gabinete.find((g) => g.id === "secretaria-general");
  assert.equal(sg.titular, "Anastacio Montiel");
  assert.ok(e.gabinete.every((g) => g.titular));
});

test("v3: migración desde la v2 conserva nombres y bloques cargados", async () => {
  const almacen = new Almacen();
  const b = crearBackendMemoria(almacen, "uid-jemc");
  const { migrarEstado } = await import("../js/migracion.js");
  const e2 = migrarEstado(estadoInicial());
  // Simular una partida v2: sin estructuras de la v3 y con datos propios
  delete e2.congreso.legisladores; delete e2.areas; delete e2.presupuesto; delete e2.indicadores.recaudacion;
  e2.gabinete = e2.gabinete.filter((g) => g.id !== "secretaria-general").map((g) => ({ ...g, titular: g.id === "defensa" ? "Nombre Propio" : "" }));
  e2.congreso.bloquesDiputados = [{ id: "mio", nombre: "Mi Bloque", bancas: 200, postura: "Oficialista" }];
  e2.congreso.bloquesSenado = [];
  almacen.confirmar({}, { "partidas/VDOS-A123": { codigo: "VDOS-A123", nombre: "v2", version: 2, jugadores: { jemc: { uid: "uid-jemc", pin: "1" }, presidente: null }, estado: e2 } });
  const j = new Juego(b, "VDOS-A123", "jemc");
  j.conectar(() => {});
  await esperar(); await esperar(); await esperar();
  assert.equal(j.partida.version, 3);
  assert.equal(j.estado.gabinete.find((g) => g.id === "defensa").titular, "Nombre Propio");
  assert.equal(j.estado.gabinete[0].titular, "Anastacio Montiel");
  assert.equal(j.estado.congreso.bloquesDiputados.find((x) => x.id === "mio").bancas, 200);
  assert.equal(j.estado.congreso.bloquesDiputados.find((x) => x.nombre === "Sin bloque").bancas, 57);
  assert.equal(j.estado.congreso.legisladores.filter((l) => l.camara === "S").length, 72);
});

test("v3: medida económica y turno mensual", async () => {
  const { jemc, pres } = await armar();
  await cargarIndicadores(pres);
  const r = await pres.proponer({ titulo: "Ajuste", dominio: "economia", efectos: [{ tipo: "medida", medida: { id: "m1", tipo: "ajuste_gasto", nombre: "Ajuste del gasto público", meses: 2 } }] });
  assert.equal(r.estado, EP.aprobada);
  await esperar();
  await jemc.avanzarMes(jemc.estado.fechaJuego);
  await esperar();
  assert.equal(pres.estado.fechaJuego, "2030-01-08");
  assert.ok(pres.estado.indicadores.inflacion.valor < 30);
  assert.equal(pres.estado.economia.medidas[0].restante, 1);
  await assert.rejects(pres.avanzarMes("2029-12-08"), /ya avanzó/);
  await pres.avanzarMes(pres.estado.fechaJuego);
  await esperar();
  assert.equal(pres.estado.economia.medidas.length, 0);
  assert.equal(pres.estado.economia.historial.length, 2);
});

test("v3: turno mensual sin indicadores cargados no falla", async () => {
  const { jemc } = await armar();
  await jemc.avanzarMes();
  await esperar();
  assert.equal(jemc.estado.fechaJuego, "2030-01-08");
});

test("v3: presupuesto: pedido del Jefe, reparto del Presidente, Congreso y moral", async () => {
  const { jemc, pres } = await armar();
  await cargarIndicadores(pres);
  const pedido = await jemc.proponer({ titulo: "Pedido PFA", dominio: "pfa", efectos: [{ tipo: "dato", ruta: "presupuesto.pedidos.pfa", valor: 1000 }] });
  assert.equal(pedido.decide, "jemc");
  await assert.rejects(jemc.enviarPresupuesto(), /Presidente/);
  await pres.proponer({ titulo: "Borrador", dominio: "economia", efectos: [
    { tipo: "dato", ruta: "presupuesto.borrador.pfa", valor: 400 }, { tipo: "dato", ruta: "presupuesto.borrador.fadea", valor: 900 }, { tipo: "dato", ruta: "presupuesto.borrador.obras", valor: 1200 },
  ] });
  await esperar();
  const { id } = await pres.enviarPresupuesto();
  await esperar();
  const r1 = await pres.votarLey(id);
  assert.equal(r1.estado, "Media sanción");
  const r2 = await pres.votarLey(id);
  assert.equal(r2.estado, "Sancionada");
  await esperar();
  assert.equal(jemc.estado.presupuesto.vigente.pfa, 400);
  assert.equal(jemc.estado.fadea.presupuestoAnual, 900);
  const moral0 = jemc.estado.areas.pfa.moral;
  await jemc.avanzarMes(); await esperar();
  assert.ok(jemc.estado.areas.pfa.moral < moral0, "la PFA recibió menos de lo pedido: baja la moral");
  await assert.rejects(pres.votarLey(id), /ya no se puede votar/);
});

test("v3: obra: licitación, adjudicación, avance, inauguración con impacto provincial", async () => {
  const { jemc, pres } = await armar();
  await cargarIndicadores(pres);
  await pres.proponer({ titulo: "Licitación", dominio: "infraestructura", efectos: [{ tipo: "doc", col: "obras", id: "obra-1", op: "crear", datos: { nombre: "Hospital Regional", tipo: "Hospital", provincia: "Salta", provinciaId: "salta", estado: "En licitación", ofertas: [{ id: "of-0", empresa: "Constructora Andina S.A.", costo: 100, plazo: 2, riesgo: "Bajo" }] } }] });
  await esperar();
  await pres.proponer({ titulo: "Adjudicar", dominio: "infraestructura", efectos: [{ tipo: "doc", col: "obras", id: "obra-1", op: "editar", cambios: { estado: "En ejecución", empresa: "Constructora Andina S.A.", costo: 100, plazo: 2, riesgo: "Bajo", avance: 0 } }] });
  await esperar();
  await jemc.avanzarMes(); await esperar();
  assert.ok(pres.obras[0].avance > 20 && pres.obras[0].avance < 100);
  for (let i = 0; i < 4 && pres.obras[0].estado !== "Terminada"; i++) { await jemc.avanzarMes(); await esperar(); }
  assert.equal(pres.obras[0].estado, "Terminada");
  const ap0 = pres.estado.gobierno.opinionPublica.aprobacion;
  await pres.proponer({ titulo: "Inaugurar", dominio: "infraestructura", efectos: [
    { tipo: "doc", col: "obras", id: "obra-1", op: "editar", cambios: { estado: "Inaugurada" } },
    { tipo: "simples", efectos: { opinion: 1.5, prov: 5 }, provinciaId: "salta" },
  ] });
  await esperar();
  assert.equal(pres.estado.gobierno.opinionPublica.aprobacion, Math.round((ap0 + 1.5) * 10) / 10);
  assert.ok(pres.estado.provincias.find((p) => p.id === "salta").ajusteAprobacion >= 5);
});

test("v3: condecoración por decreto presidencial", async () => {
  const { jemc, pres } = await armar();
  await jemc.proponer({ titulo: "Alta", dominio: "pfa", efectos: [alta("pfa-1", "Héroe", "Sargento", "Operador táctico")] });
  await esperar();
  const pedidoJefe = await jemc.proponer({ titulo: "Condecorar", dominio: "decretos", efectos: [{ tipo: "personal", op: "condecorar", inst: "pfa", division: "pfa-1", id: "pol-Héroe", nombre: "Héroe", medalla: "Medalla al Valor" }] });
  assert.equal(pedidoJefe.decide, "presidente");
  await pres.decidir(pedidoJefe.id, "aprobar");
  await esperar();
  assert.equal(policias(jemc, "pfa-1")[0].condecoraciones[0].medalla, "Medalla al Valor");
});

test("v3: auditoría ordenada por el Presidente termina a los dos meses", async () => {
  const { jemc, pres } = await armar();
  await pres.proponer({ titulo: "Auditoría", dominio: "politica", efectos: [{ tipo: "doc", col: "auditorias", id: "aud-1", op: "crear", datos: { area: "fadea", areaNombre: "FAdeA", motivo: "Control de gastos", estado: "En curso", meses: 0 } }] });
  await esperar();
  await jemc.avanzarMes(); await esperar();
  assert.equal(pres.auditorias[0].estado, "En curso");
  await jemc.avanzarMes(); await esperar();
  assert.equal(pres.auditorias[0].estado, "Finalizada");
  assert.ok(["Sin observaciones", "Observaciones menores", "Irregularidades graves"].includes(pres.auditorias[0].resultado));
});

// ---------- Banco Central, ARCA, cuentas públicas y carga inicial ----------
test("carga inicial: cualquiera carga datos vacíos; después decide el Presidente", async () => {
  const { jemc, pres } = await armar();
  const a = await jemc.proponer({ titulo: "Inflación inicial", dominio: "carga_inicial", efectos: [{ tipo: "indicador", clave: "inflacion", valor: 25 }] });
  assert.equal(a.decide, "jemc");
  assert.equal(a.estado, EP.aprobada);
  await esperar();
  const b = await jemc.proponer({ titulo: "Cambio", dominio: "carga_inicial", efectos: [{ tipo: "indicador", clave: "inflacion", valor: 20 }] });
  assert.equal(b.decide, "presidente");
  const c = await jemc.proponer({ titulo: "Dólar", dominio: "carga_inicial", efectos: [{ tipo: "dato", ruta: "bcra.dolar", valor: 1500 }] });
  assert.equal(c.decide, "jemc");
  const d = await jemc.proponer({ titulo: "Córdoba", dominio: "carga_inicial", efectos: [{ tipo: "lista", ruta: "provincias", op: "editar", id: "cordoba", cambios: { alineamiento: "Aliado" } }] });
  assert.equal(d.decide, "jemc");
  await esperar();
  assert.equal(pres.estado.bcra.dolar, 1500);
  assert.equal(pres.estado.provincias.find((p) => p.id === "cordoba").alineamiento, "Aliado");
  // Las áreas del Jefe del Estado Mayor no cambian: el presupuesto propuesto sigue siendo del Presidente.
  const e = await jemc.proponer({ titulo: "x", dominio: "economia", efectos: [{ tipo: "dato", ruta: "presupuesto.borrador.obras", valor: 1 }] });
  assert.equal(e.decide, "presidente");
});

test("ARCA: alícuota cargada solo cambia por ley; la reforma sancionada ajusta la recaudación", async () => {
  const { jemc, pres } = await armar();
  await jemc.proponer({ titulo: "IVA", dominio: "carga_inicial", efectos: [{ tipo: "dato", ruta: "arca.alicuotas.iva", valor: 21 }] });
  await pres.proponer({ titulo: "Recaudación", dominio: "carga_inicial", efectos: [{ tipo: "indicador", clave: "recaudacion", valor: 100000 }] });
  await esperar();
  await assert.rejects(pres.proponer({ titulo: "IVA directo", dominio: "economia", efectos: [{ tipo: "dato", ruta: "arca.alicuotas.iva", valor: 19 }] }), /ley del Congreso/);
  await pres.proponer({ titulo: "Reforma", dominio: "politica", efectos: [{ tipo: "doc", col: "leyes", id: "ley-iva", op: "crear", datos: { tipo: "impuestos", titulo: "Baja del IVA", alicuotas: { iva: 19 }, origen: "Poder Ejecutivo", estado: "Presentado", negociaciones: [] } }] });
  await esperar();
  assert.equal((await pres.votarLey("ley-iva")).estado, "Media sanción");
  assert.equal((await pres.votarLey("ley-iva")).estado, "Sancionada");
  await esperar();
  assert.equal(jemc.estado.arca.alicuotas.iva, 19);
  assert.equal(jemc.estado.indicadores.recaudacion.valor, 95000); // -2 puntos × 2,5%
});

test("cuentas públicas: el historial registra ingreso, gasto y resultado mensual", async () => {
  const { jemc, pres } = await armar();
  await pres.proponer({ titulo: "Recaudación", dominio: "carga_inicial", efectos: [{ tipo: "indicador", clave: "recaudacion", valor: 120000 }] });
  await pres.proponer({ titulo: "Borrador", dominio: "economia", efectos: [{ tipo: "dato", ruta: "presupuesto.borrador.otros", valor: 132000 }] });
  await esperar();
  const { id } = await pres.enviarPresupuesto(); await esperar();
  await pres.votarLey(id); await pres.votarLey(id); await esperar();
  await jemc.avanzarMes(); await esperar();
  const h = jemc.estado.economia.historial.at(-1);
  assert.equal(h.ingresoMensual, 10000);
  assert.equal(h.gastoMensual, 11000);
  assert.equal(h.resultado, -1000);
});
