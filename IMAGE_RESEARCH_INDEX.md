# Image Upload Block Research Index

## Overview

Complete architectural analysis of the `input-image` block implementation in the Eureka Flow visual workflow editor. This research documents the entire data flow from file selection through base64 encoding to node execution.

---

## Documentation Files

### 1. **IMAGE_UPLOAD_RESEARCH_SUMMARY.md** ← Start here

**Purpose**: Executive summary and quick reference
**Best for**: Getting oriented, understanding the big picture
**Contents**:

- What is the image upload block?
- Five-minute version of how it works
- The smart parts (compression, cropping, caching)
- Architecture patterns
- Real-world scenarios
- Quick reference functions

### 2. **IMAGE_UPLOAD_BLOCK_RESEARCH.md** ← For deep understanding

**Purpose**: Complete technical deep-dive with detailed explanations
**Best for**: Understanding every component and trade-off
**Contents**:

- 14 detailed sections covering every aspect
- Block definition and registration
- Image upload UI components (inline + panel)
- Execute function implementation
- Image processing pipeline (compression + crop/resize)
- S3 image resolution with caching
- Complete data flow diagram
- Configuration fields
- Type definitions
- Performance & optimization patterns
- Error handling strategies
- Related components
- Testing considerations

### 3. **IMAGE_UPLOAD_IMPLEMENTATION_GUIDE.md** ← For implementation

**Purpose**: Code snippets organized by task
**Best for**: Implementing similar features or modifying existing code
**Contents**:

- Quick navigation table (all files)
- Complete flow in 30 seconds
- 7 code reference sections:
    1. Block registration
    2. File upload & base64 encoding
    3. Compression algorithm
    4. Crop & resize processing
    5. Execution function
    6. S3 image resolution
    7. Image display
- Critical constants
- State management locations
- Debugging tips
- Quick troubleshooting table

### 4. **IMAGE_BLOCK_ARCHITECTURE.md** ← For visual learners

**Purpose**: Diagrams and visual flowcharts
**Best for**: Understanding system interactions and state flows
**Contents**:

- System architecture diagram
- Detailed compression algorithm flow
- Detailed crop & resize algorithm flow
- Data structure flows (registration, config update, execution)
- Image display pipeline
- UI state machine diagram
- Memory lifecycle visualization
- Error handling flowcharts
- Performance characteristics table
- Testing scenarios

### 5. **IMAGE_RESEARCH_INDEX.md** ← This file

**Purpose**: Navigation guide
**Best for**: Finding the right documentation
**Contents**: This index and usage guide

---

## Quick Start Paths

### Path A: "I want to understand the architecture in 10 minutes"

1. Read: IMAGE_UPLOAD_RESEARCH_SUMMARY.md (5 min)
2. Skim: IMAGE_BLOCK_ARCHITECTURE.md diagrams (5 min)

### Path B: "I need to implement something similar"

1. Read: IMAGE_UPLOAD_RESEARCH_SUMMARY.md (5 min)
2. Reference: IMAGE_UPLOAD_IMPLEMENTATION_GUIDE.md (as needed)
3. Deep-dive: IMAGE_UPLOAD_BLOCK_RESEARCH.md sections (as needed)

### Path C: "I need to debug an issue"

1. Check: IMAGE_UPLOAD_IMPLEMENTATION_GUIDE.md troubleshooting table
2. Search: IMAGE_UPLOAD_BLOCK_RESEARCH.md for error handling section
3. Trace: IMAGE_BLOCK_ARCHITECTURE.md error handling flowchart

### Path D: "I want complete technical mastery"

1. Read in order:
    - IMAGE_UPLOAD_RESEARCH_SUMMARY.md
    - IMAGE_UPLOAD_BLOCK_RESEARCH.md
    - IMAGE_BLOCK_ARCHITECTURE.md
    - IMAGE_UPLOAD_IMPLEMENTATION_GUIDE.md

---

## Key Code Locations

### Block Definition

**File**: `/apps/web/src/app/features/flows/data/demo-blocks.ts:33-52`
**What**: `input-image` block metadata and configuration schema

### Upload UI

**Inline (Canvas)**: `/apps/web/src/app/features/flows/components/NodeBlock.tsx:509-584`
**Panel (Config)**: `/apps/web/src/app/features/flows/components/DetailPanel.tsx:154-290`

### Image Processing

**Compression**: `/libs/flows/src/utils/imageCompression.ts` (170 lines)
**Processing**: `/libs/flows/src/utils/imageProcessing.ts` (183 lines)

### Execution

**Frontend Execution**: `/libs/flows/src/api/execute-functions.ts:43-48`

### S3 Resolution

**Utilities**: `/libs/flows/src/utils/s3Utils.ts` (93 lines)
**Hook**: `/libs/flows/src/hooks/useS3Image.ts` (68 lines)
**API**: `/libs/flows/src/api/nodes.ts:247-261`

