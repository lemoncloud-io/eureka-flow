# Image Upload Block: Implementation Quick Reference

## Quick Navigation

| Component        | File                                                          | Purpose                      |
| ---------------- | ------------------------------------------------------------- | ---------------------------- |
| Block Definition | `/apps/web/src/app/features/flows/data/demo-blocks.ts`        | `input-image` block metadata |
| Inline UI        | `/apps/web/src/app/features/flows/components/NodeBlock.tsx`   | Canvas upload in node widget |
| Panel UI         | `/apps/web/src/app/features/flows/components/DetailPanel.tsx` | Config panel upload          |
| Execution        | `/libs/flows/src/api/execute-functions.ts`                    | Frontend execution function  |
| Compression      | `/libs/flows/src/utils/imageCompression.ts`                   | Adaptive JPEG compression    |
| Processing       | `/libs/flows/src/utils/imageProcessing.ts`                    | Crop & resize pipeline       |
| S3 Resolution    | `/libs/flows/src/utils/s3Utils.ts`                            | S3 URL → data URL cache      |
| Hook             | `/libs/flows/src/hooks/useS3Image.ts`                         | React hook for S3 resolution |
| Display          | `/apps/web/src/app/features/flows/components/S3Image.tsx`     | Image rendering component    |
| API              | `/libs/flows/src/api/nodes.ts`                                | `getImageFromS3()` endpoint  |

---

## The Complete Flow in 30 Seconds

```javascript
// 1. USER UPLOADS IMAGE
<input type="file" accept="image/*" onChange={handleImageUpload} />;

// 2. CONVERT TO BASE64
const reader = new FileReader();
reader.readAsDataURL(file); // → "data:image/jpeg;base64,/9j/4AAQSk..."

// 3. COMPRESS IF NEEDED (>5MB → target 5.5MB)
const { dataUrl: compressed } = await compressImageIfNeeded(base64);

// 4. OPTIONAL: CROP & RESIZE
const processed = await processImageWithConfig(compressed, {
    aspectRatio: '3:4',
    maxWidth: '1000',
    bypass: 'false',
});

// 5. SAVE TO CONFIG
node.config.imageData = processed;

// 6. EXECUTE NODE
const packet = {
    value: node.config.imageData,
    type: 'image',
    timestamp: Date.now(),
};
return { out: packet };

// 7. DOWNSTREAM NODES RECEIVE PACKET
// Can be rendered via <S3Image src={packet.value} />
```

---

## Code Reference by Task

### Task 1: Understanding Block Registration

**File**: `/apps/web/src/app/features/flows/data/demo-blocks.ts:33-52`

```typescript
const DEMO_BLOCKS: BlockDefinitionWithFrontend[] = [
    {
        id: '0009',
        type: 'input-image', // ← Unique block identifier
        label: 'User Image Input', // ← UI display name
        icon: '🖼️',
        stereo: 'input', // ← Block category
        isFrontend: true, // ← Executes in browser
        inputs: [], // ← No input ports
        outputs: [{ id: 'out', label: 'Image', type: 'image' }],
        defaultConfig: { imageData: '' },
        configSchema: [
            {
                // ← Defines config UI
                key: 'imageData', // ← Stored as node.config.imageData
                type: 'file', // ← Renders file upload input
                label: 'Image',
            },
        ],
    },
];
```

**Key Points**:

- `isFrontend: true` → Look for execution function in `EXECUTE_FUNCTIONS`
- `configSchema.type: 'file'` → System renders file input (handled by DetailPanel)
- No `execute` property → Uses EXECUTE_FUNCTIONS registry

---

### Task 2: File Upload & Base64 Encoding

**File 1**: `/apps/web/src/app/features/flows/components/NodeBlock.tsx:516-531` (Inline)

```typescript
const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async evt => {
            const dataUrl = evt.target?.result as string;
            // dataUrl is now: "data:image/jpeg;base64,/9j/4AAQSk..."
            if (dataUrl) {
                const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
                onConfigChange('imageData', compressed);
            }
            setIsUploading(false);
        };
        reader.readAsDataURL(file); // ← Converts file to base64
    }
};
```

**File 2**: `/apps/web/src/app/features/flows/components/DetailPanel.tsx:164-181` (Advanced)

