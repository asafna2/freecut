# Video Editor Refactor

Modern browser-based video editor with React 19, TypeScript 5.9, high-performance storage (OPFS + IndexedDB), and Remotion-powered composition.

## Important Notes
- Project or tree structure docs might not reflect the state written due to incremental updates. Always cross reference and check if unclear. 

## Tech Stack

- **React 19.2** - Activity, Effect Events, concurrent rendering
- **Vite 8.1.0** - Build tool with fast HMR
- **TypeScript 5.9.3** - Import defer, enhanced type inference
- **TanStack Router 1.91.6** - Type-safe routing with loaders
- **Zustand 5.0.8** - State management (use granular selectors!)
- **Zundo 2.3.0** - Undo/Redo middleware for zustand
- **Remotion 4.0.375** - Server-side video composition and rendering
- **mediabunny 1.25.0** - Video processing
- **Shadcn 3.5.0** - UI components (Radix + Tailwind)
- **Tailwind 4.1.17** - Styling with utility classes

## Critical: State Management

**Always use granular Zustand selectors** - `useStore(s => s.value)` not `useStore()`

See `.claude/docs/video-editor/state-management.md` for patterns and optimization.

## Core Architecture

**Routing:** Type-safe client-side routing with TanStack Router - file-based or route tree, typed params, and data loaders.
See `.claude/docs/video-editor/routing.md`

**Storage:** Two-tier architecture - OPFS for media files (3-4x faster), IndexedDB for metadata.
See `.claude/docs/video-editor/storage.md`

**Components:** Timeline (modular multi-track editor with specialized components, hooks, and stores) and VideoEditor (complete editing shell) are main editing components.
See `.claude/docs/video-editor/components-usage.md` and `.claude/docs/video-editor/timeline-architecture.md`

**CRUD:** Project management with Zustand stores, API client for backend, and TanStack Router loaders.
See `.claude/docs/video-editor/crud-patterns.md`

**Integration:** Server-side Remotion rendering, mediabunny for video processing, media adaptors for external sources.
See `.claude/docs/video-editor/integration.md`

## Conventions

- **File naming:** Use PascalCase for component names, kebab-case for the files that contain them and for utils/hooks/stores
- **Imports:** React/libs → stores → components → utils/types
- **TypeScript:** Strict null checks, `import defer` for heavy libs

See `.claude/docs/video-editor/conventions.md` for complete guidelines.

## Documentation

**Organization:** All application docs in `.claude/docs/video-editor/`. Keep `.claude/docs/` root clean.

**All docs in `.claude/docs/video-editor/`:**
- `routing.md` - TanStack Router setup, type-safe routes, loaders
- `crud-patterns.md` - Project CRUD with Zustand, API client, forms
- `storage.md` - OPFS/IndexedDB architecture, worker patterns, schemas
- `components-usage.md` - Timeline/VideoEditor examples and API
- `timeline-architecture.md` - Timeline component structure, hooks, stores, utilities
- `architecture.md` - Project tree, component hierarchy
- `integration.md` - Server-side Remotion rendering, mediabunny, media adaptors
- `error-handling.md` - Storage errors, quota management, recovery
- `react-patterns.md` - React 19 features (Activity, Effect Events)
- `state-management.md` - Zustand v5 best practices, re-render optimization
- `conventions.md` - File naming, imports, TypeScript config
- `development.md` - Setup, testing, debugging

**External:**
- [TanStack Router Docs](https://tanstack.com/router/latest)
- [Remotion Server Rendering](https://www.remotion.dev/docs/renderer)
- [Timeline Component API](https://www.reactvideoeditor.com/docs/core/components/timeline)
- [React Video Editor API](https://www.reactvideoeditor.com/docs/core/components/react-video-editor)
- [Vite Tailwind Setup](https://tailwindcss.com/docs/installation/using-vite)

## Development

```bash
npm install     # Install dependencies
npm run dev     # Start dev server (localhost:5173)
npm run build   # Production build
```

**Browser Requirements:** Chrome/Edge 102+, Safari macOS 12.2+/iOS 15.2+, Firefox latest

## Key Reminders

- **TanStack Router:** Use type-safe routes, leverage loaders for data fetching
- **Zustand:** Use granular selectors to prevent re-renders
- **Storage:** Check quota before large uploads, handle QuotaExceededError
- **React 19:** Use Activity for show/hide, Effect Events for playback sync
- **TypeScript:** Use `import defer` for mediabunny and other heavy libraries
- **Remotion:** Server-side rendering with `@remotion/renderer`, not client-side

See `.claude/docs/` for comprehensive documentation on all topics.
