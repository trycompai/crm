# Custom Edges

Custom edges in React Flow use the `EdgeProps<T>` typing pattern and path utility functions to render connections between nodes.

## Table of Contents

- [Edge Type Definition](#edge-type-definition)
- [EdgeProps Structure](#edgeprops-structure)
- [Path Utility Functions](#path-utility-functions)
- [BaseEdge Component](#baseedge-component)
- [EdgeLabelRenderer for Interactive Labels](#edgelabelrenderer-for-interactive-labels)
- [Animated Edges](#animated-edges)
- [SVG Text Labels](#svg-text-labels)
- [EdgeText Component](#edgetext-component)
- [Time Label Edge Example](#time-label-edge-example)
- [Edge Registration](#edge-registration)
- [Default Edge Options](#default-edge-options)

## Edge Type Definition

Define custom edge types with typed data:

```typescript
import { Edge, EdgeProps } from '@xyflow/react';

// Define the custom edge type
export type TimeLabelEdge = Edge<{ time: string; label: string }, 'timeLabel'>;

// Component receives EdgeProps
export default function TimeLabelEdge(props: EdgeProps<TimeLabelEdge>) {
  // Edge implementation
}
```

## EdgeProps Structure

The `EdgeProps` type includes these key properties:

```typescript
type EdgeProps<T extends Edge = Edge> = {
  id: string;
  type?: string;
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: T['data'];
  selected?: boolean;
  animated?: boolean;
  style?: CSSProperties;
  markerStart?: string;
  markerEnd?: string;
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
  label?: ReactNode;
  labelStyle?: CSSProperties;
  labelShowBg?: boolean;
  labelBgStyle?: CSSProperties;
  labelBgPadding?: [number, number];
  labelBgBorderRadius?: number;
  interactionWidth?: number;
  pathOptions?: any;
};
```

## Path Utility Functions

React Flow provides several path generators:

### getBezierPath

Creates smooth curved paths:

```typescript
import { FC } from 'react';
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

const CustomEdge: FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25, // Optional: control curve amount (default 0.25)
  });

  return <BaseEdge path={edgePath} id={id} />;
};
```

### getStraightPath

Creates direct straight lines:

```typescript
import { getStraightPath } from '@xyflow/react';

const [edgePath, labelX, labelY] = getStraightPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
});
```

### getSmoothStepPath

Creates orthogonal paths with smooth corners:

```typescript
import { getSmoothStepPath } from '@xyflow/react';

const [edgePath, labelX, labelY] = getSmoothStepPath({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  borderRadius: 8, // Optional: corner radius
  offset: 20, // Optional: offset from node
});
```

### getSmoothStepPath with borderRadius: 0 (Step Edge)

For orthogonal paths with sharp corners, use `getSmoothStepPath` with `borderRadius: 0`:

```typescript
import { getSmoothStepPath } from '@xyflow/react';

const [edgePath, labelX, labelY] = getSmoothStepPath({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  borderRadius: 0, // Sharp corners (step edge)
  offset: 20, // Optional: offset from node
});
```

## BaseEdge Component

The `BaseEdge` component renders the path with proper styling:

```typescript
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

function CustomEdge(props: EdgeProps) {
  const [edgePath] = getBezierPath(props);

  return (
    <BaseEdge
      id={props.id}
      path={edgePath}
      style={props.style}
      markerEnd={props.markerEnd}
      markerStart={props.markerStart}
      interactionWidth={20} // Wider click target
    />
  );
}
```

## EdgeLabelRenderer for Interactive Labels

Use `EdgeLabelRenderer` to render interactive HTML labels instead of SVG text:

```typescript
import { getBezierPath, EdgeLabelRenderer, BaseEdge, EdgeProps } from '@xyflow/react';

function CustomEdge({ id, data, ...props }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath(props);

  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: '#ffcc00',
            padding: 10,
            borderRadius: 5,
            fontSize: 12,
            fontWeight: 700,
            pointerEvents: 'all', // Enable interactions
          }}
          className="nodrag nopan"
        >
          <button onClick={() => console.log('clicked edge', id)}>
            {data?.label || 'Delete'}
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
```

## Animated Edges

### Dash Animation

Animate the stroke dash pattern:

```typescript
const animatedEdgeStyle = {
  strokeDasharray: '5 5',
  animation: 'dashdraw 0.5s linear infinite',
};

// CSS
// @keyframes dashdraw {
//   to {
//     stroke-dashoffset: -10;
//   }
// }

function AnimatedEdge(props: EdgeProps) {
  const [edgePath] = getBezierPath(props);
  return <BaseEdge path={edgePath} style={animatedEdgeStyle} />;
}
```

### Moving Circle Along Path

```typescript
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

function MovingCircleEdge(props: EdgeProps) {
  const [edgePath] = getBezierPath(props);

  return (
    <>
      <BaseEdge id={props.id} path={edgePath} />
      <circle r="4" fill="#ff0072">
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
    </>
  );
}
```

## SVG Text Labels

For simple text labels along the path:

```typescript
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

function TextLabelEdge({ id, data, ...props }: EdgeProps) {
  const [edgePath] = getBezierPath(props);

  return (
    <>
      <BaseEdge path={edgePath} id={id} />
      <text>
        <textPath
          href={`#${id}`}
          style={{ fontSize: '12px' }}
          startOffset="50%"
          textAnchor="middle"
        >
          {data?.text || ''}
        </textPath>
      </text>
    </>
  );
}
```

## EdgeText Component

For positioned text with background:

```typescript
import { BaseEdge, EdgeText, EdgeProps, getSmoothStepPath } from '@xyflow/react';

function LabeledEdge({ id, data, ...props }: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath(props);

  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      <EdgeText
        x={labelX}
        y={labelY - 5}
        label={data?.text || ''}
        labelBgStyle={{ fill: 'white' }}
        labelStyle={{ fill: 'black' }}
        onClick={() => console.log(data)}
      />
    </>
  );
}
```

## Time Label Edge Example

Custom edge displaying time/duration labels:

```typescript
import { EdgeProps, getBezierPath, EdgeLabelRenderer, BaseEdge } from '@xyflow/react';

type TimeLabelData = {
  duration: string;
  status: 'normal' | 'delayed' | 'critical';
};

export type TimeLabelEdge = Edge<TimeLabelData, 'timeLabel'>;

function TimeLabelEdge({ id, data, selected, ...props }: EdgeProps<TimeLabelEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath(props);

  const statusColors = {
    normal: 'bg-green-100 text-green-800',
    delayed: 'bg-yellow-100 text-yellow-800',
    critical: 'bg-red-100 text-red-800',
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          strokeWidth: selected ? 2 : 1,
          stroke: data?.status === 'critical' ? '#ef4444' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <div className={`px-2 py-1 rounded text-xs font-medium ${statusColors[data?.status || 'normal']}`}>
            {data?.duration || '0m'}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
```

## Edge Registration

Register custom edges in the `edgeTypes` prop:

```typescript
import { ReactFlow, EdgeTypes } from '@xyflow/react';
import TimeLabelEdge from './TimeLabelEdge';
import AnimatedEdge from './AnimatedEdge';

const edgeTypes: EdgeTypes = {
  timeLabel: TimeLabelEdge,
  animated: AnimatedEdge,
};

function Flow() {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      edgeTypes={edgeTypes}
    />
  );
}
```

## Default Edge Options

Set default properties for all edges:

```typescript
import { DefaultEdgeOptions } from '@xyflow/react';

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
  type: 'smoothstep',
  style: { stroke: '#fff', strokeWidth: 2 },
};

<ReactFlow defaultEdgeOptions={defaultEdgeOptions} />
```
