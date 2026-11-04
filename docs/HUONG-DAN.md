# Hướng dẫn: ký, cài và kiểm tra trên TV

Áp dụng cho TV đã cài launcher CleanYourTizen (đã có chứng chỉ Samsung, Developer Mode, `sdb` và `tizen` CLI).
Cách tạo chứng chỉ: xem `docs/SIGNING.md` trong repo [cleanyourtizen](https://github.com/ductu3590/cleanyourtizen).

## 1. Ký và cài probe trước

Probe trả lời những điều app phụ thuộc mà chỉ TV thật mới biết. Cài và chạy nó trước app.

```sh
# Dùng profile chứng chỉ đã tạo cho launcher (ví dụ tên "cyt")
tizen package -t wgt -s cyt -- probe
tizen install -n NgheProbe.wgt -s <IP-TV>:26101 -- probe
tizen run -p NgheProbe1.Probe -s <IP-TV>:26101
```

Probe tự chạy các kiểm tra và hiện kết quả (xanh = được, đỏ = không). Sau đó:

1. Chọn **Thử phát khi bị che**, bấm **Home**, đợi khoảng 20 giây, rồi mở lại **NgheProbe**. Dòng vàng cho biết âm thanh có phát tiếp khi app bị che hay không.
2. Chụp ảnh màn hình kết quả. Kết quả cũng nằm trong `localStorage` khoá `nghe-probe` (xem qua Web Inspector).

| Kiểm tra | Nếu không đạt |
|---|---|
| `sources.json` trên GitHub | App vẫn chạy với bản đóng gói; kiểm tra mạng/DNS của TV |
| Feed VnExpress (không có CORS) | TV áp dụng CORS cho app đã ký: cần một hàm chuyển tiếp nhỏ (Vercel) cho các nguồn này |
| Feed lớn VOV: "dừng sớm được" | Nếu "KHÔNG dừng sớm được", TV tải hết 30 MB: nên bỏ VOV Thời sự hoặc thêm hàm chuyển tiếp |
| Phát thử từng nguồn | Nguồn đỏ sẽ báo lỗi khi phát trong app; ghi lại mã lỗi |
| Sách Nói Việt Nam | Máy chủ có lớp chống bot; nếu TV cũng bị chặn thì bỏ nguồn này |
| Phát khi bị che | Đo với cùng cài đặt như app (`background-support="disable"`); TV từ chối cài gói có `enable` |

## 2. Ký và cài app Nghe

```sh
tizen package -t wgt -s cyt -- app
tizen install -n Nghe.wgt -s <IP-TV>:26101 -- app
tizen run -p NgheTV0001.Nghe -s <IP-TV>:26101
```

Ghim lên màn hình chính của launcher: **Ứng dụng → Sửa dock → Nghe**.

## Đã kiểm chứng trên TV (QA55LS03BAKXXV, Tizen 6.5)

- 2026-11-04: app Nghe cài và chạy; tab, nguồn và danh sách bài hiện đúng.
- 2026-11-04: app đã ký đọc được feed **không có CORS** (VnExpress) trực tiếp; không cần hàm chuyển tiếp.
- 2026-11-04: ảnh bìa và ảnh bài từ CDN của VnExpress hiện trên TV.
- 2026-11-04: TV **từ chối cài** gói có `background-support="enable"` ("Failed to install Tizen application");
  cả app và probe giữ `disable`.

## 3. Danh sách kiểm tra trên TV (ghi kết quả)

- [ ] Mở app: 6 tab hiện ngay (bản đóng gói), danh sách bài của nguồn đầu tiên tải trong vài giây.
- [ ] D-pad: trái/phải giữa các tab và các nguồn; xuống vào danh sách bài; lên quay lại; ô đang chọn nổi lên.
- [ ] OK trên một bài: màn đang nghe với ảnh bìa làm nền; âm thanh phát; sau 6 giây chỉ còn hình và dòng nhỏ.
- [ ] OK và Play/Pause tạm dừng/tiếp tục; ‹ › và Rewind/FastForward tua 15 giây; ▾ đổi hẹn giờ 15/30/60/tắt.
- [ ] Back về danh sách, âm thanh vẫn phát, nút "đang phát" hiện ở góc trên; OK trên nút đó quay lại màn đang nghe.
- [ ] Tắt app giữa chừng rồi mở lại: tab **Đang nghe** có bài đó, phát tiếp từ chỗ đã dừng.
- [ ] VOV Truyện dài: hết một phần thì tự sang phần mới hơn. AudioAZ: mở một sách, hết chương tự sang chương sau.
- [ ] Home khi đang nghe: ghi lại âm thanh có dừng không. Art Mode, Power vẫn như bình thường.
- [ ] Back ở hàng tab thoát app và quay về launcher (guard service không bị ảnh hưởng).

## Ghi chú

- VnExpress trả 404 cho yêu cầu không có User-Agent; trình duyệt TV luôn gửi User-Agent nên không ảnh hưởng.
- App không giả User-Agent, Referer hay cookie và không vượt lớp chống bot của nguồn nào.
- Nguồn AudioAZ và Sách Nói Việt Nam chỉ dùng cá nhân, có thể hỏng khi các trang đổi cấu trúc.
