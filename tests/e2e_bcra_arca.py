"""Banco Central, ARCA y Cuentas públicas con dos sesiones independientes."""
import sys
from playwright.sync_api import sync_playwright, expect
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
errores = []
def ok(m): print(f"  ✓ {m}", flush=True)
def sesion(b, n):
    pg = b.new_context(viewport={"width": 1360, "height": 900}, locale="es-AR").new_page()
    pg.on("dialog", lambda d: d.accept()); pg.on("pageerror", lambda e: errores.append(f"[{n}] {e}"))
    pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errores.append(f"[{n}] {m.text}"))
    return pg
def ir(pg, h): pg.evaluate(f"location.hash = '#{h}'")
with sync_playwright() as p:
    b = p.chromium.launch(); jemc, pres = sesion(b, "JEMC"), sesion(b, "PRES")
    jemc.goto(URL); jemc.click('[data-form="crear"] [type="submit"]')
    codigo = jemc.locator(".codigo").inner_text().strip(); jemc.click('[data-accion="entrar-nueva"]')
    pres.goto(f"{URL}/?p={codigo}"); pres.click('[data-form="unirse"] [type="submit"]')
    expect(pres.locator(".cabecera")).to_contain_text("Presidente de la Nación")
    nav = jemc.locator(".nav").inner_text()
    for t in ["Cuentas públicas", "Banco Central", "ARCA"]: assert t in nav, t
    # Banco Central: carga inicial del Jefe, cambio posterior al Presidente
    ir(jemc, "bcra"); expect(jemc.locator(".encabezado-inst svg")).to_be_visible()
    jemc.click('[data-ruta="bcra.dolar"]'); jemc.fill('#ventana [name="valor"]', "1450")
    expect(jemc.locator("#ventana [data-aviso-generico]")).to_contain_text("dentro de tus facultades")
    jemc.click('#ventana [type="submit"]')
    ir(pres, "bcra"); expect(pres.locator("tr", has_text="Cotización del dólar")).to_contain_text("1.450", timeout=10000)
    jemc.click('[data-ruta="bcra.dolar"]'); jemc.fill('#ventana [name="valor"]', "1600")
    expect(jemc.locator("#ventana [data-aviso-generico]")).to_contain_text("Le corresponde al Presidente")
    jemc.click('#ventana [data-accion="cerrar-ventana"]')
    ok("Banco Central: el Jefe cargó el dólar inicial; un cambio posterior ya le corresponde al Presidente")
    # ARCA: carga inicial, reforma por ley, Congreso
    ir(jemc, "arca"); jemc.click('[data-ruta="arca.alicuotas.iva"]'); jemc.fill('#ventana [name="valor"]', "21"); jemc.click('#ventana [type="submit"]')
    ir(pres, "arca"); expect(pres.locator("tr", has_text="IVA")).to_contain_text("21%", timeout=10000)
    expect(pres.locator("tr", has_text="IVA")).to_contain_text("Se cambia por ley")
    pres.click('[data-accion="reforma-tributaria"]'); pres.fill('#ventana [name="iva"]', "19"); pres.click('#ventana [type="submit"]')
    ir(pres, "gobierno"); pres.click('.subtabs [data-valor="congreso"]')
    fila = pres.locator("tr", has_text="Reforma tributaria")
    fila.locator('[data-accion="votar-ley"]').click(timeout=10000); expect(fila).to_contain_text("Media sanción", timeout=10000)
    fila.locator('[data-accion="votar-ley"]').click(); expect(fila).to_contain_text("Sancionada", timeout=10000)
    expect(jemc.locator("tr", has_text="IVA")).to_contain_text("19%", timeout=10000)
    ok("ARCA: IVA cargado por el Jefe; la reforma pasó por el Congreso y ahora rige el 19%")
    # Cuentas públicas
    ir(pres, "cuentas"); expect(pres.locator("main")).to_contain_text("Ingreso por mes")
    pres.click('[data-accion="indicador"][data-clave="recaudacion"]'); pres.fill('#ventana [name="valor"]', "120000"); pres.click('#ventana [type="submit"]')
    expect(pres.locator(".panel", has_text="Ingreso por mes")).to_contain_text("US$ 10.000 M", timeout=10000)
    ok("Cuentas públicas: ingreso mensual calculado desde la recaudación")
    for v in ["bcra", "arca", "cuentas"]:
        ir(pres, v); pres.wait_for_timeout(300); pres.screenshot(path=f"/tmp/atlas-capturas/v3-{v}.png", full_page=True)
    b.close()
if errores: print("Errores:", *errores, sep="\n  "); sys.exit(1)
print("Todo OK: Banco Central, ARCA y Cuentas públicas sincronizados.")
