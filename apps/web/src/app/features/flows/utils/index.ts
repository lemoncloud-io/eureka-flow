import { compressImageIfNeeded } from '@flows/flows';

import type { UploadHtmlProductView } from '@flows/flows';
import type { Connection, DataPacket, NodeData, PortDefinition } from '@lemoncloud/eureka-flows-api';

// ============================================================
// Port Type Utilities
// ============================================================

/** Valid port style keys matching CSS variables (--port-type-*) */
export type PortStyleKey = 'text' | 'image' | 'number' | 'json' | 'any';

const PORT_STYLE_KEYS: Record<string, PortStyleKey> = {
    text: 'text',
    string: 'text',
    image: 'image',
    number: 'number',
    json: 'json',
    any: 'any',
};

/** Normalize port type string to a valid style key (e.g., 'string' → 'text') */
export const getPortStyleKey = (portType: string): PortStyleKey => PORT_STYLE_KEYS[portType.toLowerCase()] ?? 'any';

// ============================================================
// Port Visibility Utilities
// ============================================================

/**
 * Information about the connection being dragged
 */
export interface ConnectionDraftInfo {
    sourceNodeId: string;
    sourcePortId: string;
    sourceType: string;
}

/**
 * Check if two port types are compatible for connection.
 * Handles undefined target type by treating it as 'any'.
 */
export const arePortTypesCompatible = (sourceType: string, targetType: string | undefined): boolean => {
    const normalizedTarget = targetType ?? 'any';
    if (sourceType === 'any' || normalizedTarget === 'any') return true;
    return sourceType.toLowerCase() === normalizedTarget.toLowerCase();
};

/**
 * Filter ports based on visibility rules:
 * 1. First port is always visible
 * 2. Connected ports are always visible
 * 3. During connection drag: show compatible input ports on target nodes
 *
 * @param allPorts - All port definitions
 * @param connectedPortIds - IDs of ports that have connections
 * @param connectionDraft - Active connection being dragged (null if not dragging)
 * @param nodeId - Current node's ID
 * @param portType - 'input' or 'output'
 * @returns Filtered array of visible ports
 */
export const getVisiblePorts = (
    allPorts: PortDefinition[],
    connectedPortIds: string[],
    connectionDraft: ConnectionDraftInfo | null,
    nodeId: string,
    portType: 'input' | 'output'
): PortDefinition[] => {
    if (allPorts.length === 0) return [];

    // Output ports are always visible (no progressive disclosure)
    if (portType === 'output') {
        return allPorts;
    }

    // Input ports use progressive disclosure
    const visible = new Set<string>();

    // 1. First port is always visible
    visible.add(allPorts[0].id);

    // 2. Connected ports are always visible
    connectedPortIds.forEach(id => {
        if (allPorts.some(p => p.id === id)) {
            visible.add(id);
        }
    });

    // 3. During connection drag: show compatible input ports on OTHER nodes
    if (connectionDraft && connectionDraft.sourceNodeId !== nodeId) {
        allPorts.forEach(port => {
            if (arePortTypesCompatible(connectionDraft.sourceType, port.type)) {
                visible.add(port.id);
            }
        });
    }

    // Preserve original order
    return allPorts.filter(p => visible.has(p.id));
};

// ============================================================
// Connection Utilities
// ============================================================

export const getConnectionKey = (conn: Connection): string =>
    `${conn.sourceNodeId}:${conn.sourcePortId}→${conn.targetNodeId}:${conn.targetPortId}`;

/**
 * Collapse edges that describe the same connection, keeping the first.
 *
 * Nothing creates duplicates any more — an edge gets one client-generated ID and keeps
 * it — but flows saved before that can carry two edges for one connection, so loaded
 * data still needs this.
 */
export const deduplicateEdges = (edges: Connection[]): Connection[] => {
    const edgeMap = new Map<string, Connection>();
    const seenIds = new Set<string>();

    edges.forEach(edge => {
        // Skip if we've already seen this ID (prevents duplicate key errors in React)
        if (edge.id && seenIds.has(edge.id)) {
            return;
        }

        const key = getConnectionKey(edge);
        if (edgeMap.has(key)) {
            return;
        }

        edgeMap.set(key, edge);
        if (edge.id) seenIds.add(edge.id);
    });

    return Array.from(edgeMap.values());
};

