// Estado inicial de la partida ATLAS (8 de diciembre de 2029).
// Todo el contenido es ficticio. `null` significa "sin dato confirmado":
// la interfaz nunca lo reemplaza por un número inventado.

export const FECHA_INICIAL = "2029-12-08";

export function estadoInicial() {
  return {
    fechaJuego: FECHA_INICIAL,

    gobierno: {
      nombre: "Libertad y Progreso",
      reformas: [
        "Reducir el tamaño del Estado y el gasto público",
        "Bajar impuestos y controlar la inflación",
        "Atraer inversiones privadas",
        "Fortalecer la industria nacional y aumentar las exportaciones",
        "Reducir la dependencia de sectores tradicionales",
        "Priorizar infraestructura, vivienda, educación y seguridad",
      ],
      opinionPublica: { aprobacion: null, fechaCarga: null, nota: "Sin encuestas incorporadas a la partida" },
    },

    indicadores: {
      inflacion: { nombre: "Inflación", unidad: "%", valor: null, fechaCarga: null },
      crecimiento: { nombre: "Crecimiento del PBI", unidad: "%", valor: null, fechaCarga: null },
      desempleo: { nombre: "Desempleo", unidad: "%", valor: null, fechaCarga: null },
      pobreza: { nombre: "Pobreza", unidad: "%", valor: null, fechaCarga: null },
      reservas: { nombre: "Reservas", unidad: "US$ millones", valor: null, fechaCarga: null },
      riesgoPais: { nombre: "Riesgo país", unidad: "puntos", valor: null, fechaCarga: null },
    },

    politicaFiscal: [
      "Las ganancias netas de la operación industrial antártica, excluida FAdeA, se destinan al Tesoro Nacional y a las reservas",
      "FAdeA conserva su función de sostener la capacidad industrial y militar argentina",
      "La inversión militar extraordinaria está en fase de cierre",
      "Se mantiene la inversión anual acordada para ATLAS y el mantenimiento de las capacidades existentes",
      "Se prevén auditorías independientes y reportes públicos de los fondos públicos relevantes",
      "La información técnica sensible puede permanecer clasificada",
    ],

    economia: {
      ministro: "Ministro de Economía en funciones (participa en análisis y ejecución)",
      conduccion: "El Presidente asumió personalmente la conducción económica, sin eliminar al ministro",
    },

    federalismo: {
      propuesta:
        "Ampliar la autonomía económica de las 23 provincias y la Ciudad Autónoma de Buenos Aires, con acuerdos voluntarios y administración de recursos para proyectos conjuntos",
      estado: "Pendiente",
      nota: "Pendiente de tratamiento en el Congreso",
      cordoba:
        "Córdoba está fuera de la unificación policial plena. La PFA interviene allí ante delitos federales u órdenes judiciales federales; los delitos provinciales ordinarios son de jurisdicción local.",
    },

    soberania: [
      { tema: "Ushuaia, sede central de ATLAS", estado: "Consolidado", detalle: "Coordinación, pista, hangares, desarrollo aeronáutico y almacenamiento conjunto" },
      { tema: "Instalaciones industriales antárticas", estado: "Consolidado", detalle: "Investigación, hangares, almacenamiento y desarrollo aeronáutico, naval y terrestre. Ubicación exacta, inventario total, costos y avance: no definidos" },
    ],

    relaciones: [
      { pais: "Estados Unidos", temas: "Inversiones, comercio, energía y tecnología", estado: "En negociación" },
      { pais: "Japón", temas: "Ferrocarriles, industria y capacitación. Conversaciones de cooperación con ATLAS; no es miembro", estado: "En negociación" },
      { pais: "Corea del Sur", temas: "Industria, tecnología y cooperación económica", estado: "En negociación" },
    ],

    proyectos: [
      p("subte", "Ampliación de la red de subte de Buenos Aires", "infraestructura", "infraestructura", "Gobierno nacional", "Aprobado", null, "Sin balance físico completo", ""),
      p("rutas", "Programa nacional de mejora de rutas", "infraestructura", "infraestructura", "Vialidad", "Aprobado", null, "Sin porcentaje de avance consolidado", "Vialidad trabaja en el programa en todo el país"),
      p("vivienda", "Torres de vivienda y relocalización", "infraestructura", "infraestructura", "Gobierno nacional con inversión privada", "Aprobado", null,
        "Sin balance de hogares trasladados, torres terminadas, títulos entregados ni ejecución presupuestaria",
        "Construcción por etapas con inversión privada, alojamiento transitorio durante las obras y nuevas viviendas con títulos de propiedad. Los ingresos públicos de operaciones inmobiliarias se destinarían a infraestructura y transporte"),
      p("ferro", "Modernización ferroviaria: estudios de factibilidad", "infraestructura", "infraestructura", "Gobierno nacional", "En evaluación", null, "",
        "Corredores: Buenos Aires–Rosario–Córdoba; Córdoba–Mendoza; Córdoba–Salta; Córdoba–Neuquén; Buenos Aires–Mar del Plata; futuras conexiones hacia la Patagonia. No son obras terminadas"),
      p("ferro-cba", "Centro de formación ferroviaria en Córdoba", "infraestructura", "infraestructura", "Gobierno nacional", "En evaluación", null, "", ""),
      p("puertos", "Modernización de puertos", "infraestructura", "infraestructura", "Gobierno nacional", "En evaluación", null, "", "Mejorar la logística y reducir costos del comercio exterior"),
      p("tarifas-puertos", "Sistema de tarifas portuarias", "economia", "economia", "Gobierno nacional", "Propuesta", null, "No hay tarifas nuevas aprobadas", "Recuperar costos de mantenimiento y financiar inversiones"),
      { ...p("cba-industria", "Córdoba Industria 2035", "industria", "economia", "Gobierno nacional y Córdoba", "En búsqueda de financiamiento", "US$ 240 millones (propuesta)", "Financiamiento no asegurado", "Forma parte de un plan de capacitación más amplio"), empleos: "1.200 (estimados)" },
      { ...p("cba-software", "Córdoba Software Industrial 2035", "industria", "economia", "Gobierno nacional y Córdoba", "En evaluación", "US$ 45 millones (propuesta)", "", ""), empleos: "600 (estimados)" },
      { ...p("capacitacion", "Capacitación industrial", "industria", "economia", "Gobierno nacional", "Prevista", null, "", ""), empleos: "3.000 trabajadores a capacitar (meta)" },
      p("federalismo", "Autonomía económica provincial", "politica", "politica", "Presidencia", "Pendiente", null, "Requiere tratamiento en el Congreso", "Acuerdos voluntarios entre jurisdicciones"),
      p("auditorias", "Auditorías independientes y reportes públicos", "economia", "economia", "Gobierno nacional", "Prevista", null, "", "Objetivo de transparencia establecido"),
      p("cierre-inversion", "Cierre de la inversión militar extraordinaria", "defensa", "compras_militares", "Presidencia y Estado Mayor Conjunto", "Aprobado", null, "", "Continúan la inversión anual de ATLAS y el mantenimiento de capacidades"),
      p("antartida", "Complejo industrial antártico", "soberania", "fuerzas", "FAdeA y fabricantes nacionales", "Consolidado", null, "Ubicación exacta, inventario total, costos y avance no definidos", "Las ganancias netas, excluida FAdeA, van al Tesoro y a las reservas"),
      p("at1", "AT-1: avión de combate conjunto", "atlas", "atlas", "ATLAS (dirección desde Ushuaia)", "Consolidado", null, "Cantidades y especificaciones finales no definidas", "Producción iniciada"),
      p("atlas-naval", "Programa industrial conjunto naval (buques, submarinos, destructores)", "atlas", "atlas", "ATLAS (liderazgo de Suecia)", "Consolidado", null, "Cantidades no consolidadas", ""),
      p("atlas-terrestre", "Programa industrial conjunto terrestre (tanques y artillería)", "atlas", "atlas", "ATLAS (Alemania: tanques; Reino Unido: artillería)", "Consolidado", null, "Cantidades no consolidadas", ""),
    ],

    aereo: [
      a("zonda", "AR-90 Zonda", 1000, "FAdeA", "Argentina",
        "Superioridad aérea, defensa aérea, intercepción, escolta y combate polivalente. En el juego, el caza más avanzado del mundo. Uso exclusivo argentino: no se vende ni se presta.",
        "Inspiración concreta no fijada en el canon. Diseño original de FAdeA; cualquier comparación con cazas reales es solo conceptual.", "no_fijada"),
      a("bisonte", "AR-78 Bisonte", 200, "FAdeA", "Argentina",
        "Bombardero estratégico furtivo. Modelo propio de FAdeA, no una copia. Uso exclusivo argentino: no se vende ni se presta.",
        "Northrop Grumman B-2 Spirit (referencia de categoría)", "analogia"),
      a("colibri", "AR-41 Colibrí", 750, "FAdeA", "Argentina",
        "Reconocimiento estratégico de alta velocidad: observación y obtención de información para apoyar la planificación.",
        "Lockheed SR-71 Blackbird", "analogia"),
      a("dragon", "AR-46 Dragón", 418, "FAdeA", "Argentina",
        "Avión cisterna para reabastecimiento en vuelo de aeronaves compatibles.",
        "Boeing KC-46 Pegasus (referencia funcional)", "analogia"),
      a("f16", "F-16 Viper", 718, "Lockheed Martin", "Estados Unidos", "Caza polivalente para defensa aérea y misiones generales.",
        "Lockheed Martin F-16 Fighting Falcon; “Viper” es el apodo popular", "propio"),
      a("fa18", "F/A-18 Super Hornet", 670, "Boeing", "Estados Unidos", "Caza polivalente, asociado también a operaciones navales.",
        "Boeing F/A-18E/F Super Hornet", "propio"),
      a("f14", "F-14 Tomcat", 350, "Grumman", "Estados Unidos", "Caza de defensa aérea y operaciones navales.",
        "Grumman F-14 Tomcat", "propio"),
      { ...a("f15ex", "F-15EX Eagle II", 12, "Boeing", "Estados Unidos", "Caza pesado polivalente.", "Boeing F-15EX Eagle II", "propio"),
        previstos: 350, nota: "350 previstos; 12 entregados según el último estado registrado. El total cuenta solo los entregados." },
      a("c130", "C-130 Hercules / Super Hercules", 350, "Lockheed", "Estados Unidos", "Transporte táctico.",
        "Lockheed C-130 Hercules / C-130J Super Hercules", "propio"),
      a("c17", "C-17 Globemaster III", 222, "Boeing", "Estados Unidos", "Transporte estratégico pesado.", "Boeing C-17 Globemaster III", "propio"),
      a("c5m", "C-5M Galaxy", 150, "Lockheed", "Estados Unidos", "Transporte estratégico de gran capacidad.", "Lockheed C-5M Super Galaxy", "propio"),
      a("uh60", "UH-60 Black Hawk", 250, "Sikorsky", "Estados Unidos", "Helicóptero militar de transporte y apoyo. No se cuenta como helicóptero policial.",
        "Sikorsky UH-60 Black Hawk", "propio"),
      { ...a("kc135", "KC-135 Stratotanker", null, "Boeing", "Estados Unidos", "Avión cisterna que aparece en antecedentes de la flota.",
        "Boeing KC-135 Stratotanker", "propio"), nota: "Cantidad no consolidada. Queda fuera del total hasta que los jugadores indiquen su cifra." },
      { ...a("entrenamiento", "Aeronaves de entrenamiento", null, "No definido", "No definido", "Formación de pilotos.",
        "Modelos no definidos", "no_fijada"), nota: "Hay cantidad suficiente, pero no se definieron modelos ni cantidades." },
    ],

    transportePresidencial: {
      modelo: "Airbus A380 presidencial (“A380 mitificado”)",
      referencia: "Airbus A380 especialmente acondicionado",
      nota: "Avión presidencial argentino. No es un avión militar de inventario.",
    },

    referenciasAereas: [
      r("Boeing F-47", "Modelo designado F-47 dentro de la partida", "Plataforma de Estados Unidos considerada como referencia para el AT-1. No integra el inventario argentino."),
      r("Rafale", "Dassault Rafale", "Caza polivalente francés y referencia para el AT-1."),
      r("Eurofighter Typhoon", "Eurofighter Typhoon", "Caza europeo (Alemania y Reino Unido) y referencia para el AT-1."),
      r("Gripen E/F", "Saab JAS 39 Gripen E/F", "Referencia sueca y brasileña para cooperación y el AT-1."),
      r("KF-21 Boramae", "KAI KF-21 Boramae", "Referencia surcoreana para cooperación aeronáutica y el AT-1."),
      r("F-35I Adir", "F-35A Lightning II adaptado para Israel", "Aeronave operada por Israel; referencia de integración. No es un diseño fabricado por Israel."),
      r("B-2 Spirit", "Northrop Grumman B-2 Spirit", "Referencia de categoría para el AR-78 Bisonte."),
      r("B-21 Raider", "Northrop Grumman B-21 Raider", "Referencia de bombardero estratégico en conversaciones de cooperación de ATLAS."),
      r("SR-71 Blackbird", "Lockheed SR-71 Blackbird", "Referencia de alta velocidad y reconocimiento para el AR-41 Colibrí."),
      r("KC-46 Pegasus", "Boeing KC-46 Pegasus", "Referencia funcional del AR-46 Dragón."),
    ],

    capacidades: [
      c("buques", "Buques de superficie", "Fuerzas navales"),
      c("submarinos", "Submarinos", "Fuerzas navales"),
      c("destructores", "Destructores", "Fuerzas navales"),
      c("portaaviones", "Portaaviones", "Fuerzas navales"),
      c("tanques", "Tanques", "Fuerzas terrestres"),
      c("artilleria", "Artillería", "Fuerzas terrestres"),
    ],

    pfa: {
      autoridad: "Jefe del Estado Mayor Conjunto",
      divisiones: [
        d("operaciones", "Operaciones Especiales", "Respuesta rápida, tácticas especiales y soporte aéreo"),
        d("investigacion", "Investigación", "Investigadores, detectives, criminología y balística. Dirige las causas criminales"),
        d("uate", "UATE", "Unidad de Tácticas y Armas Especiales. Apoyo táctico cuando corresponda"),
        d("asuntos-internos", "Asuntos Internos", "Auditoría y control de conducta interna. No reemplaza a Investigación en causas ordinarias"),
        d("afi", "AFI", "Protección de instalaciones estratégicas y controles de acceso"),
        d("side", "SIDE", "Inteligencia y contrainteligencia"),
      ],
      nota: "Fuerza profesionalizada y unificada en todo el país, con Córdoba fuera de la unificación plena.",
      cargas: "Las unidades de carga se conservan y se renuevan con modelos nuevos. Cantidad no definida.",
    },

    pfaTerrestre: [
      v("charger", "Dodge Charger SRT Hellcat Redeye Jailbreak", 5200),
      v("a250", "Mercedes-Benz A250 AMG Line", 6600),
      v("giulia", "Alfa Romeo Giulia Quadrifoglio", 2860),
      v("m5", "BMW M5 Competition", 3800),
      v("ct5v", "Cadillac CT5-V Blackwing", 500),
      v("mustang", "Ford Mustang", 60),
      v("i8", "BMW i8", 20),
      v("raptor", "Ford Ranger Raptor", 6400),
      v("ram", "RAM 1500", 1800),
      v("tahoe", "Chevrolet Tahoe Z71", 820),
      v("everest", "Ford Everest", 240),
      v("defender", "Land Rover Defender", 220),
      v("f150", "Ford F-150 Tremor", 120),
      v("ktm", "KTM 1290 Super Duke R", 3400),
      v("m1000rr", "BMW M1000RR", 2600),
      v("panigale", "Ducati Panigale V4", 800),
      v("streetfighter", "Ducati Streetfighter V4", 1400),
    ],

    pfaHelicopteros: [
      v("h125", "Airbus H125", 12),
      v("h135", "Airbus H135", 12),
      v("h145", "Airbus H145", 18),
      v("aw139", "Leonardo AW139", 12),
      v("h225", "Airbus H225", 6),
    ],

    atlas: {
      sede: "Ushuaia",
      presupuestoAnual: "US$ 258.000 millones (referencia anual)",
      miembros: [
        m("Argentina", "Sede central en Ushuaia; dirección y producción del AT-1; aporte aeronáutico de FAdeA"),
        m("Estados Unidos", "Capacidades satelitales; cooperación tecnológica; plataforma F-47 considerada para el AT-1"),
        m("Francia", "Cooperación aeronáutica; Rafale como referencia para el AT-1"),
        m("Reino Unido", "Aporte de artillería; cooperación con el programa Eurofighter como referencia aeronáutica"),
        m("Alemania", "Aporte de tanques; cooperación con el programa Eurofighter como referencia aeronáutica"),
        m("Corea del Sur", "Referencia aeronáutica KF-21 Boramae; cooperación industrial y tecnológica"),
        m("Suecia", "Liderazgo de la línea naval; referencia aeronáutica Gripen E"),
        m("Israel", "Aporte de capacidades terrestres; F-35I Adir como referencia de aeronave operada e integración"),
        m("Brasil", "Cooperación económica e industrial; Gripen E/F como referencia de plataforma operada"),
      ],
      enConversaciones: [{ pais: "Japón", nota: "Conversaciones de cooperación. No es miembro hasta que se apruebe formalmente su incorporación." }],
      principios: [
        "Coordina la defensa colectiva ante una agresión externa contra un miembro",
        "No interviene en conflictos internos de sus integrantes; cada miembro decide si permanece neutral",
        "Las decisiones de guerra requieren más del 80% de aprobación de los miembros",
        "Coordina defensa, ejercicios, cooperación tecnológica, investigación y producción industrial",
        "Ushuaia es la sede central y cada país conserva una sede nacional",
      ],
    },

    at1: {
      proposito:
        "Primer avión de combate conjunto de ATLAS. Debe ser una aeronave nueva, con identidad propia: no un Zonda rebautizado ni una suma superficial de partes. La idea aprobada es estudiar las mejores capacidades de las aeronaves de los miembros y crear una plataforma común.",
      direccion: "Sede de ATLAS en Ushuaia",
      estadoPrograma: "Producción iniciada",
      plataformas: [
        { pais: "Argentina", plataforma: "AR-90 Zonda; experiencia con F-16, F/A-18 y F-14" },
        { pais: "Estados Unidos", plataforma: "Boeing F-47" },
        { pais: "Francia", plataforma: "Dassault Rafale" },
        { pais: "Alemania y Reino Unido", plataforma: "Eurofighter Typhoon" },
        { pais: "Suecia", plataforma: "Saab JAS 39 Gripen E" },
        { pais: "Corea del Sur", plataforma: "KAI KF-21 Boramae" },
        { pais: "Israel", plataforma: "F-35I Adir (aeronave operada, no fabricada por Israel)" },
        { pais: "Brasil", plataforma: "Gripen E/F (plataforma operada y cooperación industrial)" },
      ],
      aclaracion:
        "Son referencias conceptuales. No implican que los países hayan transferido componentes, planos ni tecnologías: ninguna transferencia está votada ni aprobada.",
      // Campos que los jugadores pueden decidir con propuestas registradas.
      decisiones: {
        nombreDefinitivo: null,
        faseActual: null,
        produccion: null,
        financiacion: null,
        controlExportaciones: null,
        repartoIndustrial: null,
      },
      // Datos técnicos que la aplicación nunca completa por su cuenta.
      noDefinidos: ["Motor", "Materiales", "Sensores", "Dimensiones", "Alcance", "Armamento", "Cantidades producidas", "Cronograma de pruebas"],
    },
  };
}

