# Modular Frontend

React application for visualizing and exploring knowledge graphs extracted from scientific papers.

## Tech Stack

- **React 18** with TypeScript
- **Vite** for development and bundling
- **TanStack Query** for server state management
- **react-force-graph-2d** for interactive graph visualization
- **react-pdf** for PDF viewing with source highlighting
- **shadcn/ui** components (Accordion, Button, Card, Dialog)
- **Tailwind CSS** for styling

## Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui components
│   ├── Library.tsx      # Main library view (orchestrates graph + panels)
│   ├── KnowledgeGraph.tsx   # Force-directed graph visualization
│   ├── GraphPanel.tsx   # Graph controls and filter panel
│   ├── ElementPanel.tsx # Node/edge detail panel
│   ├── SourcePanel.tsx  # PDF viewer panel
│   └── PdfViewer.tsx    # PDF rendering with bbox highlights
├── hooks/
│   ├── useLibrary.ts    # Fetch library data from API
│   ├── useGraphData.ts  # Transform library data to graph format
│   └── useSourceLoader.ts   # Load TEI XML for source highlighting
├── lib/
│   ├── graph-utils.ts   # Graph transformation and helper functions
│   └── pdf-utils.ts     # PDF/TEI parsing utilities
└── types/
    └── graph.ts         # TypeScript types for graph data
```

## Development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
npm run preview
```
