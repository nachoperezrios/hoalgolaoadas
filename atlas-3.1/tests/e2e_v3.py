"""Prueba de punta a punta de la versión 3 con dos sesiones independientes:
economía, presupuesto por el Congreso, obras, auditorías, ceremonias, comunicación,
turno mensual y mapa de provincias.

Uso: python3 tests/e2e_v3.py [url]
"""
import os, sys
from playwright.sync_api import sync_playwright, expect

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
CAP = "/tmp/atlas-capturas"
os.makedirs(CAP, exist_ok=True)
errores = []

def ok(m): print(f"  ✓ {m}", flush=True)

def sesion(b, nombre):
    pg = b.new_context(viewport={"width": 1360, "height": 900}, locale="es-AR").new_page()
    pg.on("dialog", lambda d: d.accept())
    pg.on("pageerror", lambda e: errores.append(f"[{nombre}] {e}"))
    pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errores.append(f"[{nombre}] {m.text}"))
    return pg

def ir(pg, h, sub=None):
    pg.evaluate(f"location.hash = '#{h}'")
    if sub: pg.click(f'.subtabs [data-valor="{sub}"]')

def enviar(pg): pg.click('#ventana [type="submit"]')

def cerrar(pg):
    if pg.locator("#ventana[open]").count(): pg.click('#ventana [data-accion="cerrar-ventana"]')

