import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, BrainCircuit, MousePointer2, Link as LinkIcon, Unlink, StickyNote as MemoIcon, Check, Image as ImageIcon, FileType, Layout, Save, Upload, Palette, Download, MessageSquare, Undo2, RefreshCw, Scaling, ExternalLink, ChevronsUp, ChevronUp, ChevronDown, ChevronsDown } from 'lucide-react';

// NOTE: External Libraries injected dynamically via CDN
const HTML2CANVAS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const BOARD_IMAGE_MAX_SIZE = 300;
const STORED_IMAGE_MAX_SIZE = 1400;
const IMAGE_COMPRESSION_QUALITY = 0.82;
const SAVE_HANDLE_DB_NAME = 'final-board-save-handles';
const SAVE_HANDLE_STORE_NAME = 'daily-handles';
const CONNECTION_PLANE_ABOVE_IMAGES = 'above-images';
const CONNECTION_PLANE_BELOW_IMAGES = 'below-images';

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

const CONNECTION_COLORS = {
  noun: '#fde047',
  verb: '#86efac',
  adj: '#93c5fd',
  pink: '#f9a8d4',
  purple: '#c4b5fd',
  orange: '#fdba74',
  memo: '#e2e8f0',
  image: '#94a3b8'
};

const getConnectionColor = (item) => CONNECTION_COLORS[item?.type] || '#94a3b8';

const getNoteStyle = (text, type, customWidth, customHeight) => {
  if (type === 'image') {
      const w = customWidth || 200;
      const h = customHeight || 200;
      return { 
          width: `${w}px`, 
          height: `${h}px`, 
          widthVal: w, 
          heightVal: h, 
          fontSize: 'text-sm', 
          isImage: true 
      };
  }

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

const getCenter = (item) => {
    if (!item) return { x: 0, y: 0 }; 
    const style = getNoteStyle(item.text, item.type, item.width, item.height);
    return { x: item.x + style.widthVal / 2, y: item.y + style.heightVal / 2 };
};

const getCurvePoints = (from, to, offset = {x: 0, y: 0}) => {
    if (!from || !to) return { path: '', labelX: 0, labelY: 0 };
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    if (isNaN(midX) || isNaN(midY)) return { path: '', labelX: 0, labelY: 0 };

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (!distance) return { path: `M${from.x},${from.y}`, labelX: from.x, labelY: from.y };

    const unitX = dx / distance;
    const unitY = dy / distance;
    const anchor = {
        x: midX + offset.x,
        y: midY + offset.y
    };
    const endHandle = Math.min(280, Math.max(100, distance * 0.38));
    const midHandle = Math.min(220, Math.max(70, distance * 0.24));
    const c1 = {
        x: from.x + unitX * endHandle,
        y: from.y + unitY * endHandle
    };
    const c2 = {
        x: anchor.x - unitX * midHandle,
        y: anchor.y - unitY * midHandle
    };
    const c3 = {
        x: anchor.x + unitX * midHandle,
        y: anchor.y + unitY * midHandle
    };
    const c4 = {
        x: to.x - unitX * endHandle,
        y: to.y - unitY * endHandle
    };
    const labelX = anchor.x;
    const labelY = anchor.y;

    return { path: `M${from.x},${from.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${anchor.x},${anchor.y} C${c3.x},${c3.y} ${c4.x},${c4.y} ${to.x},${to.y}`, labelX, labelY };
};

const getLabelDimensions = (label) => {
    const len = label ? label.length : 0;
    const width = Math.max(36, len * 12 + 16); 
    const height = 36; 
    return { width, height, rx: height / 2 };
};

const getConnectionLayer = (connection, sourceIndex) => connection.connectionLayer ?? sourceIndex;
const getConnectionPlane = (connection) => (
    connection.connectionPlane === CONNECTION_PLANE_BELOW_IMAGES
        ? CONNECTION_PLANE_BELOW_IMAGES
        : CONNECTION_PLANE_ABOVE_IMAGES
);

const getLayeredConnections = (connections, plane) => connections
    .map((connection, sourceIndex) => ({
        connection,
        sourceIndex,
        layer: getConnectionLayer(connection, sourceIndex)
    }))
    .filter(({ connection }) => !plane || getConnectionPlane(connection) === plane)
    .sort((a, b) => a.layer === b.layer ? a.sourceIndex - b.sourceIndex : a.layer - b.layer);

const createLayeredConnection = (connections, connection) => {
    const nextLayer = connections.reduce((max, current, index) => (
        Math.max(max, getConnectionLayer(current, index))
    ), -1) + 1;

    return { ...connection, connectionLayer: nextLayer, connectionPlane: CONNECTION_PLANE_ABOVE_IMAGES };
};

const getConnectionVisualPoints = (fromItem, toItem) => {
    return {
        from: getCenter(fromItem),
        to: getCenter(toItem)
    };
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

const getScaledSize = (width, height, maxSize) => {
    let w = width;
    let h = height;

    if (w > h) {
        if (w > maxSize) {
            h = Math.round(h * (maxSize / w));
            w = maxSize;
        }
    } else if (h > maxSize) {
        w = Math.round(w * (maxSize / h));
        h = maxSize;
    }

    return { width: Math.max(1, w), height: Math.max(1, h) };
};

const getDataUrlByteSize = (dataUrl) => {
    const payload = dataUrl.split(',')[1] || '';
    return Math.round((payload.length * 3) / 4);
};

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
});

const loadImageElement = (source) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = source;
});

const canvasToCompressedDataUrl = (canvas) => new Promise((resolve) => {
    if (!canvas.toBlob) {
        resolve(canvas.toDataURL('image/webp', IMAGE_COMPRESSION_QUALITY));
        return;
    }

    canvas.toBlob(async (blob) => {
        if (!blob) {
            resolve(canvas.toDataURL('image/webp', IMAGE_COMPRESSION_QUALITY));
            return;
        }
        resolve(await blobToDataUrl(blob));
    }, 'image/webp', IMAGE_COMPRESSION_QUALITY);
});

