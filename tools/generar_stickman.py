"""
Genera el avatar stickman (vista 3/4, mirando al público, con cascos y micro).

    python tools/generar_stickman.py

Crea avatares/stickman/normal/ listo para "Importar carpeta":
  quieto.png     callado, brazos abajo
  parpadeo.png   callado con los ojos cerrados
  hablando.webp  animado: recorre 3 gestos de brazos (y parpadea una vez) mientras hablas
  grito.png      brazos arriba, boca muy abierta
y en avatares/stickman/sueltos/ los gestos por separado (para Veadotube u otros programas).

Todo es vectorial: cambia colores, grosores o poses aquí y vuelve a ejecutarlo.
"""
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "avatares" / "stickman"
LADO = 1024

TINTA = "#141414"
PIEL = "#f6f6f8"
LENGUA = "#e8657a"
TRAZO = 17

# Cabeza girada hacia la izquierda de la imagen: la cara se desplaza a la izquierda
# y se ve el auricular del lado derecho (el izquierdo queda detrás de la cabeza).
CAB = (505, 330, 228, 214)  # cx, cy, rx, ry
OJO_CERCA = (402, 318, 22, 31)
OJO_LEJOS = (540, 313, 18, 30)  # más estrecho por el escorzo
BOCA = (462, 428)
HOMBRO_I, HOMBRO_D = (380, 606), (634, 612)

# Brazos: (codo, mano) de cada lado
POSES = {
    "reposo": {"i": ((322, 760), (302, 915)), "d": ((690, 764), (712, 918))},
    # explica con la mano derecha levantada junto al hombro
    "gesto1": {"i": ((322, 762), (304, 916)), "d": ((770, 760), (745, 615))},
    # palma abierta arriba a la izquierda, la derecha a media altura
    "gesto2": {"i": ((262, 735), (215, 600)), "d": ((728, 790), (785, 700))},
    # las dos manos a la altura del pecho, codos hacia fuera
    "gesto3": {"i": ((282, 812), (330, 688)), "d": ((736, 818), (690, 690))},
    "grito":  {"i": ((235, 590), (180, 430)), "d": ((790, 596), (842, 434))},
}

# Ciclo de habla: (pose, boca, ojos, milisegundos). Las transiciones se interpolan.
CICLO = [("gesto1", "abierta", "abiertos", 650),
         ("gesto2", "ancha", "abiertos", 520),
         ("gesto2", "ancha", "cerrados", 110),
         ("gesto2", "ancha", "abiertos", 260),
         ("gesto3", "media", "abiertos", 650),
         ("gesto1", "media", "abiertos", 450)]
PASOS_TRANSICION = 3
MS_TRANSICION = 55


def elipse(cx, cy, rx, ry, relleno=TINTA, trazo=None, grosor=TRAZO, extra=""):
    t = f' stroke="{trazo}" stroke-width="{grosor}"' if trazo else ""
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{relleno}"{t} {extra}/>'


def linea(d, grosor=TRAZO, color=TINTA):
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{grosor}" '
            'stroke-linecap="round" stroke-linejoin="round"/>')


def brazo(hombro, codo, mano):
    (hx, hy), (cx, cy), (mx, my) = hombro, codo, mano
    # curva suave que pasa por el codo, más natural que dos segmentos rectos
    qx, qy = 2 * cx - (hx + mx) / 2, 2 * cy - (hy + my) / 2
    return linea(f"M{hx},{hy} Q{qx:.1f},{qy:.1f} {mx},{my}", grosor=TRAZO + 1) + \
        elipse(mx, my, 31, 31, PIEL, TINTA, TRAZO - 3)


def ojos(estado):
    if estado == "cerrados":
        out = ""
        for cx, cy, rx, _ in (OJO_CERCA, OJO_LEJOS):
            out += linea(f"M{cx - rx - 6},{cy} Q{cx},{cy + 16} {cx + rx + 6},{cy}", grosor=TRAZO - 4)
        return out
    out = ""
    for cx, cy, rx, ry in (OJO_CERCA, OJO_LEJOS):
        out += elipse(cx, cy, rx, ry)
        out += elipse(cx - rx * 0.3, cy - ry * 0.38, rx * 0.32, ry * 0.26, PIEL)  # brillo
    return out


