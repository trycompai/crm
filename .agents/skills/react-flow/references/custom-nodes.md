# Custom Nodes

React Flow custom nodes use the `NodeProps<T>` typing pattern where `T` is the specific node type with custom data.

## Table of Contents

- [Node Type Definition](#node-type-definition)
- [Handle Component](#handle-component)
- [Multiple Handles](#multiple-handles)
- [Dynamic Handles with useUpdateNodeInternals](#dynamic-handles-with-useupdatenodeinternals)
- [Styling Nodes](#styling-nodes)
- [Aviation Map Pin Node Example](#aviation-map-pin-node-example)
- [Preventing Drag and Pan](#preventing-drag-and-pan)
- [Node Registration](#node-registration)

## Node Type Definition

Define custom nodes with typed data and specify the node type string:

```typescript
import { Node, NodeProps } from '@xyflow/react';

// Define the custom node type
export type CounterNode = Node<{ initialCount?: number }, 'counter'>;

// Component receives NodeProps<CounterNode>
export default function CounterNode(props: NodeProps<CounterNode>) {
  const [count, setCount] = useState(props.data?.initialCount ?? 0);

  return (
    <div>
      <p>Count: {count}</p>
      <button className="nodrag" onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
}
```

## Handle Component

The `Handle` component defines connection points on nodes. Use `type="target"` for incoming connections and `type="source"` for outgoing connections.

```typescript
import { Handle, Position } from '@xyflow/react';

function CustomNode({ data }) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
```

### Multiple Handles

Use the `id` prop to create multiple handles on a single node:

```typescript
import { Handle, Position, CSSProperties } from '@xyflow/react';

const sourceHandleStyleA: CSSProperties = { top: 10 };
const sourceHandleStyleB: CSSProperties = { bottom: 10, top: 'auto' };

function MultiHandleNode({ data, isConnectable }: NodeProps<ColorSelectorNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div>{data.label}</div>

      {/* Multiple source handles with IDs */}
      <Handle
        type="source"
        position={Position.Right}
        id="a"
        style={sourceHandleStyleA}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="b"
        style={sourceHandleStyleB}
        isConnectable={isConnectable}
      />
    </>
  );
}
```

## Dynamic Handles with useUpdateNodeInternals

When adding or removing handles dynamically, use `useUpdateNodeInternals()` to notify React Flow:

```typescript
import { useState, useMemo } from 'react';
import { Handle, Position, useUpdateNodeInternals, NodeProps } from '@xyflow/react';

function DynamicHandleNode({ id }: NodeProps) {
  const [handleCount, setHandleCount] = useState(1);
  const updateNodeInternals = useUpdateNodeInternals();

  const handles = useMemo(
    () =>
      Array.from({ length: handleCount }, (x, i) => {
        const handleId = `handle-${i}`;
        return (
          <Handle
            key={handleId}
            type="source"
            position={Position.Right}
            id={handleId}
            style={{ top: 10 * i }}
          />
        );
      }),
    [handleCount]
  );

  return (
    <div>
      <Handle type="target" position={Position.Left} />
      <div>output handle count: {handleCount}</div>
      <button
        onClick={() => {
          setHandleCount((c) => c + 1);
          updateNodeInternals(id); // Critical: notify React Flow
        }}
      >
        add handle
      </button>
      {handles}
    </div>
  );
}
```

## Styling Nodes

### CSS Classes

Apply styles with `className` and `style` props on the node definition:

```typescript
const nodes: Node[] = [
  {
    id: '1',
    type: 'custom',
    data: { label: 'Styled Node' },
    position: { x: 250, y: 5 },
    style: { border: '1px solid #777', padding: 10 },
    className: 'custom-node',
  },
];
```

### Inline Styles in Component

```typescript
import { CSSProperties } from 'react';

const nodeStyles: CSSProperties = { padding: 10, border: '1px solid #ddd' };

function StyledNode({ data }: NodeProps) {
  return (
    <div style={nodeStyles}>
      {data.label}
    </div>
  );
}
```

### Tailwind CSS

React Flow works seamlessly with Tailwind:

```typescript
function TailwindNode({ data }: NodeProps) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-white border-2 border-stone-400">
      <div className="flex">
        <div className="ml-2">
          <div className="text-lg font-bold">{data.name}</div>
          <div className="text-gray-500">{data.job}</div>
        </div>
      </div>
      <Handle type="target" position={Position.Top} className="w-16 !bg-teal-500" />
      <Handle type="source" position={Position.Bottom} className="w-16 !bg-teal-500" />
    </div>
  );
}
```

## Aviation Map Pin Node Example

Custom node with status-based styling using data-driven approach:

```typescript
import { NodeProps, Handle, Position } from '@xyflow/react';

type MapPinData = {
  label: string;
  status: 'active' | 'warning' | 'inactive';
  coordinate: { lat: number; lon: number };
};

export type MapPinNode = Node<MapPinData, 'mapPin'>;

function MapPinNode({ data, selected }: NodeProps<MapPinNode>) {
  const statusColors = {
    active: 'bg-green-500',
    warning: 'bg-yellow-500',
    inactive: 'bg-gray-400',
  };

  return (
    <div className={`relative ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      {/* Beacon glow for active status */}
      {data.status === 'active' && (
        <div className="absolute inset-0 animate-ping bg-green-500 rounded-full opacity-75" />
      )}

      {/* Pin icon */}
      <div className={`relative w-8 h-8 rounded-full ${statusColors[data.status]}`}>
        <div className="absolute inset-0 flex items-center justify-center text-white font-bold">
          {data.label}
        </div>
      </div>

      {/* Connection handle at bottom */}
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
```

## Preventing Drag and Pan

Use `nodrag` and `nopan` classes to prevent interactions on specific elements:

```typescript
function InteractiveNode({ data }: NodeProps) {
  return (
    <div>
      <input
        className="nodrag"
        type="text"
        defaultValue={data.label}
      />
      <button className="nodrag nopan" onClick={() => console.log('clicked')}>
        Click me
      </button>
    </div>
  );
}
```

## Node Registration

Register custom nodes in the `nodeTypes` prop:

```typescript
import { ReactFlow, NodeTypes } from '@xyflow/react';
import CustomNode from './CustomNode';
import MapPinNode from './MapPinNode';

const nodeTypes: NodeTypes = {
  custom: CustomNode,
  mapPin: MapPinNode,
};

function Flow() {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
    />
  );
}
```