### Display

**Component**: `/apps/web/src/app/features/flows/components/S3Image.tsx` (47 lines)

---

## Essential Concepts

### 1. DataPacket

```typescript
{
    value: "data:image/jpeg;base64,...",  // Base64 data URL
    type: 'image',                         // Type hint
    timestamp: 1234567890                  // Generation time
}
```

Standard output format for all blocks. Type-aware routing and rendering.

### 2. Frontend Execution

```typescript
isFrontend: true  // Block executes in browser, not on server
↓
EXECUTE_FUNCTIONS[blockType]()  // Look up execution function
↓
Returns DataPacket synchronously (or Promise)
↓
Updates node.output in Zustand store
↓
WebSocket propagates to downstream nodes
```

### 3. Compression Algorithm

```
If file > 5MB:
    Loop quality from 0.92 to 0.5 (step: -0.05)
        compress with Canvas.toDataURL(quality)
        measure result size
        if result ≤ 5.5MB: break
Else:
    return unchanged (no overhead)
```

### 4. S3 Caching

```
Request 1: imageCache miss → API call → cache result → return
Request 2: imageCache hit → return immediately
Request 3 (concurrent): pendingRequests hit → return pending promise
```

### 5. Aspect Ratio Crop

```
Target aspect: 0.75 (3:4 portrait)
Current aspect: 1.333 (4:3 landscape, wider than target)
↓
Crop left/right sides to 1125×1500 (centered)
↓
Resize to max width: 1000×1333
↓
Output JPEG
```

---

## Common Questions Answered

**Q: Why base64?**
A: Embeds image data in config, persists to database, works with API Gateway 6MB limit when compressed.

**Q: Why compress adaptively?**
A: Preserves quality for reasonable files (< 5MB) while guaranteeing fit under API limit.

**Q: Why Canvas for processing?**
A: Pixel-perfect control, handles format conversion (PNG→JPEG), dynamic quality adjustment.

**Q: Why dual S3 support?**
A: Local uploads store as data URLs, server outputs as S3 URLs. Hook abstracts both seamlessly.

**Q: Why deduplication?**
A: Prevents O(n²) API calls when multiple nodes request same S3 image. Map tracks pending requests.

**Q: Why multiple upload UIs?**
A: Inline (quick feedback) vs. Panel (advanced features like crop). Both write to same config.

**Q: Why 0.92 to 0.5 quality?**
A: 0.92 preserves quality, 0.5 is acceptable floor. 10 iterations max avoids excessive loops.

**Q: Why 5MB threshold?**
A: Conservative safety margin. 6MB API Gateway limit - 0.5MB header/envelope.

**Q: Why 5.5MB target?**
A: Final compressed size, leaving further margin for protocol overhead.

**Q: Why explicit canvas cleanup?**
A: `canvas.width = 0; canvas.height = 0` signals memory free to garbage collector.

---

## File Summary Table

| File                 | Lines | Purpose                                       |
| -------------------- | ----- | --------------------------------------------- |
| demo-blocks.ts       | 378   | Block definitions (input-image: lines 33-52)  |
| NodeBlock.tsx        | 1400+ | Canvas widgets (image upload: lines 509-584)  |
| DetailPanel.tsx      | 1000+ | Config panel (image config: lines 154-290)    |
| execute-functions.ts | 152   | Execution registry (input-image: lines 43-48) |
| imageCompression.ts  | 170   | Compression algorithm                         |
| imageProcessing.ts   | 183   | Crop + resize algorithm                       |
| s3Utils.ts           | 93    | S3 resolution + caching                       |
| useS3Image.ts        | 68    | React hook for S3                             |
| S3Image.tsx          | 47    | Image display component                       |
| nodes.ts             | 320   | API client (getImageFromS3: lines 247-261)    |

---

## Architecture Patterns Used

1. **Frontend Execution Model**: Blocks with `isFrontend: true` run in browser
2. **Configuration Schema**: Block metadata drives config UI rendering
3. **DataPacket Abstraction**: Standardized output format for all block types
4. **In-Memory Caching**: Fast path for repeated requests (S3 URLs)
5. **Deduplication**: Shared promises prevent concurrent duplicate requests
6. **Canvas as Image Engine**: All pixel operations via Canvas API
7. **Hook Abstraction**: `useS3Image` hides URL resolution complexity
8. **Multiple UI Entry Points**: Inline + Panel for different use cases
9. **Lazy Loading**: S3 resolution only when image renders
10. **Explicit Memory Management**: Canvas cleanup prevents leaks

---

## Performance Insights

### Wins

- **No compression for small files**: < 5MB files skip compression entirely
- **Single API call per S3 URL**: Cache + deduplication prevent redundant requests
- **Instant inline feedback**: Frontend execution (no server round-trip)
- **Canvas rendering**: Hardware-accelerated image operations
- **Lazy S3 resolution**: Only resolve when image actually renders

