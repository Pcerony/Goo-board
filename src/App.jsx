import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, BrainCircuit, MousePointer2, Link as LinkIcon, Unlink, StickyNote as MemoIcon, Check, Image as ImageIcon, FileType, Layout, Save, Upload, Palette, Download } from 'lucide-react';

// NOTE: External Libraries injected dynamically via CDN (Only Export libs needed now)
const HTML2CANVAS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

// --- Configuration ---
const POS_TYPES = {
  NOUN: { id: 'noun', label: '名词', color: 'bg-yellow-300', borderColor: 'border-yellow-400', strokeColor: 'stroke-yellow-300', gradientText: 'text-yellow-300' }, 
  VERB: { id: 'verb', label: '动作', color: 'bg-green-300', borderColor: 'border-green-400', strokeColor: 'stroke-green-300', gradientText: 'text-green-300' }, 
  ADJ: { id: 'adj', label: '形容', color: 'bg-blue-300', borderColor: 'border-blue-400', strokeColor: 'stroke-blue-300', gradientText: 'text-blue-300' },
  PINK: { id: 'pink', label: '粉色', color: 'bg-gradient-to-br from-pink-300 to-rose-300', borderColor: 'border-pink-400', strokeColor: 'stroke-pink-400', gradientText: 'text-pink-400' },
  PURPLE: { id: 'purple', label: '紫色', color: 'bg-gradient-to-br from-purple-300 to-violet-300', borderColor: 'border-purple-400', strokeColor: 'stroke-purple-400', gradientText: 'text-purple-400' },
  ORANGE: { id: 'orange', label: '橙色', color: 'bg-gradient-to-br from-orange-300 to-red-300', borderColor: 'border-orange-400', strokeColor: 'stroke-orange-400', gradientText: 'text-orange-400' },
  MEMO: { id: 'memo', label: '备注', color: 'bg-white/60 backdrop-blur-md shadow-sm', borderColor: 'border-slate-300', strokeColor: 'stroke-slate-200', gradientText: 'text-slate-200' }, 
};

const getNoteStyle = (text, type) => {
  const isMemo = type === 'memo';
  const len = text ? text.length : 0;
  if (isMemo) {
    let widthRem = 12; 
    let heightRem = 4; 
    if (len > 15) widthRem = Math.min(24, 12 + (len - 15) * 0.4);
    return { width: `${widthRem}rem`, height: `${heightRem}rem`, widthVal: widthRem * 16, heightVal: heightRem * 16, fontSize: 'text-sm', isMemo: true };
  } else {
    let sizeRem = 9; let fontSize = 'text-lg';
    if (len <= 6) fontSize = 'text-2xl'; 
    else if (len <= 15) fontSize = 'text-lg';  
    else if (len <= 40) fontSize = 'text-sm';  
    else { fontSize = 'text-xs'; sizeRem = Math.min(16, 9 + (len - 40) * 0.15); }
    return { width: `${sizeRem}rem`, height: `${sizeRem}rem`, widthVal: sizeRem * 16, heightVal: sizeRem * 16, fontSize, isMemo: false };
  }
};

// SAFETY CHECK: Guard against undefined item to prevent white screen
const getCenter = (item) => {
    if (!item) return { x: 0, y: 0 }; 
    const style = getNoteStyle(item.text, item.type);
    return { x: item.x + style.widthVal / 2, y: item.y + style.heightVal / 2 };
};

const getCurvePoints = (from, to, offset = {x: 0, y: 0}) => {
    if (!from || !to) return { path: '', labelX: 0, labelY: 0 };
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    // Check for NaN
    if (isNaN(midX) || isNaN(midY)) return { path: '', labelX: 0, labelY: 0 };

    const cpX = midX + offset.x;
    const cpY = midY + offset.y;
    const labelX = midX + 0.5 * offset.x;
    const labelY = midY + 0.5 * offset.y;
    return { path: `M${from.x},${from.y} Q${cpX},${cpY} ${to.x},${to.y}`, labelX, labelY };
};

const getLabelDimensions = (label) => {
    const len = label ? label.length : 0;
    const width = Math.max(36, len * 12 + 16); 
    const height = 36; 
    return { width, height, rx: height / 2 };
};

