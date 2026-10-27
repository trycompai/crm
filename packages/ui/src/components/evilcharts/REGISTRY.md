# EvilCharts ECharts source

Upstream: https://evilcharts.com
Source: https://github.com/legions-developer/evilcharts
License: MIT. The complete notice is in LICENSE.

The official shadcn registry supplies area, bar, and pie components.
Their shared UI modules use Apache ECharts with Canvas by default.
Each root also supports the SVG renderer.

Installed with Bun in packages/ui:

```sh
bunx --bun shadcn@latest add @evilcharts/echarts-area-chart @evilcharts/echarts-bar-chart @evilcharts/echarts-pie-chart
```

packages/ui/components.json owns the registry namespace.
CRM adaptations fix local imports and React lifecycle integration.
Dashboard wrappers preserve reporting-currency values and accessible summaries.

Tooltips add exact-value formatting and controlled keyboard markers.
Keyboard tooltip updates account for native ECharts refresh timing.
Bottom positioning keeps donut totals visible.
Option updates retain tooltip state and remove obsolete series.