/**
 * Calculate bezier curve path for connection lines
 * Creates smooth, natural-looking curves similar to Sequencer.media
 */
export const getBezierPath = (x1: number, y1: number, x2: number, y2: number): string => {
    const dx = x2 - x1;
    const absDx = Math.abs(dx);

    // For backwards connections (when target is to the left of source)
    if (dx < 0) {
        // Create a looping curve that goes around
        const loopOffset = Math.max(60, absDx * 0.3 + 30);
        const cp1x = x1 + loopOffset;
        const cp1y = y1;
        const cp2x = x2 - loopOffset;
        const cp2y = y2;
        return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
    }

    // Normal forward connection - smooth horizontal bezier
    // Control points extend horizontally from each endpoint
    // This creates natural S-curves that flow smoothly between nodes
    const curvature = Math.min(absDx * 0.5, 100);
    const cp1x = x1 + curvature;
    const cp1y = y1;
    const cp2x = x2 - curvature;
    const cp2y = y2;

    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
};

/**
 * Check if a connection between two ports is valid.
 * Uses arePortTypesCompatible for consistent case-insensitive type matching.
 *
 * @deprecated sourceIdx/targetIdx are unused - kept for backward compatibility.
 * Consider using arePortTypesCompatible directly for new code.
 */
export const isValidConnection = (
    sourceNode: NodeData,
    _sourceIdx: number,
    targetNode: NodeData,
    _targetIdx: number,
    sourceType: string,
    targetType: string
): boolean => {
    if (sourceNode.id === targetNode.id) return false;
    return arePortTypesCompatible(sourceType, targetType);
};

export { wouldCreateCycle } from './graph';
export { captureCanvasAsDataUrl, captureCanvasForThumbnail, exportCanvasAsPng } from './exportImage';
export { createDesktopCanvasBinding } from './createDesktopCanvasBinding';
export { createGenerateApiLlmGateway } from './createGenerateApiLlmGateway';
export type {
    CreateGenerateApiLlmGatewayOptions,
    GenerateConnectionSnapshot,
    GenerateContent,
    GeneratePostConfig,
    GeneratePostFn,
    GenerateReceiver,
    GenerateRequestBody,
    GenerateResponse,
} from './createGenerateApiLlmGateway';
export { createBlockCatalogLookup } from './createBlockCatalogLookup';

// ============================================================
// Input File Upload Utilities
// ============================================================

/** Maximum upload file size, in MB. Single source of truth — i18n copy interpolates this. */
export const MAX_UPLOAD_SIZE_MB = 58;

export const MAX_UPLOAD_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

/** Thrown when a picked file is at or over MAX_UPLOAD_SIZE, so callers can tell it apart from read failures */
export class FileTooLargeError extends Error {
    constructor() {
        super(`File exceeds ${MAX_UPLOAD_SIZE_MB} MB`);
        this.name = 'FileTooLargeError';
    }
}

/** Reject an oversized file before it is read into memory */
export const assertUploadSize = (file: File): void => {
    if (file.size >= MAX_UPLOAD_SIZE) throw new FileTooLargeError();
};

/** Resolve an upload failure to user-facing copy — size rejections read differently from read failures */
export const getUploadErrorMessage = (
    error: unknown,
    t: (key: string, options?: Record<string, unknown>) => string
): string =>
    error instanceof FileTooLargeError
        ? t('flows:detailPanel.fileTooLarge', { size: MAX_UPLOAD_SIZE_MB })
        : t('flows:detailPanel.uploadFailed');

/** Accepted file types for the input-image block (images + text/json + zip files) */
export const INPUT_FILE_ACCEPT =
    'image/*,.txt,.text,.html,.json,.zip,text/plain,text/html,application/json,application/zip,application/x-zip-compressed';