const isPointInPolygon = (point, vs) => {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

// --- Sub Components ---

const ColorPicker = ({ onChange, currentType }) => (
  <div className="flex gap-1 mt-2 justify-center" onMouseDown={e => e.stopPropagation()}>
    {Object.entries(POS_TYPES).filter(([k]) => k !== 'MEMO').map(([key, config]) => (
      <button key={key} title={config.label} onClick={() => onChange(config)} className={`w-4 h-4 rounded-full border border-black/10 transition-transform hover:scale-110 ${config.color} ${currentType === config.id ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`} />
    ))}
  </div>
);

const GooeyFilters = () => (
  <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
    <defs>
      <filter id="goo">
        <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="blur" />
        <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 40 -10" result="goo" />
        <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
      </filter>
    </defs>
  </svg>
);

const BlobBackground = ({ item }) => {
    const style = getNoteStyle(item.text, item.type);
    if (item.type === 'memo') return null; 
    return (
        <div className={`absolute rounded-full transition-all duration-300 ease-out ${item.color}`} style={{ left: item.x, top: item.y, width: style.width, height: style.height }} />
    );
};

const MemoBackground = ({ item }) => {
    const style = getNoteStyle(item.text, item.type);
    return (
        <div 
            className={`absolute rounded-full transition-all duration-300 ease-out ${item.color}`} 
            style={{ 
                left: item.x, 
                top: item.y, 
                width: style.width, 
                height: style.height,
            }} 
        />
    );
};

const GooeyLine = ({ id, from, to, fromColor, toColor, offset, label }) => {
    if (!from || !to) return null;
    const gradientId = `grad-${id}`;
    const curveData = getCurvePoints(from, to, offset);
    const { width, height, rx } = getLabelDimensions(label);

    return (
        <g>
            <defs>
                <linearGradient id={gradientId} x1={from.x} y1={from.y} x2={to.x} y2={to.y} gradientUnits="userSpaceOnUse">
                    <stop offset="0%" className={fromColor} stopColor="currentColor" stopOpacity="1" />
                    <stop offset="35%" className={fromColor} stopColor="currentColor" stopOpacity="1" />
                    <stop offset="65%" className={toColor} stopColor="currentColor" stopOpacity="1" />
                    <stop offset="100%" className={toColor} stopColor="currentColor" stopOpacity="1" />
                </linearGradient>
            </defs>
            <path 
                d={curveData.path} 
                stroke={`url(#${gradientId})`} 
                strokeWidth="18" 
                strokeLinecap="round" 
                fill="none" 
            />
            {label ? (
                 <rect 
                    x={curveData.labelX - width / 2}
                    y={curveData.labelY - height / 2}
                    width={width}
                    height={height}
                    rx={rx}
                    fill={`url(#${gradientId})`}
                 />
            ) : (
                <circle cx={curveData.labelX} cy={curveData.labelY} r="18" fill={`url(#${gradientId})`} />
            )}
        </g>
    );
};

const StickyNote = ({ item, onMouseDown, onDelete, onChangeColor, onUpdateText, onUnlink, onStartConnection, isSelected, isTargeted, mode, isEditing, setEditingId, isUnlinking }) => {
  if (!item) return null;
  const isMemo = item.type === 'memo';
  const isGrouped = !!item.groupId;
  const styleInfo = getNoteStyle(item.text, item.type);
  const { fontSize } = styleInfo;
  
  const borderClass = isMemo ? `border ${item.borderColor}` : '';

  return (
    <div
        onMouseDown={(e) => { 
            if (isEditing) { 
                e.stopPropagation(); 
            } else { 
                onMouseDown(e, item.id, 'note'); 
            } 
        }}
        onDoubleClick={(e) => { 
            e.stopPropagation(); 
            setEditingId(item.id); 
        }}
        style={{ 
            left: item.x, 
            top: item.y, 
            width: styleInfo.width, 
            height: styleInfo.height, 
            cursor: isEditing ? 'auto' : 'move', 
            zIndex: isSelected || isEditing ? 300 : (isTargeted ? 150 : 10), 
            transform: isTargeted ? 'scale(1.05)' : 'scale(1)', 
            animation: isUnlinking ? 'shake 0.3s cubic-bezier(.36,.07,.19,.97) both' : 'none' 
        }}
        className={`absolute p-4 flex flex-col items-center justify-center text-center transition-all duration-300 ease-out rounded-full group 
        ${borderClass}
        ${isEditing ? 'select-text cursor-auto' : 'select-none'}
        ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2' : 
          (isTargeted ? 'ring-4 ring-indigo-300 ring-offset-2' : 
            (isGrouped ? 'border-2 border-dashed border-indigo-400/50' : ''))}`}
    >
        {/* EDIT MODE: Color Picker (Top) */}
        {isEditing && !styleInfo.isMemo && (
            <div 
                className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-white p-2 rounded-full shadow-lg border border-slate-200 z-50 flex gap-2 animate-in fade-in slide-in-from-bottom-2 pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <ColorPicker currentType={item.type} onChange={(config) => onChangeColor(item.id, config)} />
            </div>
        )}

        {/* Connect Button Handle */}
        {isEditing && (
            <div 
                className="absolute -right-6 top-1/2 transform -translate-y-1/2 bg-green-500 text-white p-2 rounded-full shadow-lg cursor-crosshair z-50 animate-in fade-in zoom-in hover:scale-110 transition-transform pointer-events-auto"
                onMouseDown={(e) => onStartConnection(e, item.id)}
                title="拖拽连线"
            >
                <LinkIcon size={16} />
            </div>
        )}
        
        {isTargeted && (
             <div className="absolute -right-2 -bottom-2 bg-indigo-600 text-white rounded-full p-1 shadow animate-bounce z-50">
                <Check size={12} />
             </div>
        )}
        
        <div className="flex-1 flex flex-col justify-center items-center w-full h-full relative z-10">
        {isEditing ? (
            <textarea 
                autoFocus 
                className={`w-full h-full bg-transparent resize-none border-none focus:ring-0 text-center ${fontSize} ${isMemo ? 'text-slate-700 font-medium' : 'text-gray-900 font-bold'} p-0 select-text leading-tight`} 
                value={item.text} 
                placeholder={styleInfo.isMemo ? "" : ""} 
                onChange={(e) => onUpdateText(item.id, e.target.value)} 
                onKeyDown={(e) => { 
                    if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditingId(null); } 
                }} 
                onMouseDown={(e) => e.stopPropagation()} 
            />
        ) : (
            <>
                <span className={`${styleInfo.isMemo ? 'font-medium text-slate-700' : 'font-bold text-gray-900'} ${fontSize} leading-tight break-words w-full px-2 select-none pointer-events-none drop-shadow-sm`}>{item.text}</span>
                {!styleInfo.isMemo && item.count > 0 && <span className="text-[10px] text-stone-600/80 mt-1 select-none pointer-events-none">Freq: {item.count}</span>}
            </>
        )}
        </div>
        
        {/* EDIT MODE: Action Buttons (Bottom) */}
        {isEditing && (
            <div 
                className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 flex gap-2 bg-white px-3 py-1.5 rounded-full shadow-lg border border-slate-200 z-50 animate-in fade-in slide-in-from-top-2 pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()} 
            >
                {item.groupId && ( 
                    <button 
                        onClick={() => { onUnlink(item.id); setEditingId(null); }} 
                        className="text-slate-500 hover:text-indigo-600 hover:bg-slate-100 p-1 rounded transition-colors flex items-center gap-1" 
                        title="解绑"
                    >
                        <Unlink size={16} />
                    </button>
                )}
                <button 
                    onClick={() => { onDelete(item.id); setEditingId(null); }} 
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors flex items-center gap-1" 
                    title="删除"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        )}
        <style>{`@keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }`}</style>
    </div>
  );
};

