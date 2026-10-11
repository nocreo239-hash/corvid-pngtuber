"""
Genera el cuervo PNGtuber con IA (Cloudflare FLUX.2 klein, el mismo generador que la tienda).

Pasos:
  1. python tools/cuervo_ia.py base 4            -> 4 candidatos en ia/base/ (elige uno)
  2. python tools/cuervo_ia.py frames ia/base/base_XXX.png [ids...]
                                                 -> cada expresión editando el cuervo elegido
  3. python tools/cuervo_ia.py unificar          -> mismo cuerpo en todos los fotogramas de una expresión
  4. python tools/cuervo_ia.py recortar         -> PNG transparentes en ia/png/<expresion>/
  Accesorios: python tools/cuervo_ia.py accesorio sombrero "a brown cowboy hat ..." 3
                                                 -> capas transparentes en ia/accesorios/ (encajan con el cuervo)

Lee CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN del .env de la tienda (o del entorno).
La cuota gratuita de Cloudflare se renueva a las 00:00 UTC.
"""
import base64
import os
import sys
import time
from collections import deque
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

RAIZ = Path(__file__).resolve().parent.parent
IA = RAIZ / "ia"
ENV_TIENDA = Path(r"E:\assets\DOWNLOADS\Tienda\.env")
MODELO = "@cf/black-forest-labs/flux-2-klein-4b"
LADO = 1024

ESTILO = ("cute chibi vtuber mascot sticker, kawaii anime style, thick clean dark outlines, flat cel shading, "
          "soft simple colors, big round head, tiny body, clean vector look, centered, full body, front view, "
          "plain flat pure white background, no text, no shadow on background")

PERSONAJE = ("a round fluffy chibi crow character, glossy black feathers with deep purple sheen, "
             "small tuft of feathers on top of the head, huge sparkling violet eyes with white highlights, "
             "small dark grey beak, pink blush cheeks, two little wings at the sides, tiny grey feet, "
             "a purple ribbon bow on the chest")

EDITAR = ("Same character, exact same design, colors, outline thickness, size, pose and position in the frame, "
          "same plain pure white background, same violet eye color, keep the purple ribbon bow on the chest. "
          "It is a bird: it has only a small dark grey beak, never a human mouth, lips, teeth or smile line. "
          "Change ONLY the face: ")
PICO = {"quieto": " The beak stays shut as a small closed triangle.",
        "hablando": " The beak opens: upper and lower beak parts apart showing a small dark inside with a tiny pink tongue.",
        "parpadeo": " The beak stays shut as a small closed triangle.",
        "grito": (" The beak is opened as wide as possible, showing the dark inside and pink tongue; "
                  "the beak stays centered between the eyes, symmetric, front view, and ends above the bow.")}
# Parpadeo parte del 'quieto' y grito del 'hablando' de cada expresión.
PARPADEO = ("both eyes are now fully shut, each one drawn as a simple curved eyelid line, both the same; "
            "keep the eyebrows and blush as they are; do not add tears, sweat or any new marks")
GRITO = ("keep exactly the same eyes, eyebrows, blush and face marks, do not make it angry; "
         "only the beak opens much wider, shouting loudly with the same emotion, no fangs or teeth")
SIN_PARPADEO = {"feliz", "dormido", "llorando_risa"}  # ya tienen los ojos cerrados

