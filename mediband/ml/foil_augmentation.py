"""
MediBand - Phase 4: Blister Foil & Metallic Strip Augmentation Engine
Simulates the physical, optical, and geometric properties of metallic pharmaceutical blister packs:
1. Aluminum foil metallic sheen & desaturation
2. Specular reflection & blister cavity glare spots
3. Random perspective & vertical strip aspect ratio jitter
4. Letterbox square padding (prevents squashing tall strips)
"""

import math
import random
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw
import torch
from torchvision import transforms

class LetterboxPad:
    """Pads an arbitrary aspect ratio image to square with neutral reflection/gray fill."""
    def __init__(self, target_size=224, fill_color=(128, 128, 128)):
        self.target_size = target_size
        self.fill_color = fill_color

    def __call__(self, img: Image.Image) -> Image.Image:
        w, h = img.size
        max_dim = max(w, h)
        if w == h:
            return img.resize((self.target_size, self.target_size), Image.Resampling.BILINEAR)

        # Create square canvas
        square = Image.new("RGB", (max_dim, max_dim), self.fill_color)
        paste_x = (max_dim - w) // 2
        paste_y = (max_dim - h) // 2
        square.paste(img, (paste_x, paste_y))
        return square.resize((self.target_size, self.target_size), Image.Resampling.BILINEAR)

class SimulateMetallicFoil:
    """Simulates aluminum foil reflectivity, metallic desaturation, and high ink contrast."""
    def __init__(self, p=0.7):
        self.p = p

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() > self.p:
            return img

        # 1. Color desaturation towards silver
        sat_enhancer = ImageEnhance.Color(img)
        img = sat_enhancer.enhance(random.uniform(0.3, 0.7))

        # 2. Contrast boost to mimic printed ink on foil
        contrast_enhancer = ImageEnhance.Contrast(img)
        img = contrast_enhancer.enhance(random.uniform(1.2, 1.8))

        # 3. Metallic specular sheen gradient
        w, h = img.size
        arr = np.array(img, dtype=np.float32)

        # Add angled linear sheen bar
        angle = random.uniform(-0.5, 0.5)
        y_indices, x_indices = np.indices((h, w), dtype=np.float32)
        band_pos = random.uniform(0.2, 0.8) * (w + h)
        band_width = random.uniform(0.15, 0.3) * (w + h)
        dist = np.abs((x_indices + y_indices * angle) - band_pos)
        sheen = np.exp(- (dist ** 2) / (2 * (band_width / 2) ** 2)) * random.uniform(30, 70)

        arr = np.clip(arr + sheen[:, :, np.newaxis], 0, 255).astype(np.uint8)
        return Image.fromarray(arr)

class SimulateBlisterBubbles:
    """Simulates round/oval pill cavity bubbles with specular highlight rims."""
    def __init__(self, p=0.6):
        self.p = p

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() > self.p:
            return img

        w, h = img.size
        # Draw blister bubble specular rims onto an overlay mask
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        # Typically 2 columns x 5 rows = 10 tablets
        cols = random.choice([2, 3])
        rows = random.choice([4, 5, 6])
        cell_w = w / (cols + 1)
        cell_h = h / (rows + 1)
        radius = min(cell_w, cell_h) * 0.38

        for r in range(1, rows + 1):
            for c in range(1, cols + 1):
                cx = c * cell_w + random.uniform(-4, 4)
                cy = r * cell_h + random.uniform(-4, 4)
                
                # Outer highlight arc (flash reflection)
                highlight_color = (255, 255, 255, random.randint(40, 110))
                draw.arc([cx - radius, cy - radius, cx + radius, cy + radius],
                         start=random.randint(200, 240), end=random.randint(320, 360),
                         fill=highlight_color, width=max(1, int(radius * 0.15)))

        # Blur the overlay for natural lighting
        overlay = overlay.filter(ImageFilter.GaussianBlur(radius=random.uniform(1.0, 2.5)))
        img_rgba = img.convert("RGBA")
        combined = Image.alpha_composite(img_rgba, overlay)
        return combined.convert("RGB")

class RandomStripAspectCrop:
    """Simulates cropping or aspect-stretching to vertical/horizontal medicine strips."""
    def __init__(self, p=0.5):
        self.p = p

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() > self.p:
            return img

        w, h = img.size
        # Stretch or crop aspect ratio to elongated blister strip format (0.35 to 0.65)
        strip_ratio = random.uniform(0.35, 0.65)
        if random.random() < 0.5:
            # Tall vertical strip
            new_w = int(h * strip_ratio)
            if new_w < w:
                left = random.randint(0, w - new_w)
                return img.crop((left, 0, left + new_w, h))
        else:
            # Wide horizontal strip
            new_h = int(w * strip_ratio)
            if new_h < h:
                top = random.randint(0, h - new_h)
                return img.crop((0, top, w, top + new_h))
        return img

def get_foil_training_transforms(img_size=(224, 224)):
    """Complete Phase 4 training transform pipeline combining foil simulation and letterbox padding."""
    return transforms.Compose([
        RandomStripAspectCrop(p=0.4),
        LetterboxPad(target_size=img_size[0]),
        SimulateMetallicFoil(p=0.6),
        SimulateBlisterBubbles(p=0.5),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomVerticalFlip(p=0.3),
        transforms.RandomRotation(degrees=15),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

def get_foil_eval_transforms(img_size=(224, 224)):
    """Phase 4 evaluation transform with aspect-ratio preserving letterbox padding."""
    return transforms.Compose([
        LetterboxPad(target_size=img_size[0]),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
