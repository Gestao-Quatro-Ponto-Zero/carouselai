# CarouselAI

Instagram carousel creator with AI-powered content and image generation.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build to /dist
npm run preview      # Preview production build
```

## Stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 3 (compiled with CSS variables)
- shadcn/ui (Radix UI + Tailwind components)
- lucide-react (icons)
- Google Gemini AI (@google/genai)
- html-to-image for PNG export
- @dnd-kit/core, @dnd-kit/sortable (drag-and-drop)

## Structure

```
App.tsx                     # Onboarding, style selection, editor theme state
index.css                   # Tailwind base + CSS variables for theming
tailwind.config.js          # Extended Tailwind config with shadcn colors
lib/utils.ts                # cn() utility for conditional classes
components/
  Workspace.tsx             # Main editor, export, slide management (drag-and-drop, duplicate)
  TwitterSlide.tsx          # Twitter template
  StorytellerSlide.tsx      # Storyteller template
  ui/                       # shadcn/ui components
    button.tsx, input.tsx, textarea.tsx, label.tsx,
    switch.tsx, slider.tsx, select.tsx, card.tsx,
    toggle.tsx, toggle-group.tsx
services/geminiService.ts   # Gemini API calls
types.ts                    # TypeScript interfaces
```

## Code Style

```tsx
// Functional components with hooks
// Use shadcn/ui components and cn() for conditional classes
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MyComponent: React.FC<Props> = ({ prop1, active }) => {
  const [state, setState] = useState<Type>(initial);

  return (
    <div className={cn(
      "flex items-center gap-4 p-6 rounded-lg",
      active ? "bg-primary text-primary-foreground" : "bg-secondary"
    )}>
      <Button variant="outline" onClick={handleClick}>
        Click me
      </Button>
    </div>
  );
};
```

- TypeScript strict mode
- Tailwind CSS classes with CSS variables (bg-background, text-foreground, etc.)
- shadcn/ui components (Button, Input, Switch, Slider, Select, etc.)
- lucide-react icons (not inline SVGs)
- `const` over `let`
- Descriptive names

## CSS Variables (index.css)

```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --primary: 0 72% 51%;      /* #dc2626 red accent */
  --secondary: 0 0% 96.1%;
  --muted: 0 0% 96.1%;
  --border: 0 0% 89.8%;
}
.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  /* ... dark variants */
}
```

## Key Types

```tsx
interface Slide {
  id: string;
  content: string;
  type: SlideType;
  showImage: boolean;
  imageUrl?: string;
  imageScale?: number;
  fontStyle?: FontStyle;
  fontScale?: number;
  contentLayout?: ContentLayout;
  showBackgroundImage?: boolean;
  backgroundImageUrl?: string;
}

type Theme = 'DARK' | 'LIGHT';           // Slide theme
type EditorTheme = 'light' | 'dark';     // Editor UI theme
type AspectRatio = '1/1' | '4/5' | '9/16' | '16/9';
type CarouselStyle = 'TWITTER' | 'STORYTELLER';
type FontStyle = 'MODERN' | 'SERIF' | 'TECH';
type ContentLayout = 'default' | 'image-after-title' | 'image-first';
```

## Export System

Uses `html-to-image` library:
```tsx
const dataUrl = await window.htmlToImage.toPng(element, {
  width: PREVIEW_WIDTH,
  height: previewHeight,
  backgroundColor: bgColor,
  pixelRatio: 1
});
```

No special handling needed - captures actual rendered pixels.

## Slide Management

```tsx
// Drag-and-drop reordering with @dnd-kit
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove } from '@dnd-kit/sortable';

// Wrap slide list
<DndContext onDragEnd={handleDragEnd}>
  <SortableContext items={slides.map(s => s.id)}>
    {slides.map(slide => <SortableSlideItem key={slide.id} />)}
  </SortableContext>
</DndContext>

// Duplicate slide
const handleDuplicateSlide = (slideId: string) => {
  const slide = slides.find(s => s.id === slideId);
  const duplicate = { ...slide, id: crypto.randomUUID() };
  // Insert after original
};
```

## AI Integration

```tsx
// Text generation
await generateCarouselContent(topic, numberOfSlides, model);

// Image generation
await generateSlideImage(prompt, aspectRatio);

// Image stylization
await stylizeImage(imageBase64, prompt, aspectRatio);

// Image editing
await editImage(imageBase64, editPrompt, aspectRatio);

// Content refinement
await refineCarouselContent(slides, feedback, model);
```

Models:
- Text: `gemini-2.5-pro-preview-05-06`, `gemini-2.0-flash`
- Image: `gemini-2.0-flash-exp-image-generation`

## Do Not

- Commit `.env.local` (API keys)
- Hardcode API keys
- Use html2canvas (use html-to-image instead)
- Create separate CSS files (use Tailwind + CSS variables)
- Use raw HTML elements in editor UI (use shadcn/ui components)
- Forget `crossOrigin="anonymous"` on external images (not needed for data URIs)

## Testing

1. `npm run dev`
2. Create carousel (both styles)
3. Toggle editor themes (Light/Dark via moon/sun icon)
4. Toggle slide themes (Light/Dark in sidebar)
5. Export PNG - verify matches preview
6. Test AI image generation
