# Image Upload Block Research: Executive Summary

## What You're Looking At

This is a **frontend-executable image upload block** in a visual workflow editor. Users drag the `input-image` block onto a canvas, upload an image file through the UI, and the image flows downstream as a base64-encoded DataPacket.

**Key characteristic**: The entire image processing pipeline (compression, cropping, resizing) happens in the browser—zero server-side processing for the upload itself.

---

## The Five-Minute Version

### 1. Block Definition

```typescript
// Block registered in demo-blocks.ts
{
    type: 'input-image',
    isFrontend: true,                    // ← Executes in browser
    configSchema: [{ key: 'imageData', type: 'file' }],
    outputs: [{ id: 'out', type: 'image' }]
}
```

### 2. User Uploads Image

```typescript
// NodeBlock.tsx or DetailPanel.tsx
<input type="file" accept="image/*" onChange={handleImageUpload} />
↓
FileReader.readAsDataURL(file)  // → "data:image/jpeg;base64,..."
↓
(Optional) compressImageIfNeeded(dataUrl)  // If > 5MB
↓
(Optional) processImageWithConfig(dataUrl)  // Crop + resize
↓
node.config.imageData = processedDataUrl
```

### 3. Node Executes

```typescript
// execute-functions.ts
'input-image': async (_inputs, config, onProgress) => {
    return {
        out: {
            value: config.imageData,  // Base64 string
            type: 'image',
            timestamp: Date.now()
        }
    };
}
```

### 4. Image Flows Downstream

```typescript
// WebSocket propagation
DataPacket {
    value: "data:image/jpeg;base64,...",
    type: 'image',
    timestamp: 1234567890
}
↓
Connected nodes receive packet in node.input ports
↓
Can be displayed via <S3Image src={packet.value} />
```

---

## The Smart Parts

### 1. Adaptive Image Compression

**Problem**: Base64 images can exceed 6MB API Gateway limit.

**Solution**:

- Measure base64 size: `Math.floor((base64.length * 3) / 4) - padding`
- Only compress if > 5MB (avoids overhead for smaller files)
- Iteratively reduce JPEG quality (0.92 → 0.5) until ≤ 5.5MB
- Browser Canvas handles the actual encoding

**Code**: `/libs/flows/src/utils/imageCompression.ts`

### 2. Canvas-Based Crop + Resize

**Problem**: Need pixel-perfect aspect ratio cropping while preserving quality.

**Solution**:

- Parse aspect ratio: `"3:4"` → `0.75` (width/height)
- Calculate center crop region based on current vs. target aspect
- Draw cropped source region to output canvas
- Resize to max width while maintaining aspect
- Output as JPEG with 0.9 quality

**Example**: 2000×1500 image with `aspectRatio: "3:4"` and `maxWidth: 1000`

```
Current aspect: 2000/1500 = 1.333 (wider than target)
→ Crop left/right: 1125×1500 (centered)
→ Resize to max width: 1000×1333
→ Output: 1000×1333 JPEG
```

**Code**: `/libs/flows/src/utils/imageProcessing.ts`

### 3. Dual-Format S3 Support with Caching

**Problem**: Some images from server come as S3 URLs (`s3://bucket/key`), others as data URLs.

**Solution**:

- `useS3Image` hook abstracts both formats
- S3 URLs → resolved via API to data URLs
- In-memory cache prevents duplicate API calls
- Pending request map deduplicates concurrent requests
- Non-S3 URLs passed through unchanged

**Cache Strategy**:

```typescript
const imageCache = new Map<string, string>(); // Resolved results
const pendingRequests = new Map<string, Promise>(); // Deduplication

// First call: API request + cache
// Second call: Return immediately from cache
// Concurrent calls: Share same promise
```

**Code**: `/libs/flows/src/utils/s3Utils.ts`, `/libs/flows/src/hooks/useS3Image.ts`

---

## Architecture Patterns

### 1. Frontend Execution Model

```
Block flagged: isFrontend = true
    ↓
WorkflowCanvas calls: EXECUTE_FUNCTIONS[blockType](inputs, config, onProgress)
    ↓
Runs immediately in browser (no server round-trip)
    ↓
Returns DataPacket output
    ↓
Updates node.output store
    ↓
WebSocket notifies downstream nodes
```

### 2. Configuration-Driven Processing

Block definition includes `configSchema` that tells DetailPanel how to render config inputs:

```typescript
configSchema: [
    {
        key: 'imageData',
        type: 'file',
        label: 'Image',
    },
];
```

The node stores config values in `node.config`, accessible during execution as `config.imageData`.

### 3. Multiple UI Entry Points

- **Inline** (NodeBlock): Quick upload, basic compression
- **Detail Panel** (DetailPanel): Advanced config, image editor, download

Both write to same `node.config.imageData`, allowing users to upload via either path.

### 4. DataPacket Abstraction

All outputs wrapped in standardized DataPacket:

```typescript
{
    value: unknown,        // The actual data (base64 string for images)
    type: 'image',         // Type hint for rendering
    timestamp: number      // When data was generated
}
```

Allows system to route data by type and provide type-aware rendering.

