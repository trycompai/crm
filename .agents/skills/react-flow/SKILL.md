---
name: react-flow
description: React Flow (@xyflow/react) for workflow visualization with custom nodes and edges. Use when building graph visualizations, creating custom workflow nodes, implementing edge labels, or controlling viewport. Triggers on ReactFlow, @xyflow/react, Handle, NodeProps, EdgeProps, useReactFlow, fitView.
---

# React Flow

React Flow (@xyflow/react) is a library for building node-based graphs, workflow editors, and interactive diagrams. It provides a highly customizable framework for creating visual programming interfaces, process flows, and network visualizations.

## Quick Start

### Installation

```bash
pnpm add @xyflow/react
```

### Basic Setup

```typescript
import { ReactFlow, Node, Edge, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'input',
    data: { label: 'Input Node' },
    position: { x: 250, y: 5 },
  },
  {
    id: '2',
    data: { label: 'Default Node' },
    position: { x: 100, y: 100 },
  },
  {
    id: '3',
    type: 'output',
    data: { label: 'Output Node' },
    position: { x: 400, y: 100 },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3' },
];

function Flow() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow nodes={initialNodes} edges={initialEdges}>
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

export default Flow;
```

## Core Concepts

### Nodes

Nodes are the building blocks of the graph. Each node has:
- `id`: Unique identifier
- `type`: Node type (built-in or custom)
- `position`: { x, y } coordinates
- `data`: Custom data object

```typescript
import { Node } from '@xyflow/react';

const node: Node = {
  id: 'node-1',
  type: 'default',
  position: { x: 100, y: 100 },
  data: { label: 'Node Label' },
  style: { background: '#D6D5E6' },
  className: 'custom-node',
};
```

Built-in node types:
- `default`: Standard node
- `input`: No target handles
- `output`: No source handles
- `group`: Container for other nodes

### Edges

Edges connect nodes. Each edge requires:
- `id`: Unique identifier
- `source`: Source node ID
- `target`: Target node ID

```typescript
import { Edge } from '@xyflow/react';

const edge: Edge = {
  id: 'e1-2',
  source: '1',
  target: '2',
  type: 'smoothstep',
  animated: true,
  label: 'Edge Label',
  style: { stroke: '#fff', strokeWidth: 2 },
};
```

Built-in edge types:
- `default`: Bezier curve
- `straight`: Straight line
- `step`: Orthogonal with sharp corners
- `smoothstep`: Orthogonal with rounded corners

### Handles

Handles are connection points on nodes. Use `Position` enum for placement:

```typescript
import { Handle, Position } from '@xyflow/react';

<Handle type="target" position={Position.Top} />
<Handle type="source" position={Position.Bottom} />
```

Available positions: `Position.Top`, `Position.Right`, `Position.Bottom`, `Position.Left`

## State Management

### Controlled Flow

Use state hooks for full control:

```typescript
import { useNodesState, useEdgesState, addEdge, OnConnect } from '@xyflow/react';
import { useCallback } from 'react';

function ControlledFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
    />
  );
}
```

### useReactFlow Hook

Access the React Flow instance for programmatic control:

```typescript
import { useReactFlow } from '@xyflow/react';

function FlowControls() {
  const {
    getNodes,
    getEdges,
    setNodes,
    setEdges,
    addNodes,
    addEdges,
    deleteElements,
    fitView,
    zoomIn,
    zoomOut,
    getNode,
    getEdge,
    updateNode,
    updateEdge,
  } = useReactFlow();

  return (
    <button onClick={() => fitView()}>Fit View</button>
  );
}
```

## Custom Nodes

Define custom nodes using `NodeProps<T>` with typed data:

