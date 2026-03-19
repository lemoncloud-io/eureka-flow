# Image Upload Block Implementation Research

## Overview

The `input-image` block is a frontend-executable block that allows users to upload image files through the workflow editor UI. The complete data flow from file selection through base64 encoding to node output has been fully traced.

---

## 1. Block Definition and Registration

### Block Definition (`demo-blocks.ts`)

**File**: `/Users/tak/workspace/lemoncloud/codes/eureka-flow/apps/web/src/app/features/flows/data/demo-blocks.ts` (lines 33-52)

```typescript
{
    id: '0009',
    type: 'input-image',
    label: 'User Image Input',
    icon: '🖼️',
    description: 'User Image Input - pass-through image input block',
    stereo: 'input',
    isFrontend: true,
    inputs: [],
    outputs: [{ id: 'out', label: 'Image', type: 'image' }],
    defaultConfig: { imageData: '' },
    configSchema: [
        {
            key: 'imageData',
            type: 'file',
            label: 'Image',
            placeholder: 'Used when no input is connected',
        },
    ],
}
```

**Key Characteristics**:

- **Type**: `input-image` (hardcoded for offline demo mode)
- **Frontend Execution**: `isFrontend: true` - executes in browser, not on server
- **Config Schema**: Uses `type: 'file'` with `key: 'imageData'` to store the base64-encoded image
- **Output Type**: `type: 'image'` - outputs a DataPacket with type 'image'
- **No Inputs**: Pure input block with zero input ports

---

## 2. Image Upload UI Components

### 2.1 Node Inline Editor (`NodeBlock.tsx`)

**File**: `/Users/tak/workspace/lemoncloud/codes/eureka-flow/apps/web/src/app/features/flows/components/NodeBlock.tsx` (lines 509-584)

#### Component: `InputImageVisualizationEditable`

```typescript
const InputImageVisualizationEditable: React.FC<EditableVisualizationProps> = ({ node, onConfigChange }) => {
    const img = node.config?.imageData as string | undefined;
    const fileInputId = `inline-image-${node.id}`;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsUploading(true);
            const reader = new FileReader();
            reader.onload = async evt => {
                const dataUrl = evt.target?.result as string;
                if (dataUrl) {
                    const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
                    onConfigChange('imageData', compressed);
                }
                setIsUploading(false);
            };
            reader.onerror = () => setIsUploading(false);
            reader.readAsDataURL(file);
        }
    };
    // ... JSX rendering
};
```

**Upload Flow**:

1. Hidden `<input type="file" accept="image/*">` triggers on label click
2. FileReader reads file as DataURL
3. Image compression is applied (if needed)
4. `onConfigChange('imageData', compressed)` saves to node config

**UI States**:

- **Empty State**: Dashed border box with upload icon
- **Uploading**: Spinner (Loader2 icon)
- **Loaded**: Preview with hover remove button (X icon)

### 2.2 Detail Panel Editor (`DetailPanel.tsx`)

**File**: `/Users/tak/workspace/lemoncloud/codes/eureka-flow/apps/web/src/app/features/flows/components/DetailPanel.tsx` (lines 154-290)

#### Component: `InputImageConfig`

```typescript
const InputImageConfig: React.FC<InputImageConfigProps> = ({ node, onConfigChange, t }) => {
    const img = node.config?.imageData as string | undefined;
    const { src: resolvedSrc, isLoading } = useS3Image(img || '');
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    // Config-based image processing
    const aspectRatio = node.config?.aspectRatio as string | undefined;
    const maxWidth = node.config?.maxWidth as string | undefined;
    const bypass = node.config?.bypass as string | undefined;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async evt => {
                const dataUrl = evt.target?.result as string;
                if (dataUrl) {
                    // Process image with config (crop/resize based on aspectRatio, maxWidth, bypass)
                    const processed = await processImageWithConfig(dataUrl, {
                        aspectRatio,
                        maxWidth,
                        bypass,
                    });
                    onConfigChange('imageData', processed);
                }
            };
            reader.readAsDataURL(file);
        }
    };
    // ... more handlers
};
```

**Key Features**:

- **S3 Resolution**: Uses `useS3Image()` hook to resolve S3 URLs to data URLs
- **Advanced Processing**: Applies `processImageWithConfig()` with crop/resize options
- **Image Editor**: Optional ImageEditorDialog for post-upload editing
- **Download Support**: Quick action button to download current image

---

## 3. Execute Function

### Location: `libs/flows/src/api/execute-functions.ts` (lines 43-48)

```typescript
'input-image': async (_inputs, config, onProgress) => {
    if (!config.imageData) throw new Error('No image data provided');
    onProgress?.(100);
    return { out: createPacket(config.imageData, 'image') };
},
```