---

## Key Files & Responsibilities

| File                   | Responsibility                          |
| ---------------------- | --------------------------------------- |
| `demo-blocks.ts`       | Block registration & metadata           |
| `NodeBlock.tsx`        | Inline image upload UI in canvas widget |
| `DetailPanel.tsx`      | Advanced config panel UI with editor    |
| `execute-functions.ts` | Frontend execution logic                |
| `imageCompression.ts`  | Adaptive JPEG quality compression       |
| `imageProcessing.ts`   | Aspect ratio crop + max width resize    |
| `s3Utils.ts`           | S3 URL detection & caching              |
| `useS3Image.ts`        | React hook for S3 resolution            |
| `S3Image.tsx`          | Display component handling both formats |
| `nodes.ts`             | API: `getImageFromS3()` endpoint        |

---

## The Compression Algorithm Explained

```
INPUT: "data:image/jpeg;base64,/9j/4AAQ..." (8MB)

1. Measure size
   base64 length = 10,616,832 characters
   size = floor((10616832 * 3) / 4) - padding = 8,388,608 bytes

2. Compare to threshold
   8,388,608 > 5,242,880 → Compress

3. Start quality iterations
   quality = 0.92
   Loop:
     canvas.toDataURL('image/jpeg', 0.92)
     Measure new size
     If size ≤ 5,767,104: break
     quality -= 0.05 → 0.87

   Iteration 1: quality=0.92 → 7.2MB (still too big)
   Iteration 2: quality=0.87 → 5.8MB (still too big)
   Iteration 3: quality=0.82 → 5.1MB ✓ Done!

4. Return compressed result
   dataUrl: "data:image/jpeg;base64,..." (5.1MB)
   quality: 0.82
   wasCompressed: true
   savedPercent: 39%
```

**Why this approach?**

- Preserves quality for reasonable file sizes (< 5MB uncompressed)
- Guaranteed to fit in 6MB API Gateway limit (targeting 5.5MB)
- Exponential search would be overkill (fixed max 10 iterations)
- Browser Canvas handles encoding (no external library needed)

---

## Data Flow Summary

```
FileReader.readAsDataURL(file)
    ↓ "data:image/jpeg;base64,/9j/..."
compressImageIfNeeded() [optional]
    ↓ "data:image/jpeg;base64,...optimized"
processImageWithConfig() [optional, DetailPanel only]
    ↓ "data:image/jpeg;base64,...cropped_resized"
Zustand store: node.config.imageData = value
    ↓
User runs node
    ↓
EXECUTE_FUNCTIONS['input-image']({ imageData: value }, ...)
    ↓
return { out: { value, type: 'image', timestamp } }
    ↓
node.output['out'] = DataPacket
    ↓
WebSocket: type='node', status='COMPLETED'
    ↓
Downstream nodes:
  - Receive DataPacket in node.input['in']
  - Can render via <S3Image src={packet.value} />
  - Can pass to image processing blocks
```

---

## Performance Characteristics

### Time

- **Upload (no compression)**: O(file size) - FileReader I/O
- **Compression iteration**: O(1) fixed - max 10 iterations (0.92 to 0.5 by -0.05 steps)
- **Crop + resize**: O(width × height) - Canvas draw
- **S3 resolution (cache hit)**: O(1) - Map lookup
- **S3 resolution (API)**: O(file size) - Network + decode

### Memory

- **Base64 storage**: ~1.33× file size
- **Canvas buffer**: width × height × 4 bytes (RGBA)
- **S3 cache**: One entry per unique S3 URL (unbounded)

### Optimization Opportunities

1. **Web Worker**: Move compression to background thread
2. **Streaming**: Chunk large file reads
3. **IndexedDB**: Persistent S3 cache
4. **Lazy Loading**: Defer S3 resolution until image renders
5. **TensorFlow.js**: GPU-accelerated image processing

---

## Error Handling

| Error Type                | Handling                                                       |
| ------------------------- | -------------------------------------------------------------- |
| File read error           | Caught in `reader.onerror` callback                            |
| Compression error         | Promise rejection, config not updated                          |
| Processing error          | Promise rejection, config not updated                          |
| No imageData at execution | `throw new Error('No image data provided')` → Node ERROR state |
| Invalid S3 URL            | `isS3Url()` returns false → use directly                       |
| S3 API failure            | Caught in `resolveS3Image()` → `S3Image` shows error state     |
| Canvas context error      | Caught in `getContext()` check                                 |

---

## Testing Checklist

### Unit Tests

- [ ] `getBase64Size()` with various padding
- [ ] `parseAspectRatio()` edge cases
- [ ] Compression iteration loop termination
- [ ] Crop calculation (centered, all four edges)
- [ ] Resize calculations (aspect preservation)
- [ ] S3 URL pattern detection
- [ ] Cache hit/miss behavior

### Integration Tests

- [ ] File upload → compression → config update
- [ ] Config update → node state change
- [ ] Node execution → DataPacket creation
- [ ] DataPacket → downstream node reception
- [ ] S3 URL → API call → cache → reuse

### E2E Tests

