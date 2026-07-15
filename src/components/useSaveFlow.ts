import { useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import { useFileStore } from '../store/fileStore';
import { useDriveToken, validDriveToken } from '../drive/token';
import { updateYamlContent } from '../drive/api';
import { gdErrorKey } from '../drive/errors';
import { formatDateTime } from '../ir/ivrProperty';
import { useAuth } from '../auth/useAuth';
import { useT } from '../ui/i18n';
import { useToast } from '../ui/toast';

// ─────────────────────────────────────────────────────────────────────────────
// Hook lưu flow hiện tại (export IR -> YAML) về Google Drive: ghi đè nội dung
// file version đang mở — 更新日時 (modifiedTime) tự nhảy; tạo version MỚI là
// thao tác riêng ở màn quản lý.
// Dùng chung cho HeaderMenu (nút Lưu + Ctrl/⌘+Shift+S) và FlowsPanel.
// Mỗi component gọi hook có state saving/savedAt/saveError riêng — độc lập nhau.
// ─────────────────────────────────────────────────────────────────────────────
export function useSaveFlow() {
  const ir = useFlowStore((s) => s.ir);
  const exportYaml = useFlowStore((s) => s.exportYaml);
  const setMeta = useFlowStore((s) => s.setMeta);
  const currentFile = useFileStore((s) => s.current);
  const driveTokenState = useDriveToken();
  const { user } = useAuth();
  const t = useT();
  const showToast = useToast((s) => s.show);
  const [saving, setSaving] = useState(false);
  // Thời điểm lưu thành công gần nhất (yyyy-MM-dd HH:mm) — hiện cạnh dấu tích.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Key lỗi i18n nếu lưu thất bại (null = không lỗi).
  const [saveError, setSaveError] = useState<string | null>(null);

  const driveToken = validDriveToken(driveTokenState);

  // Có đủ điều kiện để lưu (đã mở file + có token Drive còn hạn + có IR).
  const canSave = !!(ir && currentFile && driveToken);

  // Trả về true khi lưu thành công (nút điều hướng dựa vào đây để đi tiếp/ở lại).
  const saveToRepo = async (): Promise<boolean> => {
    if (!currentFile || saving) return false;
    if (!driveToken) {
      // Token Drive hết hạn/chưa có — báo lỗi thay vì im lặng.
      setSaveError('gdErrAuth');
      return false;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // Đóng dấu 更新日時 (và 作成者/作成日時 nếu file cũ chưa có) trước khi export.
      const now = formatDateTime(new Date());
      setMeta({
        updatedAt: now,
        ...(ir?.meta.createdAt ? {} : { createdAt: now }),
        ...(ir?.meta.author ? {} : { author: user?.name ?? user?.email ?? '' }),
      });
      const yaml = exportYaml();
      await updateYamlContent(driveToken, currentFile.driveFileId, yaml);
      setSavedAt(now);
      showToast(t('fmSaved')); // thông báo nổi, tự biến mất
      return true;
    } catch (e) {
      setSaveError(gdErrorKey(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { saving, savedAt, saveError, canSave, saveToRepo };
}
