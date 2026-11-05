// Almacén de documentos con versiones. Lo usan el servidor local y los tests.
// Cada documento tiene una versión; un commit falla si alguna versión esperada cambió.

const SEGMENTO = /^[A-Za-z0-9_\-.~:@+]+$/;

export function rutaValida(ruta, tipo) {
  if (typeof ruta !== "string" || ruta.length > 1000) return false;
  const partes = ruta.split("/");
  if (!partes.every((p) => SEGMENTO.test(p) && p !== "." && p !== "..")) return false;
  return tipo === "doc" ? partes.length % 2 === 0 : partes.length % 2 === 1;
}

export class Almacen {
  constructor(inicial = {}) {
    this.docs = new Map(Object.entries(inicial)); // ruta -> {data, version}
    this.oyentes = new Set();
  }

  leer(ruta) {
    const d = this.docs.get(ruta);
    return d ? { data: d.data, version: d.version } : { data: null, version: 0 };
  }

  leerColeccion(ruta) {
    const prefijo = ruta + "/";
    const n = ruta.split("/").length + 1;
    const out = [];
    for (const [r, d] of this.docs) {
      if (r.startsWith(prefijo) && r.split("/").length === n) out.push({ id: r.slice(prefijo.length), data: d.data, version: d.version });
    }
    return out;
  }

  confirmar(esperado, escrituras) {
    for (const [r, v] of Object.entries(esperado || {})) {
      if (this.leer(r).version !== v) return { ok: false, conflicto: r };
    }
    for (const r of Object.keys(escrituras)) if (!rutaValida(r, "doc")) return { ok: false, error: `Ruta inválida: ${r}` };
    for (const [r, data] of Object.entries(escrituras)) {
      const prev = this.leer(r).version;
      this.docs.set(r, { data: JSON.parse(JSON.stringify(data)), version: prev + 1 });
    }
    const rutas = Object.keys(escrituras);
    if (rutas.length) for (const f of this.oyentes) f(rutas);
    return { ok: true };
  }

  escuchar(f) { this.oyentes.add(f); return () => this.oyentes.delete(f); }

  exportar() { return Object.fromEntries(this.docs); }
}

// Backend en memoria con la interfaz común (para tests en Node).
export function crearBackendMemoria(almacen, uid) {
  const copia = (x) => (x === null ? null : JSON.parse(JSON.stringify(x)));
  return {
    tipo: "memoria",
    uid,
    async get(ruta) { return copia(almacen.leer(ruta).data); },
    async transact(rutas, fn) {
      for (let intento = 0; intento < 8; intento++) {
        const datos = {}, esperado = {};
        for (const r of rutas) { const l = almacen.leer(r); datos[r] = copia(l.data); esperado[r] = l.version; }
        const { writes = {}, result } = fn(datos);
        const res = almacen.confirmar(esperado, writes);
        if (res.ok) return result;
        if (res.error) throw new Error(res.error);
      }
      throw new Error("Demasiados conflictos simultáneos; probá de nuevo");
    },
    onDoc(ruta, cb) {
      queueMicrotask(() => cb(copia(almacen.leer(ruta).data)));
      return almacen.escuchar((rutas) => { if (rutas.includes(ruta)) queueMicrotask(() => cb(copia(almacen.leer(ruta).data))); });
    },
    onCol(ruta, cb) {
      const emitir = () => cb(almacen.leerColeccion(ruta).map((d) => ({ ...copia(d.data), id: d.id })));
      queueMicrotask(emitir);
      return almacen.escuchar((rutas) => { if (rutas.some((r) => r.slice(0, r.lastIndexOf("/")) === ruta)) queueMicrotask(emitir); });
    },
  };
}
