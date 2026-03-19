# Image Upload Block: Architecture & Data Flow Diagrams

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser Frontend                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  React Components                         │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                            │   │
│  │  ┌─────────────────────┐         ┌──────────────────────┐  │   │
│  │  │   NodeBlock.tsx     │         │  DetailPanel.tsx     │  │   │
│  │  │                     │         │                      │  │   │
│  │  │ InputImageVisual    │         │ InputImageConfig     │  │   │
│  │  │ izationEditable     │         │                      │  │   │
│  │  │                     │         │ - Advanced UI        │  │   │
│  │  │ - Quick upload      │         │ - Image editor       │  │   │
│  │  │ - Inline preview    │         │ - Download button    │  │   │
│  │  └─────────────────────┘         └──────────────────────┘  │   │
│  │                                                            │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │      File Upload Pipeline                            │  │   │
│  │  ├──────────────────────────────────────────────────────┤  │   │
│  │  │                                                       │  │   │
│  │  │  <input type="file" />                               │  │   │
│  │  │        ↓                                              │  │   │
│  │  │  FileReader.readAsDataURL()                          │  │   │
│  │  │        ↓ (base64)                                    │  │   │
│  │  │  ┌─────────────────────────────────────┐             │  │   │
│  │  │  │ imageCompression.ts                 │             │  │   │
│  │  │  │ compressImageIfNeeded()             │             │  │   │
│  │  │  │ - Measure: getBase64Size()          │             │  │   │
│  │  │  │ - If > 5MB: compress via Canvas    │             │  │   │
│  │  │  │ - Iterate quality: 0.92 → 0.5      │             │  │   │
│  │  │  │ - Stop when size ≤ 5.5MB           │             │  │   │
│  │  │  └─────────────────────────────────────┘             │  │   │
│  │  │        ↓ (optional)                                  │  │   │
│  │  │  ┌─────────────────────────────────────┐             │  │   │
│  │  │  │ imageProcessing.ts                  │             │  │   │
│  │  │  │ processImageWithConfig()            │             │  │   │
│  │  │  │ - Parse aspect ratio ("3:4")        │             │  │   │
│  │  │  │ - Center crop on canvas             │             │  │   │
│  │  │  │ - Resize to maxWidth                │             │  │   │
│  │  │  │ - Output JPEG (quality: 0.9)        │             │  │   │
│  │  │  │ - Re-compress result                │             │  │   │
│  │  │  └─────────────────────────────────────┘             │  │   │
│  │  │        ↓ (base64)                                    │  │   │
│  │  │  node.config.imageData = base64String               │  │   │
│  │  │        ↓ (Zustand store)                             │  │   │
│  │  │  Node Config Persisted                               │  │   │
│  │  │                                                       │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Execution Pipeline                          │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                            │   │
│  │  User clicks "Run Node"                                  │   │
│  │        ↓                                                  │   │
│  │  EXECUTE_FUNCTIONS['input-image'](                       │   │
│  │    inputs={},                                            │   │
│  │    config={ imageData: "data:..." },                     │   │
│  │    onProgress                                            │   │
│  │  )                                                        │   │
│  │        ↓                                                  │   │
│  │  Create DataPacket {                                     │   │
│  │    value: config.imageData,                             │   │
│  │    type: 'image',                                        │   │
│  │    timestamp: Date.now()                                │   │
│  │  }                                                        │   │
│  │        ↓                                                  │   │
│  │  Return { out: packet }                                  │   │
│  │        ↓ (Zustand store)                                │   │
│  │  node.output.out = packet                                │   │
│  │        ↓ (WebSocket)                                     │   │
│  │  Propagate to downstream nodes                           │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Image Display Pipeline                         │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                            │   │
│  │  <S3Image src={packet.value || "s3://..."} />            │   │
│  │        ↓                                                  │   │
│  │  useS3Image(src)                                         │   │
│  │    ├─ If data URL: return as-is                         │   │
│  │    └─ If S3 URL:                                         │   │
│  │         ↓                                                 │   │
│  │         resolveS3Image(s3Url)                            │   │
│  │           ├─ Check imageCache (Map)                     │   │
│  │           ├─ Check pendingRequests (Map)                │   │
│  │           └─ If miss:                                    │   │
│  │              API: GET /nodes/0/image?s3Url=...           │   │
│  │                ↓                                          │   │
│  │              Cache result & return                        │   │
│  │        ↓                                                  │   │
│  │  <img src={resolvedDataUrl} />                           │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                             ↓↑
              ┌──────────────────────────────┐
              │   Backend API Server         │
              ├──────────────────────────────┤
              │ POST /nodes/:id/run          │
              │ GET /nodes/0/image?s3Url=... │
              │ GET /nodes/0/image-info      │
              └──────────────────────────────┘
