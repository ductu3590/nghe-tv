# Nghe

App nghe tin tức, podcast và sách nói cho TV Samsung Tizen, tối giản theo tinh thần Apple. Chọn một bài, rồi chỉ còn hình nền và âm thanh.

- **Gọi thẳng nguồn, không máy chủ, không lưu trữ gì.** App tự đọc feed của VnExpress, Tuổi Trẻ, VOV, Vietcetera, Spiderum, Voiz FM, Fonos… trên TV. Chỉ có danh sách nguồn ([`app/sources.json`](app/sources.json)) nằm trên GitHub, để thay nguồn mà không phải ký lại app.
- **Feed lớn vẫn nhẹ.** App chỉ đọc phần đầu của feed (VOV Thời sự dài ~30 MB, app tải ~100 KB) cho đủ 30 bài mới nhất rồi dừng.
- **Màn đang nghe:** ảnh bìa làm hình nền mờ, tiêu đề, thanh tiến trình. Sau 6 giây giao diện mờ dần, chỉ còn hình và một dòng nhỏ.
- **Remote:** OK hoặc Play/Pause để tạm dừng, ‹ › hoặc Rewind/FastForward để tua 15 giây, ▾ để hẹn giờ tự dừng (15/30/60 phút), Back để về danh sách (âm thanh vẫn phát).
- **Nghe tiếp:** nhớ vị trí đã nghe trên TV; tab **Đang nghe** liệt kê 20 bài gần nhất; truyện dài và sách tự chuyển sang phần kế tiếp.
- **Sách nói tổng hợp (AudioAZ):** chỉ dùng cá nhân; trang có thể đổi cấu trúc hoặc chặn bất cứ lúc nào. Sách Nói Việt Nam đã bỏ vì TV không phát được file của trang này (lớp chống bot).

Không chiếm phím Home, Power hay phím thương hiệu; chỉ đăng ký các phím media mà TV báo là hỗ trợ.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `app/` | App Nghe (`NgheTV0001.Nghe`): HTML/CSS/JS ES5, `config.xml`, `sources.json` |
| `probe/` | App kiểm tra trên TV (`NgheProbe1.Probe`): CORS, feed lớn, phát mp3/m4a từng nguồn, phím media, phát khi bị che |
| `tools/` | `check_feeds.py` (kiểm tra feed từ máy tính), `preview.cjs` (xem trước trên máy tính), `build_icon.py`, `sync_probe.cjs` |
| `tests/` | Test Node và Python, chạy trong CI |

## Dùng nhanh

```sh
npm test                                        # test Node (Node 18+)
python -m unittest discover -s tests            # test Python (3.10+)
npm run preview                                 # http://127.0.0.1:4190 — mũi tên, Enter, Esc = Back
python -I tools/check_feeds.py --json app/sources.json   # kiểm tra feed thật (cần mạng)
```

Bản xem trước dùng một proxy chạy trên máy (chỉ loopback, chỉ tới các tên miền trong `hosts` của `sources.json`) vì trình duyệt máy tính chặn đọc feed khác tên miền. Trên TV app không dùng proxy.

Ký và cài lên TV, chạy probe, danh sách kiểm tra: [docs/HUONG-DAN.md](docs/HUONG-DAN.md).

## Thêm hoặc bớt nguồn

Sửa [`app/sources.json`](app/sources.json), chạy `npm run sync && npm test`, rồi commit lên `main`. TV đọc bản mới trong vòng 10 phút; app đã cài vẫn giữ bản đóng gói làm dự phòng.

Mỗi nguồn có `type`: `rss` (podcast feed), `audioaz` hoặc `wordpress` (trang sách nói có link mp3 trong RSS). `next: "newer"` cho truyện đăng nhiều kỳ, `next: "list"` cho chương sách. Tên miền mới cần thêm vào `hosts` để bản xem trước cho phép.
