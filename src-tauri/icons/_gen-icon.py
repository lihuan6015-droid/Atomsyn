#!/usr/bin/env python3
"""
Atomsyn · App icon generator
Composites the atom logo onto a macOS-style rounded-square background
with gradient, inner bevel, drop shadow, and glossy highlight.

Usage: python3 src-tauri/icons/_gen-icon.py
Output: src-tauri/icons/icon.png (1024x1024 master)
        + all size variants for Tauri build
"""

import sys
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).parent
# V2.0: user provided a pre-composited icon with gloss + shadow baked in.
# Much better quality than our PIL compositing. Use it directly as master.
# V2.0-layout: switched to Atomsyn_logo_svg.png — pure transparent-bg atom
# icon. The composite_icon() path below will add the macOS rounded-square
# background, gradient, inner bevel, gloss and drop shadow programmatically.
ICON_PATH = ROOT.parent.parent / "non-existent-to-force-composite.png"
# Fallback: raw logo for compositing (kept but no longer default path)
LOGO_PATH = ROOT.parent.parent / "src/assets/atomsyn-logo.png"
OUT_DIR = ROOT

SIZE = 1024
RADIUS = int(SIZE * 0.22)  # macOS icon corner radius ~22%

def rounded_rect_mask(size, radius):
    """Create an alpha mask for a rounded rectangle."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask

def gradient_bg(size):
    """Create a subtle warm-white gradient background."""
    img = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / size
        # Top: #f8f9fc → Bottom: #e2e3ec
        r = int(248 - t * 22)
        g = int(249 - t * 24)
        b = int(252 - t * 16)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
    return img

def inner_shadow(size, radius, offset=6, blur_radius=20, alpha=30):
    """Create a subtle inner shadow (bottom/right edges)."""
    # Dark shadow on bottom-right
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.rounded_rectangle(
        [offset, offset, size - 1 + offset, size - 1 + offset],
        radius=radius,
        fill=(0, 0, 0, alpha),
    )
    # Subtract the shape itself to get only the edge
    mask = rounded_rect_mask(size, radius)
    # Blur
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur_radius))
    # Mask to only show inside the shape
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(shadow, mask=mask)
    return result

def inner_highlight(size, radius):
    """Bright highlight on top-left edge."""
    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(highlight)
    draw.rounded_rectangle(
        [-4, -4, size - 5, size - 5],
        radius=radius,
        fill=(255, 255, 255, 60),
    )
    mask = rounded_rect_mask(size, radius)
    highlight = highlight.filter(ImageFilter.GaussianBlur(16))
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(highlight, mask=mask)
    return result

def glossy_overlay(size, radius):
    """Top-left glossy shine."""
    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(gloss)
    # Elliptical highlight in top portion
    draw.ellipse(
        [int(size * 0.05), int(-size * 0.35), int(size * 0.95), int(size * 0.45)],
        fill=(255, 255, 255, 55),
    )
    gloss = gloss.filter(ImageFilter.GaussianBlur(40))
    mask = rounded_rect_mask(size, radius)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(gloss, mask=mask)
    return result

def outer_shadow(size, radius, spread=40, alpha=35):
    """Drop shadow behind the icon for 3D depth."""
    canvas_size = size + spread * 4
    shadow = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    offset = spread * 2
    draw.rounded_rectangle(
        [offset, offset + 8, offset + size, offset + size + 8],
        radius=radius,
        fill=(60, 60, 100, alpha),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(spread))
    return shadow, offset

def composite_icon():
    """Build the final icon."""
    print(f"Loading logo from {LOGO_PATH}")
    logo = Image.open(LOGO_PATH).convert("RGBA")

    # Crop logo to square (it's 1024x1034)
    w, h = logo.size
    if w != h:
        sq = min(w, h)
        left = (w - sq) // 2
        top = (h - sq) // 2
        logo = logo.crop((left, top, left + sq, top + sq))

    # Resize logo to fit inside icon with customized scaling to match internal CSS
    logo_size = int(SIZE * 1.20)
    logo = logo.resize((logo_size, logo_size), Image.LANCZOS)

    # Enhance logo saturation slightly
    enhancer = ImageEnhance.Color(logo)
    logo = enhancer.enhance(1.15)

    # --- Build layers using alpha_composite throughout ---
    # 1. Background gradient (fully opaque)
    bg = gradient_bg(SIZE)

    # 2. Logo drop shadow — create a full-size layer, composite onto bg
    logo_x = (SIZE - logo_size) // 2
    logo_y = (SIZE - logo_size) // 2 - int(SIZE * 0.01)

    shadow_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    logo_a = logo.split()[3]
    shadow_mono = Image.new("RGBA", logo.size, (80, 80, 140, 0))
    shadow_pixels = shadow_mono.load()
    logo_a_pixels = logo_a.load()
    for x in range(logo.size[0]):
        for y_px in range(logo.size[1]):
            a = logo_a_pixels[x, y_px]
            shadow_pixels[x, y_px] = (80, 80, 140, int(a * 0.35))
    shadow_mono = shadow_mono.filter(ImageFilter.GaussianBlur(14))
    # Paste WITHOUT mask — let alpha_composite handle blending
    shadow_layer.paste(shadow_mono, (logo_x + 4, logo_y + 10))
    bg = Image.alpha_composite(bg, shadow_layer)

    # 3. Logo — paste WITHOUT mask onto a transparent layer, then
    #    alpha_composite so logo's own alpha is respected but
    #    transparent regions don't punch through the bg gradient.
    logo_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    logo_layer.paste(logo, (logo_x, logo_y))
    bg = Image.alpha_composite(bg, logo_layer)

    # 4. Inner shadow (depth on bottom/right edges)
    ishadow = inner_shadow(SIZE, RADIUS)
    bg = Image.alpha_composite(bg, ishadow)

    # 5. Inner highlight (top/left edges)
    ihighlight = inner_highlight(SIZE, RADIUS)
    bg = Image.alpha_composite(bg, ihighlight)

    # 6. Glossy overlay
    # 6. Glossy overlay
    gloss = glossy_overlay(SIZE, RADIUS)
    bg = Image.alpha_composite(bg, gloss)

    # 7. Apply rounded mask — final icon core.
    mask = rounded_rect_mask(SIZE, RADIUS)
    final = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    final.paste(bg, mask=mask)

    # --- Scale down to macOS standard padding (824x824) ---
    MAC_APP_SIZE = 824
    scaled = final.resize((MAC_APP_SIZE, MAC_APP_SIZE), Image.LANCZOS)
    
    # 8. Add macOS intrinsic drop shadow
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    
    offset_x = (SIZE - MAC_APP_SIZE) // 2
    offset_y = (SIZE - MAC_APP_SIZE) // 2
    sr = int(MAC_APP_SIZE * 0.22)

    # Large ambient shadow
    shadow1 = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw1 = ImageDraw.Draw(shadow1)
    s_offset_y1 = offset_y + 16
    draw1.rounded_rectangle(
        [offset_x, s_offset_y1, offset_x + MAC_APP_SIZE, s_offset_y1 + MAC_APP_SIZE],
        radius=sr,
        fill=(0, 0, 0, 45),
    )
    shadow1 = shadow1.filter(ImageFilter.GaussianBlur(20))
    
    # Sharp close shadow
    shadow2 = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw2 = ImageDraw.Draw(shadow2)
    s_offset_y2 = offset_y + 6
    draw2.rounded_rectangle(
        [offset_x, s_offset_y2, offset_x + MAC_APP_SIZE, s_offset_y2 + MAC_APP_SIZE],
        radius=sr,
        fill=(0, 0, 0, 30),
    )
    shadow2 = shadow2.filter(ImageFilter.GaussianBlur(8))
    
    # Composite shadows and the scaled icon
    canvas = Image.alpha_composite(canvas, shadow1)
    canvas = Image.alpha_composite(canvas, shadow2)
    canvas.paste(scaled, (offset_x, offset_y), scaled)

    return canvas

def generate_all_sizes(master):
    """Generate all icon sizes needed for Tauri build."""
    sizes = {
        "icon.png": 1024,
        "32x32.png": 32,
        "64x64.png": 64,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        # Windows store logos
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }

    for name, size in sizes.items():
        out = OUT_DIR / name
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(str(out), "PNG")
        print(f"  {name} ({size}x{size})")

    # .ico (Windows) — contains multiple sizes
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images = [master.resize((s, s), Image.LANCZOS) for s in ico_sizes]
    ico_path = OUT_DIR / "icon.ico"
    ico_images[0].save(str(ico_path), format="ICO", sizes=[(s, s) for s in ico_sizes],
                       append_images=ico_images[1:])
    print(f"  icon.ico ({len(ico_sizes)} sizes)")

    # .icns (macOS) — use iconutil via temp .iconset dir
    iconset = OUT_DIR / "icon.iconset"
    iconset.mkdir(exist_ok=True)
    icns_sizes = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    for name, size in icns_sizes.items():
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(str(iconset / name), "PNG")

    icns_path = OUT_DIR / "icon.icns"
    ret = os.system(f'iconutil -c icns "{iconset}" -o "{icns_path}"')
    if ret == 0:
        print(f"  icon.icns (via iconutil)")
        # Clean up .iconset
        import shutil
        shutil.rmtree(str(iconset))
    else:
        print(f"  icon.icns FAILED (iconutil exit {ret}), .iconset kept for manual conversion")

    # iOS icons
    ios_dir = OUT_DIR / "ios"
    ios_dir.mkdir(exist_ok=True)
    ios_sizes = {
        "AppIcon-20x20@1x.png": 20,
        "AppIcon-20x20@2x.png": 40,
        "AppIcon-20x20@3x.png": 60,
        "AppIcon-29x29@1x.png": 29,
        "AppIcon-29x29@2x.png": 58,
        "AppIcon-29x29@3x.png": 87,
        "AppIcon-40x40@1x.png": 40,
        "AppIcon-40x40@2x.png": 80,
        "AppIcon-40x40@3x.png": 120,
        "AppIcon-60x60@2x.png": 120,
        "AppIcon-60x60@3x.png": 180,
        "AppIcon-76x76@1x.png": 76,
        "AppIcon-76x76@2x.png": 152,
        "AppIcon-83.5x83.5@2x.png": 167,
        "AppIcon-1024x1024@1x.png": 1024,
    }
    for name, size in ios_sizes.items():
        resized = master.resize((size, size), Image.LANCZOS)
        (ios_dir / name).parent.mkdir(exist_ok=True)
        resized.save(str(ios_dir / name), "PNG")
    print(f"  ios/ ({len(ios_sizes)} sizes)")

    # Android icons
    android_dir = OUT_DIR / "android"
    android_dir.mkdir(exist_ok=True)
    android_sizes = {
        "mipmap-mdpi/ic_launcher.png": 48,
        "mipmap-hdpi/ic_launcher.png": 72,
        "mipmap-xhdpi/ic_launcher.png": 96,
        "mipmap-xxhdpi/ic_launcher.png": 144,
        "mipmap-xxxhdpi/ic_launcher.png": 192,
        "mipmap-mdpi/ic_launcher_round.png": 48,
        "mipmap-hdpi/ic_launcher_round.png": 72,
        "mipmap-xhdpi/ic_launcher_round.png": 96,
        "mipmap-xxhdpi/ic_launcher_round.png": 144,
        "mipmap-xxxhdpi/ic_launcher_round.png": 192,
        "mipmap-mdpi/ic_launcher_foreground.png": 108,
        "mipmap-hdpi/ic_launcher_foreground.png": 162,
        "mipmap-xhdpi/ic_launcher_foreground.png": 216,
        "mipmap-xxhdpi/ic_launcher_foreground.png": 324,
        "mipmap-xxxhdpi/ic_launcher_foreground.png": 432,
    }
    for name, size in android_sizes.items():
        resized = master.resize((size, size), Image.LANCZOS)
        out_path = android_dir / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        resized.save(str(out_path), "PNG")
    print(f"  android/ ({len(android_sizes)} sizes)")

if __name__ == "__main__":
    print("Atomsyn · Icon Generator")
    print("=" * 40)

    # Prefer the pre-composited icon (image.png) if available — it has
    # professionally baked gloss, shadow, and gradient that PIL can't match.
    if ICON_PATH.exists():
        print(f"Using pre-composited icon: {ICON_PATH}")
        master = Image.open(ICON_PATH).convert("RGBA")
        # Crop to square if slightly off
        w, h = master.size
        if w != h:
            sq = min(w, h)
            left = (w - sq) // 2
            top = (h - sq) // 2
            master = master.crop((left, top, left + sq, top + sq))
        # Upscale to 1024 for the master (LANCZOS gives best quality)
        if master.size[0] < SIZE:
            print(f"  Upscaling {master.size[0]}px → {SIZE}px")
            master = master.resize((SIZE, SIZE), Image.LANCZOS)
    elif LOGO_PATH.exists():
        print("Compositing icon from raw logo...")
        master = composite_icon()
    else:
        print(f"ERROR: Neither {ICON_PATH} nor {LOGO_PATH} found")
        sys.exit(1)

    master.save(str(OUT_DIR / "icon.png"), "PNG")
    print(f"\nMaster: icon.png ({master.size[0]}x{master.size[1]})")

    print("\nGenerating size variants...")
    generate_all_sizes(master)

    print("\nDone!")
