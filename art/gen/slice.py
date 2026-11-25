"""Recorta folhas geradas em fundo magenta em sprites PNG com alfa, reduz pra escala de pixel art e gera manifest.

uso: python3 slice.py <folha.png> <pasta_saida> <prefixo> [--target 32] [--grid COLSxROWS] [--names a,b,c]
  --grid  força corte em grade regular (quando o modelo alinhou bem); sem --grid usa componentes conexos.
  --target tamanho máximo (lado maior) de cada sprite depois da redução.
"""
import sys, json, os, argparse
from PIL import Image, ImageFilter
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("sheet"); ap.add_argument("out"); ap.add_argument("prefix")
ap.add_argument("--target", type=int, default=32)
ap.add_argument("--grid", default="")
ap.add_argument("--names", default="")
ap.add_argument("--minarea", type=int, default=400)
a = ap.parse_args()

im = Image.open(a.sheet).convert("RGB")
arr = np.asarray(im).astype(int)
r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
# magenta: R e B altos, G baixo (tolerante a compressão e sombra da IA)
bg = (r > 110) & (b > 0.6 * r) & (g < 0.55 * np.minimum(r, b))
fg = ~bg
os.makedirs(a.out, exist_ok=True)
names = [n for n in a.names.split(",") if n]
boxes = []
if a.grid:
    cols, rows = map(int, a.grid.lower().split("x"))
    W, H = im.size; cw, ch = W / cols, H / rows
    for j in range(rows):
        for i in range(cols):
            x0, y0, x1, y1 = int(i * cw), int(j * ch), int((i + 1) * cw), int((j + 1) * ch)
            sub = fg[y0:y1, x0:x1]
            if sub.sum() < a.minarea: boxes.append(None); continue
            ys, xs = np.where(sub)
            boxes.append((x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1))
else:
    # componentes conexos (4-vizinhança) com dilatação leve pra juntar partes soltas (folhas, flores)
    mask = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))
    m = np.asarray(mask) > 0
    lab = np.zeros(m.shape, dtype=int); n = 0
    H, W = m.shape
    for y in range(H):
        for x in range(W):
            if m[y, x] and lab[y, x] == 0:
                n += 1; stack = [(y, x)]; lab[y, x] = n
                while stack:
                    cy, cx = stack.pop()
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = n; stack.append((ny, nx))
    comps = []
    for k in range(1, n + 1):
        ys, xs = np.where((lab == k) & fg)
        if len(xs) < a.minarea: continue
        comps.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    # ordena em leitura: linhas por centro y (agrupadas), depois x
    comps.sort(key=lambda bx: ((bx[1] + bx[3]) / 2 // (im.size[1] / 6), (bx[0] + bx[2]) / 2))
    boxes = comps

manifest = []
for idx, bx in enumerate(boxes):
    if bx is None: continue
    x0, y0, x1, y1 = bx
    crop = Image.open(a.sheet).convert("RGBA").crop((x0, y0, x1, y1))
    ca = np.asarray(crop).astype(int)
    cr, cg, cb = ca[..., 0], ca[..., 1], ca[..., 2]
    cbg = (cr > 110) & (cb > 0.6 * cr) & (cg < 0.55 * np.minimum(cr, cb))
    am = Image.fromarray(np.where(cbg, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))
    alpha = np.asarray(am)
    rgba = np.dstack([ca[..., :3].astype(np.uint8), alpha])
    sp = Image.fromarray(rgba, "RGBA")
    # tira franja magenta: pixels com borda rosada viram a cor do vizinho opaco mais próximo (simples: escurece o canal R/B)
    px = np.asarray(sp).astype(int)
    fringe = (px[..., 3] > 0) & (px[..., 0] > 100) & (px[..., 2] > 0.6 * px[..., 0]) & (px[..., 1] < 0.6 * np.minimum(px[..., 0], px[..., 2]))
    px[fringe, 3] = 0
    sp = Image.fromarray(px.astype(np.uint8), "RGBA")
    bb = sp.getbbox()
    if not bb: continue
    sp = sp.crop(bb)
    bw, bh = sp.size
    s = a.target / max(bw, bh)
    if s < 1:
        sp = sp.resize((max(1, round(bw * s)), max(1, round(bh * s))), Image.LANCZOS)
        # re-pixeliza: alfa binário e quantização leve
        q = np.asarray(sp).copy(); q[..., 3] = np.where(q[..., 3] > 140, 255, 0); sp = Image.fromarray(q, "RGBA")
    name = names[idx] if idx < len(names) else f"{a.prefix}{idx:02d}"
    path = os.path.join(a.out, f"{name}.png"); sp.save(path)
    manifest.append({"name": name, "file": os.path.basename(path), "w": sp.size[0], "h": sp.size[1], "src": [int(x0), int(y0), int(x1), int(y1)]})
json.dump(manifest, open(os.path.join(a.out, f"{a.prefix}manifest.json"), "w"), indent=1, ensure_ascii=False)
# folha de contato pra conferir
cols = 8; cell = a.target + 8; rows_n = (len(manifest) + cols - 1) // cols
sheet = Image.new("RGBA", (cols * cell, max(1, rows_n) * cell), (40, 40, 48, 255))
for i, m in enumerate(manifest):
    sp = Image.open(os.path.join(a.out, m["file"]))
    sheet.paste(sp, ((i % cols) * cell + 4, (i // cols) * cell + 4), sp)
sheet = sheet.resize((sheet.size[0] * 3, sheet.size[1] * 3), Image.NEAREST)
sheet.save(os.path.join(a.out, f"{a.prefix}contato.png"))
print(f"{len(manifest)} sprites -> {a.out} ({a.prefix}contato.png)")
