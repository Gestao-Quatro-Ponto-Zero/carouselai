# CarouselAI - Project Context for Claude

## Project Overview

CarouselAI is an Instagram carousel creator that uses Google Gemini AI for content and image generation. Users can create multi-slide carousels with AI-generated text and images, customize styling, and export to PNG.

## Tech Stack

- **React 19** with TypeScript
- **Vite 6** for build/dev server
- **Tailwind CSS 3** for styling with CSS variables (compiled, not CDN)
- **shadcn/ui** - Component library (Radix UI primitives + Tailwind)
- **lucide-react** - Icon library
- **Google Gemini AI** (`@google/genai`) for text and image generation
- **html-to-image** for PNG export (captures rendered DOM)
- **@dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`) for drag-and-drop slide reordering
- **Apify REST API** for Instagram post/reel scraping (browser-compatible, no npm client)

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Build for production
npm run preview      # Preview production build
```

## Project Structure

```
/
├── App.tsx                    # Main app, onboarding flow, editor theme state
├── index.tsx                  # Entry point
├── index.html                 # HTML template with CDN scripts for export libraries
├── index.css                  # Tailwind base + CSS variables for theming
├── tailwind.config.js         # Extended Tailwind config with shadcn colors
├── types.ts                   # TypeScript interfaces (Slide, Profile, Theme, etc.)
├── constants.ts               # Default slides, prompts
├── lib/
│   └── utils.ts               # cn() utility for conditional classes
├── components/
│   ├── Workspace.tsx          # Main editor: sidebar, preview, export logic
│   ├── TwitterSlide.tsx       # Twitter-style slide template
│   ├── StorytellerSlide.tsx   # Storyteller-style slide template
│   └── ui/                    # shadcn/ui components
│       ├── button.tsx
│       ├── input.tsx
│       ├── textarea.tsx
│       ├── label.tsx
│       ├── switch.tsx
│       ├── slider.tsx
│       ├── select.tsx
│       ├── card.tsx
│       ├── toggle.tsx
│       └── toggle-group.tsx
└── services/
    ├── geminiService.ts       # Gemini AI API integration
    └── instagramService.ts    # Instagram scraping via Apify REST API
```

## Key Files to Understand

- **`Workspace.tsx`** - The main editor component. Contains slide management (add, delete, duplicate, reorder via drag-and-drop), image generation, export functionality, and all sidebar controls. Also handles background image generation, layout ordering, and style conversion.
- **`geminiService.ts`** - Handles all Gemini API calls. Exports `generateCarouselContent`, `generateSlideImage`, `stylizeImage`, `editImage`, `refineCarouselContent`, `processDocument`. Also handles Instagram media upload via Gemini Files API.
- **`instagramService.ts`** - Handles Instagram scraping via Apify REST API. Exports URL detection (`extractInstagramUrls`), API key management (`setApifyApiKey`, `getApifyApiKey`), scraping (`scrapeInstagramPost`), and media download (`downloadMediaAsBlob`).
- **`types.ts`** - All TypeScript types. Key types: `Slide`, `Profile`, `CarouselStyle`, `Theme`, `AspectRatio`, `FontStyle`, `ContentLayout`, `UploadedDocument`, `CarouselProject`.

## Code Style

- Use functional React components with hooks
- TypeScript strict mode enabled
- Tailwind CSS for all styling with CSS variables
- Use shadcn/ui components for UI (Button, Input, Switch, Slider, Select, etc.)
- Use `cn()` utility from `lib/utils.ts` for conditional class names
- Use lucide-react icons instead of inline SVGs where possible
- Use `const` over `let` when possible
- Descriptive variable names
- Keep components focused - extract if over 300 lines

## Architecture Notes

### Export System
- Uses `html-to-image` library (NOT html2canvas) for PNG export
- Captures visible preview element directly (not hidden off-screen elements)
- Waits for all images to load before capturing
- `crossOrigin="anonymous"` only needed for external URLs, NOT for data URIs (base64)

### AI Integration
- Gemini API key stored in localStorage (user enters in UI) or `.env.local`
- Apify API token stored in localStorage (user enters in UI, for Instagram scraping)
- Text generation: `gemini-3-pro-preview` (main), `gemini-2.5-flash` (backup)
- Image generation: `gemini-3-pro-image-preview` (main), `gemini-2.5-flash-image` (backup)
- Supported aspect ratios for images: 1:1, 4:5, 9:16, 16:9
- Instagram media (images/videos) are downloaded as Blob, uploaded to Gemini Files API, then referenced via `createPartFromUri`

### Styling
- **Editor UI Theme**: Light mode (default) or Dark mode, controlled by `editorTheme` state in App.tsx
  - Applies `dark` class to document root
  - Uses CSS variables in `index.css` for consistent theming
  - Primary accent color: `#dc2626` (red-600)
- **Carousel/Slide Themes**: `DARK` and `LIGHT` themes for the slide output (separate from editor theme)
- Two carousel styles: `TWITTER` and `STORYTELLER` (convertible via UI)
- Post aspect ratios: `1/1` (square) and `4/5` (portrait)

### Layout System
- **ContentLayout** (Twitter only): Controls element ordering - `'default'` | `'image-after-title'` | `'image-first'`
- **Background Image**: Full-bleed background with solid color overlay, separate from illustration image
  - Z-index layers: background (z-0) → overlay (z-1) → illustration (z-2) → content (z-10)
  - Customizable overlay color and opacity (0-100%)
  - AI generation with custom prompts or auto-generated from slide content

### Slide Management
- **Drag-and-drop reordering**: Uses @dnd-kit with `DndContext`, `SortableContext`, and `useSortable` hook
- **Duplicate slide**: Creates a deep copy with new UUID, inserted after original
- **Delete slide**: Removes slide and selects first remaining slide if active was deleted

## Important Constraints

- NEVER commit `.env.local` (contains API keys)
- NEVER hardcode API keys in source files
- External images need `crossOrigin="anonymous"` for export, but NOT data URIs
- Tailwind classes only - no inline style objects unless dynamic values needed

## Testing Changes

1. Run `npm run dev`
2. Create a carousel with both styles (Twitter & Storyteller)
3. Test with both themes (Light & Dark)
4. Export slides and verify PNG output matches preview
5. Test image generation with different aspect ratios
