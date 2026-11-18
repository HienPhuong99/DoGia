# Gemini quét giá mỗi ngày — chỉ ghi món đổi giá

Lịch mỗi ngày:
- **9:30 sáng:** script `QuetGia.gs` (Apps Script, chạy ngay trong Google Sheet) gửi Gemini **1 lượt duy nhất**, kèm danh sách gọn `chỉ số|tên|giá đang ghi`. Gemini mở trang nguồn rồi **chỉ trả về những món có giá khác**. Món giữ nguyên giá thì không ghi gì, cũng không cập nhật gì.
- **10:00 sáng:** GitHub Actions chụp sheet cho trang web.

Mỗi món đổi giá được ghi thành:
- 1 dòng mới trong tab **Biến động** (ngày, giá cũ → giá mới, link nguồn);
- 3 ô của đúng món đó trong tab chính: Giá bán, Giá cũ, Ngày cập nhật.

Món lệch quá ngưỡng ở `Cấu hình!B3` (mặc định 30%) sẽ bị bỏ qua, để không ghi nhầm khi Gemini đọc sai.

## Cài một lần

1. Trong sheet, mở tab **Cấu hình**, dán link trang web cần cào giá vào ô **B1**. Có nhiều link thì cách nhau bằng dấu cách.
2. Vào **Tiện ích mở rộng → Apps Script**. Dự án "Quét giá Gemini" đã có sẵn code.
3. Bấm **⚙ Cài đặt dự án → Thuộc tính tập lệnh → Thêm**:
   - Tên: `GEMINI_API_KEY`
   - Giá trị: key lấy ở https://aistudio.google.com/apikey
4. Quay lại **Trình chỉnh sửa**, chọn hàm `caiDat`, bấm **Chạy**, rồi cấp quyền cho script.

Sau đó, trong sheet có thêm menu **Theo dõi giá**:
- **Quét giá bằng Gemini ngay:** quét thủ công, mỗi lần tốn 1 lượt.
- **Bật quét tự động 9:30 sáng mỗi ngày.**

## Hạn mức

Gói miễn phí có 20 lượt mỗi ngày **cho mỗi model**. Script chỉ dùng 1 lượt. Ô `Cấu hình!B2` ghi nhiều model cách nhau bằng dấu cách: model đầu hết lượt (lỗi 429) thì script tự dùng model sau. Script chỉ đọc đúng trang nguồn (url_context), không gọi Google Search, nên không bị giới hạn lượt tìm kiếm.

## Sửa code rồi đẩy lại (cho người dùng clasp)

```bash
cd apps-script && clasp push -f
```

Kiểm tra phần lọc món đổi giá: `node apps-script/test.js`
