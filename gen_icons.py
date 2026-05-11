"""Generate icon-192.png and icon-512.png from the HC Routes icon design."""
from PIL import Image, ImageDraw, ImageFont
import os, math

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def make_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # --- Gradient background ---
    c1 = hex_to_rgb('#0f2237')
    c2 = hex_to_rgb('#061018')
    r = int(size * 112 / 512)  # corner radius proportional to 512

    # Draw gradient pixel rows into a temp image, then mask with rounded rect
    grad = Image.new('RGBA', (size, size))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / size
        col = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)
        gd.line([(0, y), (size - 1, y)], fill=col)

    # Mask: rounded rectangle
    mask = Image.new('L', (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    img.paste(grad, mask=mask)
    draw = ImageDraw.Draw(img)

    # --- Subtle glow ring ---
    cx, cy_ring = size // 2, int(size * 220 / 512)
    ring_r = int(size * 175 / 512)
    draw.ellipse(
        [cx - ring_r, cy_ring - ring_r, cx + ring_r, cy_ring + ring_r],
        outline=(0, 229, 184, 25), width=max(1, size // 256)
    )

    # --- Route dots (top) ---
    teal = (0, 229, 184)
    white = (255, 255, 255)
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
    # Simple bezier approximation using line segments
    p0 = (int(size * 130 / 512), int(size * 105 / 512))
    p1 = (int(size * 190 / 512), int(size * 75 / 512))
    p2 = (int(size * 256 / 512), int(size * 78 / 512))
    p3 = (int(size * 322 / 512), int(size * 81 / 512))
    p4 = (int(size * 382 / 512), int(size * 105 / 512))
    pts = []
    for i in range(51):
        t = i / 50
        # Two quadratic beziers joined at midpoint
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

    # --- "HC" text ---
    font_size = int(size * 210 / 512)
    text_y = int(size * 310 / 512)
    font = None
    for fname in ['arialbd.ttf', 'Arial Bold.ttf', 'Arial.ttf', 'arial.ttf',
                  'C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/Arial Bold.ttf']:
        try:
            font = ImageFont.truetype(fname, font_size)
            break
        except Exception:
            pass
    if font is None:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), 'HC', font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = text_y - th - bbox[1]
    draw.text((tx, ty), 'HC', fill=(255, 255, 255, 255), font=font)

    # --- Teal underline accent ---
    bar_x = int(size * 118 / 512)
    bar_w = int(size * 276 / 512)
    bar_y = int(size * 342 / 512)
    bar_h = int(size * 12 / 512)
    bar_r = max(2, bar_h // 2)
    draw.rounded_rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + bar_h],
                            radius=bar_r, fill=teal + (242,))

    # --- "ROUTES" tagline ---
    tag_size = int(size * 40 / 512)
    tag_y = int(size * 410 / 512)
    tag_font = None
    for fname in ['arialbd.ttf', 'Arial Bold.ttf', 'Arial.ttf', 'arial.ttf',
                  'C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf']:
        try:
            tag_font = ImageFont.truetype(fname, tag_size)
            break
        except Exception:
            pass
    if tag_font is None:
        tag_font = ImageFont.load_default()

    tb = draw.textbbox((0, 0), 'ROUTES', font=tag_font)
    ttw = tb[2] - tb[0]
    ttx = (size - ttw) // 2 - tb[0]
    tty = tag_y - (tb[3] - tb[1]) - tb[1]
    draw.text((ttx, tty), 'ROUTES', fill=teal + (216,), font=tag_font)

    return img

out_dir = os.path.dirname(os.path.abspath(__file__))
for sz, name in [(192, 'icon-192.png'), (512, 'icon-512.png')]:
    icon = make_icon(sz)
    # Convert to RGB with white background for PNG compatibility
    bg = Image.new('RGB', (sz, sz), (6, 16, 24))
    bg.paste(icon, mask=icon.split()[3])
    bg.save(os.path.join(out_dir, name))
    print(f'Saved {name}')

print('Done.')
