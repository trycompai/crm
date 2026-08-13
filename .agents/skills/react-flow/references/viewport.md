# Viewport Control

React Flow provides viewport control through the `useReactFlow()` hook, which exposes methods for programmatic navigation, zoom, and coordinate transformations.

## Table of Contents

- [useReactFlow Hook](#usereactflow-hook)
- [fitView Method](#fitview-method)
- [Zoom Methods](#zoom-methods)
- [setViewport Method](#setviewport-method)
- [setCenter Method](#setcenter-method)
- [screenToFlowPosition Method](#screentoflowposition-method)
- [flowToScreenPosition Method](#flowtoscreenposition-method)
- [Save and Restore Viewport State](#save-and-restore-viewport-state)
- [Programmatic Pan to Node](#programmatic-pan-to-node)
- [Controlled Viewport](#controlled-viewport)
- [useOnViewportChange Hook](#useonviewportchange-hook)
- [getNodesBounds Method](#getnodesbounds-method)
- [viewportInitialized Flag](#viewportinitialized-flag)

## useReactFlow Hook

The main hook for accessing viewport and flow instance methods:

```typescript
import { useReactFlow } from '@xyflow/react';

function ViewportControls() {
  const reactFlow = useReactFlow();

  // Access viewport methods
  const handleZoomIn = () => reactFlow.zoomIn();
  const handleFitView = () => reactFlow.fitView();

  return (
    <div>
      <button onClick={handleZoomIn}>Zoom In</button>
      <button onClick={handleFitView}>Fit View</button>
    </div>
  );
}
```

## fitView Method

Adjusts the viewport to fit all nodes in view:

```typescript
import { useReactFlow, FitViewOptions } from '@xyflow/react';

function FitViewExample() {
  const { fitView } = useReactFlow();

  const handleFitView = async () => {
    // Basic usage
    await fitView();

    // With options
    await fitView({
      padding: 0.2, // 20% padding around nodes
      includeHiddenNodes: false, // Don't include hidden nodes
      minZoom: 0.5, // Minimum zoom level
      maxZoom: 2, // Maximum zoom level
      duration: 200, // Animation duration in ms
    });
  };

  return <button onClick={handleFitView}>Fit View</button>;
}
```

### fitView with Specific Nodes

Fit viewport to a subset of nodes:

```typescript
import { useReactFlow } from '@xyflow/react';

function FitSpecificNodes() {
  const { fitView, getNodes } = useReactFlow();

  const fitSelectedNodes = async () => {
    const selectedNodes = getNodes().filter(node => node.selected);

    if (selectedNodes.length > 0) {
      await fitView({
        nodes: selectedNodes,
        padding: 0.3,
        duration: 400,
      });
    }
  };

  return <button onClick={fitSelectedNodes}>Fit Selected</button>;
}
```

## Zoom Methods

```typescript
import { useReactFlow } from '@xyflow/react';

function ZoomControls() {
  const { zoomIn, zoomOut, zoomTo, getZoom } = useReactFlow();

  const handleZoomIn = () => {
    zoomIn({ duration: 300 }); // Animated zoom
  };

  const handleZoomOut = () => {
    zoomOut({ duration: 300 });
  };

  const handleZoomTo = () => {
    zoomTo(1.5, { duration: 500 }); // Zoom to specific level
  };

  const handleGetZoom = () => {
    const currentZoom = getZoom();
    console.log('Current zoom:', currentZoom);
  };

  return (
    <div>
      <button onClick={handleZoomIn}>Zoom In</button>
      <button onClick={handleZoomOut}>Zoom Out</button>
      <button onClick={handleZoomTo}>Zoom to 1.5x</button>
      <button onClick={handleGetZoom}>Get Zoom</button>
    </div>
  );
}
```

## setViewport Method

Directly set the viewport position and zoom:

```typescript
import { useReactFlow, Viewport } from '@xyflow/react';

function ViewportSetter() {
  const { setViewport, getViewport } = useReactFlow();

  const handleSetViewport = () => {
    const newViewport: Viewport = {
      x: 100,
      y: 100,
      zoom: 1.2,
    };

    setViewport(newViewport, { duration: 400 });
  };

  const handleGetViewport = () => {
    const viewport = getViewport();
    console.log('Current viewport:', viewport);
    // { x: 0, y: 0, zoom: 1 }
  };

  return (
    <div>
      <button onClick={handleSetViewport}>Set Viewport</button>
      <button onClick={handleGetViewport}>Get Viewport</button>
    </div>
  );
}
```

## setCenter Method

Center the viewport on specific coordinates:

```typescript
import { useReactFlow } from '@xyflow/react';

function CenterControls() {
  const { setCenter } = useReactFlow();

  const centerOnPosition = () => {
    setCenter(
      250, // x coordinate
      250, // y coordinate
      {
        zoom: 1.5,
        duration: 500,
      }
    );
  };

  return <button onClick={centerOnPosition}>Center on (250, 250)</button>;
}
```

## screenToFlowPosition Method

Convert screen coordinates to flow coordinates:

```typescript
import { useReactFlow } from '@xyflow/react';
import { MouseEvent } from 'react';

function ClickToAddNode() {
  const { screenToFlowPosition, setNodes } = useReactFlow();

  const handlePaneClick = (event: MouseEvent) => {
    // Convert click position to flow coordinates
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    // Add node at click position
    setNodes((nodes) => [
      ...nodes,
      {
        id: `node-${Date.now()}`,
        position,
        data: { label: 'New Node' },
      },
    ]);
  };

  return <ReactFlow onPaneClick={handlePaneClick} />;
}
```

## flowToScreenPosition Method

Convert flow coordinates to screen coordinates:

```typescript
import { useReactFlow } from '@xyflow/react';

function PositionConverter() {
  const { flowToScreenPosition } = useReactFlow();

  const getScreenPosition = () => {
    const screenPos = flowToScreenPosition({
      x: 100,
      y: 100,
    });
    console.log('Screen position:', screenPos);
  };

  return <button onClick={getScreenPosition}>Get Screen Position</button>;
}
```

## Save and Restore Viewport State

```typescript
import { useState } from 'react';
import { useReactFlow, Viewport } from '@xyflow/react';

function ViewportPersistence() {
  const { setViewport, getViewport } = useReactFlow();
  const [savedViewport, setSavedViewport] = useState<Viewport | null>(null);

  const saveViewport = () => {
    const viewport = getViewport();
    setSavedViewport(viewport);
    // Optionally save to localStorage
    localStorage.setItem('flowViewport', JSON.stringify(viewport));
  };

  const restoreViewport = () => {
    if (savedViewport) {
      setViewport(savedViewport, { duration: 300 });
    } else {
      // Load from localStorage
      const stored = localStorage.getItem('flowViewport');
      if (stored) {
        const viewport = JSON.parse(stored) as Viewport;
        setViewport(viewport, { duration: 300 });
      }
    }
  };

  return (
    <div>
      <button onClick={saveViewport}>Save Viewport</button>
      <button onClick={restoreViewport}>Restore Viewport</button>
    </div>
  );
}
```

## Programmatic Pan to Node

Pan the viewport to focus on a specific node:

```typescript
import { useReactFlow } from '@xyflow/react';

function PanToNode() {
  const { getNode, setCenter } = useReactFlow();

  const panToNodeById = (nodeId: string) => {
    const node = getNode(nodeId);

    if (node) {
      const x = node.position.x + (node.width ?? 0) / 2;
      const y = node.position.y + (node.height ?? 0) / 2;

      setCenter(x, y, { zoom: 1.5, duration: 500 });
    }
  };

  return (
    <button onClick={() => panToNodeById('node-1')}>
      Pan to Node 1
    </button>
  );
}
```

## Controlled Viewport

Control viewport directly through state:

```typescript
import { useState, useCallback } from 'react';
import { ReactFlow, Viewport, useReactFlow } from '@xyflow/react';

function ControlledViewportFlow() {
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const { fitView } = useReactFlow();

  const handleViewportChange = useCallback((newViewport: Viewport) => {
    setViewport(newViewport);
  }, []);

  const updateViewport = () => {
    setViewport((vp) => ({ ...vp, y: vp.y + 10 }));
  };

  return (
    <>
      <button onClick={updateViewport}>Move Down</button>
      <button onClick={() => fitView()}>Fit View</button>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        viewport={viewport}
        onViewportChange={handleViewportChange}
      />
    </>
  );
}
```

## useOnViewportChange Hook

Listen to viewport changes:

```typescript
import { useOnViewportChange, Viewport } from '@xyflow/react';
import { useCallback } from 'react';

function ViewportLogger() {
  const onStart = useCallback((viewport: Viewport) => {
    console.log('Viewport change started:', viewport);
  }, []);

  const onChange = useCallback((viewport: Viewport) => {
    console.log('Viewport changing:', viewport);
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

## getNodesBounds Method

Get bounding box of specific nodes:

```typescript
import { useReactFlow } from '@xyflow/react';

function NodeBounds() {
  const { getNodesBounds, getNodes } = useReactFlow();

  const logSelectedBounds = () => {
    const selectedNodes = getNodes().filter(n => n.selected);
    const bounds = getNodesBounds(selectedNodes);

    console.log('Bounds:', {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  };

  return <button onClick={logSelectedBounds}>Log Selected Bounds</button>;
}
```

## viewportInitialized Flag

Check if viewport is initialized before using methods:

```typescript
import { useReactFlow } from '@xyflow/react';

function SafeViewportControls() {
  const { viewportInitialized, fitView } = useReactFlow();

  const handleFitView = () => {
    if (viewportInitialized) {
      fitView();
    } else {
      console.warn('Viewport not yet initialized');
    }
  };

  return (
    <button onClick={handleFitView} disabled={!viewportInitialized}>
      Fit View
    </button>
  );
}
```
