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
- 2026-11-04: VnExpress phát tốt, tua 15 giây được, sau vài giây giao diện mờ dần chỉ còn hình nền.
- 2026-11-04: AudioAZ mở được (trang sách và chương trên archive.org).
- 2026-11-04: Sách Nói Việt Nam hiện được danh sách (RSS) nhưng **không phát được**: file mp3 nằm sau lớp chống bot
  của máy chủ. Đã bỏ khỏi `sources.json`; app không giả trình duyệt để vượt lớp này.

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

## Đo ảnh và thử tìm kiếm ngày 2026-11-04

Các số sau là mẫu tại thời điểm đo, không đại diện cho mọi ảnh. Đo kích thước file bằng GET trực tiếp, không sửa User-Agent, Referer hay cookie:

| Nguồn mẫu | Kích thước pixel | Dung lượng |
|---|---:|---:|
| `d3t3ozftmdmh3i.cloudfront.net`, ảnh bìa VOV Tin nhanh | 3.000 × 3.000 | 1.384.083 byte |
| Cùng CDN, ảnh một bài VOV | 3.000 × 3.000 | 1.595.070 byte |
| `vcdn1-vnexpress.vnecdn.net`, ảnh minh họa bài báo, URL có tham số của chính CDN | 1.200 × 720 | 199.891 byte |
| `i1-vnexpress.vnecdn.net`, ảnh bài podcast Điểm tin hiện tại | 1.973 × 1.172 | 2.813.293 byte |
| `static.mediacdn.vn`, logo Tuổi Trẻ trong feed | 192 × 78 | 3.307 byte |
| `img.transistorcdn.com`, ảnh bìa Fonos | 1.400 × 1.400 | 42.975 byte |
| `f.audioaz.com`, hai ảnh bìa cùng sách, đo trên TV | 320 × 320; 600 × 600 | 15.052; 35.136 byte |

Không tìm thấy URL `vcdn1` trong các RSS VnExpress được cấu hình lúc đo; mẫu trên là ảnh bài báo, không phải ảnh bài podcast. Yêu cầu URL `vcdn1` không có tham số trả 401; số trong bảng là bản URL có tham số công khai, không khẳng định là tệp gốc chưa biến đổi. Máy tính nhận HTTP 403 khi truy cập trang AudioAZ, còn TV đọc được trang và hai ảnh mẫu; không thử vượt lớp chặn.

Trên QA55LS03BAKXXV, Tizen 6.5, ảnh VOV 3.000 × 3.000 tải bằng `Image`, vẽ canvas 240 × 240 và xuất JPEG dataURL thành công, không bị tainted trong phép thử mẫu này. Với ảnh khác nếu canvas từ chối, app hiển thị ảnh gốc và không lưu thumbnail.

- Trước sửa, lần khởi chạy thứ hai, danh sách Đang nghe có 10 yêu cầu ảnh; Resource Timing ghi nhận hoàn tất từ 1.175 đến 2.649 ms kể từ điều hướng. Đây là mốc hoàn tất mạng, không phải lúc pixel được vẽ.
- Sau sửa, lần khởi chạy thứ hai, mốc app gán thumbnail dataURL đầu tiên là 1.026 ms từ điều hướng; tám ảnh đang trong vùng nhìn dùng dataURL và không có yêu cầu ảnh mạng. Đây là mốc gán CSS, không phải phép đo hiển thị pixel. Danh sách lịch sử có thay đổi sau khi thử phát, vì vậy hai mốc không phải phép so sánh cùng dữ liệu hay cùng đại lượng. Một phép reload có MutationObserver ghi 851 ms đến lần gán đầu, cũng không phải phép đo pixel.
- Đã dùng Web Inspector trên TV nhập `thoi su` và `Thời sự`: kết quả có nguồn VOV Thời sự và các bài tương ứng; chọn một kết quả thấy `currentTime` tăng đến 4,5 giây, không có lỗi media. Đây là thao tác tự động trong trang, chưa xác nhận tiếng nghe thực tế bằng tai.
- Keydown mô phỏng trong Web Inspector: xuống chuyển focus từ input tới kết quả, lên về input, Escape làm input mất focus. Chưa xác nhận tương tác thực tế với bàn phím ảo, phím Back vật lý và cách gõ dấu tiếng Việt trên TV.
- Cập nhật vị trí nút tìm kiếm: bản ký `CleanYourTizen2` đã cài trên cùng TV. Web Inspector xác nhận biểu tượng nằm ngay sau nút đang nghe (mép lần lượt 1037 và 1065 px khi nút đang phát hiện), không còn tab Tìm; phím mô phỏng phải từ nút đang nghe tới biểu tượng, Enter mở ô tìm, lên/xuống chuyển giữa biểu tượng, ô nhập và kết quả, Back từ biểu tượng quay về danh mục trước. Chưa thử các phím remote vật lý hoặc bàn phím ảo.