```typescript
const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async evt => {
            const dataUrl = evt.target?.result as string;
            if (dataUrl) {
                // Apply crop + resize if configured
                const processed = await processImageWithConfig(dataUrl, {
                    aspectRatio: node.config?.aspectRatio,
                    maxWidth: node.config?.maxWidth,
                    bypass: node.config?.bypass,
                });
                onConfigChange('imageData', processed);
            }
        };
        reader.readAsDataURL(file);
    }
};
```

**Base64 Format**:

```
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8VAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k
```

---

### Task 3: Image Compression Algorithm

**File**: `/libs/flows/src/utils/imageCompression.ts:105-153`

```typescript
export const compressImageIfNeeded = async (dataUrl: string): Promise<CompressionResult> => {
    const originalSize = getBase64Size(dataUrl); // Measure size in bytes

    // Under threshold - no compression
    if (originalSize <= COMPRESSION_THRESHOLD) {
        // 5MB
        return {
            dataUrl,
            originalSize,
            compressedSize: originalSize,
            wasCompressed: false,
        };
    }

    // Over threshold - compress to target size
    const outputMimeType = 'image/jpeg';
    let quality = INITIAL_QUALITY; // 0.92
    let compressed = dataUrl;
    let compressedSize = originalSize;

    // Iteratively reduce quality until target size
    while (compressedSize > TARGET_SIZE && quality >= MIN_QUALITY) {
        //                    ↓ 5.5MB              ↓ 0.5
        compressed = await compressWithCanvas(dataUrl, quality, outputMimeType);
        compressedSize = getBase64Size(compressed);

        if (compressedSize <= TARGET_SIZE) break;

        quality -= QUALITY_STEP; // 0.05
    }

    return {
        dataUrl: compressed,
        originalSize,
        compressedSize,
        wasCompressed: true,
        quality,
    };
};
```

**Size Calculation**:

```typescript
const getBase64Size = (dataUrl: string): number => {
    const base64 = dataUrl.split(',')[1]; // Remove "data:image/jpeg;base64,"
    const padding = (base64.match(/=/g) || []).length;
    return Math.floor((base64.length * 3) / 4) - padding;
};
// Example: "abc=" has 1 padding char
// Size = floor((4 * 3) / 4) - 1 = 3 - 1 = 2 bytes
```

**Canvas Compression**:

```typescript
const compressWithCanvas = (dataUrl: string, quality: number, mimeType: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d')!;

            ctx.drawImage(img, 0, 0);

            // Convert with quality parameter
            const compressed = canvas.toDataURL(mimeType, quality);
            //                                          ↑ 0-1 scale
            resolve(compressed);
        };
        img.src = dataUrl;
    });
};
```

---

### Task 4: Crop & Resize Processing

**File**: `/libs/flows/src/utils/imageProcessing.ts:74-182`

#### Aspect Ratio Parsing

```typescript
export const parseAspectRatio = (ratio: string | undefined): number | undefined => {
    if (!ratio || ratio === 'free') return undefined;

    const parts = ratio.split(':');
    if (parts.length !== 2) return undefined;

    const w = Number(parts[0]);
    const h = Number(parts[1]);

    if (isNaN(w) || isNaN(h) || h === 0) return undefined;

    return w / h;
};

// Examples:
parseAspectRatio('3:4'); // → 0.75  (width / height)
parseAspectRatio('16:9'); // → 1.777...
parseAspectRatio('1:1'); // → 1.0
parseAspectRatio('free'); // → undefined (skip crop)
```

#### Center Crop Algorithm

```typescript
const cropAndResizeImage = (
    dataUrl: string,
    aspect: number | undefined,
    maxWidth: number | undefined
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let cropWidth = img.naturalWidth;
            let cropHeight = img.naturalHeight;
            let cropX = 0;
            let cropY = 0;

            // Center crop to target aspect ratio
            if (aspect) {
                const currentAspect = img.naturalWidth / img.naturalHeight;

                if (currentAspect > aspect) {
                    // Image wider than target → crop sides
                    cropWidth = Math.round(img.naturalHeight * aspect);
                    cropX = Math.round((img.naturalWidth - cropWidth) / 2); // Center horizontally
                } else if (currentAspect < aspect) {
                    // Image taller than target → crop top/bottom
                    cropHeight = Math.round(img.naturalWidth / aspect);
                    cropY = Math.round((img.naturalHeight - cropHeight) / 2); // Center vertically
                }
            }

            // Resize to max width
            let outputWidth = cropWidth;
            let outputHeight = cropHeight;

            if (maxWidth && outputWidth > maxWidth) {
                const ratio = maxWidth / outputWidth;
                outputWidth = maxWidth;
                outputHeight = Math.round(outputHeight * ratio);
            }

            // Draw to canvas
            const canvas = document.createElement('canvas');
            canvas.width = outputWidth;
            canvas.height = outputHeight;
            const ctx = canvas.getContext('2d')!;

            // Draw cropped source region to output canvas
            ctx.drawImage(
                img,
                cropX,
                cropY,
                cropWidth,
                cropHeight, // Source region
                0,
                0,
                outputWidth,
                outputHeight // Target region
            );

            const result = canvas.toDataURL('image/jpeg', 0.9);

            // Free memory
            canvas.width = 0;
            canvas.height = 0;

            resolve(result);
        };
        img.src = dataUrl;
    });
};
```

