"""
Genera las imágenes SVG del cuervo chibi de ejemplo.

Cada imagen combina un tipo de ojos con un tipo de pico:
  ojos: open, closed, happy, angry, wide, squint
  pico: closed, open, wide

Uso:  python tools/generar_cuervo.py
Escribe los archivos en assets/raven/raven_<ojos>_<pico>.svg
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets" / "raven"

EYE_L = (194, 262)
EYE_R = (318, 262)
LINE = "#e9e3f8"

DEFS = """
  <defs>
    <radialGradient id="body" cx="40%" cy="28%" r="78%">
      <stop offset="0" stop-color="#4b4268"/>
      <stop offset="0.45" stop-color="#272238"/>
      <stop offset="1" stop-color="#110f18"/>
    </radialGradient>
    <radialGradient id="wing" cx="30%" cy="30%" r="90%">
      <stop offset="0" stop-color="#2e2842"/>
      <stop offset="1" stop-color="#121019"/>
    </radialGradient>
    <linearGradient id="beak" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7c7591"/>
      <stop offset="1" stop-color="#2b2837"/>
    </linearGradient>
    <radialGradient id="iris" cx="45%" cy="35%" r="70%">
      <stop offset="0" stop-color="#d9c2ff"/>
      <stop offset="0.5" stop-color="#9566f7"/>
      <stop offset="1" stop-color="#4a2a9c"/>
    </radialGradient>
    <linearGradient id="bow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b673ff"/>
      <stop offset="1" stop-color="#6a2bb0"/>
    </linearGradient>
  </defs>"""


def wing(side):
    # Ala izquierda; la derecha se refleja.
    path = ('<path d="M132,262 C82,282 66,360 104,424 C120,408 128,396 134,382 '
            'C140,398 146,404 156,410 C164,370 166,320 160,286 Z" fill="url(#wing)"/>'
            '<path d="M116,330 C112,360 114,384 122,402 M138,322 C134,352 136,376 142,396" '
            'stroke="#3a3350" stroke-width="5" fill="none" stroke-linecap="round"/>')
    if side == "R":
        return f'<g transform="translate(512,0) scale(-1,1)">{path}</g>'
    return f"<g>{path}</g>"


def base_back():
    return f"""
  <ellipse cx="256" cy="478" rx="128" ry="15" fill="#000" opacity="0.28"/>
  <g stroke="#45405a" stroke-width="9" stroke-linecap="round">
    <path d="M216,446 L198,474 M216,446 L216,480 M216,446 L234,474"/>
    <path d="M296,446 L278,474 M296,446 L296,480 M296,446 L314,474"/>
  </g>
  {wing("L")}{wing("R")}
  <g fill="#272238">
    <path d="M246,166 C232,136 236,112 250,96 C252,120 258,140 262,160 Z"/>
    <path d="M262,162 C266,134 280,118 300,112 C290,132 282,148 276,166 Z"/>
    <path d="M238,170 C222,152 208,148 192,150 C206,160 216,170 224,182 Z"/>
  </g>
  <ellipse cx="256" cy="300" rx="152" ry="150" fill="url(#body)"/>
  <ellipse cx="256" cy="378" rx="96" ry="60" fill="#2c2740" opacity="0.85"/>
  <g stroke="#3b3455" stroke-width="4" fill="none" stroke-linecap="round">
    <path d="M214,360 q12,10 24,0 M244,360 q12,10 24,0 M274,360 q12,10 24,0"/>
    <path d="M228,384 q12,10 24,0 M258,384 q12,10 24,0"/>
  </g>
  <ellipse cx="198" cy="196" rx="58" ry="26" fill="#ffffff" opacity="0.07" transform="rotate(-24 198 196)"/>
  <ellipse cx="156" cy="318" rx="26" ry="13" fill="#ff6fa8" opacity="0.33"/>
  <ellipse cx="356" cy="318" rx="26" ry="13" fill="#ff6fa8" opacity="0.33"/>"""


def bow():
    return """
  <g>
    <path d="M250,422 L244,444 M262,422 L268,444" stroke="#8a46d6" stroke-width="7" stroke-linecap="round"/>
    <path d="M256,410 L216,393 C206,404 206,426 216,437 Z" fill="url(#bow)"/>
    <path d="M256,410 L296,393 C306,404 306,426 296,437 Z" fill="url(#bow)"/>
    <circle cx="256" cy="413" r="11" fill="#c995ff"/>
  </g>"""


def eye_open(cx, cy, big=False):
    if big:
        return (f'<ellipse cx="{cx}" cy="{cy}" rx="44" ry="50" fill="#f6f2ff"/>'
                f'<ellipse cx="{cx+2}" cy="{cy+4}" rx="20" ry="24" fill="url(#iris)"/>'
                f'<ellipse cx="{cx+3}" cy="{cy+6}" rx="9" ry="11" fill="#120e1c"/>'
                f'<circle cx="{cx-6}" cy="{cy-4}" r="7" fill="#fff"/>')
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="40" ry="46" fill="#f6f2ff"/>'
            f'<ellipse cx="{cx+3}" cy="{cy+6}" rx="30" ry="36" fill="url(#iris)"/>'
            f'<ellipse cx="{cx+4}" cy="{cy+10}" rx="15" ry="19" fill="#120e1c"/>'
            f'<circle cx="{cx-10}" cy="{cy-8}" r="10" fill="#fff"/>'
            f'<circle cx="{cx+15}" cy="{cy+21}" r="5" fill="#fff" opacity="0.85"/>')


def stroke(d):
    return (f'<path d="{d}" stroke="{LINE}" stroke-width="9" fill="none" '
            'stroke-linecap="round" stroke-linejoin="round"/>')


def eyes(mode):
    out = []
    for side, (cx, cy) in (("L", EYE_L), ("R", EYE_R)):
        inner = 1 if side == "L" else -1  # dirección hacia el centro de la cara
        if mode == "open":
            out.append(eye_open(cx, cy))
        elif mode == "wide":
            out.append(eye_open(cx, cy, big=True))
        elif mode == "closed":
            out.append(stroke(f"M{cx-32},{cy+4} Q{cx},{cy+30} {cx+32},{cy+4}"))
            out.append(stroke(f"M{cx-32*inner},{cy+4} l{-10*inner},{-8}"))
        elif mode == "happy":
            out.append(stroke(f"M{cx-32},{cy+16} Q{cx},{cy-22} {cx+32},{cy+16}"))
        elif mode == "squint":
            out.append(stroke(f"M{cx-24*inner},{cy-22} L{cx+22*inner},{cy} L{cx-24*inner},{cy+22}"))
        elif mode == "angry":
            # Ojo recortado por una ceja inclinada hacia el centro.
            hi_out, hi_in = cy - 46, cy - 6
            x_out, x_in = cx - 52 * inner, cx + 52 * inner
            clip_id = f"clip{side}"
            out.append(f'<clipPath id="{clip_id}"><polygon points="{x_out},{hi_out} {x_in},{hi_in} '
                       f'{x_in},{cy+80} {x_out},{cy+80}"/></clipPath>')
            out.append(f'<g clip-path="url(#{clip_id})">{eye_open(cx, cy)}</g>')
            out.append(f'<path d="M{cx-46*inner},{cy-44} L{cx+44*inner},{cy-8}" stroke="#0b0910" '
                       'stroke-width="12" stroke-linecap="round"/>')
    return "\n  ".join(out)


def beak(mode):
    hl = '<path d="M240,{y} q16,-6 32,0" stroke="#a49dba" stroke-width="4" fill="none" opacity="0.6" stroke-linecap="round"/>'
    if mode == "closed":
        return ('<path d="M222,302 Q256,288 290,302 Q276,330 256,352 Q236,330 222,302 Z" fill="url(#beak)"/>'
                + hl.format(y=302))
    if mode == "open":
        return ('<path d="M228,310 Q256,298 284,310 Q281,350 256,364 Q231,350 228,310 Z" fill="#4a1630"/>'
                '<ellipse cx="256" cy="350" rx="14" ry="8" fill="#e2577f"/>'
                '<path d="M232,342 Q256,354 280,342 Q272,364 256,372 Q240,364 232,342 Z" fill="#3a3647"/>'
                '<path d="M222,296 Q256,282 290,296 Q274,318 256,330 Q238,318 222,296 Z" fill="url(#beak)"/>'
                + hl.format(y=296))
    if mode == "wide":
        return ('<path d="M224,306 Q256,292 288,306 Q286,368 256,384 Q226,368 224,306 Z" fill="#4a1630"/>'
                '<ellipse cx="256" cy="368" rx="18" ry="9" fill="#e2577f"/>'
                '<path d="M230,362 Q256,376 282,362 Q272,386 256,394 Q240,386 230,362 Z" fill="#3a3647"/>'
                '<path d="M218,290 Q256,274 294,290 Q276,312 256,322 Q236,312 218,290 Z" fill="url(#beak)"/>'
                + hl.format(y=290))
    raise ValueError(mode)


def raven(eye_mode, beak_mode):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
            f'{DEFS}{base_back()}{bow()}\n  {eyes(eye_mode)}\n  {beak(beak_mode)}\n</svg>\n')


COMBOS = [
    ("open", "closed"), ("open", "open"), ("closed", "closed"), ("closed", "open"), ("squint", "wide"),
    ("happy", "closed"), ("happy", "open"), ("happy", "wide"),
    ("angry", "closed"), ("angry", "open"), ("angry", "wide"),
    ("wide", "closed"), ("wide", "open"), ("wide", "wide"),
]

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for e, b in COMBOS:
        (OUT / f"raven_{e}_{b}.svg").write_text(raven(e, b), encoding="utf-8")
    print(f"{len(COMBOS)} imágenes en {OUT}")