```

---

## Detailed: Image Compression Algorithm

```
INPUT: dataUrl = "data:image/jpeg;base64,/9j/4AAQSk..."

Step 1: Measure Original Size
  getBase64Size(dataUrl)
  - Split on comma: ["data:image/jpeg;base64", "base64content"]
  - Count padding chars (=)
  - Return: Math.floor((b64length * 3) / 4) - padding

  originalSize = 8,388,608 bytes (8MB) ✗ Exceeds 5MB threshold

Step 2: Determine MIME Type
  getMimeType(dataUrl)
  - Extract from "data:image/jpeg;base64"
  - Return: "image/jpeg"

  outputMimeType = "image/jpeg"

Step 3: Iterative Compression Loop

  Iteration 1: quality = 0.92
  ┌──────────────────────────────────────────────────┐
  │ img = new Image()                                │
  │ img.src = dataUrl                                │
  │ canvas.width = img.width                         │
  │ canvas.height = img.height                       │
  │ ctx.drawImage(img, 0, 0)                         │
  │ compressed = canvas.toDataURL(mime, 0.92)       │
  │ compressedSize = getBase64Size(compressed)       │
  │ Result: 7,340,032 bytes (7MB) - Still > 5.5MB   │
  └──────────────────────────────────────────────────┘

  Iteration 2: quality = 0.87
  ┌──────────────────────────────────────────────────┐
  │ [Same process]                                   │
  │ Result: 5,767,168 bytes (5.5MB) - Still > 5.5MB │
  └──────────────────────────────────────────────────┘

  Iteration 3: quality = 0.82
  ┌──────────────────────────────────────────────────┐
  │ [Same process]                                   │
  │ Result: 5,242,880 bytes (5MB) - ✓ Below target! │
  │ BREAK LOOP                                       │
  └──────────────────────────────────────────────────┘

Step 4: Log Result
  originalSize:   8,388,608 bytes (8.00MB)
  compressedSize: 5,242,880 bytes (5.00MB)
  savedPercent:   (1 - 5.0/8.0) * 100 = 37.5%
  quality:        0.82

  Console: "[imageCompression] 8.00MB → 5.00MB (37.5% saved, quality: 0.82)"

OUTPUT: {
  dataUrl: "data:image/jpeg;base64,...",
  originalSize: 8388608,
  compressedSize: 5242880,
  wasCompressed: true,
  quality: 0.82
}
```

---

## Detailed: Crop & Resize Algorithm

```
CONFIG:
  aspectRatio: "3:4"    → aspect = 0.75 (width/height)
  maxWidth: "1000"      → maxWidth = 1000
  bypass: "false"       → process = true

INPUT IMAGE: 2000×1500 pixels (aspect = 1.333, wider than target)

Step 1: Parse Aspect Ratio
  parseAspectRatio("3:4")
  return 3/4 = 0.75

Step 2: Center Crop to Target Aspect
  currentAspect = 2000 / 1500 = 1.333
  targetAspect = 0.75

  Comparison: currentAspect (1.333) > targetAspect (0.75)
  → Image is wider than target → crop left/right sides

  cropWidth = round(1500 * 0.75) = 1125
  cropX = round((2000 - 1125) / 2) = 438  (center horizontally)
  cropY = 0
  cropHeight = 1500

  Cropped region: 1125×1500 at (438, 0)

Step 3: Resize to Max Width
  outputWidth = 1125
  outputHeight = 1500

  Compare: outputWidth (1125) > maxWidth (1000)
  → Resize to fit max width

  ratio = 1000 / 1125 = 0.889
  outputWidth = 1000
  outputHeight = round(1500 * 0.889) = 1333

