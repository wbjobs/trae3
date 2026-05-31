import sys
sys.path.insert(0, '.')
from PIL import Image, ImageDraw, ImageFont
import io
import requests

img = Image.new('RGB', (800, 600), color='white')
draw = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('arial.ttf', 24)
except:
    font = ImageFont.load_default()

y = 50
lines = [
    '设备名称：电动机',
    '型号规格：Y2-132M-4',
    '出厂编号：202401001234',
    '制造厂家：上海电机厂有限公司'
]
for line in lines:
    draw.text((50, y), line, fill='black', font=font)
    y += 40

img_bytes = io.BytesIO()
img.save(img_bytes, format='JPEG', quality=95)
img_bytes.seek(0)

files = {'file': ('test.jpg', img_bytes, 'image/jpeg')}
print('正在调用OCR接口...')
try:
    response = requests.post('http://localhost:8000/api/v1/ocr/recognize', files=files, timeout=60)
    print(f'状态码: {response.status_code}')
    print(f'响应: {response.text[:2000]}')
    if response.status_code != 200:
        try:
            err = response.json()
            if 'detail' in err:
                print(f'错误详情: {err["detail"]}')
        except:
            pass
except Exception as e:
    import traceback
    print(f'异常: {e}')
    traceback.print_exc()
