import { ReactFlowProvider } from '@xyflow/react';
import { AuthProvider } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { useAuth } from './auth/useAuth';
import { GOOGLE_CLIENT_ID } from './auth/config';
import { useFileStore } from './store/fileStore';
import { DriveManagerScreen } from './files/DriveManagerScreen';
import { DriveTokenKeeper } from './drive/DriveTokenKeeper';
import { FlowCanvas } from './canvas/FlowCanvas';
import { Toolbar } from './components/Toolbar';
import { NodeSettingsPanel } from './components/NodeSettingsPanel';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { CanvasTabs } from './components/tabs/CanvasTabs';
import { AnnounceListTab } from './components/tabs/AnnounceListTab';
import { GeneralSettingsTab } from './components/tabs/GeneralSettingsTab';
import { StatusSettingsTab } from './components/tabs/StatusSettingsTab';
import { useFlowStore } from './store/flowStore';
import { Toast } from './ui/Toast';

export default function App() {
  return (
    <AuthProvider>
      <Gate />
      <Toast />
    </AuthProvider>
  );
}

// Gating theo 2 lớp:
//   1) Chưa đăng nhập (hoặc sai domain) -> màn login.
//   2) Đã đăng nhập nhưng chưa chọn file -> màn quản lý flow (Google Drive).
//   3) Đã mở 1 file -> canvas.
function Gate() {
  const { user } = useAuth();
  const currentFile = useFileStore((s) => s.current);
  if (!user) return <LoginScreen />;
  return (
    <>
      {/* Tự gia hạn token Drive chạy nền (cấp quyền 1 lần là đủ) — cần GIS provider
          nên chỉ mount khi có Client ID và không phải chế độ demo. */}
      {GOOGLE_CLIENT_ID && !user.demo && <DriveTokenKeeper />}
      {!currentFile ? <DriveManagerScreen /> : <FlowApp />}
    </>
  );
}

function FlowApp() {
  // IR đã được nạp vào store ở màn quản lý file trước khi vào canvas.
  // Dưới header là dải tab (kiểu tab browser): Flow Diagram (canvas) + các tab
  // bảng/form (Announce List / General Settings / Status Settings) — tất cả cùng
  // đọc/ghi IR trong store nên liên động 2 chiều với nhau.
  const tab = useFlowStore((s) => s.canvasTab);
  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <CanvasTabs />
      <main className="relative flex-1 overflow-hidden">
        {tab === 'flow' && (
          <ReactFlowProvider>
            <FlowCanvas />
            <NodeSettingsPanel />
            <ConfirmDeleteModal />
          </ReactFlowProvider>
        )}
        {tab === 'announce' && <AnnounceListTab />}
        {tab === 'general' && <GeneralSettingsTab />}
        {tab === 'status' && <StatusSettingsTab />}
      </main>
    </div>
  );
}
