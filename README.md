# ATLAS

Juego narrativo y de estrategia para dos jugadores, ambientado en una historia alternativa completamente ficticia. Un jugador es el **Jefe del Estado Mayor Conjunto** y el otro, el **Presidente de la Nación**. Ninguna institución, cifra ni capacidad del juego es real.

La partida arranca el **8 de diciembre de 2029** con el estado acordado: gobierno Libertad y Progreso, ATLAS con nueve miembros y sede en Ushuaia, inventarios de la Fuerza Aérea y la PFA, proyectos civiles e industriales y la ficha del AT-1.

## Cómo se juega

Los dos juegan al mismo tiempo, cada uno desde su despacho. Cada medida pasa por una propuesta: si está dentro de tus facultades se aplica al instante; si le corresponde al otro cargo, le llega a su bandeja y queda en revisión hasta que la apruebe, la rechace o la devuelva para cambios.

| Área | Decide |
|---|---|
| ATLAS: programas, ejercicios, AT-1 y cooperación | Jefe del Estado Mayor (el Presidente puede objetar) |
| ATLAS: voto argentino en decisiones de guerra | Presidente, a pedido del Jefe del Estado Mayor |
| Fuerzas Armadas: organización, alistamiento e inventario | Jefe del Estado Mayor |
| Policía Federal Argentina | Jefe del Estado Mayor |
| Compras, presupuesto militar y programas de FAdeA | Presidente |
| Economía, política nacional, infraestructura, exteriores | Presidente |

Cómo se afectan entre ustedes:

- Sumar aviones a un modelo con cantidad conocida es una compra: la autoriza el Presidente.
- Un compromiso de ATLAS con costo queda aprobado, pero no se aplica hasta que el Presidente lo financie. Si lo rechaza, queda bloqueado por falta de fondos.
- El Presidente puede pausar cualquier programa por presupuesto, incluidos los militares.
- Las decisiones de guerra de ATLAS necesitan más del 80% de los nueve miembros (8 de 9). El voto argentino lo prepara el Jefe del Estado Mayor y lo autoriza el Presidente; si lo rechaza, elige el voto alternativo.
- Las anulaciones las pide uno y las aprueba el otro. La medida original se conserva marcada como anulada.

## Opción A: jugar online (GitHub Pages + Firebase)

Es la opción para jugar desde dos dispositivos en lugares distintos. Las dos cuentas son gratuitas y no necesitan tarjeta.

### 1. Crear el proyecto de Firebase

1. Entrá a <https://console.firebase.google.com> y creá un proyecto (por ejemplo, `atlas-partida`). Podés desactivar Google Analytics.
2. En **Compilación → Authentication → Comenzar → Método de acceso**, habilitá **Anónimo** y guardá.
3. En **Compilación → Firestore Database → Crear base de datos**, elegí **modo producción** y la ubicación `southamerica-east1 (São Paulo)`, que es la más cercana.
4. En Firestore, abrí la pestaña **Reglas**, reemplazá todo por el contenido del archivo `firestore.rules` de este repositorio y tocá **Publicar**.
5. En **Configuración del proyecto** (el engranaje) → **Tus apps**, tocá el ícono web `</>`, poné un apodo y registrá la app (no hace falta Hosting). Copiá el objeto `firebaseConfig` que aparece.

### 2. Pegar la configuración

Abrí `js/config.js` y reemplazá `export const FIREBASE_CONFIG = null;` por tu objeto, por ejemplo:

```js
export const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "atlas-partida.firebaseapp.com",
  projectId: "atlas-partida",
  storageBucket: "atlas-partida.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
```

Estos valores no son secretos: Firebase los pensó para ir en páginas públicas. La protección está en las reglas de Firestore.

### 3. Publicar en GitHub Pages

1. Creá un repositorio en GitHub (por ejemplo, `atlas`) y subí todos los archivos de esta carpeta, incluido `js/config.js` ya completado.
2. En el repositorio: **Settings → Pages → Build and deployment**, elegí **Deploy from a branch**, rama `main`, carpeta `/ (root)` y guardá.
3. Después de uno o dos minutos, el sitio queda en `https://TU-USUARIO.github.io/atlas/`.
4. En Firebase, **Authentication → Configuración → Dominios autorizados**, agregá `TU-USUARIO.github.io`.

