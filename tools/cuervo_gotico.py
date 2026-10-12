"""
Genera el cuervo chibi gótico a partir de la base aprobada (ia/cuervo_gotico/aprobada/base.png).
Ediciones con FLUX.2 klein 4B (~105 neurons cada una). Se salta lo que ya existe y para si se acaba la cuota.

  python tools/cuervo_gotico.py prueba        -> 1 edición (pico abierto) para comprobar que el 4B respeta el estilo
  python tools/cuervo_gotico.py alas          -> 3 posiciones de alas para hablar (gestos)
  python tools/cuervo_gotico.py caras         -> 6 expresiones: quieto / hablando / parpadeo
  python tools/cuervo_gotico.py accesorios    -> accesorios de cabeza
  python tools/cuervo_gotico.py todo          -> alas + caras + accesorios
  python tools/cuervo_gotico.py componer      -> ia/cuervo_gotico/png/ listo para "Importar carpeta" (sin IA)
  python tools/cuervo_gotico.py hoja [carpeta] -> hoja de contacto
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat  # noqa: E402

import cuervo_ia  # noqa: E402
from cuervo_ia import _mayor_componente, cargar_env, pedir, unificar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
DIR = RAIZ / "ia" / "cuervo_gotico"
BASE = DIR / "aprobada" / "base.png"
GEN = DIR / "gen"
cuervo_ia.MODELO = "@cf/black-forest-labs/flux-2-klein-4b"

MANTENER = ("Same chibi crow character, exact same sticker art style: flat dark slate purple-grey body, a few lighter "
            "purple-grey feather lines, thick white sticker border around the whole silhouette, soft hand-drawn "
            "lines. Exact same size, position, framing and three-quarter pose, same plain flat pastel green "
            "background. The head stays in exactly the same place and shape. ")
SOLO_CARA = "Change ONLY the face, everything else identical (body, wings, tuft, border): "
SOLO_ALAS = "Change ONLY the wings, the head and the face stay exactly identical: "

# Posiciones de alas para hablar (como en la referencia: alas que se levantan y abren al gesticular)
ALAS = {
    "gesto1": "the wing on the right side of the image is raised up and outward to shoulder height with its feathers "
              "spread like a hand waving hello; the other wing stays folded",
    "gesto2": "both wings are opened outward to the sides and slightly raised, feathers spread, an excited "
              "expressive gesture",
    "gesto3": "the wing on the right side of the image is lifted forward in front of the chest like a hand gesturing "
              "while explaining something, feather tips pointing up; the other wing stays folded",
}

PICO_CERRADO = "the beak is closed"
PICO_ABIERTO = ("the beak is clearly open wide as if talking: the upper beak and the lower beak are separated by a wide "
                "gap showing the dark pink inside of the mouth")
SEMILLAS = (5150, 5151, 5152)   # en local no hay cuota: varias por imagen y se elige la mejor

# Expresión -> cómo es el ojo (y marcas) ; la boca (pico) se añade según quieto/hablando
EXPRESIONES = {
    "normal": "calm friendly look, the eye is the same big yellow ring",
    "feliz": "very happy, the eye is closed and drawn as a happy upward curved yellow arc, a small pink blush on the cheek",
    "enojado": "angry, a dark angled eyebrow line pressing down on the yellow ring eye, a small red anger mark near the head",
    "triste": "sad, a droopy eyebrow line above the yellow ring eye and a small light blue tear under it",
    "sorprendido": "surprised, the yellow ring eye is bigger and wide open, a small yellow exclamation mark near the head",
    "sonrojado": "shy and blushing, the yellow ring eye looks slightly away, a big soft pink blush on the cheek",
}
PARPADEO = "the eye is closed and drawn as a simple short yellow line, keep any eyebrow, blush, tear or mark as described"

ACCESORIOS = {
    "sombrero_bruja": "a small black witch hat with a purple band, sitting tilted on top of the head",
    "sombrero_copa": ("a classic black top hat with a purple ribbon band, upright, sitting on the very top of the head "
                      "above the feather tuft, well above the eye; the eye stays fully visible"),
    "sombrero_vaquero": ("a brown cowboy hat with a curved brim and a darker brown band, sitting on the very top of the head "
                         "above the feather tuft, well above the eye; the eye stays fully visible"),
    "gafas": ("round glasses made of a very thin gold wire frame with perfectly clear empty lenses (no tint, no reflection), "
              "the frame circles around the yellow ring eye so the whole eye stays fully visible inside the lens"),
    "lazo": "a small purple ribbon bow on top of the head",
    "flor": "a small pink flower tucked on the side of the head near the eye",
    "corona": "a tiny golden crown sitting on top of the head",
}


def editar(salida, cambio, semilla=5150, ref=BASE):
    salida = Path(salida)
    if salida.exists():
        return True
    salida.parent.mkdir(parents=True, exist_ok=True)
    try:
        pedir(MANTENER + cambio, semilla, Path(ref)).save(salida)
        print("ok", salida.relative_to(DIR))
        return True
    except RuntimeError as e:
        print("ERROR", salida.name, str(e)[:160])
        if "4006" in str(e) or "neurons" in str(e):
            print("Se acabó la cuota de hoy. Lo que falta se generará al volver a lanzar el comando.")
            sys.exit(2)
        return False


def cmd_prueba():
    editar(GEN / "prueba" / "pico_abierto.png", SOLO_CARA + f"{EXPRESIONES['normal']}, {PICO_ABIERTO}.")


def _variantes(carpeta, nombre, prompt, semillas=SEMILLAS, ref=BASE):
    """Genera nombre.png (primera semilla) y opciones nombre_s<semilla>.png en carpeta/opciones/ para elegir."""
    for i, s in enumerate(semillas):
        destino = carpeta / f"{nombre}.png" if i == 0 else carpeta / "opciones" / f"{nombre}_s{s}.png"
        editar(destino, prompt, semilla=s, ref=ref)


def cmd_alas():
    for nombre, alas in ALAS.items():
        _variantes(GEN / "alas", nombre, SOLO_ALAS + alas + f". The face keeps the calm yellow ring eye and {PICO_CERRADO}.")


def cmd_caras():
    for eid, cara in EXPRESIONES.items():
        if eid != "normal":
            _variantes(GEN / "caras", f"{eid}_quieto", SOLO_CARA + f"{cara}, {PICO_CERRADO}.")
        _variantes(GEN / "caras", f"{eid}_hablando", SOLO_CARA + f"{cara}, {PICO_ABIERTO}.")
        _variantes(GEN / "caras", f"{eid}_parpadeo", SOLO_CARA + f"{cara}; {PARPADEO}, {PICO_CERRADO}.")


def cmd_accesorios():
    for nombre, desc in ACCESORIOS.items():
        _variantes(GEN / "accesorios", nombre,
                   f"Add ONLY this accessory and change nothing else: {desc}, drawn in the same sticker style with "
                   f"the white sticker border around it.", semillas=(7000, 7001, 7002, 7003))


# ---------- Composición (sin IA, no gasta cuota) ----------
PNG = DIR / "png"
CABEZA = [(100, 40, 720, 640)]    # ojo, pico, mejilla y marcas alrededor de la cabeza
# Ojos de qué expresión usar al parpadear: feliz ya tiene el ojo cerrado (no parpadea);
# sorprendido tiene el mismo aro que normal y su parpadeo salió raro.
PARPADEO_DE = {"feliz": None, "sorprendido": "normal"}
OJO = [(385, 290, 610, 540)]      # ojo y ceja
PICO = [(180, 360, 450, 580)]
ZONA_ACC = (40, 0, 1000, 640)


def quitar_verde(img, umbral=12):
    """Fondo verde pastel -> transparente. Conserva el borde blanco de pegatina y suaviza el contorno."""
    img = img.convert("RGB")
    r, g, b = img.split()
    verde = ImageChops.subtract(g, ImageChops.lighter(r, b))       # ~30 en el fondo, <=0 en el personaje
    cand = verde.point(lambda v: 255 if v > umbral else 0)
    w, h = img.size
    for x, y in [(x, 0) for x in range(0, w, 8)] + [(x, h - 1) for x in range(0, w, 8)] + \
                [(0, y) for y in range(0, h, 8)] + [(w - 1, y) for y in range(0, h, 8)]:
        if cand.getpixel((x, y)) == 255:
            ImageDraw.floodfill(cand, (x, y), 128)
    fondo = cand.point(lambda v: 255 if v == 128 else 0)
    # banda del contorno: alfa según lo verde que sea el píxel, color blanco (el borde es blanco)
    banda = ImageChops.subtract(fondo.filter(ImageFilter.MaxFilter(5)), fondo)
    banda = ImageChops.subtract(banda, ImageChops.invert(ImageChops.lighter(fondo, banda)))
    alfa_banda = verde.point(lambda v: max(0, min(255, int(255 * (28 - v) / 28))))
    alfa = ImageChops.invert(fondo)
    alfa = Image.composite(alfa_banda, alfa, banda.point(lambda v: 255 if v else 0))
    color = Image.composite(Image.new("RGB", img.size, (255, 255, 255)), img, banda)
    out = color.convert("RGBA")
    out.putalpha(alfa)
    return out


def _alinear(base, img, zona):
    """Desplaza 'img' para que 'zona' (caja) coincida con la base."""
    ref = base.convert("L").crop(zona)
    gris = img.convert("L")
    mejor = (0, 0, float("inf"))
    for dy in range(-14, 15, 2):
        for dx in range(-14, 15, 2):
            c = ImageChops.difference(ref, gris.crop((zona[0] - dx, zona[1] - dy, zona[2] - dx, zona[3] - dy)))
            s = sum(i * v for i, v in enumerate(c.histogram()))
            if s < mejor[2]:
                mejor = (dx, dy, s)
    return ImageChops.offset(img.convert("RGB"), mejor[0], mejor[1])


def _delta(cara, base):
    """Máscara de lo que una cara (ya unificada con la base) cambia respecto a la base."""
    r, g, b = ImageChops.difference(cara, base).split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > 6 else 0)
    return m.filter(ImageFilter.MaxFilter(5))


def _clases(img):
    """Máscaras (fondo verde, blanco de pegatina) de una imagen RGB."""
    r, g, b = img.split()
    verde = ImageChops.subtract(g, ImageChops.lighter(r, b)).point(lambda v: 255 if v > 8 else 0)
    minimo = ImageChops.darker(ImageChops.darker(r, g), b)
    gris = ImageChops.subtract(ImageChops.lighter(ImageChops.lighter(r, g), b), minimo).point(lambda v: 255 if v < 40 else 0)
    # claro y poco saturado (incluye el antialias del borde; el rubor rosa o el ojo amarillo no)
    blanco = ImageChops.multiply(minimo.point(lambda v: 255 if v > 150 else 0), gris)
    return verde, blanco


def cara_en_gesto(cara, base, gesto):
    """Pega en una postura de alas solo lo que la cara cambia respecto a la base.
    Nunca pega fondo verde, y el blanco de pegatina solo donde la postura también es fondo o borde
    (si no, el pico abierto taparía con borde blanco el ala que asoma debajo)."""
    verde_c, blanco_c = _clases(cara)
    verde_g, blanco_g = _clases(gesto)
    personaje_c = ImageChops.invert(ImageChops.lighter(verde_c, blanco_c))
    blanco_ok = ImageChops.multiply(blanco_c, ImageChops.lighter(verde_g, blanco_g))
    m = ImageChops.multiply(_delta(cara, base), ImageChops.lighter(personaje_c, blanco_ok))
    m = ImageChops.multiply(m, _elipses(base.size, CABEZA)).filter(ImageFilter.GaussianBlur(1.2))
    # la zona del ojo entera (las alas no llegan): así no quedan restos del aro de la postura si está movido
    m = ImageChops.lighter(m, _elipses(base.size, OJO))
    # las posturas salen con un tono algo distinto: igualar la cara al tono de la cabeza de la postura
    verde_b, blanco_b = _clases(base)
    cuerpo = ImageChops.multiply(ImageChops.invert(ImageChops.lighter(verde_b, blanco_b)),
                                 ImageChops.invert(_delta(cara, base).filter(ImageFilter.MaxFilter(15))))
    cuerpo = ImageChops.multiply(cuerpo, _elipses(base.size, CABEZA))
    canales = []
    for cc, cg, cb in zip(cara.split(), gesto.split(), base.split()):
        d = ImageStat.Stat(cg, cuerpo).mean[0] - ImageStat.Stat(cb, cuerpo).mean[0]
        canales.append(cc.point(lambda v, d=d: max(0, min(255, int(v + d)))))
    return Image.composite(Image.merge("RGB", canales), gesto, m)


def _rellenar_columnas(m):
    """Rellena cada columna entre su primer y su último píxel: un sombrero es macizo de arriba abajo.
    Sin esto, la cinta del sombrero (oscura como la cabeza) no cuenta como cambio y queda un corte."""
    w, h = m.size
    px = m.load()
    out = Image.new("L", m.size, 0)
    d = ImageDraw.Draw(out)
    for x in range(w):
        ys = [y for y in range(h) if px[x, y] > 128]
        if ys:
            d.line([(x, ys[0]), (x, ys[-1])], fill=255)
    return out


def extraer_accesorio(base, editada, sombrero=False):
    """Capa RGBA del accesorio: lo que sobresale de la silueta (con su borde blanco) + lo que cambia
    dentro de la cabeza, en una sola pieza maciza (sin agujeros)."""
    editada = _alinear(base, editada, (220, 160, 600, 520))
    fuera = ImageChops.subtract(quitar_verde(editada).getchannel("A").point(lambda v: 255 if v > 128 else 0),
                                quitar_verde(base).getchannel("A").point(lambda v: 255 if v > 128 else 0))
    r, g, b = ImageChops.difference(editada, base).split()
    dentro = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > 40 else 0)
    limite = Image.new("L", base.size, 0)
    ImageDraw.Draw(limite).rectangle(ZONA_ACC, fill=255)
    cambio = ImageChops.multiply(ImageChops.lighter(fuera, dentro), limite)
    m = cambio.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.MinFilter(11))
    m = _mayor_componente(m)                          # pieza principal, huecos rellenos
    if sombrero:
        # antes de rellenar columnas, quitar las líneas finas (diferencias en el contorno de la cabeza bajo el
        # ala); si no, el relleno las convierte en tiras colgando
        m = _mayor_componente(m.filter(ImageFilter.MinFilter(13)).filter(ImageFilter.MaxFilter(13)))
        m = _rellenar_columnas(m)
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    capa = quitar_verde(editada)
    capa.putalpha(ImageChops.multiply(capa.getchannel("A"), m))
    return capa


def _elipses(size, cajas):
    m = Image.new("L", size, 0)
    for c in cajas:
        ImageDraw.Draw(m).ellipse(c, fill=255)
    return m.filter(ImageFilter.GaussianBlur(10))


def caras_unificadas(base):
    """{expresion: {quieto, hablando, parpadeo, parpadeo_hablando}} con el cuerpo idéntico a la base."""
    C = GEN / "caras"
    res = {}
    for eid in EXPRESIONES:
        q = base if eid == "normal" else unificar(base, Image.open(C / f"{eid}_quieto.png"), CABEZA)
        f = {"quieto": q}
        if (C / f"{eid}_hablando.png").exists():   # del 'hablando' solo el pico: ojo y marcas iguales al quieto
            f["hablando"] = unificar(q, Image.open(C / f"{eid}_hablando.png"), PICO)
        origen = PARPADEO_DE.get(eid, eid)
        if origen and (C / f"{origen}_parpadeo.png").exists():
            f["parpadeo"] = unificar(q, Image.open(C / f"{origen}_parpadeo.png"), OJO, entera=True)
        if "hablando" in f and "parpadeo" in f:
            f["parpadeo_hablando"] = Image.composite(f["parpadeo"], f["hablando"], _elipses(base.size, OJO))
        res[eid] = f
    return res


def cmd_componer():
    base = Image.open(BASE).convert("RGB")
    caras = caras_unificadas(base)
    alas = {}
    for g in ALAS:
        ruta = GEN / "alas" / f"{g}.png"
        if ruta.exists():
            # cabeza alineada con la base y pegada encima, para que la cara encaje al cambiar de gesto
            w = _alinear(base, Image.open(ruta), (220, 160, 600, 520))
            alas[g] = w
    for eid, frames in caras.items():
        for tipo, img in frames.items():
            (PNG / eid).mkdir(parents=True, exist_ok=True)
            quitar_verde(img).save(PNG / eid / f"{tipo}.png")
            for g, w in alas.items():
                (PNG / eid / g).mkdir(parents=True, exist_ok=True)
                quitar_verde(cara_en_gesto(img, base, w)).save(PNG / eid / g / f"{tipo}.png")
        print("ok", eid, len(frames), "fotogramas +", len(alas), "gestos")
    (PNG / "accesorios").mkdir(parents=True, exist_ok=True)
    dibujar_gafas().save(PNG / "accesorios" / "gafas.png")
    print("ok accesorio gafas (dibujadas)")
    for ruta in sorted((GEN / "accesorios").glob("*.png")):
        if ruta.stem == "gafas":
            continue
        capa = extraer_accesorio(base, Image.open(ruta).convert("RGB"), sombrero=ruta.stem.startswith("sombrero"))
        capa.save(PNG / "accesorios" / ruta.name)
        print("ok accesorio", ruta.stem)


def dibujar_gafas(lado=1024, ss=4):
    """Gafas redondas de alambre dorado, dibujadas (la IA siempre pinta reflejos encima del ojo).
    Medidas sobre la base aprobada: aro del ojo centrado en (496, 416), radio ~63."""
    k = ss
    oro, contorno = (226, 182, 70, 255), (62, 50, 62, 255)
    capas = []
    for ancho, color in ((19, contorno), (9, oro)):
        im = Image.new("RGBA", (lado * k, lado * k), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse([(496 - 84) * k, (416 - 84) * k, (496 + 84) * k, (416 + 84) * k], outline=color, width=ancho * k)
        d.ellipse([(352 - 44) * k, (404 - 70) * k, (352 + 44) * k, (404 + 70) * k], outline=color, width=ancho * k)
        d.line([396 * k, 398 * k, 413 * k, 402 * k], fill=color, width=ancho * k)                  # puente
        d.line([580 * k, 404 * k, 640 * k, 396 * k, 688 * k, 400 * k], fill=color, width=ancho * k, joint="curve")  # patilla
        capas.append(im)
    out = capas[0]
    out.alpha_composite(capas[1])
    return out.resize((lado, lado), Image.LANCZOS)


def cmd_hoja(carpeta=None, salida=None):
    """Hoja de contacto de una carpeta de gen/ (o del resultado final en png/)."""
    carpeta = Path(carpeta) if carpeta else PNG
    rutas = sorted(p for p in carpeta.rglob("*.png") if not p.name.startswith("_"))
    t, cols = 200, 8
    filas = (len(rutas) + cols - 1) // cols
    hoja = Image.new("RGB", (cols * t, filas * (t + 18)), (60, 60, 70))
    cuadros = Image.new("RGB", (t, t), (200, 200, 200))
    for y in range(0, t, 16):
        for x in range(0, t, 16):
            if (x + y) // 16 % 2:
                ImageDraw.Draw(cuadros).rectangle((x, y, x + 15, y + 15), fill=(235, 235, 235))
    for i, p in enumerate(rutas):
        im = Image.open(p).convert("RGBA").resize((t, t))
        x, y = i % cols * t, i // cols * (t + 18)
        hoja.paste(cuadros, (x, y))
        hoja.paste(im, (x, y), im)
        ImageDraw.Draw(hoja).text((x + 3, y + t + 3), str(p.relative_to(carpeta))[:32], fill=(255, 255, 255))
    salida = Path(salida) if salida else carpeta / "_hoja.jpg"
    hoja.save(salida, quality=88)
    print(salida)


if __name__ == "__main__":
    a = sys.argv[1:] or ["?"]
    if a[0] in ("prueba", "alas", "caras", "accesorios", "todo"):
        cargar_env()
    {"prueba": cmd_prueba, "alas": cmd_alas, "caras": cmd_caras, "accesorios": cmd_accesorios,
     "todo": lambda: (cmd_alas(), cmd_caras(), cmd_accesorios()),
     "componer": cmd_componer, "hoja": lambda: cmd_hoja(*a[1:3])}.get(a[0], lambda: print(__doc__))()
