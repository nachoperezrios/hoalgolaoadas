"""Prueba de punta a punta de la versión 2 con dos sesiones independientes:
PFA, SIDE y AFI con escudos y generador, FAdeA, AT-1 en ATLAS, Gobierno,
opinión pública y decretos. Verifica que todo llegue al otro sin recargar.

Uso: python3 tests/e2e_v2.py [url]
"""
import os, sys, base64
from playwright.sync_api import sync_playwright, expect

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
CAP = "/tmp/atlas-capturas"
os.makedirs(CAP, exist_ok=True)
errores = []

def ok(m): print(f"  ✓ {m}", flush=True)

def sesion(b, nombre, **kw):
    ctx = b.new_context(viewport={"width": 1360, "height": 900}, locale="es-AR", **kw)
    pg = ctx.new_page()
    pg.on("dialog", lambda d: d.accept())
    pg.on("pageerror", lambda e: errores.append(f"[{nombre}] {e}"))
    pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errores.append(f"[{nombre}] {m.text}"))
    return pg

def ir(pg, hash_, sub=None):
    pg.evaluate(f"location.hash = '#{hash_}'")
    if sub:
        pg.click(f'.subtabs [data-valor="{sub}"]')

def enviar(pg):
    pg.click('#ventana [type="submit"]')

def decidir_primera(pg, texto):
    ir(pg, "despacho")
    pg.locator(".item-bandeja", has_text=texto).locator('[data-accion="ver-propuesta"]').first.click(timeout=10000)
    pg.click('#ventana [data-que="aprobar"]')
    expect(pg.locator("#ventana")).to_contain_text("Aprobada")
    pg.click('#ventana [data-accion="cerrar-ventana"]')