### Trade-offs

- **Single-threaded compression**: Blocks UI during compression (Web Worker could fix)
- **Unbounded S3 cache**: No cleanup for old URLs (IndexedDB with TTL could fix)
- **Iterative quality compression**: 10 iterations max (could be binary search)
- **Base64 overhead**: 1.33× file size (streaming could fix)

---

## Testing Coverage Needed

- [ ] Compression with various file sizes
- [ ] Aspect ratio parsing edge cases
- [ ] Center crop accuracy (all four edges)
- [ ] Resize aspect preservation
- [ ] S3 cache hit/miss behavior
- [ ] Deduplication of pending requests
- [ ] Error handling (all error types)
- [ ] UI state transitions
- [ ] E2E: upload → execute → downstream reception

---

## Future Enhancements

1. **Web Worker**: Offload compression to background thread
2. **IndexedDB Cache**: Persistent S3 cache with TTL
3. **Binary Search**: Find optimal quality faster
4. **Streaming Upload**: Chunk large files
5. **GPU Processing**: TensorFlow.js for advanced transforms
6. **Lazy DataPacket**: Defer base64 encoding until needed
7. **Batch Operations**: Process multiple images in one node
8. **Format Conversion**: Support WebP, AVIF output

---

## Related Blocks

These blocks follow similar patterns:

- **text-transform**: Frontend execution, config-based behavior
- **buffer-delay**: Frontend execution, progress reporting
- **image-info**: Frontend execution, reads image metadata
- **output-console**: Frontend execution, side effect
- **length-validator**: Frontend execution, validation

The image block is most complex due to file I/O + Canvas + async pipeline.

---

## Key Metrics

| Metric                | Value            | Notes                         |
| --------------------- | ---------------- | ----------------------------- |
| Compression threshold | 5 MB             | Below this, no compression    |
| Compression target    | 5.5 MB           | Ensure API Gateway fit        |
| Quality range         | 0.92 - 0.5       | High to acceptable            |
| Quality step          | 0.05             | 10 iterations max             |
| Canvas output quality | 0.9              | Default JPEG output           |
| S3 API endpoint       | `/nodes/0/image` | Returns base64 + content-type |
| Cache type            | In-Memory Map    | Session-scoped                |
| Base64 overhead       | 1.33x            | file size → base64 size       |

---

## Debugging Checklist

When troubleshooting image block issues:

- [ ] Check DevTools Console for compression logs
- [ ] Verify Network tab for S3 API calls
- [ ] Check Zustand store state for node.config.imageData
- [ ] Verify DataPacket format in node.output
- [ ] Check browser Canvas support
- [ ] Verify FileReader API available
- [ ] Check file size vs. compression threshold
- [ ] Verify S3 URL format (`s3://bucket/key`)
- [ ] Check image load events in DOM
- [ ] Verify downstream node receives DataPacket

---

## Key Takeaways

1. **Complete pipeline in browser**: Upload → compress → process → execute → propagate
2. **Smart compression**: Only when needed (> 5MB), stops when target reached (5.5MB)
3. **Format flexibility**: Handles both data URLs (uploads) and S3 URLs (outputs)
4. **Caching efficiency**: Prevents duplicate API calls and concurrent requests
5. **Multiple UIs**: Inline for quick feedback, panel for advanced options
6. **Error resilience**: Graceful degradation at each step
7. **Performance focused**: Lazy loading, no unnecessary work for small files
8. **Extensible design**: New processors can be added via Canvas operations

---

## Navigation Quick Links

| I want to...              | Read this                            | Location                 |
| ------------------------- | ------------------------------------ | ------------------------ |
| Understand the system     | IMAGE_UPLOAD_RESEARCH_SUMMARY.md     | Start                    |
| See detailed explanations | IMAGE_UPLOAD_BLOCK_RESEARCH.md       | Section by section       |
| Get code snippets         | IMAGE_UPLOAD_IMPLEMENTATION_GUIDE.md | "Code Reference by Task" |
| View flowcharts           | IMAGE_BLOCK_ARCHITECTURE.md          | "Diagrams" sections      |
| Find specific code        | This file                            | "Key Code Locations"     |
| Understand a concept      | IMAGE_UPLOAD_RESEARCH_SUMMARY.md     | "Essential Concepts"     |
| Debug an issue            | IMAGE_UPLOAD_IMPLEMENTATION_GUIDE.md | "Quick Troubleshooting"  |
| Implement similar feature | IMAGE_UPLOAD_IMPLEMENTATION_GUIDE.md | "Code Reference"         |
| Trace data flow           | IMAGE_BLOCK_ARCHITECTURE.md          | "Data Flow" sections     |

---

**Generated**: March 19, 2026
**Research Scope**: Complete image upload block implementation
**Files Analyzed**: 10 core files, 2000+ lines of code
**Documentation**: 5 markdown files, 8000+ lines of reference material
