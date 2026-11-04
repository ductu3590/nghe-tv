"""Generate the Nghe icons (512x423, the Samsung Home tile ratio) with only Python's standard library.

Design: five rounded sound bars, the middle ones tallest, over a deep night gradient.
The probe gets the same bars in amber so the two apps are easy to tell apart.
Run from anywhere: python tools/build_icon.py
"""
from pathlib import Path
import struct
import zlib

WIDTH, HEIGHT, SAMPLES = 512, 423, 3
TOP, BOTTOM = (30, 40, 86), (12, 14, 30)
BARS = (0.34, 0.62, 0.9, 0.62, 0.34)  # bar heights as a share of the drawing area
BAR_W, GAP = 46, 26
ROOT = Path(__file__).resolve().parents[1]


def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)


def inside_bar(x, y):
    total = len(BARS) * BAR_W + (len(BARS) - 1) * GAP
    left = (WIDTH - total) / 2
    area_top, area_bottom = HEIGHT * 0.2, HEIGHT * 0.8
    mid = (area_top + area_bottom) / 2
    for index, share in enumerate(BARS):
        x0 = left + index * (BAR_W + GAP)
        if not x0 <= x < x0 + BAR_W:
            continue
        half = (area_bottom - area_top) * share / 2
        y0, y1, r = mid - half, mid + half, BAR_W / 2
        cx = x0 + r
        if y0 + r <= y <= y1 - r:
            return True
        for cy in (y0 + r, y1 - r):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                return True
    return False


def render(color):
    rows = []
    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        base = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        row = bytearray(b'\x00')
        for x in range(WIDTH):
            hits = sum(inside_bar(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES)
                       for sx in range(SAMPLES) for sy in range(SAMPLES)) / (SAMPLES * SAMPLES)
            row += bytes(round(base[i] + (color[i] - base[i]) * hits) for i in range(3))
        rows.append(bytes(row))
    header = struct.pack('!IIBBBBB', WIDTH, HEIGHT, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')


def main():
    (ROOT / 'app' / 'icon.png').write_bytes(render((94, 227, 154)))
    (ROOT / 'probe' / 'icon.png').write_bytes(render((242, 182, 76)))


if __name__ == '__main__':
    main()
