"""Génère les images de l'application à partir du logo officiel (branding/logo-source.png).

    pip install pillow && python3 scripts/generate-icons.py

Produit : public/brand/logo.webp (logo complet), public/brand/logo-mark.webp (emblème seul) et les
icônes du téléphone dans public/icons/ (client, livreur, partenaire, favicon).
Le fond gris clair de l'image d'origine est rendu transparent.
"""
import os
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'branding' / 'logo-source.png'
PUBLIC = ROOT / 'public'
BLUE = (11, 42, 91)
ORANGE = (248, 104, 0)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def is_background(p):
    r, g, b = p[:3]
    return min(r, g, b) >= 195 and max(r, g, b) - min(r, g, b) <= 22


def cut_out(src: Image.Image) -> Image.Image:
    """Rend transparent le fond clair relié aux bords, avec un bord adouci."""
    im = src.convert('RGBA')
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    queue = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while queue:
        x, y = queue.popleft()
        i = y * w + x
        if seen[i] or not is_background(px[x, y]):
            continue
        seen[i] = 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                queue.append((nx, ny))
    for y in range(h):
        for x in range(w):
            if seen[y * w + x]:
                px[x, y] = (255, 255, 255, 0)
    near = im.split()[3].point(lambda v: 255 if v == 0 else 0).filter(ImageFilter.MaxFilter(5)).load()
    bg = (238, 239, 240)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and near[x, y]:
                alpha = min(1.0, max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2])) / 70)
                if alpha < 0.04:
                    px[x, y] = (255, 255, 255, 0)
                    continue
                c = [max(0, min(255, round((v - (1 - alpha) * bv) / alpha))) for v, bv in zip((r, g, b), bg)]
                px[x, y] = (*c, round(alpha * 255))
    return im


def fit(img, box):
    s = min(box[0] / img.size[0], box[1] / img.size[1])
    return img.resize((max(1, round(img.size[0] * s)), max(1, round(img.size[1] * s))), Image.LANCZOS)


def square(mark, size, scale, band=None, band_color=ORANGE):
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    area_h = size * (0.72 if band else 1)
    m = fit(mark, (size * scale, area_h * scale))
    y = round((area_h - m.size[1]) / 2) + (round(size * 0.03) if band else 0)
    canvas.alpha_composite(m, (round((size - m.size[0]) / 2), y))
    if band:
        d = ImageDraw.Draw(canvas)
        top = round(size * 0.74)
        d.rectangle((0, top, size, size), fill=band_color)
        font = ImageFont.truetype(FONT, round(size * 0.12))
        tw = d.textlength(band, font=font)
        box = font.getbbox(band)
        d.text(((size - tw) / 2, top + (size - top - (box[3] - box[1])) / 2 - box[1]), band, font=font, fill=(255, 255, 255))
    return canvas.convert('RGB')


def labeled(mark, size, label, color):
    """Icône avec bandeau, contenue dans la zone sûre des icônes « maskable »."""
    canvas = Image.new('RGB', (size, size), (255, 255, 255))
    inner = square(mark, round(size * 0.8), 0.9, band=label, band_color=color)
    ImageDraw.Draw(canvas).rectangle((0, round(size * 0.1) + round(size * 0.8 * 0.74), size, size), fill=color)
    canvas.paste(inner, (round(size * 0.1), round(size * 0.1)))
    return canvas


def save_png(img, path):
    img.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)


def main():
    cut = cut_out(Image.open(SOURCE))
    full = cut.crop(cut.getbbox())
    # L'emblème (A + C + livreur) est au-dessus du nom : on coupe à la première ligne vide sous l'emblème.
    alpha = full.split()[3]
    rows = [alpha.crop((0, y, full.size[0], y + 1)).getbbox() is not None for y in range(full.size[1])]
    gap = next(y for y in range(full.size[1] // 3, full.size[1]) if not rows[y])
    mark = full.crop((0, 0, full.size[0], gap))
    mark = mark.crop(mark.getbbox())

    (PUBLIC / 'brand').mkdir(exist_ok=True)
    fit(full, (480, 260)).save(PUBLIC / 'brand' / 'logo.webp', quality=85, method=6)
    fit(mark, (240, 140)).save(PUBLIC / 'brand' / 'logo-mark.webp', quality=90, method=6)
    icons = PUBLIC / 'icons'
    save_png(square(mark, 192, 0.86), icons / 'icon-192.png')
    save_png(square(mark, 512, 0.86), icons / 'icon-512.png')
    save_png(square(mark, 512, 0.62), icons / 'icon-maskable-512.png')
    save_png(square(mark, 180, 0.80), icons / 'apple-touch-icon.png')
    save_png(square(mark, 32, 0.96), icons / 'favicon-32.png')
    for size in (192, 512):
        save_png(labeled(mark, size, 'LIVREUR', ORANGE), icons / f'livreur-{size}.png')
        save_png(labeled(mark, size, 'PARTENAIRE', BLUE), icons / f'partenaire-{size}.png')
    for f in sorted(list((PUBLIC / 'brand').iterdir()) + list(icons.iterdir())):
        print(f'✔ {f.relative_to(ROOT)} ({os.path.getsize(f) // 1024} Ko)')


if __name__ == '__main__':
    main()