with sync_playwright() as p:
    b = p.chromium.launch()
    jemc, pres = sesion(b, "JEMC"), sesion(b, "PRES")
    jemc.goto(URL); jemc.click('[data-form="crear"] [type="submit"]')
    codigo = jemc.locator(".codigo").inner_text().strip()
    jemc.click('[data-accion="entrar-nueva"]')
    pres.goto(f"{URL}/?p={codigo}"); pres.click('[data-form="unirse"] [type="submit"]')
    expect(pres.locator(".cabecera")).to_contain_text("Presidente de la Nación")
    jemc.evaluate("window.__x='ok'"); pres.evaluate("window.__x='ok'")

    nav = pres.locator(".nav").inner_text()
    for t in ["Compartido", "Presidente", "Jefe del Estado Mayor", "Economía", "Obras", "Gobierno"]:
        assert t in nav, t
    assert "Crisis" not in nav and "Diario" not in nav
    ok("navegación agrupada por cargo, sin Crisis ni Diario")

    # Gabinete y Congreso generados
    ir(pres, "gobierno", "gabinete")
    expect(pres.locator("tr", has_text="Secretaría General de la Presidencia")).to_contain_text("Anastacio Montiel")
    titulares = pres.locator("main tbody tr td:nth-child(2)").all_inner_texts()
    assert titulares and all(t.strip() and "Cargar" not in t for t in titulares), "hay cargos sin titular"
    ir(pres, "gobierno", "congreso")
    expect(pres.locator(".panel").first).to_contain_text("257 bancas")
    expect(pres.locator(".panel").first).to_contain_text("135 bancas propias: mayoría propia")
    expect(pres.locator(".panel", has_text="Legisladores")).to_contain_text("257 legisladores")
    ok("gabinete completo con Anastacio Montiel; Congreso con 257 diputados y mayoría propia")

    # Indicadores iniciales cargados por el Presidente
    ir(pres, "economia", "indicadores")
    valores = {"inflacion": "30", "crecimiento": "2", "desempleo": "7", "pobreza": "30", "riesgoPais": "800", "recaudacion": "150000"}
    for k, v in valores.items():
        pres.click(f'[data-accion="indicador"][data-clave="{k}"]')
        pres.fill('#ventana [name="valor"]', v); enviar(pres)
        expect(pres.locator("#ventana[open]")).to_have_count(0)
    pres.click('[data-accion="dato"][data-ruta="gobierno.opinionPublica.aprobacion"]')
    pres.fill('#ventana [name="valor"]', "50"); enviar(pres)
    ir(pres, "bcra"); pres.click('[data-accion="indicador"][data-clave="reservas"]')
    pres.fill('#ventana [name="valor"]', "40000"); enviar(pres)
    ir(jemc, "economia", "indicadores")
    expect(jemc.locator("tbody")).to_contain_text("150.000 US$ millones", timeout=10000)
    ok("el Presidente cargó los indicadores iniciales y el Jefe los ve sin recargar")

    # Presupuesto: pedido, reparto, Congreso
    ir(jemc, "economia", "presupuesto")
    jemc.click('[data-accion="pedir-fondos"]')
    for k, v in {"fuerzas": "20000", "pfa": "5000", "fadea": "3000"}.items(): jemc.fill(f'#ventana [name="{k}"]', v)
    expect(jemc.locator("#ventana [data-aviso-generico]")).to_contain_text("dentro de tus facultades")
    enviar(jemc)
    ir(pres, "economia", "presupuesto")
    expect(pres.locator("tbody tr", has_text="PFA")).to_contain_text("US$ 5.000 M", timeout=10000)
    pres.click('[data-accion="editar-presupuesto"]')
    for k, v in {"fuerzas": "18000", "pfa": "3000", "fadea": "3000", "obras": "12000", "social": "40000", "educacion": "20000", "salud": "20000", "otros": "30000"}.items():
        pres.fill(f'#ventana [name="{k}"]', v)
    enviar(pres)
    pres.click('[data-accion="enviar-presupuesto"]')
    expect(pres.locator(".panel.tabla-envoltura", has_text="Proyectos de ley")).to_contain_text("Presupuesto 2030", timeout=10000)
    fila = pres.locator("tr", has_text="Presupuesto 2030")
    fila.locator('[data-accion="votar-ley"]').click()
    expect(fila).to_contain_text("Media sanción", timeout=10000)
    fila.locator('[data-accion="votar-ley"]').click()
    expect(fila).to_contain_text("Sancionada", timeout=10000)
    ir(jemc, "economia", "presupuesto")
    expect(jemc.locator("tbody tr", has_text="PFA")).to_contain_text("US$ 3.000 M", timeout=10000)
    expect(jemc.locator("main")).to_contain_text("Rige el presupuesto aprobado por el Congreso")
    ok("presupuesto: pedido del Jefe, reparto del Presidente, media sanción y sanción en el Congreso")

    # Auditoría, licitación y obra
    ir(pres, "gobierno", "control")
    pres.click('[data-accion="auditoria"]'); pres.select_option('#ventana [name="area"]', "fadea"); enviar(pres)
    ir(pres, "obras", "licitaciones")
    pres.click('[data-accion="nueva-licitacion"]')
    pres.fill('#ventana [name="nombre"]', "Autovía del Norte")
    pres.select_option('#ventana [name="tipo"]', "Ruta"); pres.select_option('#ventana [name="provinciaId"]', "salta")
    pres.fill('#ventana [name="costo"]', "300"); pres.fill('#ventana [name="plazo"]', "2"); enviar(pres)
    pres.click('[data-accion="ver-licitacion"]', timeout=10000)
    expect(pres.locator("#ventana tbody tr")).to_have_count(3)
    pres.locator('#ventana [data-accion="adjudicar"]').last.click()
    ir(jemc, "obras", "ejecucion")
    expect(jemc.locator("main")).to_contain_text("Autovía del Norte", timeout=10000)
    ok("auditoría ordenada; licitación con 3 empresas ficticias y obra adjudicada")

    # Ceremonias: el Presidente condecora a un agente de la PFA
    ir(jemc, "pfa", "personal")
    jemc.click('[data-accion="generar-plantel"]'); jemc.select_option('#ventana [name="unidad"]', "pfa-1")
    jemc.fill('#ventana [name="cantidad"]', "20"); enviar(jemc)
    expect(jemc.locator(".panel").first).to_contain_text("20 activos", timeout=10000)
    nombre = jemc.locator(".panel.tabla-envoltura tbody tr").first.locator("td").first.inner_text().strip()
    ir(pres, "gobierno", "ceremonias")
    pres.click('[data-foco="buscar-condecorar"]'); pres.keyboard.type(nombre[:6])
    pres.locator('[data-accion="condecorar"]').first.click()
    pres.select_option('#ventana [name="medalla"]', "Orden al Mérito Federal")
    expect(pres.locator("#ventana [data-aviso-generico]")).to_contain_text("dentro de tus facultades")
    enviar(pres)
    expect(pres.locator(".panel", has_text="Condecorados")).to_contain_text("Orden al Mérito Federal", timeout=10000)
    ok("el Presidente condecoró por decreto a un agente de la PFA")

    # Comunicación: cadena nacional (una por mes)
    ir(pres, "gobierno", "comunicacion")
    pres.click('[data-accion="comunicar"][data-tipo="cadena"]')
    pres.select_option('#ventana [name="postura"]', "anunciar"); pres.fill('#ventana [name="mensaje"]', "El país avanza"); enviar(pres)
    expect(pres.locator('[data-accion="comunicar"][data-tipo="cadena"]')).to_be_disabled(timeout=10000)
    ok("cadena nacional emitida; la siguiente queda bloqueada hasta el mes próximo")

    # Tres turnos mensuales desde el despacho del Jefe
    for _ in range(3):
        f = jemc.locator(".cabecera .fecha").inner_text()
        jemc.click('[data-accion="avanzar-mes"]')
        expect(jemc.locator(".cabecera .fecha")).not_to_have_text(f, timeout=10000)
    expect(pres.locator(".cabecera .fecha")).to_contain_text("8 de marzo de 2030", timeout=10000)
    ir(pres, "gobierno", "control")
    expect(pres.locator("tbody")).to_contain_text("Finalizada", timeout=10000)
    ok("tres turnos mensuales: la fecha avanzó al 8 de marzo de 2030 y la auditoría terminó")

    ir(pres, "obras", "terminadas")
    pres.click('[data-accion="inaugurar"]', timeout=10000)
    expect(pres.locator("main")).to_contain_text("Inaugurada", timeout=10000)
    ok("la obra se terminó con los turnos y el Presidente la inauguró")

    # Mapa y economía en movimiento
    ir(pres, "gobierno", "provincias")
    expect(pres.locator(".celda-mapa")).to_have_count(24)
    ir(pres, "economia", "indicadores")
    assert "→" in pres.locator("tbody").inner_text(), "sin historial de indicadores"
    ok("mapa de 24 provincias e indicadores con historial")

    for v, sub, n in [("economia", "presupuesto", "economia"), ("obras", "terminadas", "obras"), ("gobierno", "provincias", "mapa"), ("gobierno", "congreso", "congreso")]:
        ir(pres, v, sub); pres.wait_for_timeout(300)
        pres.screenshot(path=f"{CAP}/v3-{n}.png", full_page=True)
    assert jemc.evaluate("window.__x") == "ok" and pres.evaluate("window.__x") == "ok", "hubo recarga"
    b.close()

if errores:
    print("Errores:", *errores, sep="\n  "); sys.exit(1)
print("Todo OK: funciones de la versión 3 sincronizadas entre las dos sesiones sin recargar.")
