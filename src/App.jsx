import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, BrainCircuit, Link as LinkIcon, Unlink, StickyNote as MemoIcon, Check, Image as ImageIcon, FileType, Layout, Save, Upload, Palette, Download, MessageSquare, Undo2, RefreshCw, Scaling, ExternalLink, ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, ZoomIn, ZoomOut } from 'lucide-react';

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
const BOARD_WIDTH = 2400;
const BOARD_HEIGHT = 1600;
const MIN_BOARD_ZOOM = 0.45;
const MAX_BOARD_ZOOM = 1.6;
const BOARD_ZOOM_STEP = 0.1;
const PDF_MAX_BYTES = 20 * 1024 * 1024;
const PDF_CAPTURE_SCALE = 2;
const PDF_JPEG_QUALITIES = [0.74, 0.64, 0.54, 0.44, 0.34, 0.28];
const PDF_DOWNSCALE_FACTORS = [1, 0.85, 0.7, 0.55, 0.45, 0.35];
const GROUP_OUTLINE_PADDING = 34;

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

const clampBoardZoom = (zoom) => Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, zoom));

const isTextInputElement = (element) => (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName) || element?.isContentEditable
);

const normalizeExternalUrl = (url) => {
    if (!url) return null;
    return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
};

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

const resizeCanvasByFactor = (sourceCanvas, factor) => {
    if (factor === 1) return sourceCanvas;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceCanvas.width * factor));
    canvas.height = Math.max(1, Math.round(sourceCanvas.height * factor));

    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#f5f5f4';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
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
                className="gooey-connection-path"
                d={curveData.path} 
                stroke={`url(#${gradientId})`} 
                strokeWidth="18" 
                strokeLinecap="round" 
                fill="none" 
            />
            {label ? (
                 <rect 
                    className="gooey-connection-label-shape"
                    x={curveData.labelX - width / 2}
                    y={curveData.labelY - height / 2}
                    width={width}
                    height={height}
                    rx={rx}
                    fill={`url(#${gradientId})`}
                 />
            ) : (
                <circle className="gooey-connection-knot" cx={curveData.labelX} cy={curveData.labelY} r="18" fill={`url(#${gradientId})`} />
            )}
        </g>
    );
};