Step 4: Draw to Canvas
  canvas.width = 1000
  canvas.height = 1333

  ctx.drawImage(
    img,
    438, 0, 1125, 1500,          // Source: crop region
    0, 0, 1000, 1333              // Target: entire canvas
  )

  result = canvas.toDataURL('image/jpeg', 0.9)

Step 5: Re-compress Result
  Call compressImageIfNeeded(result)
  If still > 5MB, apply adaptive quality compression

OUTPUT IMAGE: 1000×1333 pixels (aspect = 0.75 ✓), base64 data URL
```

---

## Data Structure Flows

### Block Registration Flow

```
DEMO_BLOCKS array
    ↓
{
    type: 'input-image'
    isFrontend: true
    configSchema: [{
        key: 'imageData'
        type: 'file'
    }]
}
    ↓
useBlockRegistry() hook
    ↓
Sidebar renders block in "Input" category
User drags block to canvas
    ↓
WorkflowCanvas.addNode(blockId)
    ↓
Creates NodeData {
    id: 'node_1234567890'
    blockId: '0009'
    config: { imageData: '' }
    output: {}
    position: { x, y }
}
    ↓
Stored in useCanvasStore (Zustand)
```

### Configuration Update Flow

```
User selects file via <input type="file">
    ↓
handleImageUpload(event)
    ├─ FileReader.readAsDataURL(file)
    └─ reader.onload
        ├─ dataUrl = evt.target.result
        ├─ compressImageIfNeeded(dataUrl)
        ├─ (optional) processImageWithConfig(dataUrl, config)
        └─ onConfigChange('imageData', processedDataUrl)
    ↓
onConfigChange callback
    ├─ In NodeBlock: updateNodeConfig(nodeId, 'imageData', value)
    ├─ In DetailPanel: updateNodeConfig(nodeId, 'imageData', value)
    └─ Both route to: useCanvasStore.setState({
           nodes: [..., {
               ...node,
               config: { imageData: value }
           }]
       })
    ↓
Node visually updated with image preview
useCanvasStore subscribers notified
```

### Execution Flow

```
User clicks "Run" button on node
    ↓
handleTriggerNode(nodeId)
    ↓
executeNode(nodeId, { async: false })
    ↓
Fetch block definition from useBlockRegistry
    ↓
Check: definition.isFrontend === true
    ↓
Lookup: EXECUTE_FUNCTIONS['input-image']
    ↓
Call: EXECUTE_FUNCTIONS['input-image'](
    inputs: {},
    config: node.config,  // { imageData: "data:image/jpeg;base64,..." }
    onProgress: (percent) => { ... }
)
    ├─ Check config.imageData exists
    ├─ onProgress(100)
    └─ Return { out: {
           value: config.imageData,
           type: 'image',
           timestamp: Date.now()
       }}
    ↓
Update node.output.out in store
    ↓
WebSocket broadcast:
{
    type: 'node',
    id: nodeId,
    flowId: flowId,
    status: 'COMPLETED'
}
    ↓
Downstream nodes receive update
Trigger recomputation of connected nodes
```

### Data Packet Routing Flow

```
EXECUTE_FUNCTIONS['input-image'] returns:
{ out: {
    value: "data:image/jpeg;base64,/9j/...",
    type: 'image',
    timestamp: 1234567890
}}
    ↓
Store in useCanvasStore:
node.output = {
    'out': {
        value: "data:image/jpeg;base64,...",
        type: 'image',
        timestamp: 1234567890
    }
}
    ↓
Downstream node port receives:
node.input = {
    'in': {  // if connected
        value: "data:image/jpeg;base64,...",
        type: 'image',
        timestamp: 1234567890
    }
}
    ↓
Downstream block execution:
For 'image-info':
    img = new Image()
    img.src = inputs['in'].value
    img.onload = () => {
        return { out: {
            value: `Width: ${img.width}px, Height: ${img.height}px`,
            type: 'text'
        }}
    }