## Đo độ mượt chuyển tab trên TV

Ngày 2026-11-04, QA55LS03BAKXXV / Tizen 6.5, bản app commit `fb74e7c`, kết nối Web Inspector; âm thanh tạm dừng, dữ liệu đã có cache. Điều khiển là sự kiện D-pad tổng hợp trên trang, không phải remote vật lý. Mỗi lượt đối chứng gửi tám phím trái/phải, cách nhau mục tiêu 200 ms; ghi khoảng cách giữa các callback `requestAnimationFrame` (rAF). Đây là chỉ dấu lịch khung hình của trình duyệt, không phải đo trực tiếp pixel đã hiển thị. Khoảng 200 ms là lịch hẹn; khi luồng bận, phím thực tế bị trễ. Các sửa CSS phục vụ đo chỉ áp dụng tạm trong Web Inspector và đã được gỡ.

| Nền và hiệu ứng | rAF trung vị | rAF p95 | Lớn nhất | Khoảng trên 100 ms |
|---|---:|---:|---:|---:|
| Bình thường, hai radial gradient | 544 ms | 655 ms | 678 ms | 10/12 |
| Hai gradient, bỏ bóng thẻ nguồn | 541 ms | 628 ms | 673 ms | 10/11 |
| Nền một màu, giữ bóng | 17 ms | 51 ms | 72 ms | 0/116 |
| Nền một màu, bỏ bóng | 17 ms | 41 ms | 68 ms | 0/118 |

Đo lặp với thứ tự khác: nền phẳng p95 51 ms, tối đa 85 ms; một gradient p95 354 ms, tối đa 370 ms; hai gradient p95 667 ms, tối đa 672 ms. Mỗi lượt có ít mẫu, nên p95 chỉ mô tả lượt đo này. Khi không thao tác, rAF trung vị khoảng 17 ms, p95 17,3 ms và không có khoảng trên 33 ms trong lượt đo đầu.

Trace riêng cho sáu lần chuyển tab ghi tám lần `CompositeLayers`, mỗi lần tối đa khoảng 674 ms; tác vụ raster trên các worker cộng dồn khoảng 9,1 giây trên nhiều luồng, không được hiểu là thời gian đồng hồ thực. Thay riêng nền thành màu phẳng làm giảm mạnh khoảng rAF dài, còn bỏ riêng bóng không làm vậy. Vì thế hai radial gradient toàn màn hình trên `body` là nguyên nhân chính được xác nhận trong phép thử này; kết quả không chứng minh chính xác cơ chế bên trong GPU hay chi phí riêng của từng gradient.

Chi phí phụ cũng đo được: trong một lượt ba vòng chuyển tab, bảy lần `canvas.toDataURL` mất tổng 646 ms, tối đa 108 ms; mã giới hạn cache gọi `JSON.stringify` 392 lần, tổng 1.420 ms; đo vị trí phần tử 1.974 lần, tổng 370 ms. Các giá trị đo có instrumentation, cộng dồn toàn lượt và không phải thời gian bổ sung độc lập với nhau hoặc nguyên nhân duy nhất của mọi lần giật. Sau khi thay nền phẳng vẫn còn các khung chậm và một số lần xử lý phím mất trên 33 ms, vì vậy cần đo lại sau khi sửa nền trước khi ưu tiên tối ưu tiếp. Không thấy bằng chứng từ phép đo này để kết luận mạng là nguyên nhân chính.
