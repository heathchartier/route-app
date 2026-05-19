"""Generate icon PNGs for FieldIQ (icon-192, icon-512, icon-180, apple-touch-icon)."""
from PIL import Image, ImageDraw, ImageFont
import os, shutil

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def make_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # --- Gradient background ---
    c1 = hex_to_rgb('#0f2237')
    c2 = hex_to_rgb('#061018')
    r = int(size * 112 / 512)

    grad = Image.new('RGBA', (size, size))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / size
        col = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)
        gd.line([(0, y), (size - 1, y)], fill=col)

    mask = Image.new('L', (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    img.paste(grad, mask=mask)
    draw = ImageDraw.Draw(img)

    teal = (0, 229, 184)
    white = (255, 255, 255)

    # --- Subtle glow ring ---
    cx = size // 2
    cy_ring = int(size * 230 / 512)
    ring_r = int(size * 175 / 512)
    draw.ellipse(
        [cx - ring_r, cy_ring - ring_r, cx + ring_r, cy_ring + ring_r],
        outline=(0, 229, 184, 25), width=max(1, size // 256)
    )

    # --- Route dots (top) ---
    dots = [
        (int(size * 130 / 512), int(size * 105 / 512), int(size * 14 / 512)),
        (int(size * 256 / 512), int(size * 78 / 512),  int(size * 10 / 512)),
        (int(size * 382 / 512), int(size * 105 / 512), int(size * 14 / 512)),
    ]
    for dx, dy, dr in dots:
        draw.ellipse([dx - dr, dy - dr, dx + dr, dy + dr], fill=teal + (178,))
        inner = max(3, int(dr * 0.5))
        draw.ellipse([dx - inner, dy - inner, dx + inner, dy + inner], fill=white + (229,))

    # --- Route line connecting dots ---
    p0 = (int(size * 130 / 512), int(size * 105 / 512))
    p1 = (int(size * 190 / 512), int(size * 75 / 512))
    p2 = (int(size * 256 / 512), int(size * 78 / 512))
    p3 = (int(size * 322 / 512), int(size * 81 / 512))
    p4 = (int(size * 382 / 512), int(size * 105 / 512))
    pts = []
    for i in range(51):
        t = i / 50
        if t <= 0.5:
            s = t * 2
            x = (1-s)**2*p0[0] + 2*(1-s)*s*p1[0] + s**2*p2[0]
            y = (1-s)**2*p0[1] + 2*(1-s)*s*p1[1] + s**2*p2[1]
        else:
            s = (t - 0.5) * 2
            x = (1-s)**2*p2[0] + 2*(1-s)*s*p3[0] + s**2*p4[0]
            y = (1-s)**2*p2[1] + 2*(1-s)*s*p3[1] + s**2*p4[1]
        pts.append((int(x), int(y)))
    lw = max(2, int(size * 5 / 512))
    draw.line(pts, fill=teal + (153,), width=lw)

    # --- Load fonts ---
    def load_font(size_px):
        for fname in [
            'C:/Windows/Fonts/arialbd.ttf',
            'C:/Windows/Fonts/Arial Bold.ttf',
            'arialbd.ttf', 'Arial Bold.ttf', 'Arial.ttf', 'arial.ttf',
        ]:
            try:
                return ImageFont.truetype(fname, size_px)
            except Exception:
                pass
        return ImageFont.load_default()

    # --- "Field" label (white, smaller, above IQ) ---
    field_px = int(size * 82 / 512)
    field_baseline = int(size * 258 / 512)
    field_font = load_font(field_px)

    fb = draw.textbbox((0, 0), 'Field', font=field_font)
    ftx = (size - (fb[2] - fb[0])) // 2 - fb[0]
    fty = field_baseline - (fb[3] - fb[1]) - fb[1]
    draw.text((ftx, fty), 'Field', fill=(255, 255, 255, 224), font=field_font)

    # --- "IQ" main text (teal) ---
    iq_px = int(size * 186 / 512)
    iq_baseline = int(size * 392 / 512)
    iq_font = load_font(iq_px)

    ib = draw.textbbox((0, 0), 'IQ', font=iq_font)
    itx = (size - (ib[2] - ib[0])) // 2 - ib[0]
    ity = iq_baseline - (ib[3] - ib[1]) - ib[1]
    draw.text((itx, ity), 'IQ', fill=teal + (255,), font=iq_font)

    # --- Teal underline accent ---
    bar_x = int(size * 162 / 512)
    bar_w = int(size * 188 / 512)
    bar_y = int(size * 412 / 512)
    bar_h = max(3, int(size * 10 / 512))
    bar_r = max(2, bar_h // 2)
    draw.rounded_rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + bar_h],
                            radius=bar_r, fill=teal + (229,))

    return img

out_dir = os.path.dirname(os.path.abspath(__file__))

sizes = [
    (192,  'icon-192.png'),
    (512,  'icon-512.png'),
    (180,  'icon-180.png'),
    (180,  'apple-touch-icon.png'),
]

for sz, name in sizes:
    icon = make_icon(sz)
    bg = Image.new('RGB', (sz, sz), (6, 16, 24))
    bg.paste(icon, mask=icon.split()[3])
    out_path = os.path.join(out_dir, name)
    bg.save(out_path)
    print(f'Saved {name}  ({sz}x{sz})')

print('Done. All FieldIQ icons generated.')
