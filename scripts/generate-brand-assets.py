#!/usr/bin/env python3
"""Build the App Store icon and launch image from images/logo.png.

The header teal is #007c91. The wordmark in images/logo.png sits on a white
chip, the same way it sits in the site header. Outputs are opaque PNGs:

  assets/icon-only.png     1024x1024  (source for @capacitor/assets)
  assets/splash.png        2732x2732
  assets/splash-dark.png   same artwork, so dark mode does not flash white
  images/apple-touch-icon.png  180x180

Poppins is used for the splash slogan when the font files are available.
Pass --regular and --italic if they are not next to this script.
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "images" / "logo.png"
TEAL = (0, 124, 145, 255)
WHITE = (255, 255, 255, 255)


def load_logo():
    image = Image.open(LOGO).convert("RGBA")
    image = image.crop(image.split()[-1].getbbox())
    return image


def fit_logo(logo, width):
    height = max(1, round(logo.height * (width / logo.width)))
    return logo.resize((width, height), Image.Resampling.LANCZOS)


def rounded_card(logo, card_size, radius):
    card = Image.new("RGBA", card_size, WHITE)
    x = (card_size[0] - logo.width) // 2
    y = (card_size[1] - logo.height) // 2
    card.alpha_composite(logo, (x, y))
    mask = Image.new("L", card_size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, card_size[0] - 1, card_size[1] - 1),
        radius=radius,
        fill=255,
    )
    card.putalpha(mask)
    return card


def canvas(size):
    image = Image.new("RGBA", (size, size), TEAL)
    return image


def paste_center(base, sprite, center):
    x = center[0] - sprite.width // 2
    y = center[1] - sprite.height // 2
    base.alpha_composite(sprite, (x, y))


def flatten(image):
    background = Image.new("RGB", image.size, TEAL[:3])
    background.paste(image, mask=image.split()[-1])
    return background


def build_icon(logo):
    mark = fit_logo(logo, 820)
    card = rounded_card(mark, (900, 300), 40)
    image = canvas(1024)
    paste_center(image, card, (512, 512))
    return flatten(image)


def load_font(path, size):
    if path and Path(path).is_file():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def build_splash(logo, italic_font):
    mark = fit_logo(logo, 1680)
    card = rounded_card(mark, (1860, 620), 48)
    image = canvas(2732)
    slogan = "where 2 go on the go"
    font = load_font(italic_font, 92)
    draw = ImageDraw.Draw(image)
    bbox = draw.textbbox((0, 0), slogan, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    gap = 84
    group_h = card.height + gap + text_h
    top = (2732 - group_h) // 2
    paste_center(image, card, (1366, top + card.height // 2))
    text_x = (2732 - text_w) // 2 - bbox[0]
    text_y = top + card.height + gap - bbox[1]
    draw.text((text_x, text_y), slogan, font=font, fill=WHITE)
    return flatten(image)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--italic", default="")
    args = parser.parse_args()
    logo = load_logo()
    out = ROOT / "assets"
    out.mkdir(exist_ok=True)
    icon = build_icon(logo)
    splash = build_splash(logo, args.italic)
    icon.save(out / "icon-only.png", optimize=True)
    splash.save(out / "splash.png", optimize=True)
    splash.save(out / "splash-dark.png", optimize=True)
    icon.resize((180, 180), Image.Resampling.LANCZOS).save(
        ROOT / "images" / "apple-touch-icon.png", optimize=True
    )
    print("wrote", out / "icon-only.png", out / "splash.png")


if __name__ == "__main__":
    main()
