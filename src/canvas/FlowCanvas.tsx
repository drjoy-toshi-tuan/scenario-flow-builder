import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  SelectionMode,
  addEdge as rfAddEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStoreApi,
  type Connection,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type FinalConnectionState,
} from '@xyflow/react';
import { useFlowStore } from '../store/flowStore';
import { useTheme } from '../ui/theme';
import type { NodeType } from '../ir/types';
import { irToReactFlow } from './irAdapter';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges/DeletableEdge';
import { AddModulePanel, DND_MIME } from '../components/AddModulePanel';

// ─────────────────────────────────────────────────────────────────────────────
// Canvas React Flow. IR là source of truth:
//   - Render nodes/edges TỪ IR (re-derive mỗi khi IR đổi: load / auto-layout / sửa panel).
//   - React Flow xử lý tương tác mượt (kéo, chọn vùng, zoom) trên state cục bộ,
//     rồi commit các thay đổi có nghĩa (kéo xong, nối, xoá) trở lại IR store.
// ─────────────────────────────────────────────────────────────────────────────

// Cữ (grid) khi kéo node — bắt điểm theo lưới 16px giống n8n, tránh lệch tự do.
const SNAP_GRID: [number, number] = [16, 16];

// Chuột trái để KÉO CHỌN nhiều node (selectionOnDrag) + KÉO node; pan bằng
// chuột giữa (1) / phải (2). Nhờ vậy left-drag trên nền = khung chọn, không pan.
const PAN_BUTTONS: number[] = [1, 2];

// Phím xoá node/edge đang chọn.
const DELETE_KEYS = ['Delete', 'Backspace'];

export function FlowCanvas() {
  const ir = useFlowStore((s) => s.ir);
  const setNodePositions = useFlowStore((s) => s.setNodePositions);
  const addEdge = useFlowStore((s) => s.addEdge);
  const addNode = useFlowStore((s) => s.addNode);
  const removeNode = useFlowStore((s) => s.removeNode);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const setPanning = useFlowStore((s) => s.setPanning);
  const selectNode = useFlowStore((s) => s.selectNode);
  const theme = useTheme((s) => s.theme);
  const { screenToFlowPosition } = useReactFlow();
  const store = useStoreApi();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Re-derive trạng thái canvas mỗi khi IR đổi (state -> view, một chiều).
  useEffect(() => {
    if (!ir) return;
    const rf = irToReactFlow(ir);
    setNodes(rf.nodes);
    setEdges(rf.edges);
  }, [ir, setNodes, setEdges]);

  // Phím tắt Ctrl/⌘ + Shift + L: bật/tắt tương tác (Toggle Interactivity) — đồng
  // bộ với nút khoá trong Controls (cùng sửa store nodesDraggable/Connectable/Selectable).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyL') {
        e.preventDefault();
        const s = store.getState();
        const next = !(s.nodesDraggable && s.nodesConnectable && s.elementsSelectable);
        store.setState({
          nodesDraggable: next,
          nodesConnectable: next,
          elementsSelectable: next,
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  // Kéo xong 1 node -> commit vị trí vào IR (để auto-layout/re-derive không mất chỗ).
  const onNodeDragStop = useCallback(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of nodes) positions[n.id] = n.position;
    setNodePositions(positions);
  }, [nodes, setNodePositions]);

  // Nối dây -> thêm edge vào state cục bộ + commit vào IR.
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const id = `${connection.source}->${connection.target}#${Date.now()}`;
      setEdges((eds) => rfAddEdge({ ...connection, id, type: 'deletable' }, eds));
      addEdge({
        id,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
      });
    },
    [setEdges, addEdge],
  );

  // Kết thúc kéo dây MÀ KHÔNG trúng handle: nếu thả trên vùng 1 module thì vẫn nối
  // vào module đó (khỏi phải nhắm đúng chấm input). Tìm node dưới con trỏ bằng
  // elementFromPoint rồi nối source(handle đang kéo) -> node đích (handle mặc định).
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid) return; // đã nối trúng handle -> onConnect lo
      const fromHandle = connectionState.fromHandle;
      if (!fromHandle?.nodeId) return;

      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      const el = document.elementFromPoint(point.clientX, point.clientY) as HTMLElement | null;
      const nodeEl = el?.closest('.react-flow__node') as HTMLElement | null;
      const dropId = nodeEl?.getAttribute('data-id');
      if (!dropId) return;

      // Xác định chiều: kéo từ output (source) -> đích là node thả; ngược lại thì đảo.
      let source: string;
      let target: string;
      let sourceHandle: string | undefined;
      if (fromHandle.type === 'source') {
        source = fromHandle.nodeId;
        target = dropId;
        sourceHandle = fromHandle.id ?? undefined;
      } else {
        source = dropId;
        target = fromHandle.nodeId;
        sourceHandle = undefined;
      }
      if (source === target) return;

      const id = `${source}->${target}#${Date.now()}`;
      setEdges((eds) => rfAddEdge({ source, target, sourceHandle, id, type: 'deletable' }, eds));
      addEdge({ id, source, target, sourceHandle });
    },
    [setEdges, addEdge],
  );

  // Double-click node -> mở panel setting.
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => selectNode(node.id),
    [selectNode],
  );

  // Kéo-thả module từ palette xuống canvas: thả tại đúng vị trí con trỏ.
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(DND_MIME) as NodeType;
      if (!type) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(type, position);
    },
    [screenToFlowPosition, addNode],
  );

  // Xoá bằng phím Delete/Backspace -> commit vào IR (React Flow gọi 2 callback này).
  const onNodesDelete = useCallback(
    (deleted: Node[]) => deleted.forEach((n) => removeNode(n.id)),
    [removeNode],
  );
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => deleted.forEach((e) => removeEdge(e.id)),
    [removeEdge],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode={theme}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onNodeDoubleClick={onNodeDoubleClick}
      onPaneClick={() => selectNode(null)}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      connectionRadius={45}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      onMoveStart={() => setPanning(true)}
      onMoveEnd={() => setPanning(false)}
      deleteKeyCode={DELETE_KEYS}
      defaultEdgeOptions={{ type: 'deletable' }}
      snapToGrid
      snapGrid={SNAP_GRID}
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      panOnDrag={PAN_BUTTONS}
      multiSelectionKeyCode={['Meta', 'Shift']}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Panel position="top-left">
        <AddModulePanel />
      </Panel>
      <Background variant={BackgroundVariant.Dots} gap={16} size={1.5} />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}
