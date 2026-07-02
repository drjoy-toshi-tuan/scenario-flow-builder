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
  type Connection,
  type Node,
  type Edge,
  type NodeMouseHandler,
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
  const selectNode = useFlowStore((s) => s.selectNode);
  const theme = useTheme((s) => s.theme);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Re-derive trạng thái canvas mỗi khi IR đổi (state -> view, một chiều).
  useEffect(() => {
    if (!ir) return;
    const rf = irToReactFlow(ir);
    setNodes(rf.nodes);
    setEdges(rf.edges);
  }, [ir, setNodes, setEdges]);

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
      onConnect={onConnect}
      onNodeDoubleClick={onNodeDoubleClick}
      onPaneClick={() => selectNode(null)}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      deleteKeyCode={DELETE_KEYS}
      defaultEdgeOptions={{ type: 'deletable' }}
      snapToGrid
      snapGrid={SNAP_GRID}
      nodesDraggable
      elementsSelectable
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
