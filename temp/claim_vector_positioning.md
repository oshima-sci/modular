# Using Claim Vectors for Graph Positioning

## Overview

Claims have embedding vectors that capture their semantic meaning. By projecting these high-dimensional vectors to 2D (via UMAP, t-SNE, or PCA), we can position nodes in the knowledge graph so that semantically similar claims appear near each other.

## API Changes

The API would return 2D coordinates alongside each claim:

```typescript
interface ClaimExtract {
  id: string;
  paper_id: string;
  content: {
    rephrased_claim: string;
    // ... existing fields
    position_2d?: {
      x: number;  // Projected x coordinate
      y: number;  // Projected y coordinate
    };
  };
}
```

## Frontend Implementation

### 1. Extend the Node interface

```typescript
// In KnowledgeGraph.tsx
export interface Node {
  id: string;
  type: "claim" | "observation";
  displayText: string;
  rawContent: any;
  paperIds: string[];
  sourceElementIds: string[];
  // New: pre-computed positions from vector projection
  x?: number;
  y?: number;
  fx?: number;  // Fixed x (optional - prevents force movement)
  fy?: number;  // Fixed y (optional - prevents force movement)
}
```

### 2. Map coordinates when building nodes

In the `useEffect` that transforms library data (~line 529):

```typescript
const claimNodes: Node[] = libraryData.extracts.claims.map((claim) => ({
  id: claim.id,
  type: "claim" as const,
  displayText: claim.content.rephrased_claim || "",
  rawContent: claim.content,
  paperIds: [claim.paper_id],
  sourceElementIds: claim.content.source_elements?.map((s) => s.source_element_id) || [],
  // Use pre-computed positions if available
  x: claim.content.position_2d?.x,
  y: claim.content.position_2d?.y,
}));
```

### 3. Coordinate scaling

The projection coordinates need scaling to fit the canvas. Options:

**Option A: API returns normalized coordinates (0-1)**
```typescript
x: (claim.content.position_2d?.x ?? 0.5) * dimensions.width,
y: (claim.content.position_2d?.y ?? 0.5) * dimensions.height,
```

**Option B: API returns raw projection, frontend scales**
```typescript
// Compute bounds across all claims first
const allX = claims.map(c => c.content.position_2d?.x).filter(Boolean);
const allY = claims.map(c => c.content.position_2d?.y).filter(Boolean);
const minX = Math.min(...allX), maxX = Math.max(...allX);
const minY = Math.min(...allY), maxY = Math.max(...allY);

// Then normalize
x: ((claim.content.position_2d?.x - minX) / (maxX - minX)) * dimensions.width,
```

### 4. Force simulation behavior

Three modes for how the force simulation interacts with pre-computed positions:

| Mode | How | Effect |
|------|-----|--------|
| **Hint only** | Set `x`, `y` | Nodes start at semantic positions but forces move them |
| **Soft constraint** | Reduce force strengths | Nodes drift slowly, mostly preserve layout |
| **Fixed positions** | Set `fx`, `fy` | Nodes locked in place, only links animate |

To reduce force strength:
```typescript
useEffect(() => {
  if (fgRef.current) {
    fgRef.current.d3Force('charge')?.strength(-10);  // Weaker repulsion
    fgRef.current.d3Force('center', null);           // Remove centering
  }
}, [filteredGraphData]);
```

## Observation Positioning

Observations don't have their own vectors. Options:

1. **Force-directed from claims**: Let observations position via links to their claims
2. **Inherit from method**: Position near the method extract's claim
3. **Cluster by paper**: Group observations by source paper

## Benefits

- **Semantic clustering**: Related claims visually group together
- **Stable layout**: Same data produces same layout (deterministic)
- **Faster convergence**: Force simulation starts closer to final state
- **Meaningful exploration**: Users can see thematic regions of the graph
