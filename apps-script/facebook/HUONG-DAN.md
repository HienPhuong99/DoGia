# Báo bài mới trên Facebook tam300 qua email

Script `BaoBaiFacebook.gs` chạy trên Google Apps Script, **10 phút kiểm tra một lần** hai trang:
- https://www.facebook.com/tam300
- https://www.facebook.com/profile.php?id=61575673269886

**Có bài mới là gửi mail**, không lọc nội dung vì bài thường không ghi model. Mail gồm chữ trong bài, giờ đăng, ảnh đầu tiên và link mở bài.

Phần đọc Facebook do **Apify** (actor `apify/facebook-posts-scraper`) làm. Không cần AI, không cần Google Sheet.

## Chi phí

- Apify tính **7 USD / 1.000 bài** khi có bộ lọc ngày. Gói miễn phí có 5 USD/tháng, tức khoảng 700 bài.
- Mỗi lượt quét chỉ xin những bài **mới hơn bài cuối đã thấy**. Lượt nào không có bài mới thì không có bài nào để tính tiền, nên quét 10 phút/lần cũng không tốn hơn quét thưa.
- Để chắc chắn không vượt gói miễn phí, script có hai chốt chặn:
  - Mỗi tháng nhận tối đa **600 bài** (khoảng 4,2 USD). Hết hạn mức thì gửi mail báo, tạm dừng và sang tháng sau tự chạy lại.
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

## Mail bạn có thể nhận

| Tiêu đề | Nghĩa là |
|---|---|
| `[tam300] Bài mới: …` / `[tam300] 3 bài mới: …` | Có bài mới. Đây là mail chính. |
| `[tam300] Quét Facebook đang bị lỗi` | Lỗi 3 lần liên tiếp, ví dụ token sai hoặc Facebook chặn. Mail chỉ gửi 1 lần, khi chạy lại được sẽ có mail "chạy lại bình thường". |
| `[tam300] Có trang Facebook không đọc được` | Apify không đọc được một trong hai link, gửi tối đa 1 lần/ngày. Actor chỉ đọc được **Trang** (page) công khai, không đọc được trang cá nhân. Nếu link `profile.php?id=…` là trang cá nhân thì sẽ nhận mail này. |
| `[tam300] Tạm dừng quét: đã hết hạn mức tháng này` | Đã nhận 600 bài trong tháng. |

## Trao đổi với Muse.AI (tab "Trao đổi")

Muse ghi vào Google Sheet "Theo dõi bài đăng Facebook - 2 trang công khai" (link không ghi ở đây vì repo công khai). Tab **Trao đổi** trong sheet đó là nơi Claude, Muse và bạn nhắn cho nhau:

- Mỗi tin là một dòng mới ở cuối bảng.
- Cột **Từ / Gửi tới** ghi Claude, Muse hoặc Bạn.
- Cột **Trạng thái** đi từ Mới → Đã đọc → Đã xong. Dòng "Mới" được tô vàng.
- Khi trả lời thì ghi ID tin gốc vào cột G.

**Chia việc và tần suất:**

| Ai | Làm gì | Tần suất |
|---|---|---|
| Script Apify (`BaoBaiFacebook.gs`) | Phát hiện bài mới trên 2 trang, gửi mail ngay | 10 phút/lần |
| Muse | Đọc kỹ bài và bình luận, trích giá/deal vào tab Bài đăng | 30 phút/lần, hoặc khi được nhắc |
| Script `TraoDoi.gs` | Gửi mail cho bạn khi tab Trao đổi có tin mới từ Muse hoặc Claude | 5 phút/lần |
| Claude | Đọc và trả lời tin gửi cho Claude | Khi bạn mở phiên Claude |

**Cài báo tin nhắn:**
1. Mở sheet → **Tiện ích mở rộng → Apps Script**.
2. Dán `TraoDoi.gs` vào.
3. Chạy `caiDatTraoDoi` một lần và cấp quyền.

Muse và Claude ghi vào sheet qua API, mà sự kiện onEdit/onChange của Google Sheet không bắt được thay đổi qua API. Vì vậy script phải tự hẹn giờ kiểm tra.

## Lưu ý

- Bài thường đến chậm hơn lúc đăng khoảng 10–20 phút: chờ lượt quét kế tiếp cộng thời gian Apify chạy. Muốn biết ngay thì bật thêm thông báo **Tất cả bài viết** của trang trên app Facebook.
- Tự động quét Facebook là trái điều khoản của Facebook. Apify có thể bị chặn tạm thời, nên thỉnh thoảng có thể sót bài hoặc nhận mail lỗi.
- Kiểm tra trên máy: `node apps-script/facebook/test.js` (giả lập Apify, không gọi mạng).