export const REGISTRO_INICIAL = [
  {
    id: "inicial-1",
    tipo: "acuerdo",
    titulo: "Reparto de autoridad entre cargos",
    detalle:
      "El Jefe del Estado Mayor Conjunto conduce ATLAS, las Fuerzas Armadas y la PFA. El Presidente conduce economía, política nacional, infraestructura y relaciones exteriores, y autoriza compras militares, aumentos de presupuesto militar y el voto argentino en decisiones de guerra de ATLAS.",
  },
  {
    id: "inicial-2",
    tipo: "acuerdo",
    titulo: "La PFA queda bajo la autoridad del Jefe del Estado Mayor Conjunto",
    detalle: "Los inspectores en jefe de cada división reportan al Jefe del Estado Mayor Conjunto. El Presidente puede pedir coordinación.",
  },
  {
    id: "inicial-3",
    tipo: "acuerdo",
    titulo: "El voto argentino en decisiones de guerra de ATLAS requiere autorización presidencial",
    detalle: "El Jefe del Estado Mayor Conjunto prepara el voto y la recomendación; el Presidente lo autoriza, lo rechaza o lo devuelve.",
  },
];

function p(id, nombre, area, dominio, responsable, estado, presupuesto, obstaculos, notas) {
  return { id, nombre, area, dominio, responsable, estado, presupuesto, avance: null, obstaculos, pendientes: "", notas };
}
function a(id, modelo, cantidad, fabricante, pais, funcion, referencia, tipoReferencia) {
  return { id, modelo, cantidad, fabricante, pais, funcion, referencia, tipoReferencia, nota: "" };
}
function r(modelo, aeronaveReal, descripcion) {
  return { modelo, aeronaveReal, descripcion };
}
function c(id, nombre, rama) {
  return { id, nombre, rama, cantidad: null, nota: "Cantidad no consolidada" };
}
function d(id, nombre, funcion) {
  return { id, nombre, funcion, inspector: null };
}
function v(id, modelo, cantidad) {
  return { id, modelo, cantidad };
}
function m(pais, aporte) {
  return { pais, aporte };
}