### 4. Empezar la partida

1. Abrí el sitio, elegí **Jefe del Estado Mayor Conjunto** y creá la partida.
2. Pasale a tu amigo el enlace que aparece (o el código). Él entra, elige **Presidente de la Nación** y listo.
3. Cada uno recibe un **PIN de cargo**: sirve para recuperar el cargo desde otro navegador o dispositivo.

### 5. Comprobar la sincronización online

Hacé esta prueba una vez al configurar, con dos dispositivos (o dos navegadores distintos):

1. En uno, entrá como Jefe del Estado Mayor; en el otro, como Presidente.
2. Desde Inventarios, el Jefe del Estado Mayor sube la cantidad de AR-90 Zonda. En el despacho del Presidente tiene que aparecer un aviso y el pedido en la bandeja, sin recargar.
3. El Presidente lo aprueba. En la pantalla del Jefe del Estado Mayor, la cantidad tiene que cambiar sola.
4. Arriba a la derecha tiene que decir **Sincronizado online**.

Si algo falla, abrí la consola del navegador (F12): un error `permission-denied` indica reglas sin publicar; `auth/operation-not-allowed`, login anónimo sin habilitar; `auth/unauthorized-domain`, dominio sin autorizar.

## Opción B: servidor local (misma computadora o misma red Wi-Fi)

Necesita Node.js 18 o superior y no requiere instalar dependencias.

```bash
node servidor-local.mjs
```

Abrí la dirección que muestra (por defecto `http://localhost:8080`). También muestra la dirección para otros dispositivos conectados a la misma red, por ejemplo `http://192.168.0.15:8080`. La partida se guarda en `datos-servidor.json`. Si la computadora se apaga, nadie puede jugar hasta que vuelvas a levantar el servidor. Para jugar desde redes distintas, usá la opción A.

Cuando la app corre desde este servidor, lo usa automáticamente aunque `js/config.js` tenga Firebase configurado. Para forzar Firebase, agregá `?backend=firebase` a la dirección.

## Pruebas

```bash
node --test tests/juego.test.mjs     # 20 pruebas de reglas y flujo entre los dos cargos
node servidor-local.mjs &            # en otra terminal
python3 tests/e2e_dos_sesiones.py    # dos navegadores separados juegan la misma partida (requiere Playwright)
```

La prueba de punta a punta abre dos sesiones de navegador independientes contra el servidor local y verifica, sin recargar ninguna página, que cada acción de un cargo aparece en el otro: ingreso a la partida, pedido de compra, aprobación, votos de ATLAS, autorización del voto argentino, cierre de la votación, intervenciones en asuntos e informes.

## Estructura

```
index.html                  Página única
css/estilos.css             Estilos (claro, oscuro, móvil, impresión)
js/app.js                   Interfaz: pantallas, vistas, ventanas y formularios
js/juego.js                 Acciones de la partida y flujo de autorizaciones
js/reglas.js                Reglas puras: autoridad, efectos, votaciones
js/informes.js              Informes nacionales sin datos inventados
js/datos-iniciales.js       Estado inicial del 8 de diciembre de 2029
js/config.js                Configuración de Firebase (la completás vos)
js/backends/firebase.js     Backend online (Firestore + login anónimo)
js/backends/servidor.js     Cliente del servidor local
js/backends/almacen.js      Almacén con versiones (servidor local y pruebas)
servidor-local.mjs          Servidor local sin dependencias
firestore.rules             Reglas de seguridad para Firestore
tests/                      Pruebas de lógica y de punta a punta
```

## Límites conocidos

- **Seguridad pensada para dos amigos, no para desconocidos.** Cualquiera con el código de invitación puede entrar y jugar. El PIN evita que alguien tome un cargo ocupado desde la interfaz, pero no está protegido en el servidor: quien tenga el código y conocimientos técnicos podría leerlo. No publiques el código.
- **Los informes salen de plantillas**, con los datos asentados. No hay narración con IA.
- **Límites gratuitos de Firebase** (plan Spark): 50.000 lecturas y 20.000 escrituras por día, de sobra para dos jugadores.
- **Sin conexión**, la app no guarda cambios: hay que estar en línea para jugar.
- Las tipografías se cargan desde Google Fonts; sin internet se usan las del sistema.
