# CarouselAI - Project Context for Claude

## Project Overview

CarouselAI is an Instagram carousel creator that uses Google Gemini AI for content and image generation. Users can create multi-slide carousels with AI-generated text and images, customize styling, and export to PNG.

## Tech Stack

- **React 19** with TypeScript
- **Vite 6** for build/dev server
- **Tailwind CSS** for styling (via CDN in index.html)
- **Google Gemini AI** (`@google/genai`) for text and image generation
- **html-to-image** for PNG export (captures rendered DOM)

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
├── App.tsx                    # Main app, onboarding flow, style selection
├── index.tsx                  # Entry point
├── index.html                 # HTML template with CDN scripts
├── types.ts                   # TypeScript interfaces (Slide, Profile, Theme, etc.)
├── constants.ts               # Default slides, prompts
├── components/
│   ├── Workspace.tsx          # Main editor: sidebar, preview, export logic
│   ├── TwitterSlide.tsx       # Twitter-style slide template
│   └── StorytellerSlide.tsx   # Storyteller-style slide template
└── services/
    └── geminiService.ts       # Gemini AI API integration
```

## Key Files to Understand

- **`Workspace.tsx`** - The main editor component. Contains slide management, image generation, export functionality, and all sidebar controls. Also handles background image generation, layout ordering, and style conversion.
- **`geminiService.ts`** - Handles all Gemini API calls. Exports `generateCarouselContent`, `generateSlideImage`, `stylizeImage`, `editImage`, `refineCarouselContent`, `processDocument`.
- **`types.ts`** - All TypeScript types. Key types: `Slide`, `Profile`, `CarouselStyle`, `Theme`, `AspectRatio`, `FontStyle`, `ContentLayout`, `UploadedDocument`, `CarouselProject`.

## Code Style

- Use functional React components with hooks
- TypeScript strict mode enabled
- Tailwind CSS for all styling (no separate CSS files)
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
- API key stored in localStorage (user enters in UI) or `.env.local`
- Text generation: `gemini-2.5-pro-preview-05-06` or `gemini-2.0-flash`
- Image generation: `gemini-2.0-flash-exp-image-generation`
- Supported aspect ratios for images: 1:1, 4:5, 9:16, 16:9

### Styling
- Two carousel styles: `TWITTER` and `STORYTELLER` (convertible via UI)
- Each style supports `DARK` and `LIGHT` themes
- Post aspect ratios: `1/1` (square) and `4/5` (portrait)

### Layout System
- **ContentLayout** (Twitter only): Controls element ordering - `'default'` | `'image-after-title'` | `'image-first'`
- **Background Image**: Full-bleed background with solid color overlay, separate from illustration image
  - Z-index layers: background (z-0) → overlay (z-1) → illustration (z-2) → content (z-10)
  - Customizable overlay color and opacity (0-100%)
  - AI generation with custom prompts or auto-generated from slide content

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
