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

## 5. Nắn dây bằng tay (waypoint) — khi auto vẫn chưa ưng

Mỗi dây có **1 điểm điều khiển (waypoint)** ở khúc gấp chính (hiện khi hover/chọn dây):

- **Kéo lên/xuống**: nâng/hạ đoạn NGANG ở giữa.
- **Kéo trái/phải**: dời làn DỌC sang trái/phải (nắn dây tránh chồng/đi ngầm dưới node).
- **Double-click**: trả dây về đường mặc định.

Offset waypoint lưu ở **node nguồn** (`data.edgeShapes[<handle>] = {x,y}`), round-trip
qua YAML như `labelOffsets`. Vì vậy sau khi convert + chỉnh tay vài dây, bản chỉnh được
giữ nguyên khi lưu/mở lại. (Kéo node cũng lưu `position`, không auto-layout đè lại.)

## 6. Auto-layout màn CS (bố cục "thoáng" kiểu PDF)

Khi mở/auto-layout ở **màn CS**, canvas nắn bố cục cho giống bản thiết kế PDF
(`layout.ts` → `airifyCs`, chỉ chạy khi `cs`):

- **Nhánh hợp lưu (merge) CHÌM xuống DƯỚI mọi nhánh nuôi nó**: node mà nhiều nhánh
  cùng chảy vào (vd 質問 sau khi các route 予約/変更/キャンセル/問い合わせ gặp nhau) được
  xếp ở tầng SÂU HƠN tầng sâu nhất trong các nhánh — nên phần đuôi chung
  (質問→氏名→…→終話) nằm hẳn dưới các nhánh, đọc như **1 cột dọc ở giữa**, thay vì bị
  kéo lên ngang hàng nửa chừng theo nhánh đầu tiên chạm tới.
- **Merge được CĂN GIỮA** theo tâm các node cha (đuôi nằm dưới mọi nhánh nên dịch ngang
  không đụng nhánh nào).
- Rank tính theo **đường dài nhất** (longest path); cạnh vòng ngược (retry/loop) không
  tính vào rank.

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
