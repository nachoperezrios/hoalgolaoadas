// Backend que habla con servidor-local.mjs. Los cambios llegan en vivo por
// Server-Sent Events, sin recargar la página.

export async function crearBackendServidor(base = "") {
  let uid;
  try { uid = localStorage.getItem("atlas.uid"); } catch {}
  if (!uid) {
    uid = "u-" + crypto.getRandomValues(new Uint32Array(2)).join("");
    try { localStorage.setItem("atlas.uid", uid); } catch {}
  }

  const json = async (url, opciones) => {
    const r = await fetch(base + url, opciones);
    if (!r.ok && r.status !== 409) throw new Error(`Error del servidor (${r.status})`);
    return { status: r.status, cuerpo: await r.json() };
  };

  const suscripciones = new Set(); // {tipo, ruta, refrescar}
  let fuente = null;
  let estadoConexion = () => {};

  function abrirEventos() {
    fuente = new EventSource(base + "/api/eventos");
    fuente.onmessage = (ev) => {
      const { rutas } = JSON.parse(ev.data);
      for (const s of suscripciones) {
        const afectada = s.tipo === "doc"
          ? rutas.includes(s.ruta)
          : rutas.some((r) => r.slice(0, r.lastIndexOf("/")) === s.ruta);
        if (afectada) s.refrescar();
      }
    };
    fuente.onopen = () => { estadoConexion("conectado"); for (const s of suscripciones) s.refrescar(); };
    fuente.onerror = () => estadoConexion("reconectando");
  }

  function suscribir(tipo, ruta, cb, onError) {
    let pendiente = false;
    const s = {
      tipo, ruta,
      refrescar: () => {
        if (pendiente) return;
        pendiente = true;
        queueMicrotask(async () => {
          pendiente = false;
          try {
            if (tipo === "doc") cb((await json(`/api/doc?ruta=${encodeURIComponent(ruta)}`)).cuerpo.data);
            else cb((await json(`/api/col?ruta=${encodeURIComponent(ruta)}`)).cuerpo.map((d) => ({ ...d.data, id: d.id })));
          } catch (e) { onError && onError(e); }
        });
      },
    };
    suscripciones.add(s);
    if (!fuente) abrirEventos();
    s.refrescar();
    return () => suscripciones.delete(s);
  }

  return {
    tipo: "servidor",
    uid,
    alCambiarConexion(f) { estadoConexion = f; },
    async get(ruta) { return (await json(`/api/doc?ruta=${encodeURIComponent(ruta)}`)).cuerpo.data; },
    async transact(rutas, fn) {
      for (let intento = 0; intento < 8; intento++) {
        const leidos = await Promise.all(rutas.map((r) => json(`/api/doc?ruta=${encodeURIComponent(r)}`)));
        const datos = {}, esperado = {};
        rutas.forEach((r, i) => { datos[r] = leidos[i].cuerpo.data; esperado[r] = leidos[i].cuerpo.version; });
        const { writes = {}, result } = fn(datos);
        const res = await json("/api/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ esperado, escrituras: writes }) });
        if (res.status === 200) return result;
        await new Promise((ok) => setTimeout(ok, 50 + Math.random() * 200));
      }
      throw new Error("Demasiados cambios simultáneos; probá de nuevo");
    },
    onDoc: (ruta, cb, onError) => suscribir("doc", ruta, cb, onError),
    onCol: (ruta, cb, onError) => suscribir("col", ruta, cb, onError),
  };
}