**Execution Logic**:

1. Retrieves `imageData` from node config (should be base64 string)
2. Throws error if no image provided
3. Creates DataPacket with `type: 'image'`
4. Returns output with 100% progress

**DataPacket Creation**:

```typescript
const createPacket = (value: unknown, type: 'text' | 'image' | 'number') => ({
    value,
    type,
    timestamp: Date.now(),
});
```

The packet contains:

- **value**: Base64 data URL string
- **type**: `'image'` literal
- **timestamp**: Execution time

---

## 4. Image Processing Pipeline

### 4.1 Compression Logic

**File**: `/Users/tak/workspace/lemoncloud/codes/eureka-flow/libs/flows/src/utils/imageCompression.ts`

**Key Constants**:

```typescript
const COMPRESSION_THRESHOLD = 5 * 1024 * 1024; // 5MB
const TARGET_SIZE = 5.5 * 1024 * 1024; // 5.5MB (leave margin for Lambda 6MB limit)
const INITIAL_QUALITY = 0.92;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.05;
```

**Algorithm**:

```
If originalSize <= 5MB:
    return unchanged (no compression needed)

If originalSize > 5MB:
    Loop (quality from 0.92 to 0.5):
        Convert to Canvas (preserves dimensions)
        Output as JPEG with current quality
        Measure base64 size
        If size <= 5.5MB: break loop
        quality -= 0.05
    Return compressed image
```

**MIME Type Handling**:

- JPEG/WebP: Support quality compression
- PNG: Converted to JPEG during compression (transparency lost, but acceptable for large files)

**Base64 Size Calculation**:

```typescript
const getBase64Size = (dataUrl: string): number => {
    const base64 = dataUrl.split(',')[1];
    const padding = (base64.match(/=/g) || []).length;
    return Math.floor((base64.length * 3) / 4) - padding;
};
```

### 4.2 Advanced Image Processing

**File**: `/Users/tak/workspace/lemoncloud/codes/eureka-flow/libs/flows/src/utils/imageProcessing.ts`

**Export Function**: `processImageWithConfig(dataUrl, config)`

**Processing Order**:

```
1. Check bypass mode:
   - If bypass="true" or no config: compress only
   - Otherwise: crop → resize → compress

2. Aspect Ratio Crop (center crop):
   currentAspect = img.width / img.height
   targetAspect = config.aspectRatio (e.g., "3:4" → 0.75)

   If currentAspect > targetAspect:
       Crop left/right sides
   Else if currentAspect < targetAspect:
       Crop top/bottom
   Else:
       No crop (exact match)

3. Max Width Resize:
   If outputWidth > maxWidth:
       scale = maxWidth / outputWidth
       outputHeight = outputHeight * scale

4. Canvas Drawing:
   Create canvas with output dimensions
   Draw cropped region from source image
   Convert to JPEG with 0.9 quality

5. Final Compression:
   Apply compressImageIfNeeded() to processed result
```

**Aspect Ratio Parsing**:

```typescript
parseAspectRatio("3:4")  → 0.75  (width/height)
parseAspectRatio("16:9") → 1.777
parseAspectRatio("1:1")  → 1
parseAspectRatio("free") → undefined (skip crop)
```

---

## 5. S3 Image Resolution

### Hook: `useS3Image`

**File**: `/Users/tak/workspace/lemoncloud/codes/eureka-flow/libs/flows/src/hooks/useS3Image.ts`

```typescript
export const useS3Image = (value: string | undefined | null): UseS3ImageResult => {
    const [src, setSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!value) {
            /* reset state */
        }

        // Pass through non-S3 URLs (data URLs, http, etc.)
        if (!isS3Url(value)) {
            setSrc(value);
            return;
        }

        // Resolve S3 URL to data URL
        setIsLoading(true);
        resolveS3Image(value)
            .then(dataUrl => setSrc(dataUrl))
            .catch(err => setError(err));
    }, [value]);

    return { src, isLoading, error };
};
```

### S3 Resolution: `resolveS3Image`

**File**: `/Users/tak/workspace/lemoncloud/codes/eureka-flow/libs/flows/src/utils/s3Utils.ts`

**Caching Strategy** (In-Memory):

```typescript
const imageCache = new Map<string, string>(); // Resolved images
const pendingRequests = new Map<string, Promise<string>>(); // Prevent duplicates

export const resolveS3Image = async (s3Url: string): Promise<string> => {
    // 1. Return cached result
    const cached = imageCache.get(s3Url);
    if (cached) return cached;

    // 2. Return pending request (deduplication)
    const pending = pendingRequests.get(s3Url);
    if (pending) return pending;

    // 3. Create new request
    const request = getImageFromS3(s3Url)
        .then(dataUrl => {
            imageCache.set(s3Url, dataUrl); // Cache result
            pendingRequests.delete(s3Url); // Cleanup pending
            return dataUrl;
        })
        .catch(err => {
            pendingRequests.delete(s3Url); // Cleanup on error
            throw err;
        });

    pendingRequests.set(s3Url, request);
    return request;
};
```

