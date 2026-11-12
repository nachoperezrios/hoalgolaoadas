"""Agregar modelos al inventario de la Fuerza Aérea con dos sesiones independientes."""
import sys
from playwright.sync_api import sync_playwright, expect
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
errores = []
def sesion(b, n):
    pg = b.new_context(viewport={"width": 1360, "height": 900}, locale="es-AR").new_page()
    pg.on("dialog", lambda d: d.accept()); pg.on("pageerror", lambda e: errores.append(f"[{n}] {e}"))
    pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errores.append(f"[{n}] {m.text}"))
    return pg
with sync_playwright() as p:
    b = p.chromium.launch(); jemc, pres = sesion(b, "JEMC"), sesion(b, "PRES")
    jemc.goto(URL); jemc.click('[data-form="crear"] [type="submit"]')
    codigo = jemc.locator(".codigo").inner_text().strip(); jemc.click('[data-accion="entrar-nueva"]')
    pres.goto(f"{URL}/?p={codigo}"); pres.click('[data-form="unirse"] [type="submit"]')
    expect(pres.locator(".cabecera")).to_contain_text("Presidente de la Nación")
    def agregar(modelo, cantidad, fabricante, pais, funcion):
        jemc.evaluate("location.hash='#inventarios'"); jemc.click('[data-accion="agregar-modelo"]')
        jemc.fill('#ventana [name="modelo"]', modelo); jemc.fill('#ventana [name="cantidad"]', cantidad)
        jemc.fill('#ventana [name="fabricante"]', fabricante); jemc.fill('#ventana [name="pais"]', pais); jemc.fill('#ventana [name="funcion"]', funcion)
        expect(jemc.locator("#ventana [data-aviso-generico]")).to_contain_text("dentro de tus facultades")
        jemc.click('#ventana [type="submit"]'); expect(jemc.locator("#ventana[open]")).to_have_count(0)
    agregar("Rafale F4", "24", "Dassault", "Francia", "Caza polivalente")
    agregar("AR-99 Pampero", "10", "FAdeA", "Argentina", "Entrenador avanzado")
    pres.evaluate("location.hash='#inventarios'")
    expect(pres.locator("tbody")).to_contain_text("Rafale F4", timeout=10000)
    expect(pres.locator("tr", has_text="AR-99 Pampero")).to_contain_text("10")
    pres.evaluate("location.hash='#fadea'"); pres.click('.subtabs [data-valor="modelos"]')
    expect(pres.locator("tbody")).to_contain_text("AR-99 Pampero")
    print("  ✓ el Jefe agregó Rafale F4 (Dassault) y AR-99 Pampero (FAdeA); el Presidente los ve, y el de FAdeA aparece en FAdeA")
    jemc.evaluate("location.hash='#inventarios'"); jemc.wait_for_timeout(300)
    jemc.screenshot(path="/tmp/atlas-capturas/modelos.png", full_page=True)
    b.close()
if errores: print("Errores:", *errores, sep="\n  "); sys.exit(1)
print("Todo OK")
