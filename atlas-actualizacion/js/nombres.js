// Generador de nombres inventados (combinaciones al azar de nombres y apellidos
// comunes) y de planteles con rangos en pirámide y funciones asignadas.

const NOMBRES_M = [
  "Agustín", "Alejandro", "Andrés", "Ariel", "Bautista", "Benjamín", "Bruno", "Camilo", "Carlos", "Cristian",
  "Damián", "Daniel", "Diego", "Emiliano", "Esteban", "Ezequiel", "Facundo", "Federico", "Fernando", "Franco",
  "Gabriel", "Gastón", "Gonzalo", "Guillermo", "Hernán", "Ignacio", "Iván", "Javier", "Joaquín", "Jorge",
  "Juan", "Julián", "Leandro", "Lautaro", "Leonardo", "Lucas", "Luciano", "Marcelo", "Martín", "Matías",
  "Maximiliano", "Nahuel", "Nicolás", "Pablo", "Ramiro", "Rodrigo", "Santiago", "Sebastián", "Tomás", "Valentín",
];
const NOMBRES_F = [
  "Agustina", "Ana", "Antonella", "Belén", "Brenda", "Camila", "Carla", "Carolina", "Catalina", "Cecilia",
  "Daniela", "Delfina", "Florencia", "Gabriela", "Guadalupe", "Jimena", "Josefina", "Julieta", "Laura", "Lorena",
  "Lucía", "Luciana", "Macarena", "Magalí", "Malena", "Mariana", "Micaela", "Milagros", "Natalia", "Noelia",
  "Paula", "Rocío", "Romina", "Sabrina", "Silvina", "Sofía", "Valeria", "Verónica", "Victoria", "Yamila",
];

const APELLIDOS = [
  "Acosta", "Aguirre", "Alonso", "Álvarez", "Arias", "Ayala", "Barrios", "Benítez", "Bianchi", "Blanco",
  "Bravo", "Bustos", "Cabrera", "Cáceres", "Campos", "Cardozo", "Carrizo", "Castro", "Chávez", "Colombo",
  "Coria", "Correa", "Domínguez", "Escobar", "Farías", "Fernández", "Ferrari", "Ferreyra", "Figueroa", "Flores",
  "Franco", "Gallo", "García", "Giménez", "Godoy", "Gómez", "González", "Gutiérrez", "Herrera", "Ibáñez",
  "Juárez", "Ledesma", "Leiva", "Lombardi", "López", "Lucero", "Luna", "Maldonado", "Mansilla", "Marino",
  "Martínez", "Medina", "Méndez", "Mercado", "Miranda", "Molina", "Montenegro", "Morales", "Moreno", "Muñoz",
  "Navarro", "Núñez", "Ojeda", "Olivera", "Ortiz", "Pacheco", "Paz", "Peralta", "Pereyra", "Pérez",
  "Ponce", "Quiroga", "Ramírez", "Ramos", "Ríos", "Rivero", "Rodríguez", "Rojas", "Romano", "Romero",
  "Rossi", "Ruiz", "Salazar", "Sánchez", "Santoro", "Sosa", "Suárez", "Toledo", "Torres", "Valdez",
  "Vázquez", "Vega", "Velázquez", "Vera", "Villalba", "Villegas", "Zalazar", "Zapata", "Zárate", "Zurita",
];

const elegir = (lista, rand) => lista[Math.floor(rand() * lista.length)];

export function generarNombre(rand = Math.random) {
  const lista = rand() < 0.5 ? NOMBRES_M : NOMBRES_F;
  const nombre = rand() < 0.25 ? `${elegir(lista, rand)} ${elegir(lista, rand)}` : elegir(lista, rand);
  const apellido = rand() < 0.2 ? `${elegir(APELLIDOS, rand)} ${elegir(APELLIDOS, rand)}` : elegir(APELLIDOS, rand);
  return `${nombre} ${apellido}`.replace(/(\b\S+\b) \1/, "$1");
}

export function generarNombresUnicos(cantidad, rand = Math.random, existentes = new Set()) {
  const out = [];
  const usados = new Set(existentes);
  for (let i = 0; i < cantidad; i++) {
    let n, intentos = 0;
    do { n = generarNombre(rand); intentos++; } while (usados.has(n) && intentos < 20);
    usados.add(n);
    out.push(n);
  }
  return out;
}

// Pesos de la pirámide (de menor a mayor rango). El rango máximo de cada
// escalafón no se genera: se alcanza solo por decreto presidencial.
const PESOS = {
  pfa: [30, 16, 12, 9, 7, 4, 3, 2, 5, 4, 3, 2, 1.2, 0.8, 0.4, 0.2, 0],
  side: [34, 22, 16, 11, 8, 5, 3, 0],
};
PESOS.afi = PESOS.pfa;

