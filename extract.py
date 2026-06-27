import re, base64, os

with open('main.html', 'r', encoding='utf-8') as f:
    html = f.read()

os.makedirs('images', exist_ok=True)
count = 0

def replace_img(m):
    global count
    data = m.group(2)
    ext = m.group(1).split('/')[-1].split(';')[0]
    filename = f'images/image_{count}.{ext}'
    with open(filename, 'wb') as f:
        f.write(base64.b64decode(data))
    count += 1
    return f'src="images/image_{count-1}.{ext}"'

new_html = re.sub(r'src="data:image/([^;]+);base64,([^"]+)"', replace_img, html)

with open('main_yeni.html', 'w', encoding='utf-8') as f:
    f.write(new_html)

print(f'{count} gorsel cikarildi!')