#### Main Processing Function

```typescript
export const processImageWithConfig = async (dataUrl: string, config: ImageProcessConfig): Promise<string> => {
    const bypass = config.bypass === 'true';
    const hasConfig = config.aspectRatio !== undefined || config.maxWidth !== undefined;

    // Bypass mode: compress only
    if (bypass || !hasConfig) {
        const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
        return compressed;
    }

    // Parse config
    const aspect = parseAspectRatio(config.aspectRatio);
    const maxWidth = config.maxWidth ? parseInt(config.maxWidth, 10) : undefined;

    if (!aspect && !maxWidth) {
        const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
        return compressed;
    }

    // Full pipeline: crop → resize → compress
    const processed = await cropAndResizeImage(dataUrl, aspect, maxWidth);
    const { dataUrl: compressed } = await compressImageIfNeeded(processed);

    return compressed;
};
```

---

### Task 5: Execution Function

**File**: `/libs/flows/src/api/execute-functions.ts:43-48`

```typescript
export const EXECUTE_FUNCTIONS: Record<string, ExecuteFunction> = {
    'input-image': async (_inputs, config, onProgress) => {
        if (!config.imageData) throw new Error('No image data provided');
        onProgress?.(100); // Frontend execution is instant
        return {
            out: createPacket(config.imageData, 'image'),
        };
    },
};

// Helper
const createPacket = (value: unknown, type: 'text' | 'image' | 'number') => ({
    value,
    type,
    timestamp: Date.now(),
});
```

**Execution Model**:

- **Inputs**: None for input blocks (single underscore parameter)
- **Config**: `{ imageData: "data:image/jpeg;base64,..." }`
- **Progress**: Called with 100 to indicate completion
- **Output**: `{ out: DataPacket }` object (matches block's output port ID 'out')

---

### Task 6: S3 Image Resolution

**File 1**: `/libs/flows/src/hooks/useS3Image.ts:20-67`

```typescript
export const useS3Image = (value: string | undefined | null): UseS3ImageResult => {
    const [src, setSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!value) {
            setSrc(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        // Non-S3 URLs (data URLs, http) → use directly
        if (!isS3Url(value)) {
            setSrc(value);
            setIsLoading(false);
            return;
        }

        // S3 URL → fetch via API
        let cancelled = false;
        setIsLoading(true);
        setError(null);

        resolveS3Image(value)
            .then(dataUrl => {
                if (!cancelled) setSrc(dataUrl); // Prevent state update if unmounted
                setIsLoading(false);
            })
            .catch(err => {
                if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load image'));
                setSrc(null);
                setIsLoading(false);
            });

        return () => {
            cancelled = true; // Cleanup on unmount
        };
    }, [value]);

    return { src, isLoading, error };
};
```

**File 2**: `/libs/flows/src/utils/s3Utils.ts:35-62`

```typescript
// In-memory caching
const imageCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string>>();

export const resolveS3Image = async (s3Url: string): Promise<string> => {
    // Return cached result
    const cached = imageCache.get(s3Url);
    if (cached) return cached;

    // Return pending request (prevent duplicate API calls)
    const pending = pendingRequests.get(s3Url);
    if (pending) return pending;

    // Create new request
    const request = getImageFromS3(s3Url)
        .then(dataUrl => {
            imageCache.set(s3Url, dataUrl);
            pendingRequests.delete(s3Url);
            return dataUrl;
        })
        .catch(err => {
            pendingRequests.delete(s3Url);
            throw err;
        });

    pendingRequests.set(s3Url, request);
    return request;
};
```

**File 3**: `/libs/flows/src/api/nodes.ts:247-261`

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

    // Reconstruct data URL
    return `data:${contentType};base64,${base64Body}`;
};
```

**URL Pattern Detection**:

```typescript
const S3_URL_PATTERN = /^s3:\/\//;
export const isS3Url = (value: unknown): value is string => {
    return typeof value === 'string' && S3_URL_PATTERN.test(value);
};
```

---

### Task 7: Image Display

**File**: `/apps/web/src/app/features/flows/components/S3Image.tsx:24-46`

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
        return (
            <div className="text-destructive">
                <X />
            </div>
        );
    }

    // Render image with resolved URL
    return <img src={resolvedSrc} alt={alt} className={className} onLoad={onLoad} />;
};
```

