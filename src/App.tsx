import { ReactFlowProvider } from '@xyflow/react';
import { AuthProvider } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { useAuth } from './auth/useAuth';
import { useFileStore } from './store/fileStore';
import { FileManagerScreen } from './files/FileManagerScreen';
import { FlowCanvas } from './canvas/FlowCanvas';
import { Toolbar } from './components/Toolbar';
import { NodeSettingsPanel } from './components/NodeSettingsPanel';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
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
//   2) Đã đăng nhập nhưng chưa chọn file -> màn quản lý file YAML (GitHub).
//   3) Đã mở 1 file -> canvas.
function Gate() {
  const { user } = useAuth();
  const currentFile = useFileStore((s) => s.current);
  if (!user) return <LoginScreen />;
  if (!currentFile) return <FileManagerScreen />;
  return <FlowApp />;
}

function FlowApp() {
  // IR đã được nạp vào store ở màn quản lý file trước khi vào canvas.
  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <main className="relative flex-1 overflow-hidden">
        <ReactFlowProvider>
          <FlowCanvas />
          <NodeSettingsPanel />
          <ConfirmDeleteModal />
        </ReactFlowProvider>
      </main>
    </div>
  );
}
