# Kiến thức: đi dây (edge routing) & thứ tự nhánh (branch order) trên canvas

> Tài liệu KIẾN THỨC cho việc **convert file ngoài → YAML của hệ thống** sao cho khi
> mở trên Scenario Flow Builder, dây nối **gọn, không vắt chéo**, đỡ phải chỉnh tay.
> Áp dụng cho mọi nguồn import (Draw.io, Canva, YAML viết tay…), không riêng カレス.
>
> Liên quan: `src/ir/layout.ts` (auto-layout), `src/canvas/edges/DeletableEdge.tsx`
> (routing), `src/ui/nodeSchema.ts` (thứ tự nhánh), `src/canvas/irAdapter.ts` (nhãn).

## 1. Mô hình đi dây (điều gì quyết định dây chạy đâu)

Canvas render deterministic từ IR. Với mỗi node, **chấm output (handle) xếp đều ở
ĐÁY node theo thứ tự TRÁI → PHẢI**, đúng thứ tự nhánh khai báo trong IR.

Dây từ 1 handle tới node đích được vẽ trực giao (orthogonal), 2 kiểu:

- **Đi xuống** (đích thấp hơn nguồn): `V-H-V` — dọc xuống, ngang ở giữa 2 tầng, dọc vào
  đỉnh đích. Nếu nguồn/đích thẳng cột thì là đường thẳng đứng.
- **Vòng lên** (đích CAO hơn nguồn — retry/loop/merge ngược): dây **thoát ra làn dọc ở
  ĐÚNG PHÍA của chấm** (chấm lệch trái → vòng trái, lệch phải → vòng phải) rồi mới vòng
  lên. Nhờ vậy dây **không cắt chéo** qua các nhánh anh em đang đi xuống ngay dưới node.

> Hệ quả quan trọng: **PHÍA của chấm output (trái/phải) quyết định phía dây thoát ra.**
> Chấm nằm bên nào thì dây (khi phải vòng) đi về bên đó. Đây là chìa khoá để chống chéo.

## 2. Thứ tự nhánh = thứ tự chấm TRÁI→PHẢI = thứ tự fan của layout

Thứ tự các nhánh trong `branches[]` (YAML) — cũng là thứ tự trong **Branch Settings** —
quyết định **cả hai**:

1. **Vị trí chấm output**: nhánh đầu tiên = chấm trái nhất, nhánh cuối = chấm phải nhất.
2. **Vị trí node con khi auto-layout**: các nhánh con dàn hàng dưới, TRÁI→PHẢI đúng theo
   thứ tự nhánh, cách đều & đối xứng quanh tâm node cha (xem `layout.ts`).

Quy ước cố định:

- Nhánh **`failed` (失敗)** LUÔN là chấm **trái nhất** và (theo layout) là chuỗi đi
  **NGANG sang trái** cùng hàng với node nguồn. Trong YAML nó là field riêng `failed:`,
  KHÔNG nằm trong `branches[]`.
- Nhánh **catch-all `default`** (điều kiện "còn lại") thường để **CUỐI** danh sách (chấm
  phải nhất). Trong YAML là `- default: <target>`.

## 3. Quy tắc DỒN DÂY để KHÔNG vắt chéo (dùng khi convert)

**Nguyên tắc vàng:** *sắp thứ tự nhánh sao cho thứ tự TRÁI→PHẢI của các nhánh khớp với
thứ tự TRÁI→PHẢI của các NODE ĐÍCH.* Khi đó dây fan ra như nan quạt, không sợi nào cắt sợi nào.

Ví dụ hỏng (dây chéo nhau) — 3 điều kiện:

```
1. Cond A  → node bên TRÁI
2. Cond B  → node bên PHẢI
3. Cond C  → node bên TRÁI
```

Vì thứ tự nhánh (A, B, C) = thứ tự chấm (tráinhất → phảinhất), nhưng đích lại là
Trái, Phải, Trái → chấm giữa (B) phải vắt sang phải, chấm phải (C) phải vắt về trái →
**hai dây cắt nhau**.

Cách dồn ĐÚNG — gom các nhánh **cùng hướng** lại gần nhau, xếp theo vị trí đích:

```
1. Cond A  → node TRÁI      (các nhánh đi trái đứng bên trái)
2. Cond C  → node TRÁI
3. Cond B  → node PHẢI      (các nhánh đi phải đứng bên phải)
```

Tổng quát khi convert:

1. Xác định vị trí (thứ tự trái→phải) mong muốn của từng node đích trên canvas.
2. **Sort `branches[]` theo vị trí X của node đích** (trái → phải).
3. Giữ `failed` ở ngoài `branches[]` (field `failed:` — nó tự đi ngang-trái).
4. Đặt `default` (catch-all) ở cuối nếu đích của nó nằm bên phải; nếu logic nghiệp vụ
   buộc default trỏ về nhánh bên trái, cân nhắc đổi thành nhánh `when` tường minh để
   kiểm soát vị trí.

Với **nhánh vòng lên** (đích ở tầng trên, vd nhiều nhánh cùng merge về một node phía
trên): nhờ quy tắc "thoát ra đúng phía chấm" (§1), chỉ cần đặt nhánh đó ở phía (trái/phải)
tương ứng với hướng nó cần vòng là dây sẽ đi men theo cạnh rồi vòng lên, không cắt anh em.

## 4. Nhãn trên dây (màn CS) — giảm rối

Để canvas thoáng (giống bản thiết kế PDF):

- Node **聴取 (hearing/interaction)** chỉ có **2 nhánh** (`失敗` + 1 đường đi tiếp): nhánh
  "đi tiếp" là hiển nhiên nên **bỏ nhãn** (không hiện `次へ`). Chỉ nhánh `失敗` giữ nhãn.
