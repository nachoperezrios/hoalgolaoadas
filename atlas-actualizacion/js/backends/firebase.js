// Backend online con Firebase: Firestore para el estado compartido y login
// anónimo para identificar cada dispositivo. Los cambios llegan en vivo con onSnapshot.

const VERSION_SDK = "10.12.2";
const cdn = (m) => `https://www.gstatic.com/firebasejs/${VERSION_SDK}/${m}.js`;

export async function crearBackendFirebase(config) {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(cdn("firebase-app")),
    import(cdn("firebase-auth")),
    import(cdn("firebase-firestore")),
  ]);

  const app = initializeApp(config);
  const db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true });
  const autenticacion = auth.getAuth(app);
  if (!autenticacion.currentUser) await auth.signInAnonymously(autenticacion);
  const uid = autenticacion.currentUser.uid;

  return {
    tipo: "firebase",
    uid,
    async get(ruta) {
      const s = await fs.getDoc(fs.doc(db, ruta));
      return s.exists() ? s.data() : null;
    },
    // Transacción de Firestore: lee todo primero y después escribe. Si otro
    // jugador cambió algo en el medio, Firestore la reintenta sola.
    async transact(rutas, fn) {
      return fs.runTransaction(db, async (tx) => {
        const datos = {};
        for (const r of rutas) {
          const s = await tx.get(fs.doc(db, r));
          datos[r] = s.exists() ? s.data() : null;
        }
        const { writes = {}, result } = fn(datos);
        for (const [r, d] of Object.entries(writes)) tx.set(fs.doc(db, r), d);
        return result;
      });
    },
    onDoc(ruta, cb, onError) {
      return fs.onSnapshot(fs.doc(db, ruta), (s) => cb(s.exists() ? s.data() : null), onError);
    },
    onCol(ruta, cb, onError) {
      return fs.onSnapshot(fs.collection(db, ruta), (q) => cb(q.docs.map((d) => ({ ...d.data(), id: d.id }))), onError);
    },
  };
}