/** Check if a file is a text-based file (not image) */
export const isTextFile = (file: File): boolean =>
    file.type === 'text/plain' ||
    file.type === 'text/html' ||
    file.type === 'application/json' ||
    /\.(txt|text|html?|json)$/i.test(file.name);

/** Check if a file is a zip archive */
export const isZipFile = (file: File): boolean =>
    file.type === 'application/zip' || file.type === 'application/x-zip-compressed' || /\.zip$/i.test(file.name);

/** Extract raw base64 content from a data URL (strips "data:...;base64," prefix) */
export const extractBase64 = (dataUrl: string): string => {
    const idx = dataUrl.indexOf(',');
    return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
};

/** Read a file as a data URL */
const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = evt => resolve(evt.target?.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

/**
 * Read an image file and return it as a compressed data URL.
 * Throws FileTooLargeError if the file is at or over MAX_UPLOAD_SIZE.
 */
export const readImageFile = async (file: File): Promise<string> => {
    assertUploadSize(file);

    const { dataUrl: compressed } = await compressImageIfNeeded(await readAsDataUrl(file));
    return compressed;
};

/** Clear all file-related config keys */
export const clearFileConfig = (onConfigChange: (key: string, value: unknown) => void): void => {
    onConfigChange('fileData', '');
    onConfigChange('fileName', '');
    onConfigChange('fileType', '');
};

/**
 * Read uploaded file and update config via onConfigChange.
 * Text files (txt/html/json) → fileData (base64), image files → processImage callback.
 * Throws FileTooLargeError if the file is at or over MAX_UPLOAD_SIZE.
 */
export const processUploadedFile = async (
    file: File,
    onConfigChange: (key: string, value: unknown) => void,
    processImage: (dataUrl: string) => Promise<string>
): Promise<void> => {
    assertUploadSize(file);

    const dataUrl = await readAsDataUrl(file);
    if (!dataUrl) return;

    if (isZipFile(file)) {
        onConfigChange('imageData', extractBase64(dataUrl));
        onConfigChange('fileData', '');
        onConfigChange('fileName', file.name);
        onConfigChange('fileType', '');
        return;
    }

    if (isTextFile(file)) {
        onConfigChange('fileData', dataUrl);
        onConfigChange('fileName', file.name);
        onConfigChange('fileType', file.type || 'text/plain');
        onConfigChange('imageData', '');
        return;
    }

    onConfigChange('imageData', await processImage(dataUrl));
    clearFileConfig(onConfigChange);
};

// ============================================================
// JSON Parsing Utilities
// ============================================================

/**
 * Try to parse a JSON string, returns parsed object or null if not valid JSON.
 * Only attempts parsing for strings that start with '{' or '['.
 */
export const tryParseJson = (value: unknown): object | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
};

// ============================================================
// upload-html Product Utilities
// ============================================================

/**
 * Recognize an `upload-html` product packet, so it can be shown as a link card instead of raw JSON.
 *
 * Keyed on `website` alone: a mock run emits `{ website }` with no id, name or progress$, and the
 * spec requires it to render the same way. A JSON string is parsed first — a node can carry the
 * product as text.
 */
export const getUploadHtmlProduct = (packet: DataPacket<unknown> | null | undefined): UploadHtmlProductView | null => {
    if (!packet) return null;

    const value = typeof packet.value === 'string' ? tryParseJson(packet.value) : packet.value;
    if (!value || typeof value !== 'object') return null;

    const product = value as UploadHtmlProductView;
    return typeof product.website === 'string' && product.website ? product : null;
};

// ============================================================
// Date Formatting Utilities
// ============================================================

/** Format a timestamp as relative time (e.g., "3 minutes ago") using i18n keys */
export const formatRelativeTime = (
    timestamp: number | string | undefined,
    t: (key: string, options?: Record<string, unknown>) => string
): string => {
    if (!timestamp) return '';
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return t('flowList.justNow');
    if (minutes < 60) return t('flowList.minutesAgo', { count: minutes });
    if (hours < 24) return t('flowList.hoursAgo', { count: hours });
    if (days < 30) return t('flowList.daysAgo', { count: days });
    return date.toLocaleDateString();
};