- [ ] Upload image in inline widget
- [ ] Edit image in DetailPanel
- [ ] Run node, see output in connected node
- [ ] Download image from DetailPanel
- [ ] Verify image dimensions in image-info block output

---

## Real-World Scenarios

### Scenario 1: User uploads 8MB photo

```
1. Select file (8MB JPEG)
2. FileReader.readAsDataURL() → 10.6MB base64
3. compressImageIfNeeded() detected > 5MB threshold
4. Iteration loop: quality 0.92 → 0.82 (3 iterations)
5. Result: 5.1MB base64 ✓
6. Config saved
7. Run node → Downstream receives 5.1MB base64 packet
```

### Scenario 2: User crops square from landscape photo

```
1. Upload 4000×3000 photo
2. DetailPanel shows config: aspectRatio="1:1", maxWidth="1000"
3. Select file
4. processImageWithConfig() called:
   - Center crop: 3000×3000 (square, centered)
   - Resize: 1000×1000 (max width)
   - Output: ~350KB JPEG ✓
5. Optional compression: skipped (< 5MB)
6. Run node → Downstream receives 350KB base64 packet
```

### Scenario 3: User receives image from server

```
1. Previous node returned: { type: 'image', value: "s3://bucket/photo.jpg" }
2. DetailPanel displays image
3. <S3Image src="s3://bucket/photo.jpg" />
4. useS3Image detects S3 URL
5. resolveS3Image() API call: GET /nodes/0/image?s3Url=...
6. Response: { body: "base64content", headers: { "Content-Type": "image/jpeg" } }
7. Constructs: "data:image/jpeg;base64,base64content"
8. Cache stores result → next render hits cache
9. <img src="data:image/jpeg;base64,..."> renders
```

---

## Key Insights for Implementation

1. **Base64 is the wire format** - All images flow through the system as base64 data URLs. This enables easy serialization and S3 round-tripping.

2. **Compression is mandatory** - 6MB API Gateway limit means without compression, large images would fail silently. Adaptive quality prevents file size surprises.

3. **Canvas is the pixel engine** - All image transformations (crop, resize, compress) use native Canvas API. No image library dependency.

4. **Caching prevents O(n²)** - With deduplication, concurrent requests for same S3 URL share one promise. Without it, 10 nodes all requesting same S3 image would make 10 API calls.

5. **S3 abstraction hides complexity** - Whether image comes from file upload (data URL) or server output (S3 URL), `useS3Image` handles resolution seamlessly.

6. **DataPacket enables flexibility** - Output type hint allows system to detect images vs. text vs. JSON. Same routing infrastructure works for all types.

---

## Related Patterns in Codebase

These patterns appear in other blocks too:

- **text-transform**: Frontend execution, config-based behavior
- **buffer-delay**: Frontend execution, progress reporting
- **image-info**: Frontend execution, data transformation
- **output-console**: Frontend execution, no-op with logging
- **length-validator**: Frontend execution, validation logic

The image block is the most complex because it involves:

- File I/O (FileReader)
- Canvas manipulation (compression, crop, resize)
- Async processing (loading, compression, S3 resolution)
- Multi-step pipeline (upload → process → store → execute → route)

---

## Conclusion

The image upload block demonstrates sophisticated browser-based image processing wrapped in a clean abstraction. The architecture elegantly handles:

1. **Multiple input paths** (inline vs. panel)
2. **Complex processing** (compression + crop + resize)
3. **Format flexibility** (data URLs + S3 URLs)
4. **Performance** (caching + lazy loading)
5. **Error resilience** (error boundaries + fallbacks)

This is a reference implementation for "how to handle binary data in a visual workflow editor."

---

## Quick Reference: Essential Functions

```typescript
// FILE: imageCompression.ts
export const compressImageIfNeeded(dataUrl): CompressionResult
export const getBase64Size(dataUrl): number
export const formatFileSize(bytes): string

// FILE: imageProcessing.ts
export const processImageWithConfig(dataUrl, config): Promise<string>
export const parseAspectRatio(ratio): number | undefined

// FILE: s3Utils.ts
export const isS3Url(value): boolean
export const resolveS3Image(s3Url): Promise<string>
export const downloadImage(dataUrl): void

// FILE: nodes.ts (API)
export const getImageFromS3(s3Url): Promise<string>
export const getImageInfo(s3Url): Promise<S3ImageInfo>

// FILE: execute-functions.ts
export const EXECUTE_FUNCTIONS['input-image']: ExecuteFunction

// FILE: useS3Image.ts (Hook)
export const useS3Image(value): UseS3ImageResult
```

---

## Documentation Files Generated

1. **IMAGE_UPLOAD_BLOCK_RESEARCH.md** - Complete technical deep-dive
2. **IMAGE_UPLOAD_IMPLEMENTATION_GUIDE.md** - Code snippets by task
3. **IMAGE_BLOCK_ARCHITECTURE.md** - Visual diagrams & data flows
4. **IMAGE_UPLOAD_RESEARCH_SUMMARY.md** - This file (executive summary)

All files located in: `/Users/tak/workspace/lemoncloud/codes/eureka-flow/`