```typescript
import { NodeProps, Node, Handle, Position } from '@xyflow/react';

export type CustomNode = Node<{ label: string; status: 'active' | 'inactive' }, 'custom'>;

function CustomNodeComponent({ data, selected }: NodeProps<CustomNode>) {
  return (
    <div className={`px-4 py-2 ${selected ? 'ring-2' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="font-bold">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

Register with `nodeTypes`:

```typescript
const nodeTypes: NodeTypes = { custom: CustomNodeComponent };
<ReactFlow nodeTypes={nodeTypes} />
```

### Key Patterns

- **Multiple Handles**: Use `id` prop and `style` for positioning
- **Dynamic Handles**: Call `useUpdateNodeInternals([nodeId])` after adding/removing handles
- **Interactive Elements**: Add `className="nodrag"` to prevent dragging on inputs/buttons

See [Custom Nodes Reference](./references/custom-nodes.md) for detailed patterns including styling, aviation map pins, and dynamic handles.

## Custom Edges

Define custom edges using `EdgeProps<T>` and path utilities:

```typescript
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

export type CustomEdge = Edge<{ status: 'normal' | 'error' }, 'custom'>;

function CustomEdgeComponent(props: EdgeProps<CustomEdge>) {
  const [edgePath] = getBezierPath(props);

  return (
    <BaseEdge
      id={props.id}
      path={edgePath}
      style={{ stroke: props.data?.status === 'error' ? '#ef4444' : '#64748b' }}
    />
  );
}
```

### Path Utilities

- `getBezierPath()` - Smooth curves
- `getStraightPath()` - Straight lines
- `getSmoothStepPath()` - Orthogonal with rounded corners
- `getSmoothStepPath({ borderRadius: 0 })` - Orthogonal with sharp corners (step edge)

All return `[path, labelX, labelY, offsetX, offsetY]`.

### Interactive Labels

Use `EdgeLabelRenderer` for HTML-based labels with pointer events:

```typescript
import { EdgeLabelRenderer, BaseEdge, getBezierPath } from '@xyflow/react';

function ButtonEdge(props: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath(props);
  return (
    <>
      <BaseEdge id={props.id} path={edgePath} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button onClick={() => console.log('Delete')}>×</button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
```

See [Custom Edges Reference](./references/custom-edges.md) for animated edges, time labels, and SVG text patterns.

## Viewport Control

Use `useReactFlow()` hook for programmatic viewport control:

```typescript
import { useReactFlow } from '@xyflow/react';

function ViewportControls() {
  const { fitView, zoomIn, zoomOut, setCenter, screenToFlowPosition } = useReactFlow();

  // Fit all nodes in view
  const handleFitView = () => fitView({ padding: 0.2, duration: 400 });

  // Zoom controls
  const handleZoomIn = () => zoomIn({ duration: 300 });
  const handleZoomOut = () => zoomOut({ duration: 300 });

  // Center on specific coordinates
  const handleCenter = () => setCenter(250, 250, { zoom: 1.5, duration: 500 });

  // Convert screen coordinates to flow coordinates
  const addNodeAtClick = (event: React.MouseEvent) => {
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    // Use position to add node
  };

  return null;
}
```

See [Viewport Reference](./references/viewport.md) for save/restore state, controlled viewport, and coordinate transformations.

## Events

React Flow provides comprehensive event handling:

### Node Events

```typescript
import { NodeMouseHandler, OnNodeDrag } from '@xyflow/react';

const onNodeClick: NodeMouseHandler = (event, node) => {
  console.log('Node clicked:', node.id);
};

const onNodeDrag: OnNodeDrag = (event, node, nodes) => {
  console.log('Dragging:', node.id);
};

<ReactFlow
  onNodeClick={onNodeClick}
  onNodeDrag={onNodeDrag}
  onNodeDragStop={onNodeClick}
/>
```

### Edge and Connection Events

```typescript
import { EdgeMouseHandler, OnConnect } from '@xyflow/react';

const onEdgeClick: EdgeMouseHandler = (event, edge) => console.log('Edge:', edge.id);
const onConnect: OnConnect = (connection) => console.log('Connected:', connection);

<ReactFlow onEdgeClick={onEdgeClick} onConnect={onConnect} />
```

### Selection and Viewport Events

```typescript
import { useOnSelectionChange, useOnViewportChange } from '@xyflow/react';

useOnSelectionChange({
  onChange: ({ nodes, edges }) => console.log('Selected:', nodes.length, edges.length),
});

useOnViewportChange({
  onChange: (viewport) => console.log('Viewport:', viewport.zoom),
});
```

See [Events Reference](./references/events.md) for complete event catalog including validation, deletion, and error handling.

## Common Patterns

### Preventing Drag/Pan

```typescript
<input className="nodrag" />
<button className="nodrag nopan">Click me</button>
```

### Connection Validation

```typescript
const isValidConnection = (connection: Connection) => {
  return connection.source !== connection.target; // Prevent self-connections
};

<ReactFlow isValidConnection={isValidConnection} />
```

### Adding Nodes on Click

```typescript
const { screenToFlowPosition, setNodes } = useReactFlow();

const onPaneClick = (event: React.MouseEvent) => {
  const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
  setNodes(nodes => [...nodes, { id: `node-${Date.now()}`, position, data: { label: 'New' } }]);
};
```

### Updating Node Data

```typescript
const { updateNodeData } = useReactFlow();
updateNodeData('node-1', { label: 'Updated' });
updateNodeData('node-1', (node) => ({ ...node.data, count: node.data.count + 1 }));
```

## Provider Pattern

Wrap the app with `ReactFlowProvider` when using `useReactFlow()` outside the flow:

```typescript
import { ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';

function Controls() {
  const { fitView } = useReactFlow(); // Must be inside provider
  return <button onClick={() => fitView()}>Fit View</button>;
}

function App() {
  return (
    <ReactFlowProvider>
      <Controls />
      <ReactFlow nodes={nodes} edges={edges} />
    </ReactFlowProvider>
  );
}
```

## Implementation gates

Use these **sequenced checks** before treating an integration as done (they target common footguns, not style preferences).

1. **CSS in the bundle** — Ensure `import '@xyflow/react/dist/style.css'` runs in the app (entry or layout). **Pass:** nodes and edges have expected default styling; handles are visible and interactable.
2. **Stable `nodeTypes` / `edgeTypes`** — Do not pass a fresh object literal every render; define maps outside the component or memoize with `useMemo` and correct deps. **Pass:** no remount flicker or “maximum update depth” / runaway updates when only selection or viewport changes.
3. **Provider boundary** — Components that call `useReactFlow()` must be descendants of `ReactFlowProvider`, and the flow must actually mount. **Pass:** no missing-context error at runtime; programmatic APIs (`fitView`, etc.) work where expected.

## Reference Files

For detailed implementation patterns, see:

- [Custom Nodes](./references/custom-nodes.md) - NodeProps typing, Handle component, dynamic handles, styling patterns
- [Custom Edges](./references/custom-edges.md) - EdgeProps typing, path utilities, EdgeLabelRenderer, animated edges
- [Viewport](./references/viewport.md) - useReactFlow methods, fitView options, coordinate conversion
- [Events](./references/events.md) - Node/edge/connection events, selection handling, viewport changes
