# Events

React Flow provides comprehensive event handling for nodes, edges, connections, selections, and viewport changes.

## Table of Contents

- [Node Events](#node-events)
  - [Click Events](#click-events)
  - [Drag Events](#drag-events)
  - [Hover Events](#hover-events)
- [Edge Events](#edge-events)
  - [Click Events](#click-events-1)
  - [Hover Events](#hover-events-1)
  - [Edge Update and Reconnect](#edge-update-and-reconnect)
- [Connection Events](#connection-events)
  - [Basic Connection](#basic-connection)
  - [Connection Start and End](#connection-start-and-end)
  - [Validate Connections](#validate-connections)
- [Selection Events](#selection-events)
  - [useOnSelectionChange Hook](#useonselectionchange-hook)
  - [Selection Drag](#selection-drag)
  - [Selection Context Menu](#selection-context-menu)
- [Viewport Events](#viewport-events)
  - [useOnViewportChange Hook](#useonviewportchange-hook)
  - [Move Events](#move-events)
- [Pane Events](#pane-events)
  - [Click Events](#click-events-2)
  - [Mouse Events](#mouse-events)
- [Init and Delete Events](#init-and-delete-events)
  - [Initialization](#initialization)
  - [Delete Events](#delete-events)
- [Error Handling](#error-handling)

## Node Events

### Click Events

```typescript
import { ReactFlow, NodeMouseHandler, Node } from '@xyflow/react';

function NodeClickExample() {
  const onNodeClick: NodeMouseHandler = (event, node) => {
    console.log('Node clicked:', node.id, node.data);
  };

  const onNodeDoubleClick: NodeMouseHandler = (event, node) => {
    console.log('Node double-clicked:', node.id);
  };

  const onNodeContextMenu: NodeMouseHandler = (event, node) => {
    event.preventDefault();
    console.log('Node right-clicked:', node.id);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      onNodeContextMenu={onNodeContextMenu}
    />
  );
}
```

### Drag Events

```typescript
import { ReactFlow, OnNodeDrag, NodeMouseHandler } from '@xyflow/react';

function NodeDragExample() {
  const onNodeDragStart: NodeMouseHandler = (event, node) => {
    console.log('Drag started:', node.id);
  };

  const onNodeDrag: OnNodeDrag = (event, node, nodes) => {
    console.log('Dragging:', node.id, 'at', node.position);
    console.log('All dragged nodes:', nodes.map(n => n.id));
  };

  const onNodeDragStop: NodeMouseHandler = (event, node) => {
    console.log('Drag stopped:', node.id, 'at', node.position);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
    />
  );
}
```

### Hover Events

```typescript
import { ReactFlow, NodeMouseHandler } from '@xyflow/react';

function NodeHoverExample() {
  const onNodeMouseEnter: NodeMouseHandler = (event, node) => {
    console.log('Mouse entered:', node.id);
  };

  const onNodeMouseMove: NodeMouseHandler = (event, node) => {
    console.log('Mouse moving over:', node.id);
  };

  const onNodeMouseLeave: NodeMouseHandler = (event, node) => {
    console.log('Mouse left:', node.id);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseMove={onNodeMouseMove}
      onNodeMouseLeave={onNodeMouseLeave}
    />
  );
}
```

## Edge Events

### Click Events

```typescript
import { ReactFlow, EdgeMouseHandler } from '@xyflow/react';

function EdgeClickExample() {
  const onEdgeClick: EdgeMouseHandler = (event, edge) => {
    console.log('Edge clicked:', edge.id);
    console.log('From:', edge.source, 'To:', edge.target);
  };

  const onEdgeDoubleClick: EdgeMouseHandler = (event, edge) => {
    console.log('Edge double-clicked:', edge.id);
  };

  const onEdgeContextMenu: EdgeMouseHandler = (event, edge) => {
    event.preventDefault();
    console.log('Edge right-clicked:', edge.id);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onEdgeClick={onEdgeClick}
      onEdgeDoubleClick={onEdgeDoubleClick}
      onEdgeContextMenu={onEdgeContextMenu}
    />
  );
}
```

### Hover Events

```typescript
import { ReactFlow, EdgeMouseHandler } from '@xyflow/react';

function EdgeHoverExample() {
  const onEdgeMouseEnter: EdgeMouseHandler = (event, edge) => {
    console.log('Mouse entered edge:', edge.id);
  };

  const onEdgeMouseMove: EdgeMouseHandler = (event, edge) => {
    console.log('Mouse moving over edge:', edge.id);
  };

  const onEdgeMouseLeave: EdgeMouseHandler = (event, edge) => {
    console.log('Mouse left edge:', edge.id);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onEdgeMouseEnter={onEdgeMouseEnter}
      onEdgeMouseMove={onEdgeMouseMove}
      onEdgeMouseLeave={onEdgeMouseLeave}
    />
  );
}
```

### Edge Update and Reconnect

```typescript
import { ReactFlow, OnReconnect, OnReconnectStart, OnReconnectEnd } from '@xyflow/react';

function EdgeReconnectExample() {
  const onReconnect: OnReconnect = (oldEdge, newConnection) => {
    console.log('Edge reconnected:', oldEdge.id);
    console.log('New connection:', newConnection);
  };

  const onReconnectStart: OnReconnectStart = (event, edge, handleType) => {
    console.log('Reconnect started:', edge.id, 'handle:', handleType);
  };

  const onReconnectEnd: OnReconnectEnd = (event, edge, handleType, connectionState) => {
    console.log('Reconnect ended:', edge.id);
    console.log('Connection state:', connectionState);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onReconnect={onReconnect}
      onReconnectStart={onReconnectStart}
      onReconnectEnd={onReconnectEnd}
      edgesReconnectable={true}
    />
  );
}
```

## Connection Events

### Basic Connection

```typescript
import { ReactFlow, OnConnect, addEdge } from '@xyflow/react';
import { useCallback } from 'react';

function ConnectionExample() {
  const [edges, setEdges] = useState<Edge[]>([]);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      console.log('Connection made:', connection);
      console.log('Source:', connection.source);
      console.log('Target:', connection.target);
      console.log('Source Handle:', connection.sourceHandle);
      console.log('Target Handle:', connection.targetHandle);

      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onConnect={onConnect}
    />
  );
}
```

### Connection Start and End

```typescript
import { ReactFlow, OnConnectStart, OnConnectEnd } from '@xyflow/react';

function ConnectionLifecycleExample() {
  const onConnectStart: OnConnectStart = (event, { nodeId, handleId, handleType }) => {
    console.log('Connection started from:', nodeId);
    console.log('Handle:', handleId, 'Type:', handleType);
  };

  const onConnectEnd: OnConnectEnd = (event, connectionState) => {
    console.log('Connection ended');
    console.log('Was valid:', connectionState.isValid);
    console.log('From node:', connectionState.fromNode?.id);
    console.log('To node:', connectionState.toNode?.id);
    console.log('From handle:', connectionState.fromHandle);
    console.log('To handle:', connectionState.toHandle);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
    />
  );
}
```

### Validate Connections

```typescript
import { ReactFlow, Connection, Edge, Node } from '@xyflow/react';

function ValidatedConnectionExample() {
  const isValidConnection = (connection: Connection | Edge) => {
    // Prevent self-connections
    if (connection.source === connection.target) {
      return false;
    }

    // Custom validation logic
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);

    // Prevent connections from output nodes
    if (sourceNode?.type === 'output') {
      return false;
    }

    // Prevent connections to input nodes
    if (targetNode?.type === 'input') {
      return false;
    }

    return true;
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      isValidConnection={isValidConnection}
    />
  );
}
```

## Selection Events

### useOnSelectionChange Hook

```typescript
import { useOnSelectionChange, OnSelectionChangeParams } from '@xyflow/react';
import { useCallback } from 'react';

function SelectionLogger() {
  const onChange = useCallback(({ nodes, edges }: OnSelectionChangeParams) => {
    console.log('Selected nodes:', nodes.map(n => n.id));
    console.log('Selected edges:', edges.map(e => e.id));
  }, []);

  useOnSelectionChange({
    onChange,
  });

  return null;
}

function SelectionExample() {
  return (
    <ReactFlow nodes={nodes} edges={edges}>
      <SelectionLogger />
    </ReactFlow>
  );
}
```

### Selection Drag

```typescript
import { ReactFlow, SelectionDragHandler } from '@xyflow/react';

function SelectionDragExample() {
  const onSelectionDragStart: SelectionDragHandler = (event, nodes) => {
    console.log('Selection drag started:', nodes.length, 'nodes');
  };

  const onSelectionDrag: SelectionDragHandler = (event, nodes) => {
    console.log('Dragging selection:', nodes.map(n => n.id));
  };

  const onSelectionDragStop: SelectionDragHandler = (event, nodes) => {
    console.log('Selection drag stopped');
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onSelectionDragStart={onSelectionDragStart}
      onSelectionDrag={onSelectionDrag}
      onSelectionDragStop={onSelectionDragStop}
    />
  );
}
```

### Selection Context Menu

```typescript
import { ReactFlow, Node, Edge } from '@xyflow/react';

function SelectionContextMenuExample() {
  const onSelectionContextMenu = (event: React.MouseEvent, nodes: Node[]) => {
    event.preventDefault();
    console.log('Context menu on selection:', nodes.map(n => n.id));

    // Show custom context menu
    // ... context menu logic
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onSelectionContextMenu={onSelectionContextMenu}
    />
  );
}
```

## Viewport Events

### useOnViewportChange Hook

```typescript
import { useOnViewportChange, Viewport } from '@xyflow/react';
import { useCallback } from 'react';

function ViewportLogger() {
  const onStart = useCallback((viewport: Viewport) => {
    console.log('Viewport change started:', viewport);
  }, []);

  const onChange = useCallback((viewport: Viewport) => {
    console.log('Viewport:', {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    });
  }, []);

  const onEnd = useCallback((viewport: Viewport) => {
    console.log('Viewport change ended:', viewport);
  }, []);

  useOnViewportChange({
    onStart,
    onChange,
    onEnd,
  });

  return null;
}
```

### Move Events

```typescript
import { ReactFlow, OnMove } from '@xyflow/react';

function MoveExample() {
  const onMove: OnMove = (event, viewport) => {
    console.log('Viewport moved to:', viewport);
  };

  const onMoveStart: OnMove = (event, viewport) => {
    console.log('Move started from:', viewport);
  };

  const onMoveEnd: OnMove = (event, viewport) => {
    console.log('Move ended at:', viewport);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onMove={onMove}
      onMoveStart={onMoveStart}
      onMoveEnd={onMoveEnd}
    />
  );
}
```

## Pane Events

### Click Events

```typescript
import { ReactFlow } from '@xyflow/react';
import { MouseEvent } from 'react';

function PaneClickExample() {
  const onPaneClick = (event: MouseEvent) => {
    console.log('Pane clicked at:', event.clientX, event.clientY);
  };

  const onPaneContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    console.log('Pane right-clicked');
  };

  const onPaneScroll = (event?: MouseEvent | WheelEvent) => {
    console.log('Pane scrolled');
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
      onPaneScroll={onPaneScroll}
    />
  );
}
```

### Mouse Events

```typescript
import { ReactFlow } from '@xyflow/react';
import { MouseEvent } from 'react';

function PaneMouseExample() {
  const onPaneMouseEnter = (event: MouseEvent) => {
    console.log('Mouse entered pane');
  };

  const onPaneMouseMove = (event: MouseEvent) => {
    console.log('Mouse moving over pane');
  };

  const onPaneMouseLeave = (event: MouseEvent) => {
    console.log('Mouse left pane');
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onPaneMouseEnter={onPaneMouseEnter}
      onPaneMouseMove={onPaneMouseMove}
      onPaneMouseLeave={onPaneMouseLeave}
    />
  );
}
```

## Init and Delete Events

### Initialization

```typescript
import { ReactFlow, OnInit, ReactFlowInstance } from '@xyflow/react';

function InitExample() {
  const onInit: OnInit = (reactFlowInstance: ReactFlowInstance) => {
    console.log('React Flow initialized');
    console.log('Viewport:', reactFlowInstance.getViewport());
    reactFlowInstance.fitView();
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onInit={onInit}
    />
  );
}
```

### Delete Events

```typescript
import { ReactFlow, OnNodesDelete, OnEdgesDelete, OnBeforeDelete } from '@xyflow/react';

function DeleteExample() {
  const onNodesDelete: OnNodesDelete = (nodes) => {
    console.log('Nodes deleted:', nodes.map(n => n.id));
  };

  const onEdgesDelete: OnEdgesDelete = (edges) => {
    console.log('Edges deleted:', edges.map(e => e.id));
  };

  const onBeforeDelete: OnBeforeDelete = async ({ nodes, edges }) => {
    console.log('About to delete:', nodes.length, 'nodes and', edges.length, 'edges');

    // Return true to allow deletion, false to cancel
    const confirmed = window.confirm('Delete selected elements?');
    return confirmed;
  };

  const onDelete = ({ nodes, edges }) => {
    console.log('Deleted:', nodes.length, 'nodes and', edges.length, 'edges');
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      onBeforeDelete={onBeforeDelete}
      onDelete={onDelete}
    />
  );
}
```

## Error Handling

```typescript
import { ReactFlow, OnError } from '@xyflow/react';

function ErrorHandlingExample() {
  const onError: OnError = (code, message) => {
    console.error(`React Flow Error [${code}]:`, message);

    // Handle specific error codes
    if (code === '010') {
      console.error('Handle must be rendered inside a custom node');
    }
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onError={onError}
    />
  );
}
```