### API Call: `getImageFromS3`

**File**: `/Users/tak/workspace/lemoncloud/codes/eureka-flow/libs/flows/src/api/nodes.ts` (lines 247-261)

```typescript
export const getImageFromS3 = async (s3Url: string): Promise<string> => {
    if (!s3Url || !s3Url.startsWith('s3://')) {
        throw new Error('Invalid S3 URL');
    }

    const response = await api.get<{ body: string; headers: { 'Content-Type': string } }>('/nodes/0/image', {
        params: { s3Url },
    });

    const contentType = response.data.headers?.['Content-Type'] || 'image/png';
    const base64Body = response.data.body;

    return `data:${contentType};base64,${base64Body}`;
};
```

**API Endpoint**: `GET /nodes/0/image?s3Url=...`
**Response Format**: `{ body: string (base64), headers: { 'Content-Type': string } }`
**Return Format**: `data:image/png;base64,{base64Body}`

---

## 6. Image Display Component

### Component: `S3Image`

**File**: `/Users/tak/workspace/lemoncloud/codes/eureka-flow/apps/web/src/app/features/flows/components/S3Image.tsx`

```typescript
export const S3Image: React.FC<S3ImageProps> = ({ src, alt, className, onLoad }) => {
    const { src: resolvedSrc, isLoading, error } = useS3Image(src);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center">
                <RefreshCw className="animate-spin" />
            </div>
        );
    }

    if (error || !resolvedSrc) {
        return <div className="text-destructive"><X /></div>;
    }

    return <img src={resolvedSrc} alt={alt} className={className} onLoad={onLoad} />;
};
```

**Dual Format Support**:

- **S3 URLs** (`s3://...`): Resolved via API to data URLs
- **Data URLs** (`data:image/...;base64,...`): Used directly
- **HTTP URLs**: Passed through unchanged

---

## 7. Complete Data Flow Diagram

```
USER ACTION: Select File
    ↓
File Input Element
    ├─ NodeBlock inline upload (InputImageVisualizationEditable)
    └─ DetailPanel config upload (InputImageConfig)
    ↓
FileReader.readAsDataURL(file)
    ↓ Returns: "data:image/jpeg;base64,/9j/4AAQSk..."
Browser Canvas Processing (imageCompression.ts)
    ├─ Measure: getBase64Size() → bytes
    ├─ If size > 5MB:
    │   └─ Loop through quality levels (0.92 to 0.5)
    │       └─ canvas.toDataURL('image/jpeg', quality)
    │       └─ Measure new size
    │       └─ Break when size <= 5.5MB
    └─ Return: Optimized base64 data URL
    ↓ (Optional) processImageWithConfig
    ├─ Parse aspect ratio ("3:4" → 0.75)
    ├─ Center crop image on canvas
    ├─ Resize to max width (preserve aspect)
    ├─ Draw to canvas, output JPEG
    └─ Return: Cropped/resized base64 data URL
    ↓
onConfigChange('imageData', base64String)
    ↓ Updates node.config
Node Config Store (Zustand)
    ↓
EXECUTION: runNode()
    ↓
EXECUTE_FUNCTIONS['input-image']({}, config, onProgress)
    ├─ Extract config.imageData (base64 string)
    ├─ Create DataPacket:
    │   {
    │       value: "data:image/jpeg;base64,...",
    │       type: "image",
    │       timestamp: Date.now()
    │   }
    └─ Return: { out: packet }
    ↓
Output Routing
    ├─ Save to node.output (Zustand)
    ├─ WebSocket propagation to downstream nodes
    └─ Display in DetailPanel's renderDataPreview
    ↓
Image Display
    ├─ Check if S3 URL: isS3Url()
    ├─ If S3: resolveS3Image() → data URL (with cache)
    ├─ Render <S3Image> component
    └─ Use resolved data URL in <img src={}>
```

---

## 8. Configuration Fields

### Block Configuration Schema

The `input-image` block's `configSchema` defines how the UI renders config inputs:

```typescript
configSchema: [
    {
        key: 'imageData',
        type: 'file',
        label: 'Image',
        placeholder: 'Used when no input is connected',
    },
];
```

**Extended Config Options** (Advanced nodes like `image-resize`):

- `aspectRatio`: String like `"3:4"`, `"16:9"`, or `"free"`
- `maxWidth`: String number like `"1000"` (pixels)
- `bypass`: String boolean `"true"` or `"false"` (skip processing)

