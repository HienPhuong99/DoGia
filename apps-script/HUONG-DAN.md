# Quét giá tam300.com mỗi ngày — chỉ ghi món đổi giá, 0 token, không API key

Mỗi sản phẩm trên tam300.com nằm trong một thẻ:

```html
<article data-product-card data-offers='[{"capacity":"256GB","color":"Đen","price":"20,9 triệu"}, …]'>
```

Script `QuetGia.gs` (Apps Script, chạy ngay trong Google Sheet) đọc thẳng dữ liệu này, nên **không cần AI, không tốn token, không cần API key**.

Lịch mỗi ngày:
- **9:30 sáng — script quét:**
  1. Mở trang chủ tam300.com, lấy link các trang `/iphone/…-series`.
  2. Đọc giá của từng dung lượng. Mỗi dung lượng lấy giá **thấp nhất trong các màu**, giống cách sheet đang ghi.
  3. Ghép với sheet theo model, dung lượng và loại máy (mới / cũ). Máy newseal không bị ghép với giá máy cũ.
  4. **Chỉ món đổi giá** mới được ghi: thêm 1 dòng vào tab **Biến động** và sửa 3 ô của đúng món đó (Giá bán, Giá cũ, Ngày cập nhật). Món giữ nguyên giá thì không ghi gì.
  5. Món lệch quá ngưỡng ở `Cấu hình!B3` (mặc định 30%) thì **không ghi**, vì có thể do đọc nhầm.
  6. Ghi báo cáo vào `Cấu hình!A4:C4` (**Lần quét cuối**) và `A5:C5` (**Cần Gemini xem**: món mơ hồ, món không thấy trên trang, hoặc trang đã đổi cấu trúc).
  7. Nếu không tải được tam300.com (lỗi mạng, HTTP khác 200), script không sửa giá nào. Nó ghi `LỖI: …` vào `A4:C5` để không ai tưởng báo cáo hôm trước là của hôm nay.
- **Sau đó — Gemini:** làm việc qua file `chat.md` trên máy (không commit lên repo). Gemini đọc phần "Cần Gemini xem", dò lại trên tam300.com rồi ghi kết quả vào `chat.md`. Claude áp kết quả vào sheet và commit.
- **10:00 sáng — GitHub Actions:** chụp sheet cho trang web.

## Cài một lần

1. Trong sheet, vào **Tiện ích mở rộng → Apps Script**. Dự án "Quét giá Gemini" đã có sẵn code.
2. Chọn hàm `caiDat`, bấm **Chạy**, rồi cấp quyền cho script. Google sẽ hỏi quyền sửa sheet này, truy cập web (để đọc tam300.com) và tạo lịch chạy.

Sau đó, trong sheet có thêm menu **Theo dõi giá**:
- **Quét giá tam300.com ngay**
- **Bật quét tự động 9:30 sáng mỗi ngày**

## Sửa code rồi đẩy lại (dành cho người dùng clasp)

```bash
cd apps-script && clasp push -f
```

Kiểm tra phần đọc trang và lọc món đổi giá: `node apps-script/test.js`
