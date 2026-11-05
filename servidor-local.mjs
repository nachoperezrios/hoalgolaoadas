// Servidor local de ATLAS: sirve la aplicación y guarda la partida en un archivo JSON.
// Sirve para probar y para jugar en la misma red (Wi-Fi). No requiere dependencias.
//
//   node servidor-local.mjs            -> http://localhost:8080
//   PUERTO=9000 node servidor-local.mjs
//   ARCHIVO=mi-partida.json node servidor-local.mjs

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Almacen, rutaValida } from "./js/backends/almacen.js";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PUERTO || 8080);
const ARCHIVO = path.resolve(process.env.ARCHIVO || path.join(RAIZ, "datos-servidor.json"));

let inicial = {};
try { inicial = JSON.parse(fs.readFileSync(ARCHIVO, "utf8")); } catch {}
const almacen = new Almacen(inicial);

let guardado = null;
almacen.escuchar(() => {
  clearTimeout(guardado);
  guardado = setTimeout(() => fs.writeFile(ARCHIVO, JSON.stringify(almacen.exportar()), () => {}), 200);
});

const clientes = new Set();
almacen.escuchar((rutas) => {
  const msg = `data: ${JSON.stringify({ rutas })}\n\n`;
  for (const res of clientes) res.write(msg);
});

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".md": "text/markdown; charset=utf-8" };

function responder(res, status, cuerpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(cuerpo));
}

function leerCuerpo(req) {
  return new Promise((ok, mal) => {
    let s = "";
    req.on("data", (c) => { s += c; if (s.length > 5e6) { mal(new Error("Cuerpo demasiado grande")); req.destroy(); } });
    req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { mal(e); } });
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/ping") return responder(res, 200, { ok: true });
    if (url.pathname === "/api/doc") {
      const ruta = url.searchParams.get("ruta");
      if (!rutaValida(ruta, "doc")) return responder(res, 400, { error: "Ruta inválida" });
      return responder(res, 200, almacen.leer(ruta));
    }
    if (url.pathname === "/api/col") {
      const ruta = url.searchParams.get("ruta");
      if (!rutaValida(ruta, "col")) return responder(res, 400, { error: "Ruta inválida" });
      return responder(res, 200, almacen.leerColeccion(ruta));
    }
    if (url.pathname === "/api/commit" && req.method === "POST") {
      const { esperado, escrituras } = await leerCuerpo(req);
      const r = almacen.confirmar(esperado, escrituras || {});
      if (r.error) return responder(res, 400, r);
      return responder(res, r.ok ? 200 : 409, r);
    }
    if (url.pathname === "/api/eventos") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write(": conectado\n\n");
      clientes.add(res);
      const latido = setInterval(() => res.write(": latido\n\n"), 25000);
      req.on("close", () => { clearInterval(latido); clientes.delete(res); });
      return;
    }
    // Archivos estáticos
    let archivo = path.normalize(path.join(RAIZ, decodeURIComponent(url.pathname)));
    if (!archivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
    if (url.pathname === "/") archivo = path.join(RAIZ, "index.html");
    if (path.basename(archivo).startsWith("datos-servidor")) { res.writeHead(404); return res.end(); }
    fs.readFile(archivo, (err, buf) => {
      if (err) { res.writeHead(404); return res.end("No encontrado"); }
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(buf);
    });
  } catch (e) {
    responder(res, 500, { error: String(e.message || e) });
  }
});

servidor.listen(PUERTO, "0.0.0.0", () => {
  console.log(`ATLAS: servidor local en http://localhost:${PUERTO}`);
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) if (i.family === "IPv4" && !i.internal) console.log(`  En la misma red: http://${i.address}:${PUERTO}`);
  }
  console.log(`  Datos guardados en ${ARCHIVO}`);
});