# id: (nombre, cara quieto, cara hablando)
EXPRESIONES = {
    "normal":      ("Normal", "calm friendly look, eyes open, beak closed",
                    "calm friendly look, eyes open, beak open talking"),
    "feliz":       ("Feliz", "very happy, eyes closed as upside-down U arcs, extra blush, beak closed",
                    "very happy, eyes closed as upside-down U arcs, beak wide open laughing"),
    "enojado":     ("Enojado", "angry, furrowed eyebrows slanted down, glaring eyes, puffed cheeks, beak closed, small anger vein mark",
                    "angry, furrowed eyebrows slanted down, glaring eyes, beak wide open shouting, small anger vein mark"),
    "sorprendido": ("Sorprendido", "shocked, big round white eyes each with a small violet iris and black dot pupil, beak closed",
                    "shocked, big round white eyes each with a small violet iris and black dot pupil, beak wide open gasping"),
    "triste":      ("Triste", "sad, teary watery eyes, eyebrows tilted up, small frown, beak closed",
                    "sad crying, tears streaming, eyebrows tilted up, beak open sobbing"),
    "sonrojado":   ("Sonrojado", "embarrassed and shy, very strong red blush across the face, eyes looking away, beak closed",
                    "embarrassed and shy, very strong red blush across the face, eyes looking away, beak slightly open stammering"),
    "enamorado":   ("Enamorado", "in love, pink heart-shaped eyes, blush, beak closed",
                    "in love, pink heart-shaped eyes, blush, beak open"),
    "presumido":   ("Presumido", "smug, half-closed eyelids, one eyebrow raised, confident smirk, beak closed",
                    "smug, half-closed eyelids, one eyebrow raised, beak open talking confidently"),
    "dormido":     ("Dormido", "asleep, eyes closed, small bubble from the beak, beak closed, little Zzz",
                    "sleepy yawning, eyes closed, beak wide open yawning"),
    "confundido":  ("Confundido", "confused, one eye bigger than the other, swirl and small question mark near the head, beak closed",
                    "confused, one eye bigger than the other, small question mark near the head, beak open"),
    "asustado":    ("Asustado", "scared, trembling, tiny pupils, sweat drops, pale, beak closed",
                    "scared, tiny pupils, sweat drops, beak wide open screaming"),
    "mareado":     ("Mareado", "dizzy, spiral swirl eyes, beak closed",
                    "dizzy, spiral swirl eyes, beak open"),
    "llorando_risa": ("Llorando de risa", "laughing so hard, eyes squeezed shut as > < shapes, tears of joy, beak closed",
                      "laughing so hard, eyes squeezed shut as > < shapes, tears of joy, beak wide open"),
}


def cargar_env():
    if ENV_TIENDA.exists():
        for linea in ENV_TIENDA.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def pedir(prompt, semilla, referencia=None):
    cuenta, token = os.environ.get("CLOUDFLARE_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")
    if not cuenta or not token:
        raise SystemExit("Faltan CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN")
    url = f"https://api.cloudflare.com/client/v4/accounts/{cuenta}/ai/run/{MODELO}"
    campos = {"prompt": (None, prompt[:2048]), "width": (None, str(LADO)),
              "height": (None, str(LADO)), "seed": (None, str(semilla))}
    if referencia is not None:
        campos["input_image_0"] = ("ref.png", referencia.read_bytes(), "image/png")
    for intento in range(4):
        resp = requests.post(url, headers={"Authorization": f"Bearer {token}"}, files=campos, timeout=180)
        if resp.status_code == 429 and intento < 3:
            time.sleep(10 * (intento + 1))
            continue
        break
    if resp.status_code != 200:
        raise RuntimeError(f"Cloudflare respondió {resp.status_code}: {resp.text[:500]}")
    datos = resp.json()
    return Image.open(BytesIO(base64.b64decode((datos.get("result") or datos)["image"]))).convert("RGB")


def cmd_base(n):
    destino = IA / "base"
    destino.mkdir(parents=True, exist_ok=True)
    prompt = f"{PERSONAJE}, calm friendly look, eyes open, beak closed. {ESTILO}"
    for i in range(n):
        semilla = 1000 + i * 7919
        ruta = destino / f"base_{semilla}.png"
        if ruta.exists():
            continue
        pedir(prompt, semilla).save(ruta)
        print("ok", ruta.name)


def cmd_frames(base, ids):
    base = Path(base)
    destino = IA / "frames"
    destino.mkdir(parents=True, exist_ok=True)
    for arg in ids or EXPRESIONES:
        # "feliz@7" usa otra semilla (para repetir un fotograma que salió mal)
        eid, _, sem = arg.partition("@")
        semilla = 4242 + int(sem or 0)
        _, quieto, hablando = EXPRESIONES[eid]
        tipos = [("quieto", quieto, base), ("hablando", hablando, "quieto"), ("grito", GRITO, "hablando")]
        if eid not in SIN_PARPADEO:
            tipos.insert(2, ("parpadeo", PARPADEO, "quieto"))
        for tipo, cara, ref in tipos:
            ruta = destino / f"{eid}_{tipo}.png"
            if ruta.exists():
                continue
            # cada fotograma parte de otro de la misma expresión para que solo cambie la cara
            if ref != base:
                ref = destino / f"{eid}_{ref}.png"
                if not ref.exists():
                    print("falta", ref.name, "-> salto", ruta.name)
                    continue
            if eid == "normal" and tipo == "quieto":
                Image.open(base).convert("RGB").save(ruta)
                print("ok", ruta.name, "(copia de la base)")
                continue
            try:
                pedir(EDITAR + cara + "." + PICO[tipo] + " " + ESTILO, semilla, ref).save(ruta)
                print("ok", ruta.name)
            except RuntimeError as e:
                print("ERROR", ruta.name, e)
                if "neuron" in str(e).lower() or "quota" in str(e).lower() or "4006" in str(e):
                    return