```

---

## UI State Machine: Image Upload Component

```
┌─────────────────────────────────────────────────────────────┐
│                  InputImageVisualizationEditable             │
│                  (Inline node upload)                        │
└─────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   Initial       │
                    │  (img === '')   │
                    └────────┬────────┘
                             │
                    User clicks upload area
                             │
                             ↓
                    ┌─────────────────┐
                    │  Uploading      │
        ┌──────────▶│ (isUploading)   │◀──────────┐
        │           └────────┬────────┘           │
        │                    │                    │
        │       FileReader   │                    │
        │       completes    │                    │
        │            (file read error)           │
        │            |                            │
        │            └────────────────────────────┘
        │
        ├─ Call: compressImageIfNeeded()
        │
        └─▶ ┌─────────────────┐
            │   Loaded        │
            │ (img !== '')    │
            └────────┬────────┘
                     │
                     │ User hovers
                     │
                     ├─▶ Show remove button (X)
                     │
                     └─▶ User clicks upload icon in hover overlay
                          │
                          ├─▶ Select different file
                          │
                          └─▶ Back to "Uploading" state


DetailPanel: InputImageConfig
    │
    ├─ img = node.config.imageData
    ├─ useS3Image(img) → { src, isLoading, error }
    │
    ├─ If img exists:
    │  ├─ Show preview area (h-28)
    │  ├─ Show action buttons:
    │  │  ├─ Edit (pencil icon) → ImageEditorDialog
    │  │  ├─ Replace (upload icon) → file input
    │  │  └─ Remove (X icon)
    │  └─ Hover to show download button
    │
    └─ If img empty:
       └─ Show dashed upload box
```

---

## Memory Lifecycle

### Image Cache

```
SESSION START
    ↓
S3Image uses useS3Image hook
    ↓
useS3Image detects S3 URL
    ↓
resolveS3Image('s3://bucket/key.png')
    ├─ Check: imageCache.has(url)? → NO
    ├─ Check: pendingRequests.has(url)? → NO
    ├─ Create Promise: getImageFromS3(url)
    ├─ Store: pendingRequests.set(url, promise)
    ├─ Await API response
    ├─ Store: imageCache.set(url, dataUrl)
    ├─ Delete: pendingRequests.delete(url)
    └─ Resolve with dataUrl
    ↓
Component unmounts
    ├─ useS3Image cleanup runs
    ├─ cancelled = true
    └─ State updates prevented
    ↓
Same S3 URL rendered elsewhere
    ↓
resolveS3Image('s3://bucket/key.png')
    ├─ Check: imageCache.has(url)? → YES ✓
    └─ Return immediately (no API call)
    ↓
SESSION END
    ├─ imageCache persists until:
    │  ├─ Browser tab closed
    │  ├─ clearS3ImageCache() called
    │  └─ Manual cache clearing
```

### Canvas Memory

```
cropAndResizeImage()
    ├─ const canvas = document.createElement('canvas')
    ├─ canvas.width = outputWidth
    ├─ canvas.height = outputHeight
    ├─ Draw image to canvas
    ├─ result = canvas.toDataURL(...)
    ├─ CLEANUP:
    │  ├─ canvas.width = 0
    │  └─ canvas.height = 0  (Explicit free)
    └─ return result

compressWithCanvas()
    ├─ const canvas = document.createElement('canvas')
    ├─ [Same pattern]
    ├─ No explicit cleanup (relies on GC)
    └─ return result
```

---

## Error Handling Flows

```
Upload Error Handling
    ├─ FileReader error
    │  └─ reader.onerror callback
    │     └─ setIsUploading(false)
    │
    ├─ Compression error
    │  └─ Promise rejection
    │     └─ Propagates to component
    │        └─ onConfigChange not called
    │
    └─ Processing error
       └─ Promise rejection
          └─ Propagates to component
             └─ onConfigChange not called

Execution Error Handling
    ├─ No imageData in config
    │  └─ throw new Error('No image data provided')
    │     └─ Caught by executeNode()
    │        └─ Node state → ERROR
    │           └─ Error message displayed below node
    │
    └─ DataPacket creation error
       └─ Should not happen
          └─ Return { out: packet }

S3 Resolution Error Handling
    ├─ Invalid S3 URL format
    │  └─ isS3Url() returns false
    │     └─ Use URL directly
    │
    ├─ API request fails
    │  └─ catch in resolveS3Image()
    │     ├─ pendingRequests.delete(url)
    │     ├─ Reject promise
    │     └─ useS3Image catches
    │        ├─ setError(err)
    │        ├─ setSrc(null)
    │        └─ S3Image shows error state
    │
    └─ Network timeout
       └─ Axios timeout
          └─ Same as API failure above

