from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs('apps/extension/icons', exist_ok=True)

for size in [16, 48, 128]:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = max(1, size // 16)
    
    # Background: Rounded emerald/slate green block (#10b981)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=max(2, size // 4),
        fill='#10b981',
        outline='#059669',
        width=max(1, size // 32)
    )
    
    # Inner bedrock block grid motif / letter 'B'
    if size >= 48:
        # Draw stylized BDS pickaxe / block symbol
        center = size // 2
        block_w = size // 3
        draw.rectangle(
            [center - block_w // 2, center - block_w // 2, center + block_w // 2, center + block_w // 2],
            fill='#064e3b'
        )
        draw.text((size // 2, size // 2), 'B', fill='#ffffff', anchor='mm')
    else:
        draw.text((size // 2, size // 2), 'B', fill='#ffffff', anchor='mm')
        
    img.save(f'apps/extension/icons/icon-{size}.png')
    print(f'Generated apps/extension/icons/icon-{size}.png')
