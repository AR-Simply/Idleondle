import os
from PIL import Image

# configure these values
input_folder = "C:/Users/tobia/PycharmProjects/wiki scraper/images/recipes/Tab 1"
output_folder =  "C:/Users/tobia/PycharmProjects/wiki scraper/images/recipes/crops"

# crop parameters
x = 577           # top-left x
y = 261            # top-left y
width = 523
height = 632

os.makedirs(output_folder, exist_ok=True)

for filename in os.listdir(input_folder):
    if filename.lower().endswith((".png", ".jpg", ".jpeg")):
        img_path = os.path.join(input_folder, filename)
        img = Image.open(img_path)

        crop_box = (x, y, x + width, y + height)
        cropped = img.crop(crop_box)

        out_path = os.path.join(output_folder, "Tab 1_"+filename)
        cropped.save(out_path)