def boca(tipo):
    x, y = BOCA
    if tipo == "cerrada":
        return linea(f"M{x - 44},{y - 6} Q{x},{y + 26} {x + 40},{y - 8}", grosor=TRAZO - 3)
    # ancho, alto: boca en D (arriba recta, abajo redonda), un poco más estrecha hacia el lado lejano
    an, al = {"media": (44, 32), "abierta": (52, 48), "ancha": (58, 64), "grito": (76, 100)}[tipo]
    d = f"M{x - an},{y - 8} L{x + an * 0.85},{y - 12} Q{x + an * 0.8},{y + al} {x - 4},{y + al} Q{x - an * 1.05},{y + al} {x - an},{y - 8} Z"
    lengua = elipse(x - 2, y + al * 0.72, an * 0.55, al * 0.3, LENGUA)
    return (f'<clipPath id="b"><path d="{d}"/></clipPath>'
            f'<path d="{d}" fill="{TINTA}"/><g clip-path="url(#b)">{lengua}</g>'
            f'<path d="{d}" fill="none" stroke="{TINTA}" stroke-width="{TRAZO - 5}" stroke-linejoin="round"/>')


def cuerpo():
    # torso cortado por abajo, hombro izquierdo algo más alto y ancho (está más cerca)
    d = ("M372,620 Q376,560 440,552 L575,554 Q640,560 642,626 "
         "L664,1060 L352,1060 Z")
    return f'<path d="{d}" fill="{PIEL}" stroke="{TINTA}" stroke-width="{TRAZO}" stroke-linejoin="round"/>'


def cabeza():
    cx, cy, rx, ry = CAB
    mechon = (f'<path d="M512,132 L530,36 L568,108 L622,50 L616,142 Z" fill="{PIEL}" '
              f'stroke="{TINTA}" stroke-width="{TRAZO}" stroke-linejoin="round"/>')
    diadema = linea(f"M{cx - 205},{cy - 110} Q{cx - 40},{cy - 268} {cx + 222},{cy - 40}", grosor=26)
    cara = elipse(cx, cy, rx, ry, PIEL, TINTA)
    # mejilla del lado de la cara un poco más llena (escorzo)
    auricular = (elipse(718, 352, 50, 82, TINTA, extra='transform="rotate(-8 718 352)"') +
                 elipse(706, 352, 22, 50, "#3a3a3a", extra='transform="rotate(-8 706 352)"'))
    micro = linea("M700,420 Q690,488 600,486", grosor=13) + elipse(588, 484, 30, 23)
    return mechon + cara + diadema + auricular + micro


def svg(pose, tipo_boca, estado_ojos):
    brazos = brazo(HOMBRO_I, *pose["i"]) + brazo(HOMBRO_D, *pose["d"])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{LADO}" height="{LADO}" viewBox="0 0 {LADO} {LADO}">'
            f'{cuerpo()}{brazos}{cabeza()}{ojos(estado_ojos)}{boca(tipo_boca)}</svg>')


def render(pose, tipo_boca="cerrada", estado_ojos="abiertos"):
    png = cairosvg.svg2png(bytestring=svg(pose, tipo_boca, estado_ojos).encode())
    return Image.open(BytesIO(png)).convert("RGBA")


def mezclar(a, b, t):
    t = t * t * (3 - 2 * t)  # suavizado
    lerp = lambda p, q: (round(p[0] + (q[0] - p[0]) * t), round(p[1] + (q[1] - p[1]) * t))
    return {lado: tuple(lerp(p, q) for p, q in zip(a[lado], b[lado])) for lado in a}


def animacion_hablando():
    fotos, tiempos = [], []
    for i, (pose, b, o, ms) in enumerate(CICLO):
        fotos.append(render(POSES[pose], b, o))
        tiempos.append(ms)
        sig = CICLO[(i + 1) % len(CICLO)][0]
        if sig != pose:
            for k in range(1, PASOS_TRANSICION + 1):
                p = mezclar(POSES[pose], POSES[sig], k / (PASOS_TRANSICION + 1))
                fotos.append(render(p, b, "abiertos"))
                tiempos.append(MS_TRANSICION)
    return fotos, tiempos


def main():
    normal = SALIDA / "normal"
    sueltos = SALIDA / "sueltos"
    normal.mkdir(parents=True, exist_ok=True)
    sueltos.mkdir(parents=True, exist_ok=True)

    render(POSES["reposo"]).save(normal / "quieto.png")
    render(POSES["reposo"], estado_ojos="cerrados").save(normal / "parpadeo.png")
    render(POSES["grito"], "grito").save(normal / "grito.png")
    fotos, tiempos = animacion_hablando()
    fotos[0].save(normal / "hablando.webp", save_all=True, append_images=fotos[1:],
                  duration=tiempos, loop=0, lossless=True)

    for n, (pose, b) in enumerate([("gesto1", "abierta"), ("gesto2", "ancha"), ("gesto3", "media")], 1):
        render(POSES[pose], b).save(sueltos / f"hablando_{n}.png")
        render(POSES[pose], b, "cerrados").save(sueltos / f"hablando_{n}_parpadeo.png")
    print("ok", SALIDA)


if __name__ == "__main__":
    main()