Display Error Handling
    ├─ <S3Image error>
    │  └─ Show error state (X icon)
    │
    ├─ <img onerror> (for raw <img> tag)
    │  └─ Would need own handler
    │
    └─ Invalid base64
       └─ Browser <img> shows broken image icon
```

---

## Performance Characteristics

### Time Complexity

| Operation                 | Best Case | Worst Case | Notes                                 |
| ------------------------- | --------- | ---------- | ------------------------------------- |
| Upload (no compression)   | O(n)      | O(n)       | n = file size (FileReader I/O)        |
| Compression iteration     | O(1)      | O(1)       | Fixed 10 iterations max (0.92 to 0.5) |
| Crop + resize             | O(w×h)    | O(w×h)     | Canvas draw operation                 |
| S3 resolution (cache hit) | O(1)      | O(1)       | Map lookup                            |
| S3 resolution (API)       | O(n)      | O(n)       | Network request + base64 decode       |
| Image display             | O(n)      | O(n)       | DOM rendering                         |

### Space Complexity

| Component             | Space Used | Notes                      |
| --------------------- | ---------- | -------------------------- |
| Base64 data URL       | n          | n ≈ 1.33 × file size       |
| Canvas buffer         | w×h×4      | Width × height × RGBA      |
| Image cache (per URL) | n          | n = base64 size            |
| Pending requests map  | O(k)       | k = concurrent S3 requests |

### Optimization Opportunities

1. **Web Worker**: Offload compression to worker thread
2. **Streaming Upload**: Chunk large files
3. **IndexedDB Cache**: Persistent S3 cache
4. **Image Lazy Load**: Defer S3 resolution
5. **Tensor Processing**: Use TensorFlow.js for advanced processing

---

## Testing Scenarios

### Unit Tests

```typescript
// imageCompression.ts
describe('getBase64Size', () => {
    test('should calculate correct size with padding', () => {
        const dataUrl = 'data:image/png;base64,ABC=';
        expect(getBase64Size(dataUrl)).toBe(2);
    });
});

describe('compressImageIfNeeded', () => {
    test('should skip compression for small images', async () => {
        const result = await compressImageIfNeeded(smallDataUrl);
        expect(result.wasCompressed).toBe(false);
    });

    test('should compress large images', async () => {
        const result = await compressImageIfNeeded(largeDataUrl);
        expect(result.wasCompressed).toBe(true);
        expect(result.compressedSize).toBeLessThan(5.5 * 1024 * 1024);
    });
});

describe('parseAspectRatio', () => {
    test('should parse valid ratios', () => {
        expect(parseAspectRatio('3:4')).toBe(0.75);
        expect(parseAspectRatio('16:9')).toBeCloseTo(1.777, 2);
    });

    test('should return undefined for free aspect', () => {
        expect(parseAspectRatio('free')).toBeUndefined();
    });
});
```

### Integration Tests

```typescript
describe('Image upload flow', () => {
    test('should upload and compress image', async () => {
        const file = new File(['...'], 'large.jpg');
        const { getByTestId } = render(<NodeBlock node={node} />);

        const input = getByTestId('file-input');
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(node.config.imageData).toMatch(/^data:image/);
        });
    });

    test('should process image with config', async () => {
        const node = {
            config: {
                imageData: dataUrl,
                aspectRatio: '3:4',
                maxWidth: '1000'
            }
        };

        const result = await processImageWithConfig(dataUrl, {
            aspectRatio: '3:4',
            maxWidth: '1000'
        });

        // Verify crop and resize applied
        expect(result).toMatch(/^data:image/);
    });
});

describe('Execution', () => {
    test('should execute input-image block', async () => {
        const result = await EXECUTE_FUNCTIONS['input-image'](
            {},
            { imageData: dataUrl },
            jest.fn()
        );

        expect(result.out.type).toBe('image');
        expect(result.out.value).toBe(dataUrl);
    });
});
```

### E2E Tests

```typescript
describe('Image block E2E', () => {
    test('should upload image and propagate to downstream node', async () => {
        // 1. Create two nodes: input-image + image-info
        // 2. Connect input-image.out → image-info.in
        // 3. Upload image to input-image node
        // 4. Run input-image
        // 5. Verify image-info receives packet
        // 6. Run image-info
        // 7. Verify output shows dimensions
    });
});
```