// Funciones por departamento y nivel (base, suboficiales, oficiales, jefes).
const FUNCIONES = {
  "pfa-1": [["Operador táctico", "Tirador selecto"], ["Jefe de equipo táctico", "Instructor táctico"], ["Oficial de operaciones tácticas", "Negociador"], ["Jefe de grupo táctico"]],
  "pfa-2": [["Investigador", "Agente de calle"], ["Investigador senior", "Encargado de sumarios"], ["Oficial instructor de causas", "Detective"], ["Jefe de brigada de investigaciones"]],
  "pfa-3": [["Técnico en criminalística", "Auxiliar de laboratorio"], ["Perito balístico", "Perito en rastros"], ["Criminólogo", "Jefe de laboratorio"], ["Jefe de sección pericial"]],
  "pfa-4": [["Patrullero de respuesta rápida", "Motorista"], ["Jefe de móvil", "Operador de despacho"], ["Oficial de guardia", "Coordinador de respuesta"], ["Jefe de turno operativo"]],
  "pfa-5": [["Analista de cibercrimen", "Técnico en informática forense"], ["Investigador digital", "Analista de inteligencia digital"], ["Oficial de ciberinvestigaciones", "Perito informático"], ["Jefe de sección cibercrimen"]],
  "pfa-6": [["Auditor", "Agente de control interno"], ["Instructor de sumarios administrativos", "Auditor senior"], ["Oficial de asuntos internos", "Investigador de conducta"], ["Jefe de sección de auditoría"]],
  side: [["Agente de campo", "Analista"], ["Analista senior", "Oficial de enlace"], ["Oficial de inteligencia", "Jefe de célula"], ["Jefe de sección de inteligencia"]],
  afi: [["Custodio de instalaciones", "Operador de control de acceso"], ["Supervisor de seguridad", "Jefe de puesto"], ["Oficial de protección", "Coordinador de custodia"], ["Jefe de sección de protección"]],
  general: [["Agente operativo", "Auxiliar"], ["Supervisor", "Encargado"], ["Oficial a cargo", "Coordinador"], ["Jefe de sección"]],
};

export const FUNCION_JEFE_INTERINO = "Jefe de Departamento interino";

function nivel(indice, total) {
  const r = indice / (total - 1);
  return r < 0.2 ? 0 : r < 0.5 ? 1 : r < 0.8 ? 2 : 3;
}

export function funcionPara(unidadId, rangos, rango, rand = Math.random) {
  const inst = unidadId.split("-")[0];
  const tabla = FUNCIONES[unidadId] || FUNCIONES[inst] || FUNCIONES.general;
  return elegir(tabla[nivel(rangos.indexOf(rango), rangos.length)], rand);
}

// Reparte `cantidad` en rangos según la pirámide (método del mayor resto).
export function repartirRangos(inst, rangos, cantidad) {
  const pesos = PESOS[inst] || PESOS.pfa;
  const suma = pesos.reduce((a, b) => a + b, 0);
  const exactos = pesos.map((p) => (p / suma) * cantidad);
  const cuentas = exactos.map(Math.floor);
  let resto = cantidad - cuentas.reduce((a, b) => a + b, 0);
  const orden = exactos.map((x, i) => [x - Math.floor(x), i]).filter(([, i]) => pesos[i] > 0).sort((a, b) => b[0] - a[0]);
  for (let k = 0; resto > 0; k = (k + 1) % orden.length, resto--) cuentas[orden[k][1]]++;
  return rangos.map((r, i) => [r, cuentas[i] || 0]);
}

// Genera un plantel para una unidad. El de mayor rango queda como jefe interino
// (confirmarlo como jefe pleno requiere decreto presidencial).
export function generarPlantel({ inst, unidadId, rangos, cantidad, rand = Math.random, existentes, conJefe = true }) {
  const nombres = generarNombresUnicos(cantidad, rand, existentes);
  const filas = [];
  let k = 0;
  for (const [rango, n] of repartirRangos(inst, rangos, cantidad)) {
    for (let i = 0; i < n; i++) filas.push({ nombre: nombres[k++], rango, funcion: funcionPara(unidadId, rangos, rango, rand), division: unidadId });
  }
  if (conJefe && filas.length) {
    const max = Math.max(...filas.map((f) => rangos.indexOf(f.rango)));
    filas.find((f) => rangos.indexOf(f.rango) === max).funcion = FUNCION_JEFE_INTERINO;
  }
  return filas;
}
