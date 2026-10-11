"""
Genera avatares PNGtuber con IA (Cloudflare FLUX.2 klein, el mismo generador que el cuervo chibi).

  python tools/avatar_ia.py base <personaje> <variante> [n]
        -> candidatos en ia/<personaje>/base/<variante>_<semilla>.png  (para que el usuario elija)
  python tools/avatar_ia.py editar <ref.png> <salida.png> "<qué cambiar>" [semilla]
        -> edita una imagen manteniendo el personaje (caras, posiciones de alas, accesorios)
  python tools/avatar_ia.py hoja <carpeta> [salida.png]
        -> hoja de contacto para revisar

Cuota: ~105 neurons por imagen de 1024x1024 (10.000 gratis al día, se renuevan a las 00:00 UTC).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cuervo_ia  # noqa: E402
from cuervo_ia import cargar_env, pedir  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent

# Fondo verde pastel liso: se recorta por color y no se confunde con el negro ni con el blanco de los ojos.
FONDO = "plain flat solid pastel green background, no text, no shadow on the background, no props"

MODELOS = {
    "4b": "@cf/black-forest-labs/flux-2-klein-4b",  # ~105 neurons por imagen 1024²
    "9b": "@cf/black-forest-labs/flux-2-klein-9b",  # más detalle y estilo; también edita
}

PERSONAJES = {
    # Chibi "gótico": silueta morado oscuro con borde blanco de pegatina y ojo amarillo en anillo.
    "cuervo_gotico": {
        "estilo": ("drawn as a cute die-cut sticker: the whole silhouette is filled with flat dark slate purple-grey "
                   "colour, a few simple slightly lighter purple-grey lines hint at the feathers and the folded wing, "
                   "a thick clean white sticker border runs around the whole outer silhouette, soft hand-drawn lines "
                   "with slight wobble, cosy indie illustration, not 3D, no gradients"),
        "pose": ("Three-quarter view: the body is turned about 35 degrees to the left while the head faces the "
                 "viewer, upper body and head only, wings folded against the sides in a relaxed resting pose, "
                 "the character fills most of the image"),
        "variantes": {
            "anillo": "a chibi crow character with a big round head, a small fluffy tuft on top, a short simple "
                      "pointed beak, and one big round eye drawn as a bright yellow ring with a dark empty centre",
            "dos_ojos": "a chibi crow character with a big round head, a small fluffy tuft on top, a short simple "
                        "pointed beak, and two big round eyes, each drawn as a bright yellow ring with a dark empty "
                        "centre, both visible because of the three-quarter view",
            "alargado": "a chibi crow character with a slightly elongated body and a short visible neck, an oval head "
                        "with a few ruffled feathers on top, a short thick pointed beak, and one big round eye drawn as "
                        "a bright yellow ring with a dark empty centre",
            "bolita": "a very round, plump chibi crow character shaped almost like a ball, tiny ruffled tuft on top, "
                      "a small simple pointed beak, a little folded wing on the side, and one big round eye drawn "
                      "as a bright yellow ring with a dark empty centre",
        },
    },

    # Silueta negra plana, ojos blancos enormes (estilo "black cat pngtuber"), en vista 3/4.
    "cuervo_negro": {
        "estilo": ("minimalist flat graphic style: solid pure black silhouette with no outlines and no interior "
                   "lines, two huge perfectly round white eyes with small black pupils looking at the viewer, "
                   "flat colors, no gradients, no texture, centered, full body"),
        "pose": ("Three-quarter view: the body is turned about 35 degrees to the left while the eyes look straight "
                 "at the viewer, so the beak points slightly to the left. Wings folded against the sides of the body "
                 "in a relaxed resting pose"),
        "variantes": {
            "redondo": "a cute crow character with a round chubby body, a small pale grey pointed beak, tiny dark "
                       "grey feet and a short fan of simple tail feathers",
            "esbelto": "a cute crow character with a slim upright body, a longer pointed tail, a small warm "
                       "yellow-orange pointed beak and thin dark grey legs",
            "copete": "a cute crow character with a round body, a small tuft of three feathers sticking up on top "
                      "of the head, a small pale grey pointed beak, tiny dark grey feet and a short tail",
        },
    },
}


def usar_modelo(clave):
    """Cambia el modelo con el que pide cuervo_ia.pedir (4b por defecto)."""
    cuervo_ia.MODELO = MODELOS[clave]


def cmd_base(personaje, variante, n=2, modelo="4b", semilla0=7300):
    usar_modelo(modelo)
    p = PERSONAJES[personaje]
    destino = RAIZ / "ia" / personaje / "base"
    destino.mkdir(parents=True, exist_ok=True)
    prompt = f"{p['variantes'][variante]}, {p['estilo']}. {p['pose']}. {FONDO}"
    for i in range(n):
        semilla = semilla0 + i * 977
        ruta = destino / f"{variante}_{modelo}_{semilla}.png"
        if ruta.exists():
            continue
        pedir(prompt, semilla, None).save(ruta)
        print("ok", ruta.name)


EDITAR = ("Same character, exact same drawing style, colors, size and position in the frame, same plain flat "
          "pastel green background, head in exactly the same place. ")


def cmd_editar(ref, salida, cambio, semilla=5150):
    salida = Path(salida)
    if salida.exists():
        print("ya existe", salida.name)
        return
    salida.parent.mkdir(parents=True, exist_ok=True)
    pedir(EDITAR + cambio, int(semilla), Path(ref)).save(salida)
    print("ok", salida.name)


def cmd_hoja(carpeta, salida=None, lado=340, columnas=3):
    fs = sorted(p for p in Path(carpeta).glob("*.png") if not p.name.startswith("_"))
    filas = (len(fs) + columnas - 1) // columnas
    hoja = Image.new("RGB", (lado * columnas, lado * filas), "#777")
    d = ImageDraw.Draw(hoja)
    for i, f in enumerate(fs):
        hoja.paste(Image.open(f).convert("RGB").resize((lado, lado)), ((i % columnas) * lado, (i // columnas) * lado))
        d.text(((i % columnas) * lado + 4, (i // columnas) * lado + 4), f.stem, fill="red")
    salida = Path(salida) if salida else Path(carpeta) / "_hoja.png"
    hoja.save(salida)
    print(salida)


if __name__ == "__main__":
    cargar_env()
    a = sys.argv[1:]
    if not a:
        print(__doc__)
    elif a[0] == "base":
        # python tools/avatar_ia.py base cuervo_gotico anillo 2 9b [semilla_inicial]
        cmd_base(a[1], a[2], int(a[3]) if len(a) > 3 else 2, a[4] if len(a) > 4 else "4b",
                 int(a[5]) if len(a) > 5 else 7300)
    elif a[0] == "editar":
        cmd_editar(a[1], a[2], a[3], *(a[4:5]))
    elif a[0] == "hoja":
        cmd_hoja(a[1], *(a[2:3]))
