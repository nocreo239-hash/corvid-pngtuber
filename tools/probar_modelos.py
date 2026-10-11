"""
Compara modelos de Cloudflare Workers AI con la misma descripción y semilla.

  python tools/probar_modelos.py <carpeta_salida> "<descripción>"

Escribe un PNG por modelo y una hoja de contacto. Cada modelo cuesta distinto (mirar el panel de Cloudflare).
"""
import base64
import os
import sys
import time
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cuervo_ia import cargar_env  # noqa: E402

MODELOS = {
    "flux2-klein-4b": ("@cf/black-forest-labs/flux-2-klein-4b", "multipart"),
    "flux2-klein-9b": ("@cf/black-forest-labs/flux-2-klein-9b", "multipart"),
    "flux2-dev": ("@cf/black-forest-labs/flux-2-dev", "multipart"),
    "leonardo-lucid": ("@cf/leonardo/lucid-origin", "json"),
}
LADO = 1024
SEMILLA = 4242


def generar(modelo, tipo, prompt):
    cuenta, token = os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"]
    url = f"https://api.cloudflare.com/client/v4/accounts/{cuenta}/ai/run/{modelo}"
    h = {"Authorization": f"Bearer {token}"}
    if tipo == "multipart":
        kw = {"files": {"prompt": (None, prompt), "width": (None, str(LADO)), "height": (None, str(LADO)),
                        "seed": (None, str(SEMILLA))}}
    else:
        kw = {"json": {"prompt": prompt, "width": LADO, "height": LADO, "seed": SEMILLA}}
    t0 = time.time()
    r = requests.post(url, headers=h, timeout=300, **kw)
    if r.status_code != 200:
        raise RuntimeError(f"{r.status_code}: {r.text[:300]}")
    if r.headers.get("content-type", "").startswith("image/"):
        datos = r.content
    else:
        j = r.json()
        datos = base64.b64decode((j.get("result") or j)["image"])
    return Image.open(BytesIO(datos)).convert("RGB"), time.time() - t0


if __name__ == "__main__":
    cargar_env()
    salida, prompt = Path(sys.argv[1]), sys.argv[2]
    salida.mkdir(parents=True, exist_ok=True)
    hechos = []
    for nombre, (modelo, tipo) in MODELOS.items():
        ruta = salida / f"{nombre}.png"
        if not ruta.exists():
            try:
                img, seg = generar(modelo, tipo, prompt)
                img.save(ruta)
                print(f"ok {nombre} ({seg:.0f} s)")
            except Exception as e:  # noqa: BLE001
                print(f"ERROR {nombre}: {e}")
                continue
        hechos.append((nombre, ruta))
    lado = 420
    hoja = Image.new("RGB", (lado * len(hechos), lado + 26), "#222")
    d = ImageDraw.Draw(hoja)
    for i, (nombre, ruta) in enumerate(hechos):
        hoja.paste(Image.open(ruta).convert("RGB").resize((lado, lado)), (i * lado, 26))
        d.text((i * lado + 6, 6), nombre, fill="white")
    hoja.save(salida / "_hoja.png")
    print(salida / "_hoja.png")