const ConnectionOverlay = ({ connection, from, to, onDelete, offset, onMouseDownHandle, label, onDoubleClickEdit }) => {
  if (!from || !to) return null;
  const curveData = getCurvePoints(from, to, offset);
  const { width, height } = getLabelDimensions(label);

  return (
    <g className="group pointer-events-auto">
      <path d={curveData.path} stroke="transparent" strokeWidth="20" fill="none" />
      <g 
        transform={`translate(${curveData.labelX}, ${curveData.labelY})`}
        onMouseDown={(e) => onMouseDownHandle(e, connection.id, 'connectionHandle')}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClickEdit(connection.id); }} 
        className="cursor-move"
      >
          {/* HIT AREA */}
          {label ? (
                 <rect 
                    x={-width / 2}
                    y={-height / 2}
                    width={width}
                    height={height}
                    rx={height/2}
                    fill="rgba(255,255,255,0.01)" 
                 />
            ) : (
                <circle cx="0" cy="0" r="45" fill="rgba(255,255,255,0.01)" />
            )}
          
          <text y="4" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#334155" className="select-none font-sans pointer-events-none drop-shadow-sm">
             {label || ''}
          </text>
      </g>
      
      {/* Delete Button (Hover) */}
      <g className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={(e) => { e.stopPropagation(); onDelete(); }} transform={`translate(${curveData.labelX + width/2 + 10}, ${curveData.labelY - 20})`}>
          <circle r="9" fill="#ef4444" className="shadow-sm"/>
          <path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke="white" strokeWidth="1.5" />
      </g>
    </g>
  );
};