# Zonas que puede cambiar cada fotograma (elipses en px de 1024): el resto se copia del fotograma base.
CARA = [(272, 230, 752, 578)]                        # ojos, pico y mejillas
OJOS = [(280, 290, 490, 510), (534, 290, 744, 510)]  # ojos y cejas
PICO_ZONA = [(370, 350, 654, 630)]


def _desplazamiento(a, b, rango=12):
    """Offset (dx, dy) que mejor alinea b sobre a, comparando la zona del cuerpo."""
    zona = (60, 600, 964, 1000)
    ref = a.convert("L").crop(zona)
    gris = b.convert("L")
    mejor = (0, 0, float("inf"))
    for dy in range(-rango, rango + 1, 2):
        for dx in range(-rango, rango + 1, 2):
            c = ImageChops.difference(ref, gris.crop((zona[0] - dx, zona[1] - dy, zona[2] - dx, zona[3] - dy)))
            s = sum(i * v for i, v in enumerate(c.histogram()))
            if s < mejor[2]:
                mejor = (dx, dy, s)
    return mejor[:2]


def unificar(quieto, otro, zonas=CARA, entera=False):
    """Devuelve 'otro' con el cuerpo exacto de 'quieto': solo copia lo que cambió dentro de 'zonas'
    (o la zona entera, para que no queden restos de los ojos abiertos al parpadear)."""
    quieto, otro = quieto.convert("RGB"), otro.convert("RGB")
    dx, dy = _desplazamiento(quieto, otro)
    otro = ImageChops.offset(otro, dx, dy)
    zona = Image.new("L", quieto.size, 0)
    for caja in zonas:
        ImageDraw.Draw(zona).ellipse(caja, fill=255)
    # solo donde hay cambios reales (ojos, pico, lágrimas...), rellenando huecos
    dif = ImageChops.difference(quieto, otro)
    r, g, b = dif.split()
    cambio = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > 45 else 0)
    cambio = cambio.filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.MinFilter(15))
    if entera:
        mascara = zona.filter(ImageFilter.GaussianBlur(10))
    else:
        mascara = ImageChops.multiply(cambio, zona).filter(ImageFilter.GaussianBlur(6))
    # igualar el tono de 'otro' al de 'quieto' en la cara (las ediciones salen algo más grises)
    estable = ImageChops.multiply(zona, ImageChops.invert(cambio))
    canales = []
    for cq, co in zip(quieto.split(), otro.split()):
        mq = ImageStat.Stat(cq, estable).mean[0]
        mo = ImageStat.Stat(co, estable).mean[0]
        canales.append(co.point(lambda v, d=mq - mo: max(0, min(255, int(v + d)))))
    otro = Image.merge("RGB", canales)
    return Image.composite(otro, quieto, mascara)


def cmd_unificar():
    origen, destino = IA / "frames", IA / "unificados"
    destino.mkdir(parents=True, exist_ok=True)
    for q in sorted(origen.glob("*_quieto.png")):
        eid = q.stem[: -len("_quieto")]
        quieto = Image.open(q).convert("RGB")
        quieto.save(destino / q.name)
        hechos = {"quieto": quieto}
        # hablando: toda la cara; parpadeo: solo ojos; grito: solo el pico, sobre el 'hablando'
        for tipo, base, zonas in (("hablando", "quieto", CARA), ("parpadeo", "quieto", OJOS), ("grito", "hablando", PICO_ZONA)):
            ruta = origen / f"{eid}_{tipo}.png"
            if not ruta.exists():
                continue
            img = unificar(hechos.get(base, quieto), Image.open(ruta), zonas, entera=tipo == "parpadeo")
            hechos[tipo] = img
            img.save(destino / ruta.name)
            print("ok", ruta.name)
        # parpadeo hablando: ojos del parpadeo sobre el 'hablando' (sin IA: mismo cuerpo, encaja exacto)
        if "hablando" in hechos and "parpadeo" in hechos:
            # zona amplia: los ojos de 'hablando' pueden estar algo más grandes o desplazados
            mascara = Image.new("L", quieto.size, 0)
            for caja in ((250, 240, 505, 535), (519, 240, 774, 535)):
                ImageDraw.Draw(mascara).ellipse(caja, fill=255)
            ImageDraw.Draw(mascara).ellipse((440, 395, 584, 640), fill=0)  # el pico abierto se queda
            mascara = mascara.filter(ImageFilter.GaussianBlur(10))
            Image.composite(hechos["parpadeo"], hechos["hablando"], mascara).save(destino / f"{eid}_parpadeo_hablando.png")
            print("ok", f"{eid}_parpadeo_hablando.png")


