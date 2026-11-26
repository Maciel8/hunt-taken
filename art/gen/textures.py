# Texturas do chão (256×256, emendam sem costura): ruído periódico em várias escalas + detalhes de pixel.
# Sem grade e sem simetria espelhada. Cores médias próximas das texturas antigas. Uso: python3 art/gen/textures.py
import numpy as np
from PIL import Image
S = 256
rng = np.random.default_rng(7331)
def pnoise(cells, seed):
    r = np.random.default_rng(seed).random((cells, cells))
    x = np.arange(S) / S * cells; i0 = np.floor(x).astype(int); t = x - i0; t = t * t * (3 - 2 * t); i1 = (i0 + 1) % cells
    a = r[i0][:, i0] * (1 - t)[None, :] + r[i0][:, i1] * t[None, :]
    b = r[i1][:, i0] * (1 - t)[None, :] + r[i1][:, i1] * t[None, :]
    return a * (1 - t)[:, None] + b * t[:, None]
def fbm(seed, octs=((4, .5), (8, .25), (16, .15), (32, .1))):
    v = sum(w * pnoise(c, seed + k) for k, (c, w) in enumerate(octs)); return (v - v.min()) / (v.max() - v.min())
def shade(pal, v):
    idx = np.clip((v * len(pal)).astype(int), 0, len(pal) - 1); return np.array(pal, dtype=np.float32)[idx]
def speckle(img, color, p, seed, size=1):
    r = np.random.default_rng(seed); m = r.random((S, S)) < p
    for dy in range(size):
        for dx in range(size): img[np.roll(np.roll(m, dy, 0), dx, 1)] = color
def save(name, img): Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(f"assets/tex/{name}.png"); print("ok", name, img.reshape(-1, 3).mean(0).round())
def blades(img, cols, n, seed):
    r = np.random.default_rng(seed)
    for _ in range(n):
        x, y, h = r.integers(0, S), r.integers(0, S), r.integers(2, 5); c = cols[r.integers(0, len(cols))]
        for k in range(h): img[(y - k) % S, (x + (k // 2) * (1 if r.random() < .5 else -1)) % S] = c
# grama (campos)
v = fbm(1); g = shade([(70, 130, 40), (82, 146, 46), (94, 160, 52), (106, 172, 58), (118, 182, 66)], v * .9 + .1 * pnoise(64, 9))
blades(g, [(60, 116, 34), (128, 192, 72), (74, 136, 40)], 2600, 2); speckle(g, (140, 200, 80), .004, 3); save("grass", g)
# chão de floresta (folhas, musgo)
v = fbm(11); g = shade([(30, 58, 34), (36, 68, 38), (42, 78, 42), (50, 88, 46), (58, 98, 52)], v)
blades(g, [(26, 50, 28), (66, 110, 56)], 1800, 12); speckle(g, (120, 78, 36), .003, 13, 2); speckle(g, (150, 110, 40), .0015, 14); save("grass_dark", g)
# areia (ondulações suaves)
v = fbm(21, ((4, .45), (8, .3), (32, .15), (64, .1))); yy = np.arange(S)[:, None]; ripple = (np.sin((yy + pnoise(4, 25) * 60) / 256 * 6.283 * 9) + 1) / 2
g = shade([(214, 190, 138), (224, 202, 150), (232, 212, 162), (240, 222, 174)], v * .7 + ripple * .3); speckle(g, (196, 170, 120), .006, 22); speckle(g, (250, 236, 196), .004, 23); save("sand", g)
# pântano (lama e poças)
v = fbm(31); g = shade([(62, 104, 58), (72, 118, 64), (84, 132, 72), (96, 146, 80), (108, 156, 88)], v)
pud = fbm(35, ((6, .6), (12, .4))) > .72; g[pud] = g[pud] * .6 + np.array([40, 70, 60]) * .4; speckle(g, (52, 86, 48), .01, 32); save("swamp", g)
# rocha (chão de pedra com rachaduras irregulares)
v = fbm(41); g = shade([(112, 112, 116), (124, 124, 128), (136, 136, 140), (148, 148, 152), (160, 160, 164)], v)
cr = np.abs(fbm(45, ((8, .6), (16, .4))) - .5) < .012; g[cr] = g[cr] * .65; speckle(g, (96, 96, 100), .008, 42); speckle(g, (176, 176, 180), .004, 43); save("rock", g)
# calçamento: pedras irregulares (Voronoi periódico) com rejunte
r = np.random.default_rng(51); pts = r.random((90, 2)) * S; yy, xx = np.mgrid[0:S, 0:S]
d1 = np.full((S, S), 1e9); d2 = np.full((S, S), 1e9); idx = np.zeros((S, S), int)
for k, (px, py) in enumerate(pts):
    for ox in (-S, 0, S):
        for oy in (-S, 0, S):
            d = np.hypot(xx - px - ox, yy - py - oy); m = d < d1; d2 = np.where(m, d1, np.minimum(d2, d)); idx = np.where(m, k, idx); d1 = np.where(m, d, d1)
tone = r.random(90)[idx] * 26 + 128; g = np.stack([tone, tone, tone + 4], -1) + (fbm(55) - .5)[..., None] * 18
edge = (d2 - d1) < 2.2; g[edge] = (86, 84, 82); save("cobble", g)