with sync_playwright() as p:
    b = p.chromium.launch()
    jemc, pres = sesion(b, "JEMC"), sesion(b, "PRES")
    jemc.goto(URL)
    jemc.click('[data-form="crear"] [type="submit"]')
    codigo = jemc.locator(".codigo").inner_text().strip()
    jemc.click('[data-accion="entrar-nueva"]')
    pres.goto(f"{URL}/?p={codigo}")
    pres.click('[data-form="unirse"] [type="submit"]')
    expect(pres.locator(".cabecera")).to_contain_text("Presidente de la Nación")
    jemc.evaluate("window.__x='ok'"); pres.evaluate("window.__x='ok'")

    # Navegación nueva
    nav = jemc.locator(".nav").inner_text()
    for t in ["FAdeA", "ATLAS y AT-1", "PFA", "SIDE", "AFI", "Gobierno"]:
        assert t in nav, t
    assert "AT-1\n" not in nav.replace("ATLAS y AT-1", "")
    ok("navegación: FAdeA reemplaza a AT-1; PFA, SIDE, AFI y Gobierno agregados")

    # PFA: escudo, 6 departamentos y generador (3.000)
    ir(jemc, "pfa")
    expect(jemc.locator(".encabezado-inst svg")).to_be_visible()
    ir(jemc, "pfa", "departamentos")
    for d in ["Unidad de Tácticas y Armas Especiales", "Departamento de Investigación", "Departamento de Criminología", "Departamento de Respuesta Rápida", "Departamento de Cibercrimen", "Departamento de Asuntos Internos"]:
        expect(jemc.locator("table")).to_contain_text(d)
    ir(jemc, "pfa", "personal")
    jemc.click('[data-accion="generar-plantel"]')
    jemc.select_option('#ventana [name="unidad"]', "__todos")
    enviar(jemc)
    expect(jemc.locator(".panel").first).to_contain_text("3.000 activos", timeout=20000)
    ir(pres, "pfa")
    expect(pres.locator(".panel").first).to_contain_text("3.000 activos", timeout=15000)
    assert pres.locator('[data-accion="generar-plantel"]').count() == 0
    fila = jemc.locator(".panel.tabla-envoltura tbody tr").first
    expect(fila).to_contain_text("Jefe de Departamento interino")
    ok("PFA: 6 departamentos, 3.000 agentes generados con jefes interinos; el Presidente los ve en vivo")

    # Decreto: confirmar jefatura plena
    nombre_jefe = fila.locator("td").first.inner_text().strip()
    fila.locator('[data-accion="policia-editar"]').click()
    jemc.fill('#ventana [name="funcion"]', "Jefe de Departamento")
    expect(jemc.locator("#ventana [data-aviso-policia]")).to_contain_text("decreto presidencial")
    enviar(jemc)
    decidir_primera(pres, "Cambio de función")
    ir(jemc, "pfa", "departamentos")
    expect(jemc.locator("table")).to_contain_text(nombre_jefe, timeout=10000)
    ok("decreto: la jefatura plena la firma el Presidente y se refleja en Departamentos")

    # SIDE: plantel 400, expediente y misión
    ir(jemc, "side", "personal")
    jemc.click('[data-accion="generar-plantel"]')
    enviar(jemc)
    expect(jemc.locator(".panel").first).to_contain_text("400 activos", timeout=15000)
    ir(jemc, "side", "expedientes")
    jemc.click('[data-accion="doc"][data-esq="expediente"]')
    jemc.fill('#ventana [name="titulo"]', "Expediente Cóndor Austral")
    jemc.select_option('#ventana [name="clasificacion"]', "Estrictamente secreto")
    enviar(jemc)
    ir(jemc, "side", "misiones")
    jemc.click('[data-accion="doc"][data-esq="mision"]')
    jemc.fill('#ventana [name="titulo"]', "Operación Niebla")
    jemc.select_option('#ventana [name="estado"]', "En curso")
    enviar(jemc)
    ir(pres, "side", "expedientes")
    expect(pres.locator(".panel")).to_contain_text("Expediente Cóndor Austral", timeout=10000)
    ok("SIDE: 400 agentes, expediente clasificado y misión en curso visibles para el Presidente")

    # AFI: plantel 800 y escudo propio subido
    ir(jemc, "afi", "personal")
    jemc.click('[data-accion="generar-plantel"]')
    enviar(jemc)
    expect(jemc.locator(".panel").first).to_contain_text("800 activos", timeout=15000)
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4APMI1KYgIAN30BDu3QxgUAAAAASUVORK5CYII=")
    open("/tmp/escudo.png", "wb").write(png)
    jemc.set_input_files('input[data-escudo="afi"]', "/tmp/escudo.png")
    expect(jemc.locator(".encabezado-inst img")).to_be_visible(timeout=10000)
    ir(pres, "afi")
    expect(pres.locator(".encabezado-inst img")).to_be_visible(timeout=10000)
    ok("AFI: 800 agentes y escudo propio que el Presidente ve sin recargar")

    # FAdeA: orden (autoriza el Presidente) y entrega que suma al inventario
    ir(jemc, "fadea", "produccion")
    jemc.click('[data-accion="doc"][data-esq="orden"]')
    jemc.select_option('#ventana [name="modelo"]', "bisonte")
    jemc.fill('#ventana [name="cantidad"]', "40")
    expect(jemc.locator("#ventana [data-aviso-generico]")).to_contain_text("Presidente")
    enviar(jemc)
    decidir_primera(pres, "Orden de producción")
    ir(jemc, "fadea", "produccion")
    jemc.locator('tr[data-esq="orden"]').first.click(timeout=10000)
    jemc.fill('#ventana [name="entregadas"]', "15")
    expect(jemc.locator("#ventana [data-aviso-generico]")).to_contain_text("dentro de tus facultades")
    enviar(jemc)
    ir(pres, "inventarios")
    expect(pres.locator('tr[data-id="bisonte"]')).to_contain_text("215", timeout=10000)
    ok("FAdeA: orden autorizada por el Presidente; 15 entregas suman al inventario (200 → 215)")

    # FAdeA: ficha técnica, filtración que trasciende y opinión pública
    ir(pres, "gobierno", "opinion")
    pres.click('[data-accion="dato"][data-ruta="gobierno.opinionPublica.aprobacion"]')
    pres.fill('#ventana [name="valor"]', "52")
    enviar(pres)
    ir(jemc, "fadea", "modelos")
    jemc.click('tr[data-accion="ver-modelo"][data-id="zonda"]')
    jemc.click('#ventana [data-ruta="fichas.zonda.motor"]')
    jemc.fill('#ventana [name="valor"]', "Turbofán de diseño propio de FAdeA")
    enviar(jemc)
    ir(jemc, "fadea", "filtraciones")
    jemc.click('[data-accion="doc"][data-esq="filtracion"]')
    jemc.fill('#ventana [name="titulo"]', "Planos del Zonda en un foro")
    jemc.select_option('#ventana [name="gravedad"]', "Alta")
    jemc.select_option('#ventana [name="trascendio"]', "Sí")
    enviar(jemc)
    expect(pres.locator(".codigo")).to_contain_text("47%", timeout=10000)
    expect(pres.locator(".panel", has_text="Historial")).to_contain_text("Filtración: Planos del Zonda")
    ok("opinión pública: 52% cargado por el Presidente; la filtración que trascendió la bajó a 47%")

    # AT-1 en ATLAS con ficha cargable
    ir(jemc, "atlas", "at1")
    jemc.click('[data-ruta="at1.ficha.motor"]')
    jemc.fill('#ventana [name="valor"]', "Desarrollo conjunto en Ushuaia")
    enviar(jemc)
    ir(pres, "atlas", "at1")
    expect(pres.locator(".panel", has_text="Ficha técnica")).to_contain_text("Desarrollo conjunto en Ushuaia", timeout=10000)
    ok("AT-1 dentro de ATLAS, con ficha técnica cargable y sincronizada")

    # Gobierno: nombramiento con nombre generado y pedido del JEMC
    ir(pres, "gobierno", "gabinete")
    pres.locator("tr", has_text="Ministerio de Defensa").locator('[data-accion="item"]').last.click()
    pres.click('#ventana [data-accion="generar-nombre"]')
    nombre_min = pres.input_value('#ventana [name="titular"]')
    assert len(nombre_min.split()) >= 2
    pres.select_option('#ventana [name="estado"]', "En funciones")
    enviar(pres)
    ir(jemc, "gobierno", "gabinete")
    expect(jemc.locator("tr", has_text="Ministerio de Defensa")).to_contain_text(nombre_min, timeout=10000)
    ir(jemc, "gobierno", "provincias")
    jemc.locator("tr", has_text="Córdoba").locator('[data-accion="item"]').last.click()
    jemc.select_option('#ventana [name="alineamiento"]', "Aliado")
    expect(jemc.locator("#ventana [data-aviso-generico]")).to_contain_text("dentro de tus facultades")
    enviar(jemc)
    ir(pres, "gobierno", "provincias")
    expect(pres.locator("tr", has_text="Córdoba")).to_contain_text("Aliado", timeout=10000)
    jemc.locator("tr", has_text="Córdoba").locator('[data-accion="item"]').last.click()
    jemc.select_option('#ventana [name="alineamiento"]', "Opositor")
    expect(jemc.locator("#ventana [data-aviso-generico]")).to_contain_text("Le corresponde al Presidente")
    jemc.click('#ventana [data-accion="cerrar-ventana"]')
    ok(f"Gobierno: el Presidente nombró a {nombre_min}; el Jefe cargó el dato vacío de Córdoba y un cambio posterior ya es del Presidente")

    # Nada sin poder cargarse en las vistas principales
    for v in ["situacion", "fadea", "pfa", "gobierno"]:
        ir(jemc, v)
        jemc.wait_for_timeout(200)
    ir(jemc, "situacion")
    txt = jemc.locator("main").inner_text()
    assert "No definido" not in txt
    ok("situación nacional sin textos de «no definido» fijos")

    # Capturas
    for v, sub, nombre in [("pfa", "personal", "pfa"), ("side", "expedientes", "side"), ("afi", "personal", "afi"), ("fadea", "resumen", "fadea"), ("fadea", "modelos", "fadea-modelos"), ("gobierno", "opinion", "gobierno"), ("atlas", "at1", "atlas-at1")]:
        ir(jemc, v, sub); jemc.wait_for_timeout(250)
        jemc.screenshot(path=f"{CAP}/v2-{nombre}.png", full_page=True)
    ir(pres, "gobierno", "congreso"); pres.wait_for_timeout(250)
    pres.screenshot(path=f"{CAP}/v2-congreso.png", full_page=True)
    m = sesion(b, "MOVIL", color_scheme="dark")
    m.set_viewport_size({"width": 390, "height": 844})
    m.goto(f"{URL}/?p={codigo}")
    m.wait_for_timeout(600)
    m.screenshot(path=f"{CAP}/v2-movil-inicio.png")

    assert jemc.evaluate("window.__x") == "ok" and pres.evaluate("window.__x") == "ok", "hubo recarga"
    b.close()

if errores:
    print("Errores:", *errores, sep="\n  "); sys.exit(1)
print("Todo OK: funciones de la versión 2 sincronizadas entre las dos sesiones sin recargar.")