**Usage in DetailPanel**:

```typescript
<S3Image
    src={img}  // Can be data URL or S3 URL
    alt="Preview"
    className="max-w-full max-h-full object-contain"
/>
```

---

## Critical Constants

```typescript
// Compression thresholds
const COMPRESSION_THRESHOLD = 5 * 1024 * 1024;      // 5MB
const TARGET_SIZE = 5.5 * 1024 * 1024;              // 5.5MB
const INITIAL_QUALITY = 0.92;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.05;

// Image processing
const OUTPUT_QUALITY = 0.9;  // Canvas output JPEG quality

// Aspect ratios
{
    '1:1': 1,       // Square
    '4:3': 1.333,   // Landscape
    '3:4': 0.75,    // Portrait
    '16:9': 1.777,  // Widescreen
    'free': undefined // No crop
}
```

---

## State Management Locations

| State                 | Store                 | Type                   | Key                     |
| --------------------- | --------------------- | ---------------------- | ----------------------- |
| Image config (base64) | Node config           | String                 | `node.config.imageData` |
| Upload UI state       | Local React state     | Boolean                | `isUploading`           |
| S3 image cache        | Module-level Map      | `Map<string, string>`  | `imageCache`            |
| Pending S3 requests   | Module-level Map      | `Map<string, Promise>` | `pendingRequests`       |
| Rendered image data   | useS3Image hook state | String \| null         | `src`                   |
| Data packet output    | Node output           | DataPacket             | `node.output['out']`    |

---

## Configuration & Environment

### Block Registration

- **Location**: `DEMO_BLOCKS` array in demo-blocks.ts
- **Availability**: Hardcoded for offline demo mode
- **Server Alternative**: API response from `GET /blocks/0/list`

### Execute Function Registration

- **Location**: `EXECUTE_FUNCTIONS` record in execute-functions.ts
- **Lookup**: `EXECUTE_FUNCTIONS[blockType]` by block.type
- **Fallback**: None (throws error if not found for isFrontend blocks)

### API Endpoints

- **Compression**: Entirely client-side (no API call)
- **S3 Resolution**: `GET /nodes/0/image?s3Url=...`
- **Image Metadata**: `GET /nodes/0/image-info?s3Url=...` (optional)
- **Execution**: `POST /nodes/:nodeId/run` (server receives DataPacket output)

---

## Debugging Tips

### Check if Image is Compressing

```typescript
// In console
const { dataUrl: compressed, wasCompressed } = await compressImageIfNeeded(myDataUrl);
console.log(wasCompressed); // true if size > 5MB
```

### Trace S3 Resolution

```typescript
// In console
const result = await resolveS3Image('s3://bucket/key.png');
console.log(result.substring(0, 50)); // Should start with "data:image/"
```

### Verify DataPacket Format

```typescript
// In DetailPanel, check node.output
console.log(node.output);
// {
//   out: {
//     value: "data:image/jpeg;base64,...",
//     type: "image",
//     timestamp: 1234567890
//   }
// }
```

### Check Compression Logs

```typescript
// Open DevTools Console
// Should see: "[imageCompression] 8.45MB → 4.23MB (50.0% saved, quality: 0.77)"
```

---

## Quick Troubleshooting

| Problem                    | Cause                    | Solution                                         |
| -------------------------- | ------------------------ | ------------------------------------------------ |
| Image not showing          | S3 URL resolution failed | Check network tab for `/nodes/0/image?s3Url=...` |
| Upload button doesn't work | Event bubbling stopped   | Remove `stopPropagation()` from parent handlers  |
| Compression not triggered  | File < 5MB               | Upload larger image to test                      |
| Canvas error               | 2D context null          | Check browser canvas support                     |
| S3 cache bloat             | Old images never cleared | Call `clearS3ImageCache()` manually              |
| Aspect ratio ignored       | `bypass: "true"`         | Set `bypass: "false"` in config                  |
