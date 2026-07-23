import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Handle, NodeToolbar, Position, useStore, type NodeProps } from '@xyflow/react';
import type { RFNodeData } from '../irAdapter';
import type { NodeType } from '../../ir/types';
import { NODE_CONFIG } from '../../ui/nodeConfig';
import { propertyFieldsFor, type PropertyField } from '../../ui/nodeSchema';
import { csProductBranches, readCsSlots } from '../../ui/csLogic';
import { ensureSettings } from '../../ir/settings';
import { computeInheritedFlags } from '../../ir/statusFlow';
import { FlagInheritStamp } from '../../ui/FlagInheritStamp';
import { Icon } from '../../ui/icons';
import { useFlowStore } from '../../store/flowStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useT, type TKey } from '../../ui/i18n';
import { HoverTip, useHoverLabel } from '../../components/HoverTip';

// ─────────────────────────────────────────────────────────────────────────────
// Node card. Bố cục theo yêu cầu:
//   - Bên TRÁI: icon của loại node (tile màu accent).
//   - Bên phải xếp dọc: (trên) tên LOẠI module · (giữa) TÊN module · (dưới) mô tả.
// Node 'condition' có nhiều handle output ở đáy (mỗi nhánh 1 chấm), chia đều & giữa.
// Chọn ĐÚNG 1 node -> hiện thanh công cụ phía trên (Sửa / Xoá) qua NodeToolbar;
// chọn NHIỀU node thì không hiện (chỉ là chọn). Preview property chỉ hiện khi HOVER.
// ─────────────────────────────────────────────────────────────────────────────

