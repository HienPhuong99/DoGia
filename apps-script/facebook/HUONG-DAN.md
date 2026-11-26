# Báo bài mới trên Facebook tam300 qua email

Script `BaoBaiFacebook.gs` chạy trên Google Apps Script, **10 phút kiểm tra một lần, từ 08:00 đến 22:00** (giờ VN; ban đêm shop nghỉ nên không quét, 8:00 lượt đầu tự lấy bù bài từ lúc tối) hai trang:
- https://www.facebook.com/tam300
- https://www.facebook.com/profile.php?id=61575673269886

**Có bài mới là gửi mail**, không lọc nội dung vì bài thường không ghi model. Mail gồm chữ trong bài, giờ đăng, ảnh đầu tiên và link mở bài. **Ngoài bài mới thì không gửi mail nào khác**, kể cả khi lỗi.

Phần đọc Facebook do **Apify** (actor `apify/facebook-posts-scraper`) làm. Không cần AI, không cần Google Sheet.

## Chi phí

- Apify tính **7 USD / 1.000 bài** khi có bộ lọc ngày. Gói miễn phí có 5 USD/tháng, tức khoảng 700 bài.
- Mỗi lượt quét chỉ xin những bài **mới hơn bài cuối đã thấy**. Lượt nào không có bài mới thì không có bài nào để tính tiền, nên quét 10 phút/lần cũng không tốn hơn quét thưa.
- Để chắc chắn không vượt gói miễn phí, script có hai chốt chặn:
  - Mỗi tháng nhận tối đa **600 bài** (khoảng 4,2 USD). Hết hạn mức thì tạm dừng (không gửi mail) và sang tháng sau tự chạy lại.
  - Mỗi lượt quét tốn tối đa 0,2 USD.
- **Sau ngày đầu tiên, nên vào Apify → Billing / Usage xem thử.** Giá trên lấy từ trang giới thiệu của actor. Nếu thấy lượt quét trống vẫn bị tính tiền thì đổi `PHUT` thành 30.

## Cài đặt (khoảng 10 phút)

1. **Tạo tài khoản Apify** (gói Free) tại https://apify.com. Sau đó vào **Settings → API & Integrations** và chép **Personal API token**. Mã này là của bạn, đừng gửi cho ai.
2. Mở https://script.google.com → **Dự án mới**, đặt tên ví dụ "Báo bài tam300".
3. Xóa nội dung `Code.gs` rồi dán toàn bộ `BaoBaiFacebook.gs` vào.
4. Vào **Cài đặt dự án** (bánh răng):
   - Tick **Hiển thị tệp kê khai "appsscript.json"**. Quay lại trình chỉnh sửa, mở `appsscript.json` và dán nội dung file `appsscript.json` trong thư mục này vào.
   - Ở **Thuộc tính tập lệnh**, thêm:
     - `APIFY_TOKEN` = token vừa chép
     - `EMAIL` = địa chỉ nhận mail. Không bắt buộc; bỏ trống thì gửi về chính tài khoản Google đang chạy script.
5. Chọn hàm **`thuGuiMail`** → **Chạy** → cấp quyền. Kiểm tra xem hộp thư đã nhận mail thử chưa.
6. Chọn hàm **`caiDat`** → **Chạy**. Script tạo lịch 10 phút/lần và bắt đầu lượt quét đầu tiên. Chỉ những bài đăng **sau lúc này** mới được báo.

Xong. Muốn tắt thì chạy `dungLai`. Muốn xem tình hình thì chạy `xemTrangThai`, hoặc xem **Lần thực thi** bên trái.

## Mail bạn sẽ nhận

Chỉ một loại: `[tam300] Bài mới: …` hoặc `[tam300] 3 bài mới: …` khi có bài mới.

Script không gửi mail khi lỗi, nên lâu không thấy mail mà nghi ngờ thì chạy `xemTrangThai`:
- `loiLienTiep` / `loiCuoi`: số lần lỗi liên tiếp và lỗi gần nhất, ví dụ token sai hoặc Facebook chặn.
- `loiTrang`: trang Apify không đọc được. Actor chỉ đọc được **Trang** (page) công khai, không đọc được trang cá nhân.
- `hetTran: true`: đã nhận đủ 600 bài trong tháng nên đang tạm dừng.
- `lanOkCuoi`: lần quét thành công gần nhất.

## Trao đổi với Muse.AI (tab "Trao đổi")

Muse ghi vào Google Sheet "Theo dõi bài đăng Facebook - 2 trang công khai" (link không ghi ở đây vì repo công khai). Tab **Trao đổi** trong sheet đó là nơi Claude, Muse và bạn nhắn cho nhau:

- Mỗi tin là một dòng mới ở cuối bảng.
- Cột **Từ / Gửi tới** ghi Claude, Muse hoặc Bạn.
- Cột **Trạng thái** đi từ Mới → Đã đọc → Đã xong. Dòng "Mới" được tô vàng.
- Khi trả lời thì ghi ID tin gốc vào cột G.

**Chia việc và tần suất:**

| Ai | Làm gì | Tần suất |
|---|---|---|
| Script Apify (`BaoBaiFacebook.gs`) | Phát hiện bài mới trên 2 trang, gửi mail ngay | 10 phút/lần, 08:00–22:00 |
| Muse | Đọc kỹ bài và bình luận, trích giá/deal vào tab Bài đăng | 30 phút/lần, 08:00–22:00 |
| Claude | Đọc và trả lời tin gửi cho Claude | Khi bạn mở phiên Claude |

Tin nhắn trong tab Trao đổi **không gửi mail**. Bạn chỉ nhận mail khi có bài đăng mới; muốn xem tin nhắn thì mở tab, dòng "Mới" được tô vàng.

## Lưu ý

- Bài thường đến chậm hơn lúc đăng khoảng 10–20 phút: chờ lượt quét kế tiếp cộng thời gian Apify chạy. Muốn biết ngay thì bật thêm thông báo **Tất cả bài viết** của trang trên app Facebook.
- Tự động quét Facebook là trái điều khoản của Facebook. Apify có thể bị chặn tạm thời, nên thỉnh thoảng có thể sót bài; kiểm tra bằng `xemTrangThai`.
- Kiểm tra trên máy: `node apps-script/facebook/test.js` (giả lập Apify, không gọi mạng).