- Từ **3 nhánh trở lên** (聴取 rẽ nhánh thật) → hiện nhãn cho **mọi** nhánh.
- Node `logic` / `transfer` giữ nhãn như cũ.

Khi convert: đừng bịa nhãn `次へ` cho mọi bước — chỉ đặt `label` cho nhánh MANG NGHĨA
(`予約` / `変更` / `はい` / `いいえ` / `失敗`…). Đường đi tiếp mặc định để trống label.

## 5. Nắn dây bằng tay — khi auto vẫn chưa ưng

Dây giữ nguyên 3 khúc (V-H-V). Chỉ **đoạn NGANG ở giữa** kéo được **LÊN/XUỐNG**:
click & giữ chuột ngay trên đoạn ngang đó rồi kéo (con trỏ đổi thành `ns-resize`).

- **Double-click** đoạn ngang: trả dây về mặc định.
- Dây **thẳng đứng** (nguồn/đích thẳng cột) và dây **vòng lên** (retry/loop) KHÔNG có
  đoạn ngang giữa đơn nhất nên không kéo — giữ nguyên hình auto-route.
- Nếu đoạn ngang có nhãn (stamp điều kiện) đè đúng giữa: nắm đoạn ngang ở BÊN CẠNH nhãn
  để kéo (nhãn nhỏ, dây rộng).

Độ lệch (chỉ trục Y) lưu ở **node nguồn** (`data.edgeShapes[<handle>].y`), round-trip qua
YAML như `labelOffsets`. Chỉnh tay vài dây rồi lưu -> mở lại giữ nguyên. (Kéo node cũng
lưu `position`, không auto-layout đè lại.)

## 6. Auto-layout màn CS (bố cục "thoáng" kiểu PDF)

Khi mở/auto-layout ở **màn CS**, canvas nắn bố cục cho giống bản thiết kế PDF
(`layout.ts` → `airifyCs`, chỉ chạy khi `cs`):

- **Nhánh hợp lưu (merge) CHÌM xuống DƯỚI mọi nhánh nuôi nó**: node mà nhiều nhánh
  cùng chảy vào (vd 質問 sau khi các route 予約/変更/キャンセル/問い合わせ gặp nhau) được
  xếp ở tầng SÂU HƠN tầng sâu nhất trong các nhánh — nên phần đuôi chung
  (質問→氏名→…→終話) nằm hẳn dưới các nhánh, đọc như **1 cột dọc ở giữa**, thay vì bị
  kéo lên ngang hàng nửa chừng theo nhánh đầu tiên chạm tới.
- **Cân đối quanh TRỤC TRUNG TÂM (dùng thuật toán cây)**: X do cây Reingold-Tilford điền
  (cha căn giữa trên bó con, các nhánh toả RỘNG theo `BRANCH_GAP`, mỗi nhánh là 1 cột
  dọc) — nên mạch chính (冒頭アナウンス → … → 終話) thẳng trục, nhánh toả đều & rộng 2 bên.
  Node đích `failed` là terminal bị LOẠI khỏi cây (xếp riêng) nên không làm lệch trục.
  Đuôi chung sau điểm hợp lưu được dịch về TÂM các nhánh cha; cuối cùng "thẳng cột" các
  chuỗi tuyến tính (node 1 cha → về đúng cột cha) để đuôi & mọi mạch nối tiếp dọc thẳng.
  Không phải lúc nào cũng cân tuyệt đối, nhưng cố cân nhất có thể.
- Rank tính theo **đường dài nhất** (longest path) trên cạnh THƯỜNG + `failed`; cạnh vòng
  ngược (retry/loop) KHÔNG tính. Node đích của `failed` mà VẪN chạy tiếp (không phải
  terminal, vd FAQ不一致アナウンス) nhờ vậy chìm xuống dưới nguồn, không nổi lên tầng 0.
- **Node đích của `failed` (terminal — vd 代表案内 / 聴取失敗)**: vì chấm output `failed`
  nằm BÊN TRÁI node, node đích cũng đặt BÊN TRÁI — xếp NGANG HÀNG (cùng Y) với node ĐẦU
  TIÊN (nông nhất) có `failed` đi vào nó, và đẩy ra phía ngoài bên TRÁI, vượt qua mọi
  node cùng hàng lẫn các node cha `failed` nằm dưới — để dây `failed` (thoát trái, vòng
  lên bên trái) KHÔNG vắt sang phải cắt chéo node/nhánh khác. (Terminal đến từ nhánh giá
  trị thường, vd 残薬不足案内 qua `なし`, vẫn nằm trong luồng xuôi bình thường.)

> Màn **TS giữ nguyên** bố cục cây cũ (không áp airify) — thay đổi này CHỈ cho CS.
> Hệ quả cho convert: **KHÔNG cần set `position`** cho file CS — để trống (0,0), canvas
> tự xếp thoáng. Chỉ giữ `position` khi đã chỉnh tay và muốn cố định bố cục đó.

## 7. Checklist convert "đẹp & chuẩn"

- [ ] `failed` để ở field `failed:`, KHÔNG nhét vào `branches[]`.
- [ ] `branches[]` sort theo vị trí X của node đích (trái → phải) để dây không chéo.
- [ ] `default` (catch-all) ở cuối; nếu đích nằm trái thì dùng `when` tường minh.
- [ ] Chỉ đặt `label` cho nhánh mang nghĩa; đường đi tiếp mặc định để trống.
- [ ] Không cần điền `position` — để trống (0,0) cho auto-layout; chỉ giữ `position` khi
      đã chỉnh tay và muốn cố định.
- [ ] Mở trên canvas, dùng waypoint nắn nốt vài dây còn chồng nếu cần.