const StickyNote = ({ item, onMouseDown, onDelete, onChangeColor, onUpdateText, onUnlink, onStartConnection, isSelected, isTargeted, isEditing, setEditingId, isUnlinking }) => {
  if (!item) return null;
  const isMemo = item.type === 'memo';
  const isImage = item.type === 'image';
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
        data-board-item-id={item.id}
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
          (isTargeted ? 'ring-4 ring-blue-300 ring-offset-2' : '')}`}
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

const GroupOutline = ({ outline }) => {
  const edge = 8;
  const width = Math.max(1, outline.width);
  const height = Math.max(1, outline.height);
  const radius = Math.min(96, width * 0.22, height * 0.36);
  const sway = Math.min(34, width * 0.08, height * 0.14);
  const path = [
    `M ${radius + sway} ${edge}`,
    `C ${width * 0.36} ${edge - sway * 0.45}, ${width * 0.64} ${edge + sway * 0.2}, ${width - radius} ${edge + sway * 0.8}`,
    `C ${width - edge + sway * 0.15} ${height * 0.22}, ${width - edge + sway * 0.2} ${height * 0.52}, ${width - edge - sway * 0.2} ${height * 0.68}`,
    `C ${width - edge - sway * 0.35} ${height * 0.88}, ${width * 0.72} ${height - edge + sway * 0.5}, ${width * 0.54} ${height - edge}`,
    `C ${width * 0.32} ${height - edge + sway * 0.35}, ${radius * 0.8} ${height - edge - sway * 0.2}, ${edge + sway * 0.35} ${height * 0.68}`,
    `C ${edge - sway * 0.55} ${height * 0.48}, ${edge + sway * 0.05} ${height * 0.24}, ${edge + radius * 0.48} ${edge + sway * 1.25}`,
    `C ${edge + radius * 0.9} ${edge + sway * 0.4}, ${radius * 0.7} ${edge + sway * 0.1}, ${radius + sway} ${edge}`,
    'Z'
  ].join(' ');

  return (
    <svg
      className="absolute pointer-events-none z-[4] overflow-visible"
      style={{ left: outline.x, top: outline.y, width, height }}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={path}
        fill="none"
        stroke="#374151"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="28 30"
      />
      {outline.name && (
        <text
          x="34"
          y="-12"
          fill="#1f2937"
          stroke="#f5f5f4"
          strokeWidth="5"
          paintOrder="stroke"
          fontSize="24"
          fontWeight="700"
          letterSpacing="0"
          className="font-handwriting"
          transform="rotate(-4 34 -12)"
        >
          {outline.name}
        </text>
      )}
    </svg>
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
  const isSpacePressedRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  
  const [editingId, setEditingId] = useState(null);
  const [editingConnId, setEditingConnId] = useState(null);
  const [unlinkingId, setUnlinkingId] = useState(null); 
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [boardZoom, setBoardZoom] = useState(1);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  
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
        const x = (container.scrollLeft + container.clientWidth / 2) / boardZoom;
        const y = (container.scrollTop + container.clientHeight / 2) / boardZoom;
        return {
            x: x + (Math.random() - 0.5) * 40,
            y: y + (Math.random() - 0.5) * 40
        };
    }
    return { x: 500, y: 300 };
  }, [boardZoom]);

  const getBoardPointFromClient = useCallback((clientX, clientY) => {
    if (!contentRef.current) return null;
    const rect = contentRef.current.getBoundingClientRect();
    return {
        x: (clientX - rect.left) / boardZoom,
        y: (clientY - rect.top) / boardZoom
    };
  }, [boardZoom]);

  const updateBoardZoom = useCallback((nextZoom, anchorClientPoint = null) => {
    const container = boardRef.current;
    const resolvedZoom = clampBoardZoom(typeof nextZoom === 'function' ? nextZoom(boardZoom) : nextZoom);

    if (!container || resolvedZoom === boardZoom) {
        setBoardZoom(resolvedZoom);
        return;
    }

    const containerRect = container.getBoundingClientRect();
    const anchorScreenX = anchorClientPoint ? anchorClientPoint.x - containerRect.left : container.clientWidth / 2;
    const anchorScreenY = anchorClientPoint ? anchorClientPoint.y - containerRect.top : container.clientHeight / 2;
    const anchorBoardX = (container.scrollLeft + anchorScreenX) / boardZoom;
    const anchorBoardY = (container.scrollTop + anchorScreenY) / boardZoom;

    setBoardZoom(resolvedZoom);
    requestAnimationFrame(() => {
        container.scrollLeft = anchorBoardX * resolvedZoom - anchorScreenX;
        container.scrollTop = anchorBoardY * resolvedZoom - anchorScreenY;
    });
  }, [boardZoom]);

  // --- Image Helpers ---
  const getBoardPointFromEvent = useCallback((e) => {
    return getBoardPointFromClient(e.clientX, e.clientY);
  }, [getBoardPointFromClient]);

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
        if (e.key === 'Escape') {
            setContextMenu(null);
        }

        if (e.code === 'Space' && !isTextInputElement(document.activeElement)) {
            e.preventDefault();
            isSpacePressedRef.current = true;
            setIsSpacePressed(true);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveHandlerRef.current?.();
            return;
        }

        if (isTextInputElement(document.activeElement)) return;

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
                    const boardPoint = getBoardPointFromClient(mousePosRef.current.x, mousePosRef.current.y) || getCenter(item);

                    setDragState({
                        id: null, type: null, isConnecting: true, startConnId: fromId,
                        startX: mousePosRef.current.x, startY: mousePosRef.current.y,
                        currMouseX: boardPoint.x, currMouseY: boardPoint.y,
                        initItemX: 0, initItemY: 0
                    });
                }
            }
        }
    };

    const handlePaste = (e) => {
        if (isTextInputElement(document.activeElement)) return;

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

    const handleKeyUp = (e) => {
        if (e.code !== 'Space') return;
        isSpacePressedRef.current = false;
        setIsSpacePressed(false);
        setIsPanning(false);
        setDragState(prev => prev.type === 'pan'
            ? { ...prev, isDragging: false, type: null, hasMoved: false }
            : prev
        );
    };

    const handleWindowBlur = () => {
        isSpacePressedRef.current = false;
        setIsSpacePressed(false);
        setIsPanning(false);
    };

    const handleWindowMouseUp = () => {
        setIsPanning(false);
        setDragState(prev => prev.type === 'pan'
            ? { ...prev, isDragging: false, type: null, hasMoved: false }
            : prev
        );
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('paste', handlePaste);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('paste', handlePaste);
        window.removeEventListener('blur', handleWindowBlur);
        window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [connections, getBoardPointFromClient, handleUndo, items, processAndAddImage, saveToHistory, selectedIds]);

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

  const handleBoardWheel = (e) => {
    if (!isSpacePressedRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    const direction = e.deltaY < 0 ? 1 : -1;
    updateBoardZoom(
        current => current + direction * BOARD_ZOOM_STEP,
        { x: e.clientX, y: e.clientY }
    );
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

  const addPdfLinks = (pdf, canvas) => {
      const scaleX = canvas.width / BOARD_WIDTH;
      const scaleY = canvas.height / BOARD_HEIGHT;

      items.forEach(item => {
          const url = normalizeExternalUrl(item.url);
          if (!url) return;

          const style = getNoteStyle(item.text, item.type, item.width, item.height);
          pdf.link(
              item.x * scaleX,
              item.y * scaleY,
              style.widthVal * scaleX,
              style.heightVal * scaleY,
              { url }
          );
      });
  };

  const createPdfFromCanvas = (sourceCanvas, quality, downscaleFactor) => {
      const { jsPDF } = window.jspdf;
      const canvas = resizeCanvasByFactor(sourceCanvas, downscaleFactor);
      const imgData = canvas.toDataURL('image/jpeg', quality);
      const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'l' : 'p',
          unit: 'px',
          format: [canvas.width, canvas.height],
          compress: true
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
      addPdfLinks(pdf, canvas);
      return pdf;
  };

  const handleExport = async (format) => {
      setShowExportMenu(false);
      if (!contentRef.current || !window.html2canvas) return;
      setIsExporting(true);
      try {
          const isPng = format === 'png';
          const captureScale = isPng ? 4 : PDF_CAPTURE_SCALE;
          const canvas = await window.html2canvas(contentRef.current, {
              scale: captureScale,
              useCORS: true,
              backgroundColor: isPng ? null : '#f5f5f4',
              logging: false,
              allowTaint: true, 
              foreignObjectRendering: !isPng,
              width: BOARD_WIDTH,
              height: BOARD_HEIGHT,
              windowWidth: BOARD_WIDTH,
              windowHeight: BOARD_HEIGHT,
              scrollX: 0,
              scrollY: 0,
              ignoreElements: (el) => el.classList.contains('no-export'),
              onclone: (doc) => {
                  const textNodes = doc.querySelectorAll('.font-handwriting span'); 
                  textNodes.forEach(node => { node.style.overflow = 'visible'; node.style.whiteSpace = 'normal'; });
                  const board = doc.querySelector('#kj-board-canvas');
                  if (board) {
                      board.style.transform = 'none';
                      board.style.transformOrigin = 'top left';
                      board.style.width = `${BOARD_WIDTH}px`;
                      board.style.height = `${BOARD_HEIGHT}px`;
                  }
                  if (isPng) {
                      if (board) { board.style.backgroundColor = 'transparent'; board.style.backgroundImage = 'none'; }
                  }
              }
          });
          
          const filename = `${boardName}_Export`; 

          if (format === 'png') {
              const link = document.createElement('a'); link.download = `${filename}.png`; link.href = canvas.toDataURL('image/png'); link.click();
          } else if (format === 'pdf' && window.jspdf) {
              let bestPdf = null;
              let bestSize = Infinity;

              for (const downscaleFactor of PDF_DOWNSCALE_FACTORS) {
                  for (const quality of PDF_JPEG_QUALITIES) {
                      const pdf = createPdfFromCanvas(canvas, quality, downscaleFactor);
                      const blob = pdf.output('blob');

                      if (blob.size < bestSize) {
                          bestPdf = pdf;
                          bestSize = blob.size;
                      }

                      if (blob.size <= PDF_MAX_BYTES) {
                          pdf.save(`${filename}.pdf`);
                          return;
                      }
                  }
              }

              bestPdf?.save(`${filename}.pdf`);
          }
      } catch (err) { console.error("Export failed:", err); alert("Export failed, please try again"); } finally { setIsExporting(false); }
  };

  const clearBoard = () => { if(confirm('Are you sure you want to clear the board?')) { saveToHistory(items, connections); setItems([]); setConnections([]); setBoardName('Untitled Analysis'); setBoardId(createBoardId()); } };
  const handleDeleteItem = (id) => { saveToHistory(items, connections); setItems(items.filter(i => i.id !== id)); setConnections(conn => conn.filter(c => c.fromId !== id && c.toId !== id)); };
  const handleUnlinkItem = (id) => { saveToHistory(items, connections); setUnlinkingId(id); setTimeout(() => { setItems(prev => prev.map(i => i.id === id ? { ...i, groupId: null, groupName: null } : i)); setUnlinkingId(null); }, 300); };
  const handleGroupSelection = () => {
      if (selectedIds.size < 2) return;

      saveToHistory(items, connections);
      const nextGroupId = `group-${Date.now()}`;
      setItems(prev => prev.map(item => selectedIds.has(item.id) ? { ...item, groupId: nextGroupId, groupName: null } : item));
  };
  const handleRenameGroup = (groupId, currentName = '') => {
      if (!groupId) return;

      const nextName = window.prompt('群组名称', currentName);
      if (nextName === null) return;

      saveToHistory(items, connections);
      const cleanName = nextName.trim();
      setItems(prev => prev.map(item => item.groupId === groupId
          ? { ...item, groupName: cleanName || null }
          : item
      ));
  };
  const getSelectionBounds = () => {
      const selectedItems = items.filter(item => selectedIds.has(item.id));
      if (selectedItems.length < 2) return null;

      return selectedItems.reduce((bounds, item) => {
          const style = getNoteStyle(item.text, item.type, item.width, item.height);
          return {
              minX: Math.min(bounds.minX, item.x),
              minY: Math.min(bounds.minY, item.y),
              maxX: Math.max(bounds.maxX, item.x + style.widthVal),
              maxY: Math.max(bounds.maxY, item.y + style.heightVal)
          };
      }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  };
  const getGroupOutlines = () => {
      const grouped = new Map();

      items.forEach(item => {
          if (!item.groupId) return;
          if (!grouped.has(item.groupId)) grouped.set(item.groupId, []);
          grouped.get(item.groupId).push(item);
      });

      return Array.from(grouped.entries()).flatMap(([groupId, groupItems]) => {
          if (groupItems.length < 2) return [];

          const bounds = groupItems.reduce((current, item) => {
              const style = getNoteStyle(item.text, item.type, item.width, item.height);
              return {
                  minX: Math.min(current.minX, item.x),
                  minY: Math.min(current.minY, item.y),
                  maxX: Math.max(current.maxX, item.x + style.widthVal),
                  maxY: Math.max(current.maxY, item.y + style.heightVal)
              };
          }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

          return [{
              id: groupId,
              name: groupItems.find(item => item.groupName)?.groupName || '',
              x: bounds.minX - GROUP_OUTLINE_PADDING,
              y: bounds.minY - GROUP_OUTLINE_PADDING,
              width: bounds.maxX - bounds.minX + GROUP_OUTLINE_PADDING * 2,
              height: bounds.maxY - bounds.minY + GROUP_OUTLINE_PADDING * 2
          }];
      });
  };
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

  const handleAddMemo = (x, y) => {
    saveToHistory(items, connections);
    let pos = { x, y };
    if (x === undefined || y === undefined) {
        pos = getViewportCenter();
    } else {
        const memoStyle = getNoteStyle('', 'memo');
        pos.x -= memoStyle.widthVal / 2;
        pos.y -= memoStyle.heightVal / 2;
    }
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

  const closeContextMenu = () => setContextMenu(null);

  const handleBoardContextMenu = (e) => {
      if (isTextInputElement(e.target)) return;

      e.preventDefault();
      e.stopPropagation();
      if (editingId || editingConnId) handleEditEnd();

      const point = getBoardPointFromClient(e.clientX, e.clientY) || getViewportCenter();
      const itemNode = e.target.closest?.('[data-board-item-id]');
      const itemId = itemNode?.dataset?.boardItemId || null;

      if (itemId && !selectedIds.has(itemId)) {
          setSelectedIds(new Set([itemId]));
      }

      setContextMenu({
          x: e.clientX,
          y: e.clientY,
          boardX: point.x,
          boardY: point.y,
          itemId
      });
      setShowExportMenu(false);
  };

  const runContextAction = (action) => {
      closeContextMenu();
      action?.();
  };

  const handleDeleteSelection = () => {
      const ids = selectedIds.size > 0
          ? selectedIds
          : (contextMenu?.itemId ? new Set([contextMenu.itemId]) : new Set());
      if (ids.size === 0) return;

      saveToHistory(items, connections);
      setItems(prev => prev.filter(item => !ids.has(item.id)));
      setConnections(prev => prev.filter(conn => !ids.has(conn.fromId) && !ids.has(conn.toId)));
      setSelectedIds(new Set());
  };

  const handleMouseDown = (e, id, type) => {
    closeContextMenu();
    e.stopPropagation();
    if(isTextInputElement(e.target) || e.target.tagName === 'BUTTON') return;

    if (isSpacePressedRef.current && e.button === 0) {
        e.preventDefault();
        if (editingId || editingConnId) handleEditEnd();
        panStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            scrollLeft: boardRef.current?.scrollLeft || 0,
            scrollTop: boardRef.current?.scrollTop || 0
        };
        setIsPanning(true);
        setDragState({
            id: null,
            type: 'pan',
            startX: e.clientX,
            startY: e.clientY,
            initItemX: 0,
            initItemY: 0,
            initOffset: {x: 0, y: 0},
            targetId: null,
            isDragging: true,
            isConnecting: false,
            startConnId: null,
            currMouseX: 0,
            currMouseY: 0,
            initialPositions: {},
            hasMoved: false
        });
        return;
    }
    
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
        const startPoint = getBoardPointFromClient(e.clientX, e.clientY);
        if (!startPoint) return;
        setSelectedIds(new Set());
        setIsLassoing(true);
        setLassoPoints([startPoint]);
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

    if (dragState.type === 'pan') {
        const container = boardRef.current;
        if (!container) return;
        container.scrollLeft = panStartRef.current.scrollLeft - (e.clientX - panStartRef.current.x);
        container.scrollTop = panStartRef.current.scrollTop - (e.clientY - panStartRef.current.y);
        return;
    }

    if (isLassoing) {
        const point = getBoardPointFromClient(e.clientX, e.clientY);
        if (!point) return;
        setLassoPoints(prev => [...prev, point]);
        return;
    }

    if (dragState.isDragging && !dragState.hasMoved) {
         if (Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) > 5) {
             setDragState(prev => ({ ...prev, hasMoved: true }));
         }
    }

    if (dragState.type === 'resize') {
        const dx = (e.clientX - dragState.startX) / boardZoom;
        const dy = (e.clientY - dragState.startY) / boardZoom;
        const newW = Math.max(50, dragState.initItemX + dx);
        const newH = Math.max(50, dragState.initItemY + dy);
        setItems(prev => prev.map(i => i.id === dragState.id ? { ...i, width: newW, height: newH } : i));
        return;
    }

    if (dragState.type === 'connectionHandle') {
        const dx = (e.clientX - dragState.startX) / boardZoom;
        const dy = (e.clientY - dragState.startY) / boardZoom;
        const newOffsetX = dragState.initOffset.x + dx * 2;
        const newOffsetY = dragState.initOffset.y + dy * 2;
        setConnections(prev => prev.map(c => c.id === dragState.id ? { ...c, controlOffset: { x: newOffsetX, y: newOffsetY } } : c));
        return;
    }

    if (dragState.isConnecting) {
        const point = getBoardPointFromClient(e.clientX, e.clientY);
        if (!point) return;
        setDragState(prev => ({ ...prev, currMouseX: point.x, currMouseY: point.y }));
        return;
    }
    if (!dragState.isDragging) return;
    const screenDx = e.clientX - dragState.startX;
    const screenDy = e.clientY - dragState.startY;
    const dx = screenDx / boardZoom;
    const dy = screenDy / boardZoom;
    if (longPressTimerRef.current && Math.hypot(screenDx, screenDy) > 5) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    
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
          setItems(prev => prev.map(item => item.groupId === draggedItem.groupId ? { ...item, x: item.x + e.movementX / boardZoom, y: item.y + e.movementY / boardZoom } : item));
      } else {
          setItems(prev => prev.map(item => item.id === dragState.id ? { ...item, x: dragState.initItemX + dx, y: dragState.initItemY + dy } : item));
      }
    }
  };

  const handleMouseUp = (e) => {
    clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null;

    if (dragState.type === 'pan') {
        setIsPanning(false);
        setDragState({ ...dragState, isDragging: false, type: null, hasMoved: false });
        return;
    }
    
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
            const boardPoint = getBoardPointFromClient(e.clientX, e.clientY);
            if (!boardPoint) return;
            
            // Revert to distance-based check (center point distance)
            const target = items.find(i => {
              if (i.id === dragState.startConnId) return false;
              const center = getCenter(i);
              return Math.hypot(center.x - boardPoint.x, center.y - boardPoint.y) < 70; // 70px snap radius
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

    if (dragState.isDragging && dragState.type === 'note') {
        const item = items.find(i => i.id === dragState.id);
        if (item?.type === 'memo') {
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
    }
    setDragState({ ...dragState, isDragging: false, isConnecting: false, id: null, startConnId: null, targetId: null, type: null, hasMoved: false });
  };

  const handleBoardDoubleClick = (e) => {
      // Only handle if clicking directly on the board background
      if (e.target === e.currentTarget) {
          const point = getBoardPointFromClient(e.clientX, e.clientY);
          if (!point) return;
          handleAddNote(point.x, point.y); 
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
    <div className="flex flex-col h-screen bg-stone-100 font-sans text-slate-800 overflow-hidden" onMouseDown={() => { closeContextMenu(); if (editingId || editingConnId) handleEditEnd(); }}>
      {/* Hidden file input for import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleLoadFromFile} 
        accept=".json" 
        className="hidden" 
      />
      <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

      {isExporting && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/20 no-export">
          <div className="flex items-center gap-3 rounded-xl bg-white/95 px-4 py-3 text-sm font-medium text-slate-700 shadow-xl">
            <RefreshCw className="animate-spin text-blue-600" size={18} />
            <span>Exporting...</span>
          </div>
        </div>
      )}

      {contextMenu && (() => {
        const targetItem = items.find(item => item.id === contextMenu.itemId);
        const hasSelection = selectedIds.size > 0 || !!targetItem;
        const menuLeft = typeof window === 'undefined'
            ? contextMenu.x
            : Math.max(8, Math.min(contextMenu.x, window.innerWidth - 236));
        const menuTop = typeof window === 'undefined'
            ? contextMenu.y
            : Math.max(8, Math.min(contextMenu.y, window.innerHeight - 284));
        const itemClass = (disabled, danger = false) => `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
            disabled
                ? 'cursor-not-allowed text-slate-300'
                : danger
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
        }`;
        const Divider = () => <div className="my-1 h-px bg-slate-200/80" />;
        const MenuButton = ({ icon, label, onClick, disabled = false, danger = false }) => (
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && runContextAction(onClick)}
                className={itemClass(disabled, danger)}
            >
                {icon}
                <span className="truncate">{label}</span>
            </button>
        );

        return (
            <div
                className="fixed z-[2500] w-56 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-2xl backdrop-blur-md no-export"
                style={{ left: menuLeft, top: menuTop }}
                onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onContextMenu={(event) => event.preventDefault()}
            >
                <MenuButton icon={<Plus size={16} />} label="新建便签" onClick={() => handleAddNote(contextMenu.boardX, contextMenu.boardY)} />
                <MenuButton icon={<MessageSquare size={16} />} label="新建备注" onClick={() => handleAddMemo(contextMenu.boardX, contextMenu.boardY)} />
                <Divider />
                <MenuButton icon={<Layout size={16} />} label="组成群组" disabled={selectedIds.size < 2} onClick={handleGroupSelection} />
                <MenuButton icon={<MemoIcon size={16} />} label="命名群组" disabled={!targetItem?.groupId} onClick={() => handleRenameGroup(targetItem.groupId, targetItem.groupName || '')} />
                <MenuButton icon={<Unlink size={16} />} label="取消成组" disabled={!targetItem?.groupId} onClick={() => handleUnlinkItem(targetItem.id)} />
                <MenuButton icon={<Trash2 size={16} />} label="删除所选" disabled={!hasSelection} danger onClick={handleDeleteSelection} />
            </div>
        );
      })()}
      
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

      <div className="absolute bottom-8 right-8 z-[1000] flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/85 px-2 py-1.5 shadow-xl backdrop-blur-md no-export select-none">
        <button
          onClick={() => updateBoardZoom(current => current - BOARD_ZOOM_STEP)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={boardZoom <= MIN_BOARD_ZOOM}
          title="Zoom out"
        >
          <ZoomOut size={18} />
        </button>
        <button
          onClick={() => updateBoardZoom(1)}
          className="h-9 min-w-14 rounded-full px-2 text-xs font-bold tabular-nums text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
          title="Reset zoom"
        >
          {Math.round(boardZoom * 100)}%
        </button>
        <button
          onClick={() => updateBoardZoom(current => current + BOARD_ZOOM_STEP)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={boardZoom >= MAX_BOARD_ZOOM}
          title="Zoom in"
        >
          <ZoomIn size={18} />
        </button>
      </div>

      {/* Main Board Area */}
      <main
        className={`board-scrollbar h-full w-full relative overflow-auto bg-stone-100 select-none ${isPanning ? 'cursor-grabbing' : (isSpacePressed ? 'cursor-grab' : '')}`}
        ref={boardRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleBoardWheel}
        onDragOver={handleBoardDragOver}
        onDragLeave={handleBoardDragLeave}
        onDrop={handleBoardDrop}
        onContextMenu={handleBoardContextMenu}
        onDragStart={(e) => e.preventDefault()}
      >
        {isImageDragOver && (
          <div className="absolute inset-4 z-[900] pointer-events-none rounded-xl border-2 border-dashed border-blue-400 bg-blue-500/5 no-export" />
        )}
        <div
          className="relative"
          style={{
            width: `${BOARD_WIDTH * boardZoom}px`,
            height: `${BOARD_HEIGHT * boardZoom}px`
          }}
        >
        <div 
            ref={contentRef}
            id="kj-board-canvas"
            className="relative bg-stone-100 cursor-inherit"
            style={{
                width: `${BOARD_WIDTH}px`,
                height: `${BOARD_HEIGHT}px`,
                backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
                backgroundSize: '24px 24px',
                transform: `scale(${boardZoom})`,
                transformOrigin: 'top left'
            }}
            onDoubleClick={handleBoardDoubleClick}
            onMouseDown={(e) => handleMouseDown(e, null, 'board')} 
        >
             <GooeyFilters />

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

             {getGroupOutlines().map(outline => (
                <GroupOutline key={outline.id} outline={outline} />
             ))}

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

             {selectedIds.size > 1 && (() => {
                const bounds = getSelectionBounds();
                if (!bounds) return null;
                return (
                    <div
                        className="absolute z-[900] flex -translate-x-1/2 items-center rounded-full border border-slate-200 bg-white/95 p-1 shadow-xl backdrop-blur-md no-export"
                        style={{
                            left: `${(bounds.minX + bounds.maxX) / 2}px`,
                            top: `${Math.max(8, bounds.minY - 52)}px`
                        }}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                    >
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                handleGroupSelection();
                            }}
                            className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
                            title="Group selected items"
                        >
                            <Layout size={16} />
                            <span>成组</span>
                        </button>
                    </div>
                );
             })()}

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
        </div>
      </main>
      
      <style>{`
        .font-handwriting { font-family: 'Comic Sans MS', 'Chalkboard SE', 'YouYuan', 'Hannotate SC', sans-serif; }
        @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
      `}</style>
    </div>
  );
}