export default function KJAnalysisBoard() {
  const [items, setItems] = useState([]);
  const [connections, setConnections] = useState([]);
  // No mode needed anymore
  const [boardName, setBoardName] = useState('未命名分析');
  const boardRef = useRef(null); 
  const contentRef = useRef(null); 
  const fileInputRef = useRef(null);
  
  const [editingId, setEditingId] = useState(null);
  const [editingConnId, setEditingConnId] = useState(null);
  const [unlinkingId, setUnlinkingId] = useState(null); 
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  const hoverTimeoutRef = useRef(null); 
  const hoverCandidateIdRef = useRef(null); 
  const longPressTimerRef = useRef(null); 

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lassoPoints, setLassoPoints] = useState([]); 
  const [isLassoing, setIsLassoing] = useState(false);
  
  const [dragState, setDragState] = useState({ 
    id: null, type: null, startX: 0, startY: 0, 
    initItemX: 0, initItemY: 0,
    initOffset: {x:0, y:0},
    targetId: null, 
    isConnecting: false, startConnId: null, currMouseX: 0, currMouseY: 0,
    initialPositions: {} 
  });

  useEffect(() => {
    // Only export libs needed now
    [HTML2CANVAS_CDN, JSPDF_CDN].forEach(src => {
        if (!document.querySelector(`script[src="${src}"]`)) {
            const script = document.createElement('script');
            script.src = src;
            document.head.appendChild(script);
        }
    });

    // Init with one blank note if empty
    if (items.length === 0) {
        setItems([{ id: `manual-${Date.now()}`, text: "", count: 0, type: 'noun', color: POS_TYPES.NOUN.color, borderColor: POS_TYPES.NOUN.borderColor, strokeColor: POS_TYPES.NOUN.strokeColor, gradientText: POS_TYPES.NOUN.gradientText, x: 500, y: 300, groupId: null }]);
    }
  }, []);

  const handleSaveToFile = () => {
    const dateStr = new Date().toISOString().split('T')[0];
    const data = { boardName, items, connections, date: Date.now() }; 
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${boardName}_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLoadFromFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.items && Array.isArray(parsed.items)) {
           setItems(parsed.items);
           setConnections(parsed.connections || []);
           if (parsed.boardName) setBoardName(parsed.boardName); 
        } else {
           alert("文件格式不正确，无法读取");
        }
      } catch (err) {
        console.error(err);
        alert("读取文件失败");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleExport = async (format) => {
      setShowExportMenu(false);
      if (!contentRef.current || !window.html2canvas) return;
      setIsExporting(true);
      try {
          const isPng = format === 'png';
          const canvas = await window.html2canvas(contentRef.current, {
              scale: 4, 
              useCORS: true,
              backgroundColor: null, 
              logging: false,
              allowTaint: true, 
              ignoreElements: (el) => el.classList.contains('no-export'),
              onclone: (doc) => {
                  const textNodes = doc.querySelectorAll('.font-handwriting span'); 
                  textNodes.forEach(node => { node.style.overflow = 'visible'; node.style.whiteSpace = 'normal'; });
                  if (isPng) {
                      const board = doc.querySelector('#kj-board-canvas');
                      if (board) { board.style.backgroundColor = 'transparent'; board.style.backgroundImage = 'none'; }
                  }
              }
          });
          
          const filename = `${boardName}_导出`; 

          if (format === 'png') {
              const link = document.createElement('a'); link.download = `${filename}.png`; link.href = canvas.toDataURL('image/png'); link.click();
          } else if (format === 'pdf' && window.jspdf) {
              const { jsPDF } = window.jspdf;
              const imgData = canvas.toDataURL('image/png');
              const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'l' : 'p', unit: 'px', format: [canvas.width, canvas.height] });
              pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
              pdf.save(`${filename}.pdf`);
          }
      } catch (err) { console.error("Export failed:", err); alert("导出失败，请重试"); } finally { setIsExporting(false); }
  };

  const clearBoard = () => { if(confirm('确定要清空所有内容吗？')) { setItems([]); setConnections([]); setBoardName('未命名分析'); } };
  const handleDeleteItem = (id) => { setItems(items.filter(i => i.id !== id)); setConnections(conn => conn.filter(c => c.fromId !== id && c.toId !== id)); };
  const handleUnlinkItem = (id) => { setUnlinkingId(id); setTimeout(() => { setItems(prev => prev.map(i => i.id === id ? { ...i, groupId: null } : i)); setUnlinkingId(null); }, 300); };
  const handleDeleteConnection = (id) => setConnections(prev => prev.filter(c => c.id !== id));
  
  const handleUpdateConnectionLabel = (id, text) => { setConnections(prev => prev.map(c => c.id === id ? { ...c, label: text } : c)); };
  const handleColorChange = (id, config) => { setItems(items.map(i => i.id === id ? { ...i, color: config.color, borderColor: config.borderColor, strokeColor: config.strokeColor, gradientText: config.gradientText, type: config.id } : i)); };
  const handleUpdateText = (id, newText) => { setItems(items.map(i => i.id === id ? { ...i, text: newText } : i)); };
  
  const handleAddNote = (x, y) => {
    // Safety check for NaN coords
    if (isNaN(x) || isNaN(y)) {
         x = 500; y = 300;
    }
    const newNote = { id: `manual-${Date.now()}`, text: "", count: 0, type: 'noun', color: POS_TYPES.NOUN.color, borderColor: POS_TYPES.NOUN.borderColor, strokeColor: POS_TYPES.NOUN.strokeColor, gradientText: POS_TYPES.NOUN.gradientText, x: x, y: y, groupId: null };
    setItems(prev => [...prev, newNote]);
  };

  const handleAddMemo = () => {
    const newMemo = { id: `memo-${Date.now()}`, text: "", count: 0, type: 'memo', color: POS_TYPES.MEMO.color, borderColor: POS_TYPES.MEMO.borderColor, strokeColor: POS_TYPES.MEMO.strokeColor, gradientText: POS_TYPES.MEMO.gradientText, x: 350 + Math.random() * 50, y: 350 + Math.random() * 50, groupId: null };
    setItems(prev => [...prev, newMemo]);
  };

  const handleStartConnection = (e, noteId) => {
      e.stopPropagation();
      e.preventDefault();
      
      const item = items.find(i => i.id === noteId);
      if (!item) return;
      
      setDragState({
          id: null, 
          type: null,
          isConnecting: true,
          startConnId: noteId,
          startX: e.clientX,
          startY: e.clientY,
          currMouseX: item.x + 72, 
          currMouseY: item.y + (item.type === 'memo' ? 40 : 72),
          initItemX: 0, initItemY: 0
      });
  };

  const handleMouseDown = (e, id, type) => {
    e.stopPropagation();
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;
    if (editingId || editingConnId) { setEditingId(null); setEditingConnId(null); return; }
    
    // Board Selection Logic (Click on background)
    if (type === 'board') {
        const rect = boardRef.current.getBoundingClientRect();
        const startX = e.clientX - rect.left + boardRef.current.scrollLeft;
        const startY = e.clientY - rect.top + boardRef.current.scrollTop;
        
        setSelectedIds(new Set());
        setIsLassoing(true);
        setLassoPoints([{x: startX, y: startY}]);
        return;
    }
    
    if (type === 'connectionHandle') {
        e.preventDefault();
        const conn = connections.find(c => c.id === id);
        const initOffset = conn?.controlOffset || {x: 0, y: 0};
        setDragState({
            id, type: 'connectionHandle',
            startX: e.clientX, startY: e.clientY,
            initOffset, 
            initItemX: 0, initItemY: 0, targetId: null, isConnecting: false, startConnId: null, currMouseX: 0, currMouseY: 0,
            initialPositions: {}
        });
        return;
    }

    e.preventDefault(); 
    const item = items.find(i => i.id === id);
    if(!item) return;

    // Multi-select Drag Logic
    let initialPositions = {};
    const newSelectedIds = new Set(selectedIds);
    
    if (newSelectedIds.has(id)) {
        newSelectedIds.forEach(selId => {
            const selItem = items.find(i => i.id === selId);
            if (selItem) initialPositions[selId] = { x: selItem.x, y: selItem.y };
        });
    } else {
        setSelectedIds(new Set([id]));
        initialPositions[id] = { x: item.x, y: item.y };
    }

    if (item.groupId && newSelectedIds.size <= 1) {
        longPressTimerRef.current = setTimeout(() => { handleUnlinkItem(id); setDragState(prev => ({ ...prev, isDragging: false })); }, 800); 
    }

    setDragState({
      id, type,
      startX: e.clientX, startY: e.clientY,
      initItemX: item.x, initItemY: item.y,
      targetId: null,
      isDragging: true, isConnecting: false, startConnId: null, currMouseX: 0, currMouseY: 0,
      initialPositions
    });
  };

  const handleMouseMove = (e) => {
    // 1. Update Lasso Selection
    if (isLassoing) {
        if (!boardRef.current) return;
        const rect = boardRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + boardRef.current.scrollLeft;
        const y = e.clientY - rect.top + boardRef.current.scrollTop;
        
        setLassoPoints(prev => [...prev, {x, y}]);
        return;
    }

    if (dragState.type === 'connectionHandle') {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        const newOffsetX = dragState.initOffset.x + dx * 2;
        const newOffsetY = dragState.initOffset.y + dy * 2;
        setConnections(prev => prev.map(c => c.id === dragState.id ? { ...c, controlOffset: { x: newOffsetX, y: newOffsetY } } : c));
        return;
    }

    if (dragState.isConnecting) {
        if (!boardRef.current) return;
        const boardRect = boardRef.current.getBoundingClientRect();
        setDragState(prev => ({ ...prev, currMouseX: e.clientX - boardRect.left + boardRef.current.scrollLeft, currMouseY: e.clientY - boardRect.top + boardRef.current.scrollTop }));
        return;
    }
    if (!dragState.isDragging) return;
    const dx = e.clientX - dragState.startX; const dy = e.clientY - dragState.startY;
    if (longPressTimerRef.current && Math.hypot(dx, dy) > 5) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    
    if (dragState.type === 'note') {
      // Multi-Item Move
      if (selectedIds.size > 1 && selectedIds.has(dragState.id)) {
          setItems(prev => prev.map(item => {
              if (selectedIds.has(item.id) && dragState.initialPositions[item.id]) {
                  return {
                      ...item,
                      x: dragState.initialPositions[item.id].x + dx,
                      y: dragState.initialPositions[item.id].y + dy
                  };
              }
              return item;
          }));
          return; 
      }

      const draggedItem = items.find(i => i.id === dragState.id);
      if (!draggedItem) return;
      if (draggedItem.groupId) {
          setItems(prev => prev.map(item => item.groupId === draggedItem.groupId ? { ...item, x: item.x + e.movementX, y: item.y + e.movementY } : item));
      } else {
          setItems(prev => prev.map(item => item.id === dragState.id ? { ...item, x: dragState.initItemX + dx, y: dragState.initItemY + dy } : item));
      }
      const currentX = draggedItem.x + (draggedItem.groupId ? e.movementX : 0); const currentY = draggedItem.y + (draggedItem.groupId ? e.movementY : 0);
      const center = getCenter({ ...draggedItem, x: currentX, y: currentY });
      const candidate = items.find(i => {
          if (i.id === dragState.id || (draggedItem.groupId && i.groupId === draggedItem.groupId)) return false; 
          const iCenter = getCenter(i);
          return Math.hypot(center.x - iCenter.x, center.y - iCenter.y) < 160; 
      });
      if (candidate) {
          if (hoverCandidateIdRef.current !== candidate.id) {
              clearTimeout(hoverTimeoutRef.current); hoverCandidateIdRef.current = candidate.id;
              hoverTimeoutRef.current = setTimeout(() => { setDragState(prev => ({ ...prev, targetId: candidate.id })); }, 600); 
          }
      } else {
          if (hoverCandidateIdRef.current) { clearTimeout(hoverTimeoutRef.current); hoverCandidateIdRef.current = null; setDragState(prev => ({ ...prev, targetId: null })); }
      }
    }
  };

  const handleMouseUp = (e) => {
    clearTimeout(hoverTimeoutRef.current); hoverCandidateIdRef.current = null; clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null;
    
    // Finalize Lasso Selection
    if (isLassoing) {
        setIsLassoing(false);
        const points = lassoPoints;
        setLassoPoints([]);
        if (points.length > 2) {
            const newSelected = new Set();
            items.forEach(item => {
                const center = getCenter(item);
                const poly = points.map(p => [p.x, p.y]);
                if (isPointInPolygon([center.x, center.y], poly)) {
                    newSelected.add(item.id);
                }
            });
            setSelectedIds(newSelected);
        } else {
            setSelectedIds(new Set());
        }
        return;
    }

    if (dragState.isConnecting) {
        if (boardRef.current) {
          const boardRect = boardRef.current.getBoundingClientRect();
          const mouseX = e.clientX - boardRect.left + boardRef.current.scrollLeft;
          const mouseY = e.clientY - boardRect.top + boardRef.current.scrollTop;
          const target = items.find(i => {
              if (i.id === dragState.startConnId) return false;
              const cx = i.x + 72; const cy = i.y + 72;
              return Math.hypot(cx - mouseX, cy - mouseY) < 60;
          });
          if (target) { 
             const existingCount = connections.filter(c => (c.fromId === dragState.startConnId && c.toId === target.id) || (c.fromId === target.id && c.toId === dragState.startConnId)).length;
             const shift = existingCount === 0 ? 0 : (existingCount % 2 === 0 ? -1 : 1) * Math.ceil(existingCount/2) * 50;
             setConnections(prev => [...prev, { id: `conn-${Date.now()}`, fromId: dragState.startConnId, toId: target.id, label: "", controlOffset: {x: shift, y: shift} }]); 
          }
        }
    }
    if (dragState.isDragging && dragState.type === 'note') {
        const item = items.find(i => i.id === dragState.id);
        if (item) {
            // Check for memo dropping on connection
            if (item.type === 'memo') {
                const itemCenter = getCenter(item);
                const targetConn = connections.find(conn => {
                    const from = items.find(i => i.id === conn.fromId); const to = items.find(i => i.id === conn.toId); if (!from || !to) return false;
                    const curveData = getCurvePoints(from, to, conn.controlOffset || {x:0,y:0});
                    return Math.hypot(curveData.labelX - itemCenter.x, curveData.labelY - itemCenter.y) < 60;
                });
                if (targetConn) {
                    setConnections(prev => prev.map(c => c.id === targetConn.id ? { ...c, label: item.text } : c));
                    setItems(prev => prev.filter(i => i.id !== item.id));
                    setDragState({ ...dragState, isDragging: false, isConnecting: false, id: null, startConnId: null, targetId: null });
                    return;
                }
            }

            if (dragState.targetId) {
                const target = items.find(i => i.id === dragState.targetId);
                if (target) {
                    let newGroupId = target.groupId;
                    if (!newGroupId) {
                        newGroupId = `group-${Date.now()}`;
                        setItems(prev => prev.map(i => i.id === target.id ? { ...i, groupId: newGroupId } : i));
                    }
                    const oldGroupId = item.groupId;
                    setItems(prev => prev.map(i => {
                        if (i.id === item.id || (oldGroupId && i.groupId === oldGroupId)) { return { ...i, groupId: newGroupId }; }
                        return i;
                    }));
                }
            }
        }
    }
    setDragState({ ...dragState, isDragging: false, isConnecting: false, id: null, startConnId: null, targetId: null, type: null });
  };

  const handleBoardDoubleClick = (e) => {
      // Only handle if clicking directly on the board background
      if (e.target === e.currentTarget) {
          const rect = boardRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left + boardRef.current.scrollLeft;
          const y = e.clientY - rect.top + boardRef.current.scrollTop;
          handleAddNote(x - 72, y - 72); 
      }
  };

  // Helper to generate SVG path for lasso
  const getLassoPath = () => {
      if (lassoPoints.length < 2) return "";
      let path = `M ${lassoPoints[0].x} ${lassoPoints[0].y}`;
      for (let i = 1; i < lassoPoints.length; i++) {
          path += ` L ${lassoPoints[i].x} ${lassoPoints[i].y}`;
      }
      return path + " Z"; // Close path
  };

  return (
    <div className="flex flex-col h-screen bg-stone-50 font-sans text-slate-800 overflow-hidden" onMouseDown={() => { if (editingId || editingConnId) { setEditingId(null); setEditingConnId(null); } }}>
      {/* Hidden file input for import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleLoadFromFile} 
        accept=".json" 
        className="hidden" 
      />

      <GooeyFilters />
      
      {/* 2. Top-Center Toolbar (The Pill) - Merged Header */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-1 bg-white/80 backdrop-blur-md shadow-xl border border-white/50 rounded-full px-2 py-1.5 transition-all hover:shadow-2xl no-export">
             {/* Title Input Area */}
             <div className="flex items-center px-2 border-r border-slate-200/60 mr-1">
                 <input
                    type="text"
                    value={boardName}
                    onChange={(e) => setBoardName(e.target.value)}
                    className="text-sm font-bold tracking-tight text-slate-700 bg-transparent border-none focus:ring-0 w-32 text-center placeholder-slate-400"
                    placeholder="未命名分析"
                    title="点击修改名称"
                />
             </div>

             {/* File Group */}
             <div className="flex items-center gap-0.5 border-r border-slate-200/60 pr-1 mr-1">
                 <button onClick={handleSaveToFile} className="flex items-center justify-center w-9 h-9 text-indigo-600 hover:bg-indigo-50/80 rounded-full transition-colors" title="保存数据"><Save size={20}/></button>
                 <button onClick={triggerFileInput} className="flex items-center justify-center w-9 h-9 text-slate-600 hover:bg-slate-100/80 rounded-full transition-colors" title="读取数据"><Upload size={20}/></button>
             </div>
             
             {/* Actions Group */}
             <div className="flex items-center gap-0.5 border-r border-slate-200/60 pr-1 mr-1">
                <button onClick={() => handleAddNote()} className="flex items-center justify-center w-9 h-9 bg-yellow-100/80 hover:bg-yellow-200 text-yellow-800 rounded-full transition-colors shadow-sm" title="添加便签"><Plus size={20} /></button>
                <button onClick={handleAddMemo} className="flex items-center justify-center w-9 h-9 bg-white/50 hover:bg-white text-slate-600 rounded-full transition-colors shadow-sm ring-1 ring-slate-200" title="添加备注"><MemoIcon size={20} /></button>
             </div>

             {/* Export & Clear */}
             <div className="relative flex items-center gap-0.5">
                <button 
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="flex items-center justify-center w-9 h-9 text-slate-600 hover:bg-slate-100/80 rounded-full transition-colors"
                    title="导出"
                >
                    <Download size={20}/>
                </button>
                {showExportMenu && (
                    <div className="absolute top-full right-0 mt-2 bg-white/90 backdrop-blur-md border border-slate-200 rounded-xl shadow-xl flex flex-col p-1 z-[1000] min-w-[50px]">
                        <button onClick={() => handleExport('png')} className="flex items-center justify-center p-2 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors" title="PNG"><ImageIcon size={20}/></button>
                        <button onClick={() => handleExport('pdf')} className="flex items-center justify-center p-2 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors" title="PDF"><FileType size={20}/></button>
                    </div>
                )}
                
                <button onClick={clearBoard} className="flex items-center justify-center w-9 h-9 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-full transition-colors" title="清空画板"><Trash2 size={20} /></button>
             </div>
      </div>

      {/* Main Board Area */}
      <main className="h-full w-full relative overflow-auto bg-stone-100 select-none" ref={boardRef} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDragStart={(e) => e.preventDefault()}>
        {isExporting && (
            <div className="fixed inset-0 bg-black/20 z-[999] flex items-center justify-center backdrop-blur-sm">
                <div className="bg-white/90 p-6 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/50">
                    <RefreshCw className="animate-spin text-indigo-600 w-8 h-8" /> 
                </div>
            </div>
        )}

        <div 
            ref={contentRef}
            id="kj-board-canvas"
            className={`w-[2400px] h-[1600px] relative bg-stone-100 cursor-default`}
            style={{backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)', backgroundSize: '24px 24px'}}
            onDoubleClick={handleBoardDoubleClick}
            onMouseDown={(e) => handleMouseDown(e, null, 'board')} 
        >
             {/* Gooey Layer */}
             <div className="absolute inset-0 pointer-events-none z-0" style={{ filter: 'url(#goo)' }}>
                <svg className="absolute inset-0 w-full h-full overflow-visible">
                    {connections.map(conn => {
                        const from = items.find(i => i.id === conn.fromId); const to = items.find(i => i.id === conn.toId);
                        if (!from || !to) return null; // Safe check to prevent crash
                        const fromColor = from ? (from.gradientText || 'text-slate-400') : 'text-slate-400';
                        const toColor = to ? (to.gradientText || 'text-slate-400') : 'text-slate-400';
                        return <GooeyLine key={`goo-conn-${conn.id}`} id={conn.id} from={getCenter(from)} to={getCenter(to)} fromColor={fromColor} toColor={toColor} offset={conn.controlOffset || {x:0,y:0}} label={conn.label} />;
                    })}
                    {dragState.isConnecting && dragState.startConnId && items.find(i=>i.id === dragState.startConnId) && (
                        <line x1={items.find(i=>i.id === dragState.startConnId).x + 72} y1={items.find(i=>i.id === dragState.startConnId).y + (items.find(i=>i.id === dragState.startConnId).type==='memo'?40:72)} x2={dragState.currMouseX} y2={dragState.currMouseY} stroke="currentColor" strokeWidth="18" strokeLinecap="round" className="stroke-indigo-300 opacity-80" />
                    )}
                </svg>
                {/* FILTER OUT MEMOS: Memos are rendered separately outside gooey layer */}
                {items.filter(item => item.type !== 'memo').map(item => (
                    <BlobBackground key={`blob-${item.id}`} item={item} />
                ))}
             </div>

             {/* Memo Background Layer (Outside Gooey) */}
             {items.filter(item => item.type === 'memo').map(item => (
                <MemoBackground key={`memo-bg-${item.id}`} item={item} />
             ))}
             
             {/* Interaction Layer - RENDER INPUTS IN ABSOLUTE DIVS, NOT SVG */}
             {editingConnId && (() => {
                const conn = connections.find(c => c.id === editingConnId);
                if (!conn) return null;
                const from = items.find(i => i.id === conn.fromId);
                const to = items.find(i => i.id === conn.toId);
                if (!from || !to) return null;
                const curveData = getCurvePoints(from, to, conn.controlOffset || {x:0,y:0});
                
                return (
                    <div 
                        className="absolute z-[1000]"
                        style={{ 
                            left: curveData.labelX, 
                            top: curveData.labelY,
                            transform: 'translate(-50%, -50%)' 
                        }}
                    >
                        <input
                            autoFocus
                            className="w-32 px-2 py-1 text-center text-xs border border-indigo-500 rounded shadow-lg focus:outline-none bg-white select-text pointer-events-auto"
                            value={conn.label || ''}
                            placeholder="输入..."
                            onChange={(e) => handleUpdateConnectionLabel(conn.id, e.target.value)}
                            onBlur={() => setEditingConnId(null)}
                            onKeyDown={(e) => { if (e.key === 'Enter') setEditingConnId(null); }}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>
                );
             })()}

             <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
                {connections.map(conn => {
                    const from = items.find(i => i.id === conn.fromId); const to = items.find(i => i.id === conn.toId); if(!from || !to) return null;
                    // Don't render overlay if editing (input is rendered above)
                    if (editingConnId === conn.id) return null;
                    return <ConnectionOverlay 
                        key={conn.id} 
                        connection={conn} 
                        from={getCenter(from)} 
                        to={getCenter(to)} 
                        offset={conn.controlOffset || {x:0,y:0}}
                        onDelete={() => handleDeleteConnection(conn.id)} 
                        onEdit={() => setEditingConnId(conn.id)} 
                        onUpdate={handleUpdateConnectionLabel} 
                        isEditing={false}
                        setEditingConnId={setEditingConnId} 
                        onMouseDownHandle={handleMouseDown}
                        onDoubleClickEdit={setEditingConnId} // Pass down
                        label={conn.label} 
                    />;
                })}
             </svg>
             
             {/* Lasso Selection Render */}
             {isLassoing && (
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-50">
                    <path 
                        d={getLassoPath()} 
                        stroke="#6366f1" 
                        strokeWidth="2" 
                        fill="rgba(99, 102, 241, 0.1)" 
                        strokeDasharray="4"
                    />
                </svg>
             )}

             {items.map(item => (
               <StickyNote 
                key={item.id} 
                item={item} 
                // Removed 'mode' since we don't switch modes anymore
                onMouseDown={handleMouseDown}
                onUpdateText={handleUpdateText} 
                isSelected={selectedIds.has(item.id) || dragState.id === item.id || dragState.startConnId === item.id} 
                isTargeted={dragState.targetId === item.id} 
                isEditing={editingId === item.id} 
                setEditingId={setEditingId} 
                isUnlinking={unlinkingId === item.id} 
                onDelete={handleDeleteItem}
                onChangeColor={handleColorChange}
                onUnlink={handleUnlinkItem}
                onStartConnection={handleStartConnection} 
               />
             ))}
          </div>
      </main>
      
      <style>{`
        .font-handwriting { font-family: 'Comic Sans MS', 'Chalkboard SE', 'YouYuan', 'Hannotate SC', sans-serif; }
        @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
      `}</style>
    </div>
  );
}