These are stored directly on `node.config` and passed to `processImageWithConfig()`.

---

## 9. Type Definitions

### DataPacket

```typescript
interface DataPacket {
    value: unknown; // Base64 string for images
    type: 'text' | 'image' | 'number' | 'json' | 'any';
    timestamp?: number;
}
```

### BlockDefinitionWithFrontend

```typescript
interface BlockDefinitionWithFrontend extends BlockDefinition {
    isFrontend?: boolean; // true = execute in browser
    execute?: (
        inputs: Record<string, DataPacket>,
        config: Record<string, any>,
        onProgress?: (percent: number) => void
    ) => Promise<Record<string, DataPacket>>;
}
```

---

## 10. Performance & Optimization Patterns

### 1. Lazy Compression

- Images < 5MB bypass compression entirely (zero overhead)
- Only trigger compression on upload, not on every render

### 2. S3 Caching

```typescript
// Prevent duplicate API calls for same S3 URL
imageCache.set(s3Url, dataUrl); // In-memory cache
pendingRequests.set(s3Url, promise); // Deduplication
```

### 3. Canvas Memory Cleanup

```typescript
canvas.width = 0;
canvas.height = 0; // Explicitly free memory after drawing
```

### 4. Debounced Image Loading

- `useS3Image` includes cancellation token to prevent state updates on unmounted components

### 5. Progress Reporting

```typescript
onProgress?.(100); // Frontend execution completes instantly
```

---

## 11. Error Handling

### Upload Errors

- **FileReader error**: Caught in `reader.onerror` handler
- **Compression failure**: Propagates to UI (promise rejection)
- **S3 Resolution failure**: Shown as error state in `S3Image` component

### Execution Errors

```typescript
if (!config.imageData) throw new Error('No image data provided');
```

### Type Coercion

- Config values stored as strings from server
- Parsed locally: `parseInt(config.maxWidth, 10)`
- Aspect ratio split: `config.aspectRatio.split(':')`

---

## 12. Key Implementation Insights

### Why Base64 Over File URLs?

- **Portability**: Embeds image data directly in config
- **Persistence**: Survives serialization to database
- **Server Compatibility**: Works with API Gateway 6MB limit when compressed
- **S3 Integration**: Can round-trip through S3 storage

### Why Canvas for Processing?

- **Pixel-perfect control**: Direct canvas drawing for cropping
- **Format conversion**: PNG → JPEG for compression
- **Quality tuning**: Dynamic quality adjustment during compression

### Why Dual-Format S3 Support?

- **Local uploads**: Store as data URLs in config
- **Server outputs**: Return as S3 URLs (s3://bucket/key)
- **Seamless resolution**: `useS3Image` abstracts both formats

### Deferred Processing

- Inline upload in NodeBlock: Basic compression only
- DetailPanel upload: Full `processImageWithConfig()` pipeline
- This allows quick feedback (inline) vs. advanced control (detail panel)

---

## 13. Related Components & Utilities

### Image Editor

- **Component**: `ImageEditorDialog` - Post-upload crop/rotate UI
- **Trigger**: "Edit" button in DetailPanel after image loads

### Image Download

- **Function**: `downloadImage()` in s3Utils.ts
- **Creates**: Temporary link with `link.download` attribute

### Image Info API

- **Endpoint**: `GET /nodes/0/image-info?s3Url=...`
- **Returns**: S3 metadata (bucket, key, size, etc.)

---

## 14. Testing Considerations

### Unit Tests

- Base64 size calculation accuracy
- Aspect ratio parsing edge cases
- Compression quality iteration loop
- S3 URL pattern detection

### Integration Tests

- File upload → config update flow
- S3 resolution with cache hits
- Image display with different formats
- Downstream node reception of image packet

### Visual Tests

- Upload UI state transitions (empty → uploading → loaded)
- Image preview rendering
- Editor dialog functionality
- Error states (bad S3 URL, oversized file)

---

## Summary

The image upload block implementation demonstrates a sophisticated pipeline:

1. **Multiple UI entry points** (inline vs. detail panel)
2. **Intelligent compression** (adaptive quality for file size limits)
3. **Advanced processing** (aspect ratio crop + resize via Canvas)
4. **Dual format support** (data URLs + S3 URLs with lazy resolution)
5. **Caching strategy** (in-memory cache + deduplication for S3 API calls)
6. **Clean execution model** (frontend execution with DataPacket output)

The key architectural insight is that image data flows through three phases:

- **Upload Phase**: File → Base64 with optional processing
- **Config Phase**: Base64 stored in node.config.imageData
- **Execution Phase**: Config value wrapped in DataPacket and propagated downstream
