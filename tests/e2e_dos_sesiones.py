"""Prueba de punta a punta: dos sesiones de navegador independientes (como dos
dispositivos) juegan la misma partida contra el servidor local y verifican que
los cambios de cada una aparecen en la otra sin recargar la página.

Uso: python3 tests/e2e_dos_sesiones.py [url]   (por defecto http://localhost:8080)
"""
import re
import sys
from playwright.sync_api import sync_playwright, expect

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
CAPTURAS = "/tmp/atlas-capturas"
errores = []


def paso(msg):
    print(f"  ✓ {msg}", flush=True)


def marcar(page):
    # Marca en memoria: si la página se recargara, desaparecería.
    page.evaluate("window.__sinRecarga = 'ok'")


def sin_recarga(page):
    assert page.evaluate("window.__sinRecarga") == "ok", "La página se recargó"


def nueva_sesion(browser, nombre, ancho=1360, alto=900):
    ctx = browser.new_context(viewport={"width": ancho, "height": alto}, locale="es-AR")
    page = ctx.new_page()
    # Las tipografías de Google no cargan sin internet: no es un error de la app.
    page.on("requestfailed", lambda r: "fonts.g" not in r.url and errores.append(f"[{nombre}] falló {r.url}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errores.append(f"[{nombre}] {m.text}"))
    page.on("pageerror", lambda e: errores.append(f"[{nombre}] {e}"))
    return ctx, page


with sync_playwright() as p:
    import os
    os.makedirs(CAPTURAS, exist_ok=True)
    browser = p.chromium.launch()
    ctx_j, jemc = nueva_sesion(browser, "JEMC")
    ctx_p, pres = nueva_sesion(browser, "PRES")

    # 1. El Jefe del Estado Mayor crea la partida
    jemc.goto(URL)
    jemc.fill('[data-form="crear"] [name="nombre"]', "Prueba de sincronización")
    jemc.check('[data-form="crear"] [value="jemc"]')
    jemc.click('[data-form="crear"] [type="submit"]')
    codigo = jemc.locator(".codigo").inner_text().strip()
    assert re.match(r"^[A-Z2-9]{4}-[A-Z2-9]{4}$", codigo), codigo
    jemc.screenshot(path=f"{CAPTURAS}/01-invitacion.png")
    jemc.click('[data-accion="entrar-nueva"]')
    expect(jemc.locator(".cabecera")).to_contain_text("8 de diciembre de 2029")
    marcar(jemc)
    paso(f"partida creada con código {codigo}")

    # 2. El Presidente entra con el enlace desde otra sesión
    pres.goto(f"{URL}/?p={codigo}")
    expect(pres.locator('[data-form="unirse"]')).to_be_visible()
    pres.check('[data-form="unirse"] [value="presidente"]')
    pres.click('[data-form="unirse"] [type="submit"]')
    expect(pres.locator(".cabecera")).to_contain_text("Presidente de la Nación")
    marcar(pres)
    paso("el Presidente entró con el código desde otra sesión")

    # 3. El JEMC ve, sin recargar, que entró el Presidente
    expect(jemc.locator(".cabecera")).to_contain_text("Presidente en la partida", timeout=8000)
    sin_recarga(jemc)
    paso("sincronización 1: el JEMC ve la llegada del Presidente sin recargar")

    # 4. El JEMC pide sumar AR-90 Zonda: es una compra y va al Presidente
    jemc.evaluate("location.hash = '#inventarios'")
    jemc.click('button[data-accion="editar-cantidad"][data-id="zonda"]')
    expect(jemc.locator("#ventana [data-aviso-decide]")).to_contain_text("dentro de tus facultades")
    jemc.fill('#ventana [name="ef_valor"]', "1100")
    expect(jemc.locator("#ventana [data-aviso-decide]")).to_contain_text("Le corresponde al Presidente")
    jemc.fill('#ventana [name="justificacion"]', "Reponer desgaste por ejercicios de ATLAS")
    jemc.click('#ventana [type="submit"]')
    expect(jemc.locator("#ventana")).to_contain_text("En revisión")
    jemc.click('#ventana [data-accion="cerrar-ventana"]')
    paso("el JEMC envió un pedido de compra de aviones")

    # 5. El Presidente lo recibe en su bandeja sin recargar y lo aprueba
    expect(pres.locator(".aviso.del-otro").first).to_contain_text("Cantidad de AR-90 Zonda", timeout=8000)
    expect(pres.locator('.nav a[href="#despacho"] .contador')).to_have_text("1")
    sin_recarga(pres)
    paso("sincronización 2: el pedido llega a la bandeja del Presidente con aviso")
    pres.click('[data-accion="ver-propuesta"]:has-text("Decidir")')
    pres.fill("#comentario-decision", "Aprobado dentro del presupuesto anual")
    pres.click('#ventana [data-que="aprobar"]')
    expect(pres.locator("#ventana")).to_contain_text("Aprobada")
    pres.click('#ventana [data-accion="cerrar-ventana"]')

    # 6. El JEMC ve la nueva cantidad sin recargar
    fila = jemc.locator('tr[data-id="zonda"]')
    expect(fila).to_contain_text("1.100", timeout=8000)
    sin_recarga(jemc)
    paso("sincronización 3: la aprobación cambia el inventario del JEMC sin recargar")

    # 7. Votación de guerra de ATLAS
    jemc.evaluate("location.hash = '#atlas'")
    jemc.click('[data-accion="nueva-votacion"]')
    jemc.fill('#ventana [name="titulo"]', "Respuesta a agresión externa contra un miembro")
    jemc.click('#ventana [type="submit"]')
    expect(jemc.locator("#ventana")).to_contain_text("al menos 8 votos a favor")
    paso("votación de guerra abierta: umbral de 8 de 9")

    pres.evaluate("location.hash = '#atlas'")
    pres.locator('tr[data-accion="ver-votacion"]').first.click(timeout=8000)
    for pais in ["Estados Unidos", "Francia", "Reino Unido", "Alemania", "Corea del Sur", "Suecia", "Israel"]:
        pres.select_option(f'#ventana select[data-pais="{pais}"]', "si")
        expect(pres.locator(f'#ventana select[data-pais="{pais}"]')).to_have_value("si")
    pres.select_option('#ventana select[data-pais="Brasil"]', "no")
    expect(pres.locator("#ventana .resultado")).to_contain_text("En curso")
    assert pres.locator('#ventana select[data-pais="Argentina"]').count() == 0
    paso("el Presidente cargó los votos de 8 miembros; Argentina no se puede cargar directo")

    expect(jemc.locator("#ventana")).to_contain_text("7 a favor", timeout=8000)
    sin_recarga(jemc)
    paso("sincronización 4: el JEMC ve los votos en vivo dentro de la ventana abierta")
    jemc.click('#ventana [data-accion="preparar-voto"]')
    jemc.select_option('#ventana [name="voto"]', "si")
    jemc.fill('#ventana [name="justificacion"]', "Agresión externa contra un miembro: corresponde defensa colectiva")
    jemc.click('#ventana [type="submit"]')
    expect(jemc.locator("#ventana")).to_contain_text("Pedido de autorización: En revisión")

    pres.click('#ventana [data-accion="cerrar-ventana"]')
    pres.evaluate("location.hash = '#despacho'")
    pres.click('[data-accion="ver-propuesta"]:has-text("Decidir")', timeout=8000)
    expect(pres.locator("#ventana")).to_contain_text("Voto recomendado")
    pres.click('#ventana [data-que="aprobar"]')
    expect(pres.locator("#ventana")).to_contain_text("Aprobada")
    pres.click('#ventana [data-accion="cerrar-ventana"]')

    expect(jemc.locator("#ventana .resultado")).to_contain_text("Aprobada", timeout=8000)
    expect(jemc.locator("#ventana")).to_contain_text("88,9% a favor")
    jemc.screenshot(path=f"{CAPTURAS}/02-votacion-jemc.png")
    jemc.click('#ventana [data-accion="confirmar-votacion"]')
    pres.evaluate("location.hash = '#atlas'")
    pres.locator('tr[data-accion="ver-votacion"]').first.click()
    pres.click('#ventana [data-accion="confirmar-votacion"]', timeout=8000)
    expect(pres.locator("#ventana")).to_contain_text("Resultado final: aprobada")
    expect(jemc.locator("#ventana")).to_contain_text("Resultado final: aprobada", timeout=8000)
    pres.click('#ventana [data-accion="cerrar-ventana"]')
    jemc.click('#ventana [data-accion="cerrar-ventana"]')
    paso("sincronización 5: voto argentino autorizado, 88,9% y votación cerrada por ambos")

    # 8. Asunto con intervenciones de los dos cargos
    pres.evaluate("location.hash = '#asuntos'")
    pres.click('[data-accion="nuevo-asunto"]')
    pres.fill('#ventana [name="titulo"]', "Corredor ferroviario Córdoba–Salta")
    pres.select_option('#ventana [name="area"]', "infraestructura")
    pres.select_option('#ventana [name="tipo"]', "hecho")
    pres.fill('#ventana [name="texto"]', "Hay estudios de factibilidad en curso; no hay obra iniciada.")
    pres.click('#ventana [type="submit"]')
    expect(pres.locator("#ventana")).to_contain_text("Hechos establecidos")
    jemc.evaluate("location.hash = '#asuntos'")
    jemc.locator('tr[data-accion="ver-asunto"]').first.click(timeout=8000)
    jemc.select_option('#ventana [name="tipo"]', "opcion")
    jemc.fill('#ventana [name="texto"]', "Evaluar uso logístico militar del corredor.")
    jemc.click('#ventana [type="submit"]')
    expect(pres.locator("#ventana")).to_contain_text("Evaluar uso logístico militar", timeout=8000)
    sin_recarga(pres)
    pres.screenshot(path=f"{CAPTURAS}/03-asunto-presidente.png")
    pres.click('#ventana [data-accion="cerrar-ventana"]')
    jemc.click('#ventana [data-accion="cerrar-ventana"]')
    paso("sincronización 6: intervención del JEMC aparece en el asunto abierto del Presidente")

    # 9. Informe sin datos inventados
    jemc.evaluate("location.hash = '#informes'")
    jemc.click('[data-accion="generar-informe"]')
    expect(jemc.locator(".informe h2")).to_have_text("Informe nacional del 8 de diciembre de 2029")
    informe = jemc.locator(".informe").inner_text()
    for seccion in ["Economía", "Política y opinión pública", "Soberanía", "Seguridad", "Infraestructura", "Industria"]:
        assert seccion in informe, seccion
    assert "Inflación" in jemc.locator(".informe .sin-dato-lista").first.inner_text()
    jemc.screenshot(path=f"{CAPTURAS}/04-informe.png", full_page=True)
    pres.evaluate("location.hash = '#informes'")
    expect(pres.locator(".panel")).to_contain_text("Informe nacional del 8 de diciembre de 2029", timeout=8000)
    paso("sincronización 7: informe con fecha en el título, secciones completas y sin cifras inventadas")

    # 10. Capturas de las vistas principales
    for vista in ["despacho", "situacion", "proyectos", "inventarios", "at1", "atlas", "registro", "partida"]:
        jemc.evaluate(f"location.hash = '#{vista}'")
        jemc.wait_for_timeout(250)
        jemc.screenshot(path=f"{CAPTURAS}/vista-{vista}.png", full_page=True)
    pres.evaluate("location.hash = '#despacho'")
    pres.wait_for_timeout(250)
    pres.screenshot(path=f"{CAPTURAS}/vista-despacho-presidente.png", full_page=True)

    ctx_m = browser.new_context(viewport={"width": 390, "height": 844}, locale="es-AR", color_scheme="dark")
    movil = ctx_m.new_page()
    movil.goto(f"{URL}/?p={codigo}")
    movil.wait_for_timeout(800)
    movil.screenshot(path=f"{CAPTURAS}/movil-oscuro-inicio.png", full_page=True)

    sin_recarga(jemc)
    sin_recarga(pres)
    browser.close()

if errores:
    print("Errores de consola:")
    for e in errores:
        print("  ", e)
    sys.exit(1)
print("Todo OK: los dos cargos jugaron en sesiones separadas y cada cambio llegó al otro sin recargar.")