def _mayor_componente(mascara):
    """Deja solo la mancha blanca más grande de una máscara L (0/255) y rellena sus huecos."""
    w, h = mascara.size
    px = mascara.load()
    etiqueta = [0] * (w * h)
    mejor, mejor_n, actual = 0, 0, 0
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0] < 128 or etiqueta[y0 * w + x0]:
                continue
            actual += 1
            n, cola = 0, deque([(x0, y0)])
            etiqueta[y0 * w + x0] = actual
            while cola:
                x, y = cola.popleft()
                n += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny] >= 128 and not etiqueta[ny * w + nx]:
                        etiqueta[ny * w + nx] = actual
                        cola.append((nx, ny))
            if n > mejor_n:
                mejor, mejor_n = actual, n
    out = Image.new("L", (w, h), 0)
    out.putdata([255 if e == mejor else 0 for e in etiqueta])
    # rellenar huecos: lo que no se alcanza desde el borde por fuera de la mancha es hueco
    fuera = Image.new("L", (w + 2, h + 2), 0)
    fuera.paste(out, (1, 1))
    ImageDraw.floodfill(fuera, (0, 0), 128)
    return fuera.crop((1, 1, w + 1, h + 1)).point(lambda v: 0 if v == 128 else 255)


def extraer_capa(base, editada, zona):
    """Capa RGBA con solo lo que la edición añadió (p. ej. un sombrero), alineada con 'base'."""
    base, editada = base.convert("RGB"), editada.convert("RGB")
    dx, dy = _desplazamiento(base, editada)
    editada = ImageChops.offset(editada, dx, dy)
    r, g, b = ImageChops.difference(base, editada).split()
    cambio = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > 50 else 0)
    limite = Image.new("L", base.size, 0)
    ImageDraw.Draw(limite).rectangle(zona, fill=255)
    cambio = ImageChops.multiply(cambio, limite)
    cambio = cambio.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))  # cerrar grietas
    # la mancha principal a 1/4 de tamaño (rápido) y luego a tamaño real
    peq = cambio.resize((base.width // 4, base.height // 4), Image.BILINEAR).point(lambda v: 255 if v > 100 else 0)
    peq = _mayor_componente(peq)
    mascara = ImageChops.multiply(peq.resize(base.size, Image.BILINEAR).filter(ImageFilter.MaxFilter(5)), cambio)
    mascara = mascara.filter(ImageFilter.GaussianBlur(1.2))
    capa = editada.convert("RGBA")
    capa.putalpha(mascara)
    return capa


def extraer_por_color(base, editada, zona, tonos=(6, 36), sat_min=70, cierre=31, contorno=7):
    """Capa RGBA de un accesorio por su color (tonos en la escala HSV de Pillow, 0-255; marrón ≈ 6-36).
    Más fiable que comparar con la base cuando el accesorio tiene partes oscuras como la cabeza."""
    base, editada = base.convert("RGB"), editada.convert("RGB")
    dx, dy = _desplazamiento(base, editada)
    editada = ImageChops.offset(editada, dx, dy)
    h, s, v = editada.convert("HSV").split()
    hp, sp, vp = h.load(), s.load(), v.load()
    w, alto = editada.size
    m = Image.new("L", editada.size, 0)
    mp = m.load()
    x0, y0, x1, y1 = zona
    for y in range(y0, min(y1, alto)):
        for x in range(x0, min(x1, w)):
            if tonos[0] <= hp[x, y] <= tonos[1] and sp[x, y] >= sat_min and vp[x, y] >= 50:
                mp[x, y] = 255
    # cerrar huecos pequeños (franja del sombrero, sombras) y quedarse con la pieza principal
    m = m.filter(ImageFilter.MaxFilter(cierre)).filter(ImageFilter.MinFilter(cierre))
    peq = m.resize((w // 4, alto // 4), Image.BILINEAR).point(lambda v: 255 if v > 100 else 0)
    peq = _mayor_componente(peq)
    m = ImageChops.multiply(peq.resize(editada.size, Image.BILINEAR).point(lambda v: 255 if v > 100 else 0), m)
    m = m.filter(ImageFilter.MaxFilter(contorno))  # incluye el contorno negro del accesorio
    m = m.filter(ImageFilter.GaussianBlur(1.2))
    capa = editada.convert("RGBA")
    capa.putalpha(m)
    return capa


def cmd_accesorio(nombre, descripcion, n=3, zona=(0, 0, 1024, 600)):
    base_ruta = IA / "frames" / "normal_quieto.png"
    destino = IA / "accesorios"
    destino.mkdir(parents=True, exist_ok=True)
    base = Image.open(base_ruta).convert("RGB")
    prompt = (EDITAR.replace("Change ONLY the face: ", "")
              + f"Keep the face exactly the same. Add ONLY this: {descripcion}. " + ESTILO)
    for i in range(n):
        semilla = 7000 + i * 131
        ruta = destino / f"{nombre}_{semilla}.png"
        if ruta.exists():
            continue
        editada = pedir(prompt, semilla, base_ruta)
        editada.save(destino / f"_{nombre}_{semilla}_editada.png")
        capa = extraer_capa(base, editada, zona)
        capa.save(ruta)
        print("ok", ruta.name)


def quitar_fondo(img, tol=40):
    """Vuelve transparente el fondo blanco conectado con los bordes (no toca blancos interiores)."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    visto = bytearray(w * h)
    cola = deque()
    for x in range(w):
        cola.extend(((x, 0), (x, h - 1)))
    for y in range(h):
        cola.extend(((0, y), (w - 1, y)))
    while cola:
        x, y = cola.popleft()
        i = y * w + x
        if visto[i]:
            continue
        visto[i] = 1
        r, g, b, _ = px[x, y]
        if 255 * 3 - (r + g + b) > tol * 3:
            continue
        px[x, y] = (255, 255, 255, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not visto[ny * w + nx]:
                cola.append((nx, ny))
    # suavizar el borde: píxeles claros pegados al fondo quedan semitransparentes
    alfa = img.getchannel("A")
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if px[x, y][3] and any(px[x + dx, y + dy][3] == 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                r, g, b, _ = px[x, y]
                claro = (r + g + b) / 3
                alfa.putpixel((x, y), int(max(0, min(255, (255 - claro) * 3))))
    img.putalpha(alfa)
    return img


def cmd_recortar():
    origen, destino = IA / "unificados", IA / "png"
    destino.mkdir(parents=True, exist_ok=True)
    # una carpeta por expresión: ia/png/<expresion>/quieto.png, hablando.png, parpadeo.png, parpadeo_hablando.png, grito.png
    tipos = ("parpadeo_hablando", "quieto", "hablando", "parpadeo", "grito")  # el más largo primero
    for ruta in sorted(origen.glob("*.png")):
        tipo = next((t for t in tipos if ruta.stem.endswith("_" + t)), None)
        if tipo is None:
            continue
        eid = ruta.stem[: -len(tipo) - 1]
        (destino / eid).mkdir(parents=True, exist_ok=True)
        quitar_fondo(Image.open(ruta)).save(destino / eid / f"{tipo}.png")
        print("ok", eid, tipo)


if __name__ == "__main__":
    cargar_env()
    args = sys.argv[1:]
    if not args:
        print(__doc__)
    elif args[0] == "base":
        cmd_base(int(args[1]) if len(args) > 1 else 4)
    elif args[0] == "frames":
        cmd_frames(args[1], args[2:])
    elif args[0] == "accesorio":
        # python tools/cuervo_ia.py accesorio sombrero "a brown cowboy hat on its head" 3
        cmd_accesorio(args[1], args[2], int(args[3]) if len(args) > 3 else 3)
    elif args[0] == "unificar":
        cmd_unificar()
    elif args[0] == "recortar":
        cmd_recortar()
