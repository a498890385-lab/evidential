from PIL import Image, ImageDraw, ImageFont
import os
S = 256
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([6, 6, S - 6, S - 6], radius=58, fill=(37, 99, 235, 255))
font = None
for f in [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"]:
    if os.path.exists(f):
        font = ImageFont.truetype(f, 156)
        break
bb = d.textbbox((0, 0), "β", font=font)
w, h = bb[2] - bb[0], bb[3] - bb[1]
d.text(((S - w) / 2 - bb[0], (S - h) / 2 - bb[1] - 4), "β", font=font, fill=(255, 255, 255, 255))
os.makedirs("build", exist_ok=True)
img.save("build/icon.png")
img.save("build/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("icon ok", os.path.getsize("build/icon.ico"))