const compressImageSource = async (source, originalBytes = Infinity) => {
    const img = await loadImageElement(source);
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    const storedSize = getScaledSize(naturalWidth, naturalHeight, STORED_IMAGE_MAX_SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = storedSize.width;
    canvas.height = storedSize.height;

    const context = canvas.getContext('2d', { alpha: true });
    context.drawImage(img, 0, 0, storedSize.width, storedSize.height);

    const compressedDataUrl = await canvasToCompressedDataUrl(canvas);
    const compressedBytes = getDataUrlByteSize(compressedDataUrl);

    const canKeepSource = source.startsWith('data:image/');

    return {
        dataUrl: canKeepSource && compressedBytes >= originalBytes ? source : compressedDataUrl,
        naturalWidth,
        naturalHeight,
        storedWidth: storedSize.width,
        storedHeight: storedSize.height,
        compressedBytes: Math.min(compressedBytes, originalBytes)
    };
};

const compressImageFile = async (file) => {
    const objectUrl = URL.createObjectURL(file);
    try {
        return await compressImageSource(objectUrl, file.size);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
};

const compressImageDataUrl = async (dataUrl) => {
    const originalBytes = getDataUrlByteSize(dataUrl);
    return compressImageSource(dataUrl, originalBytes);
};

const normalizeLoadedItems = async (loadedItems) => {
    let fallbackImageLayer = 0;

    return Promise.all(loadedItems.map(async (item) => {
        if (item.type !== 'image') return item;

        const normalized = {
            ...item,
            imageLayer: Number.isFinite(item.imageLayer) ? item.imageLayer : fallbackImageLayer++
        };

        if (!normalized.imageUrl?.startsWith('data:image/')) return normalized;

        try {
            const compressed = await compressImageDataUrl(normalized.imageUrl);
            const displaySize = getScaledSize(
                compressed.naturalWidth || normalized.width || BOARD_IMAGE_MAX_SIZE,
                compressed.naturalHeight || normalized.height || BOARD_IMAGE_MAX_SIZE,
                BOARD_IMAGE_MAX_SIZE
            );

            return {
                ...normalized,
                imageUrl: compressed.dataUrl,
                width: normalized.width || displaySize.width,
                height: normalized.height || displaySize.height,
                originalWidth: compressed.naturalWidth,
                originalHeight: compressed.naturalHeight,
                storedWidth: compressed.storedWidth,
                storedHeight: compressed.storedHeight,
                compressedBytes: compressed.compressedBytes
            };
        } catch {
            return normalized;
        }
    }));
};

const cloneItemsForHistory = (items) => items.map(item => ({ ...item }));

const cloneConnectionsForHistory = (connections) => connections.map(connection => ({
    ...connection,
    controlOffset: connection.controlOffset ? { ...connection.controlOffset } : connection.controlOffset
}));

const cloneBoardState = (items, connections) => ({
    items: cloneItemsForHistory(items),
    connections: cloneConnectionsForHistory(connections)
});

const areItemsEqual = (current, previous) => {
    if (current.length !== previous.length) return false;

    return current.every((item, index) => {
        const other = previous[index];
        if (!other) return false;

        const keys = new Set([...Object.keys(item), ...Object.keys(other)]);
        for (const key of keys) {
            if (key === 'imageUrl') continue;
            if (item[key] !== other[key]) return false;
        }
        return true;
    });
};

const areConnectionsEqual = (current, previous) => {
    if (current.length !== previous.length) return false;

    return current.every((connection, index) => {
        const other = previous[index];
        if (!other) return false;

        const currentOffset = connection.controlOffset || {};
        const otherOffset = other.controlOffset || {};
        return connection.id === other.id
            && connection.fromId === other.fromId
            && connection.toId === other.toId
            && connection.label === other.label
            && connection.connectionLayer === other.connectionLayer
            && getConnectionPlane(connection) === getConnectionPlane(other)
            && currentOffset.x === otherOffset.x
            && currentOffset.y === otherOffset.y;
    });
};

const areBoardStatesEqual = (items, connections, previousState) => (
    previousState
    && areItemsEqual(items, previousState.items || [])
    && areConnectionsEqual(connections, previousState.connections || [])
);

const createBoardId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `board-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getLocalDateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const sanitizeFileName = (name) => {
    const reservedChars = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
    const cleaned = (name || 'Untitled Analysis')
        .split('')
        .map(char => reservedChars.has(char) || char.charCodeAt(0) < 32 ? '_' : char)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    return (cleaned || 'Untitled Analysis').slice(0, 80);
};

const getSaveHandleKey = (boardId, dateKey) => `${boardId}:${dateKey}`;

const openSaveHandleDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(SAVE_HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
        request.result.createObjectStore(SAVE_HANDLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const getStoredSaveHandle = async (key) => {
    const db = await openSaveHandleDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SAVE_HANDLE_STORE_NAME, 'readonly');
        const request = transaction.objectStore(SAVE_HANDLE_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
    });
};

const storeSaveHandle = async (key, handle) => {
    const db = await openSaveHandleDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SAVE_HANDLE_STORE_NAME, 'readwrite');
        transaction.objectStore(SAVE_HANDLE_STORE_NAME).put(handle, key);
        transaction.oncomplete = () => {
            db.close();
            resolve();
        };
        transaction.onerror = () => {
            db.close();
            reject(transaction.error);
        };
    });
};

const deleteStoredSaveHandle = async (key) => {
    const db = await openSaveHandleDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SAVE_HANDLE_STORE_NAME, 'readwrite');
        transaction.objectStore(SAVE_HANDLE_STORE_NAME).delete(key);
        transaction.oncomplete = () => {
            db.close();
            resolve();
        };
        transaction.onerror = () => {
            db.close();
            reject(transaction.error);
        };
    });
};

const verifyWritablePermission = async (handle) => {
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    return (await handle.requestPermission(options)) === 'granted';
};

const writeTextToFileHandle = async (handle, text) => {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
};

const downloadJsonFile = (text, fileName) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// --- Sub Components ---

const ColorPicker = ({ onChange, currentType }) => (
  <div className="flex gap-1 mt-2 justify-center" onMouseDown={e => e.stopPropagation()}>
    {Object.entries(POS_TYPES).filter(([k]) => k !== 'MEMO').map(([key, config]) => (
      <button key={key} title={config.label} onClick={() => onChange(config)} className={`w-4 h-4 rounded-full border border-black/10 transition-transform hover:scale-110 ${config.color} ${currentType === config.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`} />
    ))}
  </div>
);

const GooeyFilters = () => (
  <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
    <defs>
      <filter id="goo" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blur" />
        <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -7" result="goo" />
      </filter>
    </defs>
  </svg>
);

const BlobBackground = ({ item }) => {
    const style = getNoteStyle(item.text, item.type);
    if (item.type === 'memo' || item.type === 'image') return null; 
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
                // Level 5: Matches Gooey Layer, sits above Images (0)
                zIndex: 5 
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
                    <stop offset="0%" stopColor={fromColor} stopOpacity="1" />
                    <stop offset="46%" stopColor={fromColor} stopOpacity="1" />
                    <stop offset="54%" stopColor={toColor} stopOpacity="1" />
                    <stop offset="100%" stopColor={toColor} stopOpacity="1" />
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

const StickyNote = ({ item, onMouseDown, onDelete, onChangeColor, onUpdateText, onUnlink, onStartConnection, isSelected, isTargeted, isEditing, setEditingId, isUnlinking }) => {
  if (!item) return null;
  const isMemo = item.type === 'memo';
  const isImage = item.type === 'image';
  const isGrouped = !!item.groupId;
  const styleInfo = getNoteStyle(item.text, item.type, item.width, item.height);
  const { fontSize } = styleInfo;
  
  const shapeClass = isImage ? 'rounded-lg' : 'rounded-full';
  
  const borderClass = isMemo ? `border ${item.borderColor}` : (isImage ? 'border-none' : '');
  const bgClass = isImage ? '' : ''; 

  // --- Z-INDEX STRATEGY ---
  // Images are rendered in their own lower container; imageLayer only sorts images.
  // 30: Text Content (Top, above Blobs at 5)
  // 300: Interaction (Dragging/Editing)
  let zIndex = 30; 
  if (isImage) zIndex = item.imageLayer || 0;
  
  if (isTargeted) zIndex = 150;
  if (isSelected || isEditing) zIndex = 500;

  const handleLinkClick = (e) => {
      e.stopPropagation();
      if (item.url && !isEditing) {
          let url = item.url;
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
              url = 'https://' + url;
          }
          window.open(url, '_blank');
      }
  };

  return (
    <div
        onMouseDown={(e) => { 
            if (isEditing) { e.stopPropagation(); } else { onMouseDown(e, item.id, 'note'); } 
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
            zIndex: zIndex, 
            transform: isTargeted ? 'scale(1.05)' : 'scale(1)', 
            animation: isUnlinking ? 'shake 0.3s cubic-bezier(.36,.07,.19,.97) both' : 'none' 
        }}
        className={`absolute flex flex-col items-center justify-center text-center transition-all duration-300 ease-out group 
        ${shapeClass} ${borderClass} ${bgClass}
        ${isImage && 'pointer-events-auto'}
        ${!isImage && 'p-4'} 
        ${isEditing ? 'select-text cursor-auto' : 'select-none'}
        ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : 
          (isTargeted ? 'ring-4 ring-blue-300 ring-offset-2' : 
            (isGrouped ? 'border-2 border-dashed border-blue-400/50' : ''))}`}
    >
        {/* EDIT MODE: Color Picker (Top) - Only for standard notes */}
        {isEditing && !isMemo && !isImage && (
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
                title="Drag to Connect"
            >
                <LinkIcon size={16} />
            </div>
        )}
        
        {/* URL Link Button (Only for Memos with URL in View Mode) */}
        {isMemo && item.url && !isEditing && (
            <div 
                className="absolute -right-2 -top-2 bg-blue-500 text-white p-1.5 rounded-full shadow-lg cursor-pointer z-50 animate-in fade-in pointer-events-auto hover:bg-blue-600 hover:scale-110 transition-transform"
                onMouseDown={handleLinkClick}
                title={`Go to: ${item.url}`}
            >
                <ExternalLink size={12} />
            </div>
        )}
        
        {isTargeted && (
             <div className="absolute -right-2 -bottom-2 bg-blue-600 text-white rounded-full p-1 shadow animate-bounce z-50">
                <Check size={12} />
             </div>
        )}
        
        {/* CONTENT AREA */}
        <div className="flex-1 flex flex-col justify-center items-center w-full h-full relative z-10 overflow-hidden">
            {isImage ? (
                <img 
                    src={item.imageUrl} 
                    alt="Uploaded" 
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                    className="w-full h-full object-cover rounded-lg shadow-sm pointer-events-none" 
                />
            ) : (
                isEditing ? (
                    <textarea 
                        autoFocus 
                        className={`w-full h-full bg-transparent resize-none border-none focus:ring-0 text-center ${fontSize} ${isMemo ? 'text-slate-700 font-medium' : 'text-gray-900 font-bold'} p-0 select-text leading-tight`} 
                        value={item.text} 
                        placeholder={styleInfo.isMemo ? "Type memo..." : "Type here..."} 
                        onChange={(e) => onUpdateText(item.id, e.target.value, item.url)} 
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
                )
            )}
        </div>

        {/* --- FLOATING URL INPUT (Plan B: Outside the main content flow) --- */}
        {isEditing && isMemo && (
             <div 
                className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 z-[500] w-48 animate-in fade-in slide-in-from-top-1 pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()} 
             >
                <input 
                    className="w-full bg-white/90 backdrop-blur shadow-xl border border-blue-200 rounded-lg px-2 py-1.5 text-xs text-center outline-none focus:ring-2 focus:ring-blue-400 placeholder-slate-400 text-slate-600"
                    value={item.url || ''}
                    placeholder="Paste URL..."
                    onChange={(e) => onUpdateText(item.id, item.text, e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') setEditingId(null); }}
                />
             </div>
        )}
        
        {/* EDIT MODE: Action Buttons (Bottom - Pushed down further for memos) */}
        {isEditing && (
            <div 
                className={`absolute left-1/2 transform -translate-x-1/2 flex gap-2 bg-white px-3 py-1.5 rounded-full shadow-lg border border-slate-200 z-50 animate-in fade-in slide-in-from-top-2 pointer-events-auto ${isMemo ? '-bottom-20' : '-bottom-10'}`}
                onMouseDown={(e) => e.stopPropagation()} 
            >
                {item.groupId && ( 
                    <button 
                        onClick={() => { onUnlink(item.id); setEditingId(null); }} 
                        className="text-slate-500 hover:text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors flex items-center gap-1" 
                    >
                        <Unlink size={16} />
                    </button>
                )}
                <button 
                    onClick={() => { onDelete(item.id); setEditingId(null); }} 
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors flex items-center gap-1" 
                    title="Delete"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        )}
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
        style={{ zIndex: 20 }} // Interaction Layer
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

const ImageControlsOverlay = ({ item, onResizeStart, onImageLayerChange }) => {
  if (!item) return null;
  const styleInfo = getNoteStyle(item.text, item.type, item.width, item.height);

  return (
    <div
      className="absolute pointer-events-none z-[1200]"
      style={{
        left: item.x,
        top: item.y,
        width: styleInfo.width,
        height: styleInfo.height
      }}
    >
      <div
        className="absolute -left-3 -top-3 flex overflow-hidden rounded-full border border-slate-200 bg-white shadow-xl pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button onClick={() => onImageLayerChange(item.id, 'back')} className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Send backward">
          <ChevronDown size={14} />
        </button>
        <button onClick={() => onImageLayerChange(item.id, 'front')} className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Bring forward">
          <ChevronUp size={14} />
        </button>
        <button onClick={() => onImageLayerChange(item.id, 'bottom')} className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Send to back">
          <ChevronsDown size={14} />
        </button>
        <button onClick={() => onImageLayerChange(item.id, 'top')} className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Bring to front">
          <ChevronsUp size={14} />
        </button>
      </div>

      <div
        className="absolute -right-3 -bottom-3 bg-blue-500 text-white p-1.5 rounded-full shadow-xl cursor-se-resize pointer-events-auto hover:scale-110 transition-transform"
        onMouseDown={(e) => onResizeStart(e, item.id)}
        title="Resize"
      >
        <Scaling size={14} />
      </div>
    </div>
  );
};

export default function KJAnalysisBoard() {
  const [items, setItems] = useState([]);
  const [connections, setConnections] = useState([]);
  const [boardName, setBoardName] = useState('Untitled Analysis');
  const [boardId, setBoardId] = useState(() => createBoardId());
  const boardRef = useRef(null); 
  const contentRef = useRef(null); 
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const saveHandlerRef = useRef(null);
  const saveFeedbackTimerRef = useRef(null);
  
  const [editingId, setEditingId] = useState(null);
  const [editingConnId, setEditingConnId] = useState(null);
  const [unlinkingId, setUnlinkingId] = useState(null); 
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  
  const hoverTimeoutRef = useRef(null); 
  const hoverCandidateIdRef = useRef(null); 
  const longPressTimerRef = useRef(null); 

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lassoPoints, setLassoPoints] = useState([]); 
  const [isLassoing, setIsLassoing] = useState(false);
  const [isImageDragOver, setIsImageDragOver] = useState(false);
  
  const [dragState, setDragState] = useState({ 
    id: null, type: null, startX: 0, startY: 0, 
    initItemX: 0, initItemY: 0,
    initOffset: {x:0, y:0},
    targetId: null, 
    isConnecting: false, startConnId: null, currMouseX: 0, currMouseY: 0,
    initialPositions: {} 
  });
  
  // History
  const [history, setHistory] = useState([]);
  const snapshotRef = useRef(null);

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
    setItems(prev => prev.length === 0
        ? [{ id: `manual-${Date.now()}`, text: "", count: 0, type: 'noun', color: POS_TYPES.NOUN.color, borderColor: POS_TYPES.NOUN.borderColor, strokeColor: POS_TYPES.NOUN.strokeColor, gradientText: POS_TYPES.NOUN.gradientText, x: 500, y: 300, groupId: null }]
        : prev
    );
  }, []);

  useEffect(() => () => {
      clearTimeout(saveFeedbackTimerRef.current);
  }, []);

  // --- History Logic ---
  const saveToHistory = useCallback((currentItems, currentConnections) => {
      setHistory(prev => {
          const newHistory = [...prev, cloneBoardState(currentItems, currentConnections)];
          if (newHistory.length > 30) return newHistory.slice(1);
          return newHistory;
      });
  }, []);

  const handleUndo = useCallback(() => {
      if (history.length === 0) return;
      const lastState = history[history.length - 1];
      if (!lastState || !lastState.items) return; 
      setHistory(prev => prev.slice(0, -1));
      setItems(lastState.items);
      setConnections(lastState.connections || []);
  }, [history]);

  const showSaveFeedback = useCallback((message = 'Saved') => {
      setSaveFeedback(message);
      clearTimeout(saveFeedbackTimerRef.current);
      saveFeedbackTimerRef.current = setTimeout(() => setSaveFeedback(null), 1800);
  }, []);

  // FIX: Get center relative to content board using contentRef
  // IMPORTANT: Reverting to boardRef scroll logic because contentRef logic was for bordered
  const getViewportCenter = useCallback(() => {
    if (boardRef.current) {
        const container = boardRef.current;
        const x = container.scrollLeft + container.clientWidth / 2;
        const y = container.scrollTop + container.clientHeight / 2;
        return {
            x: x + (Math.random() - 0.5) * 40,
            y: y + (Math.random() - 0.5) * 40
        };
    }
    return { x: 500, y: 300 };
  }, []);

  // --- Image Helpers ---
  const getBoardPointFromEvent = useCallback((e) => {
    if (!contentRef.current) return null;
    const rect = contentRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const getImageFilesFromDataTransfer = (dataTransfer) => {
    if (!dataTransfer) return [];

    const itemFiles = Array.from(dataTransfer.items || [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter(Boolean);

    if (itemFiles.length > 0) return itemFiles;

    return Array.from(dataTransfer.files || []).filter(file => file.type.startsWith('image/'));
  };

  const hasFileDrag = (dataTransfer) => Array.from(dataTransfer?.types || []).includes('Files');

  const processAndAddImage = useCallback(async (file, position, options = {}) => {
    try {
        if (!options.skipHistory) saveToHistory(items, connections);

        const compressed = await compressImageFile(file);
        const displaySize = getScaledSize(compressed.naturalWidth, compressed.naturalHeight, BOARD_IMAGE_MAX_SIZE);
        const pos = position || getViewportCenter();

        setItems(prev => {
            const nextLayer = prev.reduce((max, current, index) => {
                if (current.type !== 'image') return max;
                return Math.max(max, current.imageLayer ?? index);
            }, -1) + 1;

            return [...prev, {
                id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                type: 'image',
                imageUrl: compressed.dataUrl,
                width: displaySize.width,
                height: displaySize.height,
                x: pos.x - displaySize.width / 2,
                y: pos.y - displaySize.height / 2,
                groupId: null,
                imageLayer: nextLayer,
                originalWidth: compressed.naturalWidth,
                originalHeight: compressed.naturalHeight,
                storedWidth: compressed.storedWidth,
                storedHeight: compressed.storedHeight,
                compressedBytes: compressed.compressedBytes
            }];
        });
    } catch (err) {
        console.error("Image import failed:", err);
        alert("Failed to import image");
    }
  }, [connections, getViewportCenter, items, saveToHistory]);

  // --- Keyboard Shortcuts & Paste ---
  useEffect(() => {
    const handleKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveHandlerRef.current?.();
            return;
        }

        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            handleUndo();
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedIds.size > 0) {
                saveToHistory(items, connections);
                setItems(prev => prev.filter(item => !selectedIds.has(item.id)));
                setConnections(prev => prev.filter(c => !selectedIds.has(c.fromId) && !selectedIds.has(c.toId)));
                setSelectedIds(new Set());
            }
        }

        if (e.key.toLowerCase() === 'l') {
            if (selectedIds.size === 2) {
                const ids = Array.from(selectedIds);
                const fromId = ids[0];
                const toId = ids[1];

                saveToHistory(items, connections);
                const existingCount = connections.filter(c => (c.fromId === fromId && c.toId === toId) || (c.fromId === toId && c.toId === fromId)).length;
                const shift = existingCount === 0 ? 0 : (existingCount % 2 === 0 ? -1 : 1) * Math.ceil(existingCount/2) * 50;
                setConnections(prev => [...prev, createLayeredConnection(prev, { id: `conn-${Date.now()}`, fromId: fromId, toId: toId, label: "", controlOffset: {x: shift, y: shift} })]);
            } else if (selectedIds.size === 1) {
                const fromId = Array.from(selectedIds)[0];
                const item = items.find(i => i.id === fromId);
                if (item && contentRef.current) {
                    const rect = contentRef.current.getBoundingClientRect();
                    const mouseX = mousePosRef.current.x - rect.left;
                    const mouseY = mousePosRef.current.y - rect.top;

                    setDragState({
                        id: null, type: null, isConnecting: true, startConnId: fromId,
                        startX: mousePosRef.current.x, startY: mousePosRef.current.y,
                        currMouseX: mouseX, currMouseY: mouseY,
                        initItemX: 0, initItemY: 0
                    });
                }
            }
        }
    };

    const handlePaste = (e) => {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        const clipboardItems = (e.clipboardData || e.originalEvent.clipboardData).items;
        let blob = null;

        for (let i = 0; i < clipboardItems.length; i++) {
          if (clipboardItems[i].type.indexOf("image") === 0) {
            blob = clipboardItems[i].getAsFile();
            break;
          }
        }

        if (blob) {
          e.preventDefault();
          processAndAddImage(blob);
        }
      };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('paste', handlePaste);
    };
  }, [connections, handleUndo, items, processAndAddImage, saveToHistory, selectedIds]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    processAndAddImage(file);
    e.target.value = '';
  };

  const handleBoardDragOver = (e) => {
    const imageFiles = getImageFilesFromDataTransfer(e.dataTransfer);
    if (imageFiles.length === 0 && !hasFileDrag(e.dataTransfer)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsImageDragOver(true);
  };

  const handleBoardDragLeave = (e) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    setIsImageDragOver(false);
  };

  const handleBoardDrop = (e) => {
    const imageFiles = getImageFilesFromDataTransfer(e.dataTransfer);
    if (imageFiles.length === 0) return;

    e.preventDefault();
    e.stopPropagation();
    setIsImageDragOver(false);

    const dropPoint = getBoardPointFromEvent(e) || getViewportCenter();
    saveToHistory(items, connections);

    imageFiles.forEach((file, index) => {
        processAndAddImage(file, {
            x: dropPoint.x + index * 24,
            y: dropPoint.y + index * 24
        }, { skipHistory: true });
    });
  };

  const handleSaveToFile = useCallback(async () => {
    const dateStr = getLocalDateKey();
    const fileName = `${sanitizeFileName(boardName)}_${dateStr}.json`;
    const data = { boardId, boardName, items, connections, date: Date.now(), savedDate: dateStr };
    const serialized = JSON.stringify(data, null, 2);

    if (window.showSaveFilePicker && window.indexedDB) {
        const handleKey = getSaveHandleKey(boardId, dateStr);

        try {
            let handle = await getStoredSaveHandle(handleKey);

            if (handle && !(await verifyWritablePermission(handle))) {
                await deleteStoredSaveHandle(handleKey);
                handle = null;
            }

            if (!handle) {
                handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'Final Board JSON',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
            }

            await writeTextToFileHandle(handle, serialized);
            try {
                await storeSaveHandle(handleKey, handle);
            } catch (storeErr) {
                console.warn("Could not remember save location:", storeErr);
            }
            showSaveFeedback();
            return;
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error("Direct save failed, falling back to download:", err);
        }
    }

    downloadJsonFile(serialized, fileName);
    showSaveFeedback();
  }, [boardId, boardName, connections, items, showSaveFeedback]);

  saveHandlerRef.current = handleSaveToFile;

  const handleLoadFromFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.items && Array.isArray(parsed.items)) {
           saveToHistory(items, connections); 
           const normalizedItems = await normalizeLoadedItems(parsed.items);
           setItems(normalizedItems);
           setConnections(parsed.connections || []);
           setBoardId(parsed.boardId || createBoardId());
           if (parsed.boardName) setBoardName(parsed.boardName); 
        } else {
           alert("Invalid file format");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to read file");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const triggerImageInput = () => {
      imageInputRef.current?.click();
  }

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
          
          const filename = `${boardName}_Export`; 

          if (format === 'png') {
              const link = document.createElement('a'); link.download = `${filename}.png`; link.href = canvas.toDataURL('image/png'); link.click();
          } else if (format === 'pdf' && window.jspdf) {
              const { jsPDF } = window.jspdf;
              const imgData = canvas.toDataURL('image/png');
              const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'l' : 'p', unit: 'px', format: [canvas.width, canvas.height] });
              pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
              pdf.save(`${filename}.pdf`);
          }
      } catch (err) { console.error("Export failed:", err); alert("Export failed, please try again"); } finally { setIsExporting(false); }
  };

  const clearBoard = () => { if(confirm('Are you sure you want to clear the board?')) { saveToHistory(items, connections); setItems([]); setConnections([]); setBoardName('Untitled Analysis'); setBoardId(createBoardId()); } };
  const handleDeleteItem = (id) => { saveToHistory(items, connections); setItems(items.filter(i => i.id !== id)); setConnections(conn => conn.filter(c => c.fromId !== id && c.toId !== id)); };
  const handleUnlinkItem = (id) => { saveToHistory(items, connections); setUnlinkingId(id); setTimeout(() => { setItems(prev => prev.map(i => i.id === id ? { ...i, groupId: null } : i)); setUnlinkingId(null); }, 300); };
  const handleDeleteConnection = (id) => { saveToHistory(items, connections); setConnections(prev => prev.filter(c => c.id !== id)); };
  
  const handleUpdateConnectionLabel = (id, text) => { setConnections(prev => prev.map(c => c.id === id ? { ...c, label: text } : c)); };
  const handleColorChange = (id, config) => { saveToHistory(items, connections); setItems(items.map(i => i.id === id ? { ...i, color: config.color, borderColor: config.borderColor, strokeColor: config.strokeColor, gradientText: config.gradientText, type: config.id } : i)); };
  const handleUpdateText = (id, newText, newUrl) => { 
      setItems(items.map(i => i.id === id ? { ...i, text: newText, url: newUrl !== undefined ? newUrl : i.url } : i)); 
  };

  const handleImageLayerChange = (id, action) => {
      saveToHistory(items, connections);

      setItems(prev => {
          const imageOrder = prev
              .map((item, sourceIndex) => ({ item, sourceIndex }))
              .filter(({ item }) => item.type === 'image')
              .sort((a, b) => {
                  const aLayer = a.item.imageLayer ?? a.sourceIndex;
                  const bLayer = b.item.imageLayer ?? b.sourceIndex;
                  return aLayer === bLayer ? a.sourceIndex - b.sourceIndex : aLayer - bLayer;
              });

          const currentIndex = imageOrder.findIndex(({ item }) => item.id === id);
          if (currentIndex === -1) return prev;

          const nextOrder = [...imageOrder];
          const [target] = nextOrder.splice(currentIndex, 1);
          let nextIndex = currentIndex;

          if (action === 'top') nextIndex = nextOrder.length;
          if (action === 'bottom') nextIndex = 0;
          if (action === 'front') nextIndex = Math.min(currentIndex + 1, nextOrder.length);
          if (action === 'back') nextIndex = Math.max(currentIndex - 1, 0);

          nextOrder.splice(nextIndex, 0, target);
          const layerById = new Map(nextOrder.map(({ item }, index) => [item.id, index]));

          return prev.map(item => item.type === 'image'
              ? { ...item, imageLayer: layerById.get(item.id) ?? item.imageLayer ?? 0 }
              : item
          );
      });
  };

  const handleConnectionLayerChange = (id, action) => {
      saveToHistory(items, connections);

      setConnections(prev => {
          const targetConnection = prev.find(connection => connection.id === id);
          if (!targetConnection) return prev;

          const targetPlane = action === 'bottom'
              ? CONNECTION_PLANE_BELOW_IMAGES
              : action === 'top'
                ? CONNECTION_PLANE_ABOVE_IMAGES
                : getConnectionPlane(targetConnection);

          const planeAdjusted = prev.map(connection => connection.id === id
              ? { ...connection, connectionPlane: targetPlane }
              : connection
          );

          const orderedConnections = getLayeredConnections(planeAdjusted, targetPlane);
          const currentIndex = orderedConnections.findIndex(({ connection }) => connection.id === id);
          if (currentIndex === -1) return planeAdjusted;

          const nextOrder = [...orderedConnections];
          const [target] = nextOrder.splice(currentIndex, 1);
          let nextIndex = currentIndex;

          if (action === 'top') nextIndex = nextOrder.length;
          if (action === 'bottom') nextIndex = 0;
          if (action === 'front') nextIndex = Math.min(currentIndex + 1, nextOrder.length);
          if (action === 'back') nextIndex = Math.max(currentIndex - 1, 0);

          nextOrder.splice(nextIndex, 0, target);
          const layerById = new Map(nextOrder.map(({ connection }, index) => [connection.id, index]));

          return planeAdjusted.map(connection => getConnectionPlane(connection) === targetPlane
              ? {
                  ...connection,
                  connectionLayer: layerById.get(connection.id) ?? connection.connectionLayer ?? 0
              }
              : connection
          );
      });
  };
  
  const handleAddNote = (x, y) => {
    saveToHistory(items, connections);
    let pos = { x, y };
    if (x === undefined || y === undefined) {
        pos = getViewportCenter();
    } else {
        // Offset for cursor position click (approximate center offset)
        pos.x -= 72; 
        pos.y -= 72;
    }
    const newNote = { id: `manual-${Date.now()}`, text: "", count: 0, type: 'noun', color: POS_TYPES.NOUN.color, borderColor: POS_TYPES.NOUN.borderColor, strokeColor: POS_TYPES.NOUN.strokeColor, gradientText: POS_TYPES.NOUN.gradientText, x: pos.x, y: pos.y, groupId: null };
    setItems(prev => [...prev, newNote]);
  };

  const handleAddMemo = () => {
    saveToHistory(items, connections);
    const pos = getViewportCenter();
    const newMemo = { id: `memo-${Date.now()}`, text: "", count: 0, type: 'memo', color: POS_TYPES.MEMO.color, borderColor: POS_TYPES.MEMO.borderColor, strokeColor: POS_TYPES.MEMO.strokeColor, gradientText: POS_TYPES.MEMO.gradientText, x: pos.x, y: pos.y, groupId: null };
    setItems(prev => [...prev, newMemo]);
  };

  const handleStartConnection = (e, noteId) => {
      e.stopPropagation();
      e.preventDefault();
      const item = items.find(i => i.id === noteId);
      if (!item) return;
      
      let startX, startY;
      if (item.type === 'image') {
          startX = item.x + item.width / 2;
          startY = item.y + item.height / 2;
      } else {
          const style = getNoteStyle(item.text, item.type);
          startX = item.x + style.widthVal / 2;
          startY = item.y + style.heightVal / 2;
      }

      setDragState({
          id: null, type: null, isConnecting: true, startConnId: noteId,
          startX: e.clientX, startY: e.clientY,
          currMouseX: startX, currMouseY: startY,
          initItemX: 0, initItemY: 0
      });
  };

  const handleResizeStart = (e, id) => {
      e.stopPropagation();
      e.preventDefault();
      const item = items.find(i => i.id === id);
      if (!item) return;

      snapshotRef.current = cloneBoardState(items, connections);

      setDragState({
          id: id,
          type: 'resize',
          startX: e.clientX,
          startY: e.clientY,
          initItemX: item.width, 
          initItemY: item.height, 
          isConnecting: false, startConnId: null, currMouseX: 0, currMouseY: 0,
          initialPositions: {},
          isDragging: true
      });
  };

  const handleEditStart = (id, type) => {
      snapshotRef.current = cloneBoardState(items, connections);
      if (type === 'conn') setEditingConnId(id);
      else setEditingId(id);
  };

  const handleEditEnd = () => {
      const oldState = snapshotRef.current;
      if (oldState) {
          if (!areBoardStatesEqual(items, connections, oldState)) {
              saveToHistory(oldState.items, oldState.connections);
          }
      }
      setEditingId(null);
      setEditingConnId(null);
      snapshotRef.current = null;
  };

  const handleMouseDown = (e, id, type) => {
    e.stopPropagation();
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;
    
    if (editingId || editingConnId) { 
        handleEditEnd();
        return; 
    }
    
    // FIX: Click to Connect Logic (Hit Testing based on board coords)
    if (dragState.isConnecting) {
        if (type === 'note' && id !== dragState.startConnId) {
             const target = items.find(i => i.id === id);
             if (target) {
                saveToHistory(items, connections); 
                const existingCount = connections.filter(c => (c.fromId === dragState.startConnId && c.toId === target.id) || (c.fromId === target.id && c.toId === dragState.startConnId)).length;
                const shift = existingCount === 0 ? 0 : (existingCount % 2 === 0 ? -1 : 1) * Math.ceil(existingCount/2) * 50;
                setConnections(prev => [...prev, createLayeredConnection(prev, { id: `conn-${Date.now()}`, fromId: dragState.startConnId, toId: target.id, label: "", controlOffset: {x: shift, y: shift} })]);
                setDragState({ ...dragState, isConnecting: false, startConnId: null });
                return;
             }
        }
        // Click on board cancels connection
        setDragState({ ...dragState, isConnecting: false, startConnId: null });
        return;
    }

    if (type === 'board') {
        const rect = contentRef.current.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;
        setSelectedIds(new Set());
        setIsLassoing(true);
        setLassoPoints([{x: startX, y: startY}]);
        return;
    }
    
    if (type === 'connectionHandle') {
        e.preventDefault();
        snapshotRef.current = cloneBoardState(items, connections);

        const conn = connections.find(c => c.id === id);
        const initOffset = conn?.controlOffset || {x: 0, y: 0};
        setDragState({
            id, type: 'connectionHandle',
            startX: e.clientX, startY: e.clientY,
            initOffset, 
            initItemX: 0, initItemY: 0, targetId: null, isConnecting: false, startConnId: null, currMouseX: 0, currMouseY: 0,
            initialPositions: {},
            isDragging: true, hasMoved: false
        });
        return;
    }

    e.preventDefault(); 
    const item = items.find(i => i.id === id);
    if(!item) return;

    snapshotRef.current = cloneBoardState(items, connections);

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
      initialPositions,
      hasMoved: false
    });
  };

  const handleMouseMove = (e) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };

    if (isLassoing) {
        if (!contentRef.current) return;
        const rect = contentRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setLassoPoints(prev => [...prev, {x, y}]);
        return;
    }

    if (dragState.isDragging && !dragState.hasMoved) {
         if (Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) > 5) {
             setDragState(prev => ({ ...prev, hasMoved: true }));
         }
    }

    if (dragState.type === 'resize') {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        const newW = Math.max(50, dragState.initItemX + dx);
        const newH = Math.max(50, dragState.initItemY + dy);
        setItems(prev => prev.map(i => i.id === dragState.id ? { ...i, width: newW, height: newH } : i));
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
        if (!contentRef.current) return;
        const rect = contentRef.current.getBoundingClientRect();
        setDragState(prev => ({ ...prev, currMouseX: e.clientX - rect.left, currMouseY: e.clientY - rect.top }));
        return;
    }
    if (!dragState.isDragging) return;
    const dx = e.clientX - dragState.startX; const dy = e.clientY - dragState.startY;
    if (longPressTimerRef.current && Math.hypot(dx, dy) > 5) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    
    if (dragState.type === 'note') {
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
        if (contentRef.current) {
            const rect = contentRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Revert to distance-based check (center point distance)
            const target = items.find(i => {
              if (i.id === dragState.startConnId) return false;
              const center = getCenter(i);
              return Math.hypot(center.x - mouseX, center.y - mouseY) < 70; // 70px snap radius
            });
            if (target) { 
               saveToHistory(items, connections); 
               const existingCount = connections.filter(c => (c.fromId === dragState.startConnId && c.toId === target.id) || (c.fromId === target.id && c.toId === dragState.startConnId)).length;
               const shift = existingCount === 0 ? 0 : (existingCount % 2 === 0 ? -1 : 1) * Math.ceil(existingCount/2) * 50;
               setConnections(prev => [...prev, createLayeredConnection(prev, { id: `conn-${Date.now()}`, fromId: dragState.startConnId, toId: target.id, label: "", controlOffset: {x: shift, y: shift} })]); 
            }
        }
    }

    if (dragState.isDragging && dragState.hasMoved && snapshotRef.current) {
         setHistory(prev => [...prev, snapshotRef.current]);
    }
    if (!dragState.isDragging) snapshotRef.current = null;

    if (dragState.isDragging && dragState.type === 'note' && dragState.targetId) {
        const item = items.find(i => i.id === dragState.id);
        if (item) {
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
                 }
             }

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
    setDragState({ ...dragState, isDragging: false, isConnecting: false, id: null, startConnId: null, targetId: null, type: null, hasMoved: false });
  };

  const handleBoardDoubleClick = (e) => {
      // Only handle if clicking directly on the board background
      if (e.target === e.currentTarget) {
          const rect = contentRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          handleAddNote(x, y); 
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
    <div className="flex flex-col h-screen bg-stone-100 font-sans text-slate-800 overflow-hidden" onMouseDown={() => { if (editingId || editingConnId) handleEditEnd(); }}>
      {/* Hidden file input for import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleLoadFromFile} 
        accept=".json" 
        className="hidden" 
      />
      <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

      <GooeyFilters />

      {isExporting && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/20 no-export">
          <div className="flex items-center gap-3 rounded-xl bg-white/95 px-4 py-3 text-sm font-medium text-slate-700 shadow-xl">
            <RefreshCw className="animate-spin text-blue-600" size={18} />
            <span>Exporting...</span>
          </div>
        </div>
      )}
      
      {/* 3. Bottom-Center Toolbar */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] flex items-center gap-1 bg-white/80 backdrop-blur-md shadow-xl border border-blue-200 rounded-full px-2 py-1.5 transition-all hover:shadow-2xl select-none">
             {/* Title Input Area (No Logo) */}
             <div className="flex items-center px-2 border-r border-blue-200/60 mr-1">
                 <input
                    type="text"
                    value={boardName}
                    onChange={(e) => setBoardName(e.target.value)}
                    className="text-sm font-bold tracking-tight text-slate-700 bg-transparent border-none focus:ring-0 w-32 text-center placeholder-slate-400"
                    placeholder="Untitled Analysis"
                    title="Edit board name"
                />
             </div>

             {/* Undo Button */}
             <div className="flex items-center border-r border-blue-200/60 pr-1 mr-1">
                 <button 
                    onClick={handleUndo} 
                    className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors text-slate-500 hover:text-blue-600 hover:bg-blue-50`}
                    title="Undo (Ctrl+Z)"
                 >
                    <Undo2 size={20}/>
                 </button>
             </div>

             {/* File Group */}
             <div className="flex items-center gap-0.5 border-r border-blue-200/60 pr-1 mr-1">
                 <button onClick={handleSaveToFile} className="flex items-center justify-center w-9 h-9 text-blue-600 hover:bg-blue-50 rounded-full transition-colors" title="Save Data (.json) - Ctrl+S"><Save size={20}/></button>
                 <button onClick={triggerFileInput} className="flex items-center justify-center w-9 h-9 text-blue-600 hover:bg-blue-50 rounded-full transition-colors" title="Load Data (.json)"><Upload size={20}/></button>
             </div>
             
             {/* Actions Group */}
             <div className="flex items-center gap-2 border-r border-blue-200/60 pr-1 mr-1 ml-1">
                <button onClick={() => handleAddNote()} className="flex items-center justify-center w-9 h-9 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-full transition-colors shadow-sm" title="Add Note"><Plus size={20} /></button>
                <button onClick={handleAddMemo} className="flex items-center justify-center w-9 h-9 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-full transition-colors shadow-sm" title="Add Memo"><MessageSquare size={20} /></button>
                <button onClick={triggerImageInput} className="flex items-center justify-center w-9 h-9 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full transition-colors shadow-sm" title="Add Image"><ImageIcon size={20} /></button>
             </div>

             {/* Export & Clear */}
             <div className="relative flex items-center gap-0.5">
                <button 
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={isExporting}
                    className="flex items-center justify-center w-9 h-9 text-blue-600 hover:bg-blue-50 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    title="Export"
                >
                    <Download size={20}/>
                </button>
                {showExportMenu && (
                    <div className="absolute bottom-full right-0 mb-2 bg-white/90 backdrop-blur-md border border-slate-200 rounded-xl shadow-xl flex flex-col p-1 z-[1000] min-w-[50px]">
                        <button disabled={isExporting} onClick={() => handleExport('png')} className="flex items-center justify-center p-2 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50" title="PNG"><ImageIcon size={20}/></button>
                        <button disabled={isExporting} onClick={() => handleExport('pdf')} className="flex items-center justify-center p-2 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50" title="PDF"><FileType size={20}/></button>
                    </div>
                )}
                
                <button onClick={clearBoard} className="flex items-center justify-center w-9 h-9 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-full transition-colors" title="Clear Board"><Trash2 size={20} /></button>
             </div>
      </div>

      {saveFeedback && (
        <div className="absolute bottom-24 left-1/2 z-[1200] flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-200 bg-white/95 px-3 py-2 text-sm font-medium text-emerald-700 shadow-xl no-export pointer-events-none">
          <Check size={16} />
          <span>{saveFeedback}</span>
        </div>
      )}

      {/* Main Board Area */}
      <main
        className="h-full w-full relative overflow-auto bg-stone-100 select-none"
        ref={boardRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDragOver={handleBoardDragOver}
        onDragLeave={handleBoardDragLeave}
        onDrop={handleBoardDrop}
        onDragStart={(e) => e.preventDefault()}
      >
        {isImageDragOver && (
          <div className="absolute inset-4 z-[900] pointer-events-none rounded-xl border-2 border-dashed border-blue-400 bg-blue-500/5 no-export" />
        )}
        <div 
            ref={contentRef}
            id="kj-board-canvas"
            className={`w-[2400px] h-[1600px] relative bg-stone-100 cursor-default`}
            style={{backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)', backgroundSize: '24px 24px'}}
            onDoubleClick={handleBoardDoubleClick}
            onMouseDown={(e) => handleMouseDown(e, null, 'board')} 
        >
             {/* Connection Layer Below Images */}
             <div className="absolute inset-0 pointer-events-none z-[0]" style={{ filter: 'url(#goo)' }}>
                <svg className="absolute inset-0 w-full h-full overflow-visible">
                    {getLayeredConnections(connections, CONNECTION_PLANE_BELOW_IMAGES).map(({ connection: conn }) => {
                        const from = items.find(i => i.id === conn.fromId); const to = items.find(i => i.id === conn.toId);
                        if (!from || !to) return null;
                        const fromColor = getConnectionColor(from);
                        const toColor = getConnectionColor(to);
                        const visualPoints = getConnectionVisualPoints(from, to);
                        return <GooeyLine key={`goo-conn-under-${conn.id}`} id={conn.id} from={visualPoints.from} to={visualPoints.to} fromColor={fromColor} toColor={toColor} offset={conn.controlOffset || {x:0,y:0}} label={conn.label} />;
                    })}
                </svg>
                {items.filter(item => item.type !== 'memo' && item.type !== 'image' && connections.some(conn => (
                    getConnectionPlane(conn) === CONNECTION_PLANE_BELOW_IMAGES
                    && (conn.fromId === item.id || conn.toId === item.id)
                ))).map(item => (
                    <BlobBackground key={`under-blob-${item.id}`} item={item} />
                ))}
             </div>

             <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-[0] overflow-visible">
                {getLayeredConnections(connections, CONNECTION_PLANE_BELOW_IMAGES).map(({ connection: conn }) => {
                    const from = items.find(i => i.id === conn.fromId); const to = items.find(i => i.id === conn.toId); if(!from || !to) return null;
                    if (editingConnId === conn.id) return null;
                    const visualPoints = getConnectionVisualPoints(from, to);
                    return <ConnectionOverlay 
                        key={`under-overlay-${conn.id}`} 
                        connection={conn} 
                        from={visualPoints.from} 
                        to={visualPoints.to} 
                        offset={conn.controlOffset || {x:0,y:0}}
                        onDelete={() => handleDeleteConnection(conn.id)} 
                        onEdit={() => handleEditStart(conn.id, 'conn')} 
                        onUpdate={handleUpdateConnectionLabel} 
                        isEditing={false}
                        setEditingConnId={setEditingConnId} 
                        onMouseDownHandle={handleMouseDown}
                        onDoubleClickEdit={(selectedId) => handleEditStart(selectedId, 'conn')}
                        label={conn.label} 
                    />;
                })}
             </svg>

             {/* Image Layer - images sort among themselves between under/over connection planes */}
             <div className="absolute inset-0 z-[1] pointer-events-none">
               {items.filter(item => item.type === 'image').map(item => (
                 <StickyNote
                  key={item.id}
                  item={item}
                  onMouseDown={handleMouseDown}
                  onUpdateText={handleUpdateText}
                  isSelected={selectedIds.has(item.id) || dragState.id === item.id || dragState.startConnId === item.id}
                  isTargeted={dragState.targetId === item.id}
                  isEditing={editingId === item.id}
                  setEditingId={(selectedId) => selectedId ? handleEditStart(selectedId, 'note') : handleEditEnd()}
                  isUnlinking={unlinkingId === item.id}
                  onDelete={handleDeleteItem}
                  onChangeColor={handleColorChange}
                  onUnlink={handleUnlinkItem}
                  onStartConnection={handleStartConnection}
                 />
               ))}
             </div>

             {/* Connection Layer Above Images */}
             <div className="absolute inset-0 pointer-events-none z-[5]" style={{ filter: 'url(#goo)' }}>
                <svg className="absolute inset-0 w-full h-full overflow-visible">
                    {getLayeredConnections(connections, CONNECTION_PLANE_ABOVE_IMAGES).map(({ connection: conn }) => {
                        const from = items.find(i => i.id === conn.fromId); const to = items.find(i => i.id === conn.toId);
                        if (!from || !to) return null; // Safe check to prevent crash
                        const fromColor = getConnectionColor(from);
                        const toColor = getConnectionColor(to);
                        const visualPoints = getConnectionVisualPoints(from, to);
                        return <GooeyLine key={`goo-conn-${conn.id}`} id={conn.id} from={visualPoints.from} to={visualPoints.to} fromColor={fromColor} toColor={toColor} offset={conn.controlOffset || {x:0,y:0}} label={conn.label} />;
                    })}
                    {dragState.isConnecting && dragState.startConnId && items.find(i=>i.id === dragState.startConnId) && (
                        <line x1={items.find(i=>i.id === dragState.startConnId).x + 72} y1={items.find(i=>i.id === dragState.startConnId).y + (items.find(i=>i.id === dragState.startConnId).type==='memo'?40:72)} x2={dragState.currMouseX} y2={dragState.currMouseY} stroke="currentColor" strokeWidth="18" strokeLinecap="round" className="stroke-indigo-300 opacity-80" />
                    )}
                </svg>
                {/* FILTER OUT MEMOS: Memos are rendered separately outside gooey layer */}
                {items.filter(item => item.type !== 'memo' && item.type !== 'image').map(item => (
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
                const visualPoints = getConnectionVisualPoints(from, to);
                const curveData = getCurvePoints(visualPoints.from, visualPoints.to, conn.controlOffset || {x:0,y:0});
                
                return (
                    <div 
                        className="absolute z-[1000]"
                        style={{ 
                            left: curveData.labelX, 
                            top: curveData.labelY,
                            transform: 'translate(-50%, -50%)' 
                        }}
                    >
                        <div
                            className="absolute left-1/2 -top-9 flex -translate-x-1/2 overflow-hidden rounded-full border border-slate-200 bg-white shadow-xl pointer-events-auto"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                        >
                            <button onClick={() => handleConnectionLayerChange(conn.id, 'back')} className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Send backward">
                                <ChevronDown size={14} />
                            </button>
                            <button onClick={() => handleConnectionLayerChange(conn.id, 'front')} className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Bring forward">
                                <ChevronUp size={14} />
                            </button>
                            <button onClick={() => handleConnectionLayerChange(conn.id, 'bottom')} className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Send below images">
                                <ChevronsDown size={14} />
                            </button>
                            <button onClick={() => handleConnectionLayerChange(conn.id, 'top')} className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Bring above images">
                                <ChevronsUp size={14} />
                            </button>
                        </div>
                        <input
                            autoFocus
                            className="w-32 px-2 py-1 text-center text-xs border border-blue-500 rounded shadow-lg focus:outline-none bg-white select-text pointer-events-auto"
                            value={conn.label || ''}
                            placeholder="Input..."
                            onChange={(e) => handleUpdateConnectionLabel(conn.id, e.target.value)}
                            onBlur={handleEditEnd}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleEditEnd(); }}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>
                );
             })()}

             <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-[6] overflow-visible">
                {getLayeredConnections(connections, CONNECTION_PLANE_ABOVE_IMAGES).map(({ connection: conn }) => {
                    const from = items.find(i => i.id === conn.fromId); const to = items.find(i => i.id === conn.toId); if(!from || !to) return null;
                    // Don't render overlay if editing (input is rendered above)
                    if (editingConnId === conn.id) return null;
                    const visualPoints = getConnectionVisualPoints(from, to);
                    return <ConnectionOverlay 
                        key={conn.id} 
                        connection={conn} 
                        from={visualPoints.from} 
                        to={visualPoints.to} 
                        offset={conn.controlOffset || {x:0,y:0}}
                        onDelete={() => handleDeleteConnection(conn.id)} 
                        onEdit={() => handleEditStart(conn.id, 'conn')} 
                        onUpdate={handleUpdateConnectionLabel} 
                        isEditing={false}
                        setEditingConnId={setEditingConnId} 
                        onMouseDownHandle={handleMouseDown}
                        onDoubleClickEdit={(id) => handleEditStart(id, 'conn')} // Pass down
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

             {items.filter(item => item.type !== 'image').map(item => (
               <StickyNote 
                key={item.id} 
                item={item} 
                // Removed 'mode' since we don't switch modes anymore
                onMouseDown={handleMouseDown}
                onUpdateText={handleUpdateText} 
                isSelected={selectedIds.has(item.id) || dragState.id === item.id || dragState.startConnId === item.id} 
                isTargeted={dragState.targetId === item.id} 
                isEditing={editingId === item.id} 
                setEditingId={(id) => id ? handleEditStart(id, 'note') : handleEditEnd()}
                isUnlinking={unlinkingId === item.id} 
                onDelete={handleDeleteItem}
                onChangeColor={handleColorChange}
                onUnlink={handleUnlinkItem}
                onStartConnection={handleStartConnection} 
               />
             ))}

             <ImageControlsOverlay
                item={items.find(item => item.id === editingId && item.type === 'image')}
                onResizeStart={handleResizeStart}
                onImageLayerChange={handleImageLayerChange}
             />
          </div>
      </main>
      
      <style>{`
        .font-handwriting { font-family: 'Comic Sans MS', 'Chalkboard SE', 'YouYuan', 'Hannotate SC', sans-serif; }
        @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
      `}</style>
    </div>
  );
}
