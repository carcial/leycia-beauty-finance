from PIL import Image
import os

original = os.path.join(os.path.dirname(__file__), "..", "assets", "logo-source.png")
out = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.png")

img = Image.open(original).convert("RGBA")
w, h = img.size
pixels = img.load()


def lum(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b


def sat(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    return 0 if mx == 0 else (mx - mn) / mx


for y in range(h):
    for x in range(w):
        r, g, b, _ = pixels[x, y]
        l = lum(r, g, b)
        s = sat(r, g, b)
        if l > 175 and s < 0.18:
            pixels[x, y] = (0, 0, 0, 0)
        elif l > 160 and s < 0.22 and abs(r - g) < 20 and abs(g - b) < 20:
            pixels[x, y] = (0, 0, 0, 0)
        else:
            pixels[x, y] = (r, g, b, 255)

bottom_cap = 84
xs, ys = [], []
for y in range(0, bottom_cap + 1):
    for x in range(w):
        if pixels[x, y][3] > 128:
            xs.append(x)
            ys.append(y)

left, right = min(xs), max(xs)
top = min(ys)
crop = img.crop((max(0, left - 16), max(0, top - 16), min(w, right + 16), min(h, bottom_cap + 6)))

pad = 24
canvas = Image.new("RGBA", (crop.width + pad * 2, crop.height + pad * 2), (0, 0, 0, 0))
canvas.paste(crop, (pad, pad), crop)
canvas.save(out, "PNG")
print(f"Saved transparent logo: {out} ({canvas.width}x{canvas.height})")
