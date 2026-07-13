# flows/ — Kho file YAML flow

Thư mục này chứa các file YAML flow của **Scenario Flow Builder**:

- File **có sẵn** (mẫu / đã tạo trước).
- File người dùng **tải lên** qua màn "Quản lý file YAML".
- File **tạo mới / lưu lại** từ canvas ("Lưu về repo").

App (static site trên GitHub Pages) đọc/ghi thư mục này qua **GitHub Contents API**
bằng fine-grained token do người dùng cung cấp (quyền `Contents: Read and write`
trên đúng repo này). Xem README gốc §Quản lý file YAML.

> Nhánh đọc/ghi mặc định là `main` (đổi bằng `VITE_FLOWS_BRANCH`), thư mục mặc định
> là `flows` (đổi bằng `VITE_FLOWS_DIR`).