// Factory tạo 1 component node cho mỗi NodeType — tránh lặp markup.
export function makeNode(nodeType: NodeType) {
  const cfg = NODE_CONFIG[nodeType];
  const showTarget = cfg.showTarget !== false;
  const showSource = cfg.showSource !== false;

  function TypedNode({ id, data, selected }: NodeProps) {
    const d = data as unknown as RFNodeData;
    const description = pickDescription(d.nodeData);
    const handles = d.sourceHandles;
    const selectNode = useFlowStore((s) => s.selectNode);
    const requestDeleteNode = useFlowStore((s) => s.requestDeleteNode);
    const duplicateNode = useFlowStore((s) => s.duplicateNode);
    const isPanning = useFlowStore((s) => s.isPanning);
    // Số node đang chọn: khi chọn NHIỀU node (kéo khung / Shift-click) thì KHÔNG hiện
    // thanh Sửa/Xoá trên từng node — chỉ đơn thuần là chọn. Chỉ hiện khi chọn đúng 1 node.
    const multiSelected = useStore((s) => {
      let count = 0;
      for (const n of s.nodeLookup.values()) {
        if (n.selected && ++count > 1) return true;
      }
      return false;
    });
    const t = useT();
    // Màn CS (#/cs): node lùn, không icon loại (màu accent là đủ), chỉ tên +
    // icon biểu thị; output "khoét" rời khỏi node (CSS .bk-node--cs).
    const csMode = useWorkspaceStore((s) => s.mode === 'cs');
    const [hovered, setHovered] = useState(false);
    // Giữ preview mở khi rê chuột từ node sang card preview (có khoảng hở 12px):
    // mouseleave hẹn ẩn sau 180ms; mouseenter card huỷ hẹn -> hover được vào card.
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showPreview = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setHovered(true);
    };
    const hidePreview = () => {
      hideTimer.current = setTimeout(() => setHovered(false), 180);
    };

    // Vị trí (%) các điểm output — dùng chung cho lỗ mask trên "skin" và cung hõm.
    // Áp cho CẢ 2 màn (CS lẫn TS): node đều có output "khoét" vào cạnh đáy.
    const outPositions = showSource
      ? handles && handles.length > 0
        ? handles.map((h, i) => ({ key: h.id, left: ((i + 1) / (handles.length + 1)) * 100 }))
        : [{ key: 'default', left: 50 }]
      : [];
    // TS (không CS): tiếp điểm ĐẾN cũng "khoét lỗ" + chấm tròn ở ĐỈNH node đích, giống
    // hệt tiếp điểm xuất phát (CS giữ mũi tên -> không khoét). Chỉ khoét khi node có
    // handle target (showTarget).
    const targetNotch = showTarget && !csMode;
    // Mask khoét lỗ THẬT trên skin (nền + viền node): mỗi output 1 lỗ tròn tại mép
    // đáy — viền node tự ĐỨT đúng tại mép lỗ nên khớp hình học với cung hõm. TS thêm
    // 1 lỗ ở ĐỈNH giữa cho tiếp điểm đến.
    const skinHoles = [
      ...outPositions.map((p) => `radial-gradient(circle at ${p.left}% 100%, transparent 7px, #000 8px)`),
      ...(targetNotch ? ['radial-gradient(circle at 50% 0%, transparent 7px, #000 8px)'] : []),
    ];
    const skinMask = skinHoles.length > 0 ? skinHoles.join(', ') : undefined;
    const maskStyle: CSSProperties | undefined = skinMask
      ? ({
          maskImage: skinMask,
          maskComposite: 'intersect',
          WebkitMaskImage: skinMask,
          WebkitMaskComposite: 'source-in',
        } as CSSProperties)
      : undefined;

    return (
      <div
        className={['bk-node', csMode ? 'bk-node--cs' : '', selected ? 'bk-node--selected' : ''].join(' ')}
        style={{ '--accent': cfg.color } as CSSProperties}
        onMouseEnter={showPreview}
        onMouseLeave={hidePreview}
      >
        {/* Lớp "skin" mang nền + viền + bóng của node, bị mask khoét lỗ tại các output.
            Root node để trong suốt (xem CSS) — nhờ vậy handle/notch là anh em của skin,
            KHÔNG bị mask cắt mất. CS và TS dùng 2 class skin riêng (khác màu nền/viền)
            nhưng CÙNG cơ chế khoét lỗ. */}
        <span className={csMode ? 'bk-cs-skin' : 'bk-node-skin'} style={maskStyle} />
        {/* Hover / chọn node -> xem nhanh các property đang set (bên phải node).
            Node không có property nào cũng không có mô tả (vd hangup) thì KHÔNG hiện
            preview — tránh card "không có tham số" vô nghĩa. */}
        {hasPreviewContent(nodeType, d.nodeData, csMode) && (
          <NodeToolbar
            isVisible={hovered && !isPanning}
            position={Position.Right}
            offset={12}
            align="start"
          >
            <div onMouseEnter={showPreview} onMouseLeave={hidePreview}>
              <NodePreview id={id} type={nodeType} data={d.nodeData} cs={csMode} active={hovered} />
            </div>
          </NodeToolbar>
        )}

        {/* Thanh công cụ nổi phía trên node khi được chọn (bấm vào node).
            Ẩn trong lúc kéo/di chuyển canvas để không hiện lơ lửng sai chỗ. */}
        <NodeToolbar
          isVisible={selected && !multiSelected && !isPanning}
          position={Position.Top}
          offset={10}
          align="center"
        >
          <div className="bk-node-toolbar">
            {/* Duplicate: chỉ hiện cho node nhân bản được (Start là duy nhất -> ẩn). */}
            {nodeType !== 'start' && (
              <>
                <button
                  type="button"
                  className="bk-node-toolbar-btn"
                  onClick={() => duplicateNode(id)}
                  title={t('duplicateNodeTitle')}
                >
                  <Icon icon="lucide:copy" width={14} height={14} />
                  <span>{t('duplicate')}</span>
                </button>
                <span className="bk-node-toolbar-sep" />
              </>
            )}
            <button
              type="button"
              className="bk-node-toolbar-btn"
              onClick={() => selectNode(id)}
              title={t('editTitle')}
            >
              <Icon icon="lucide:pencil" width={14} height={14} />
              <span>{t('edit')}</span>
            </button>
            <span className="bk-node-toolbar-sep" />
            <button
              type="button"
              className="bk-node-toolbar-btn bk-node-toolbar-btn--danger"
              onClick={() => requestDeleteNode(id)}
              title={t('deleteNodeTitle')}
            >
              <Icon icon="lucide:trash-2" width={14} height={14} />
              <span>{t('delete')}</span>
            </button>
          </div>
        </NodeToolbar>

        {showTarget && <Handle type="target" position={Position.Top} className="bk-handle" />}

        {csMode ? (
          // CS: KHÔNG icon loại (nhận diện bằng màu accent trái) — TÊN node căn giữa
          // ĐÚNG TÂM node cả ngang lẫn dọc (2 dòng thì node cao thêm); dải icon biểu
          // thị neo absolute góc dưới phải, tách khỏi flow nên không đẩy lệch tên,
          // và luôn giữ khoảng hở với tên nhờ đệm đối xứng của .bk-cs-main (xem CSS).
          <div className="bk-node-body bk-node-body--cs">
            <div className="bk-cs-main">
              <div className="bk-node-name bk-node-name--cs" title={d.label}>
                {d.label}
              </div>
              <CsIndicators type={nodeType} data={d.nodeData} />
            </div>
          </div>
        ) : (
          <div className="bk-node-body">
            <div className="bk-node-icon">
              <Icon icon={cfg.icon} />
            </div>
            <div className="bk-node-text">
              <div className="bk-node-type">{cfg.typeLabel}</div>
              <div className="bk-node-name" title={d.label}>
                {d.label}
              </div>
              {description && (
                <div className="bk-node-desc" title={description}>
                  {description}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cung viền của hõm — ôm đúng mép lỗ đã mask trên skin (cùng toạ độ %). */}
        {outPositions.map((n) => (
          <span key={n.key} className="bk-cs-notch" style={{ left: `${n.left}%` }} />
        ))}
        {/* TS: cung hõm tiếp điểm ĐẾN ở ĐỈNH giữa node (mở xuống dưới, đối xứng với hõm output). */}
        {targetNotch && <span className="bk-cs-notch bk-cs-notch--target" style={{ left: '50%' }} />}

        {showSource &&
          (handles && handles.length > 0 ? (
            // Chia đều các chấm dọc đáy node, đối xứng qua tâm (1 nhánh -> giữa 50%).
            // Hover mỗi chấm hiện nhãn nhánh (label ở Branch Settings) kể cả khi chưa
            // nối dây — lúc đó không có edge nào mang nhãn giúp phân biệt nhánh.
            handles.map((h, i) => (
              <SourceHandle
                key={h.id}
                id={h.id}
                label={h.label}
                style={{ left: `${((i + 1) / (handles.length + 1)) * 100}%` }}
              />
            ))
          ) : (
            // Dự phòng: node có output nhưng chưa suy ra được nhánh -> chấm mặc định.
            <Handle id="default" type="source" position={Position.Bottom} className="bk-handle" />
          ))}
      </div>
    );
  }

  return TypedNode;
}

// Chấm output ở đáy node + tooltip nhãn nhánh khi hover. Tách riêng để mỗi chấm giữ
// được ref/hook tooltip độc lập (hook không gọi được trong vòng lặp inline).
function SourceHandle({ id, label, style }: { id: string; label?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const { onMouseEnter, onMouseLeave, tip } = useHoverLabel(ref, label ?? '');
  return (
    <>
      <Handle
        ref={ref}
        id={id}
        type="source"
        position={Position.Bottom}
        className="bk-handle"
        style={style}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
      {tip}
    </>
  );
}

// ── Icon biểu thị cấu hình trên node CS ──────────────────────────────────────
// Thay cho chữ: nhìn dải icon là biết node đã set gì (tooltip xem giá trị).
// Chỉ hiện icon của cấu hình CÓ THẬT — node trống thì không có icon nào.
// (KHÔNG có icon announce — nội dung announce xem ở preview/tab Announce List.)
function CsIndicators({ type, data }: { type: NodeType; data: Record<string, unknown> }) {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  // Mỗi loại biểu thị một MÀU tươi sáng cố định riêng (không theo accent node) để
  // nhìn phát phân biệt ngay: reconfirm vàng, retry hồng sáng, flag cyan sáng.
  const icons: { key: string; icon: string; title: string; color: string; text?: string }[] = [];

  if (type === 'interaction') {
    // Thứ tự hiển thị trái→phải: retry > reconfirm > flag (retry đẩy vào TRƯỚC).
    // Retry: hiện số lần (default 2) — icon vòng lặp + con số. Retry = 0 HOẶC bị
    // xoá trắng (chuỗi rỗng) thì ẩn; chỉ khi CHƯA TỪNG nhập mới áp default 2.
    const retry = data.retryCount == null ? '2' : str(data.retryCount);
    if (retry !== '' && retry !== '0')
      icons.push({
        key: 'retry',
        icon: 'akar-icons:arrow-cycle',
        title: str(data.retryAnnounce),
        color: '#f472b6',
        text: retry,
      });
    if (data.reconfirm === 'yes')
      icons.push({
        key: 'reconfirm',
        icon: 'fa6-solid:check-double',
        title: str(data.reconfirmAnnounce) || 'Re-confirm',
        color: '#fbbf24',
      });
  }
  // Flag: node có set Status/SMS Flag (transfer/hangup: statusFlag/smsFlag; hearing:
  // 切断時フラグ từ tab Announce List) -> cờ cyan sáng.
  const hasFlag = [data.statusFlag, data.smsFlag, data.hangupStatusFlag, data.hangupSmsFlag].some(
    (v) => str(v) !== '',
  );
  if (hasFlag) {
    const flagTitle = [
      str(data.statusFlag) || str(data.hangupStatusFlag) ? `Status: ${str(data.statusFlag) || str(data.hangupStatusFlag)}` : '',
      str(data.smsFlag) || str(data.hangupSmsFlag) ? `SMS: ${str(data.smsFlag) || str(data.hangupSmsFlag)}` : '',
    ]
      .filter(Boolean)
      .join(' / ');
    icons.push({ key: 'flag', icon: 'gravity-ui:flag', title: flagTitle, color: '#22d3ee' });
  }
  if (type === 'transfer' && str(data.transferNumber))
    icons.push({
      key: 'phone',
      icon: 'lucide:phone-forwarded',
      title: str(data.transferNumber),
      color: '#38bdf8',
    });
  // 分岐ロジック (CS): icon rẽ nhánh + số nhánh (tích các điều kiện, chưa tính else その他).
  if (type === 'logic') {
    const branches = csProductBranches(readCsSlots(data));
    if (branches.length > 0)
      icons.push({
        key: 'branches',
        icon: 'lucide:git-fork',
        title: branches.map((b) => b.label).join(' / '),
        color: '#fbbf24',
        text: String(branches.length),
      });
  }

  if (icons.length === 0) return null;
  return (
    <div className="bk-cs-indicators">
      {icons.map((it) => (
        // Màu icon truyền qua biến --ind; CSS pha thêm màu chữ node cho đủ tương phản.
        <span key={it.key} className="bk-cs-ind" title={it.title} style={{ '--ind': it.color } as CSSProperties}>
          <Icon icon={it.icon} width={13} height={13} />
          {it.text && <span className="bk-cs-ind-num">{it.text}</span>}
        </span>
      ))}
    </div>
  );
}

// Mô tả là field do người dùng tự nhập (data.description). Không lấy text/prompt
// làm mô tả — những field đó chỉ sửa trong panel setting.
function pickDescription(data: Record<string, unknown>): string | null {
  const value = data.description;
  return typeof value === 'string' && value.trim() ? value : null;
}

// Preview có gì để hiện không: còn ít nhất 1 property (đang set/áp default) hoặc có
// mô tả. Node như hangup không có field nào & không mô tả -> false, ẩn hẳn preview.
// 分岐ロジック ở màn CS: preview là danh sách CÂU ĐIỀU KIỆN (không phải field kỹ thuật
// Module/Script) — chỉ hiện khi đã tạo nhánh hoặc có mô tả.
function hasPreviewContent(type: NodeType, data: Record<string, unknown>, cs = false): boolean {
  if (cs && type === 'logic') {
    return csProductBranches(readCsSlots(data)).length > 0 || pickDescription(data) !== null;
  }
  const fields = propertyFieldsFor(type, cs).filter((f) => !f.showIf || f.showIf(data));
  return fields.length > 0 || pickDescription(data) !== null;
}

// ── Preview property (hover/chọn node) ──────────────────────────────────────
// Card nhỏ bên phải node: liệt kê các property đang set. Giá trị dài (announce,
// prompt…) cắt 1 dòng + "…" cho vừa bề rộng card (xử lý bằng CSS text-ellipsis).
// Chỉ render khi hasPreviewContent = true (component cha đã gác) nên không cần
// nhánh "không có tham số" nữa.
function NodePreview({
  id,
  type,
  data,
  cs = false,
  active = false,
}: {
  id: string;
  type: NodeType;
  data: Record<string, unknown>;
  cs?: boolean;
  active?: boolean;
}) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const fields = cs && type === 'logic' ? [] : propertyFieldsFor(type, cs).filter((f) => !f.showIf || f.showIf(data));
  const description = pickDescription(data);
  // 分岐ロジック (CS): mỗi nhánh (tích các điều kiện) 1 dòng.
  const csBranches = cs && type === 'logic' ? csProductBranches(readCsSlots(data)) : [];
  // Status/SMS flag KẾ THỪA (tự fill từ node phía trên): chỉ tính khi card đang hiện
  // (active) để tránh chạy BFS cho MỌI node — preview luôn mount trong NodeToolbar.
  const settings = ensureSettings(ir?.settings);
  const inherited = useMemo(() => (active ? computeInheritedFlags(ir).get(id) : undefined), [active, ir, id]);

  return (
    <div className="bk-node-preview">
      {description && (
        <div className="bk-node-preview-row">
          <span className="bk-node-preview-key">{t('description')}</span>
          {/* Giá trị dài bị cắt "…" -> hover xem đầy đủ (tooltip nổi). */}
          <HoverTip className="bk-node-preview-val" content={description}>
            {description}
          </HoverTip>
        </div>
      )}
      {csBranches.map((b, i) => {
        const sentence = b.label;
        return (
          <div key={b.id} className="bk-node-preview-row">
            <span className="bk-node-preview-key">{i + 1}</span>
            <HoverTip className="bk-node-preview-val" content={sentence}>
              {sentence}
            </HoverTip>
          </div>
        );
      })}
      {fields.map((f) => {
        // Status/SMS Flag (settingsSelect): value chỉ lưu SỐ flag -> map ra nhãn đầy đủ
        // "1 - 未処理" từ Status Settings; node chưa tự đặt mà có flag kế thừa -> hiện
        // stamp "継続 / Carried" + nhãn flag đang tự fill (thay vì chỉ hiện số / "—").
        if (f.kind === 'settingsSelect') {
          const opts =
            f.settingsOptions === 'smsFlags'
              ? settings.smsFlags.map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.type || '—'}` }))
              : settings.statuses.map((s) => ({ value: String(s.flag), label: `${s.flag} - ${s.name}` }));
          const labelOf = (v: string) => opts.find((o) => o.value === v)?.label ?? v;
          const raw = data[f.key];
          const own = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
          const inheritedVal = f.settingsOptions === 'smsFlags' ? inherited?.smsFlag : inherited?.statusFlag;
          return (
            <div key={f.key} className="bk-node-preview-row">
              <span className="bk-node-preview-key">{t(f.labelKey)}</span>
              {own ? (
                <HoverTip className="bk-node-preview-val" content={labelOf(own)}>
                  {labelOf(own)}
                </HoverTip>
              ) : inheritedVal && inherited?.isEntry ? (
                // Node đầu tiên: hiện giá trị mặc định (0 / -2) PLAIN, KHÔNG stamp Carried.
                <HoverTip className="bk-node-preview-val" content={labelOf(inheritedVal)}>
                  {labelOf(inheritedVal)}
                </HoverTip>
              ) : inheritedVal ? (
                <HoverTip
                  className="bk-node-preview-val"
                  content={`${t('flagInherit')} — ${labelOf(inheritedVal)}`}
                >
                  <FlagInheritStamp className="mr-1 align-middle" />
                  {labelOf(inheritedVal)}
                </HoverTip>
              ) : (
                <span className="bk-node-preview-val">—</span>
              )}
            </div>
          );
        }
        const val = formatFieldValue(f, data, t);
        return (
          <div key={f.key} className="bk-node-preview-row">
            <span className="bk-node-preview-key">{t(f.labelKey)}</span>
            <HoverTip className="bk-node-preview-val" content={val}>
              {val || '—'}
            </HoverTip>
          </div>
        );
      })}
    </div>
  );
}

// Giá trị hiển thị của 1 field: select/yesno -> nhãn lựa chọn; còn lại -> chuỗi thô.
function formatFieldValue(
  field: PropertyField,
  data: Record<string, unknown>,
  t: (key: TKey) => string,
): string {
  const raw = data[field.key];
  // Chưa lưu vào data -> lấy giá trị mặc định (giống ô nhập trong panel), tránh hiện "—"
  // dù field vốn có default (vd Voice Type, Retry Count).
  const value =
    typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : field.default ?? '';
  if ((field.kind === 'select' || field.kind === 'yesno') && value) {
    const opt = field.options?.find((o) => o.value === value);
    if (opt) return opt.labelKey ? t(opt.labelKey) : opt.label ?? value;
  }
  return value.replace(/\s+/g, ' ').trim();
}
