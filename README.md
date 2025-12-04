# CarouselAI

Create viral Instagram carousels in seconds with AI-powered content and image generation.

CarouselAI helps content creators, marketers, and social media managers build professional-looking Instagram carousels without design skills. Just provide a topic and let AI do the heavy lifting.

## Screenshots

<p align="center">
  <img src="docs/start-screen.png" alt="Start Screen" width="600"/>
  <br/>
  <em>Choose between AI-powered generation or manual creation</em>
</p>

<p align="center">
  <img src="docs/style-selection.png" alt="Style Selection" width="600"/>
  <br/>
  <em>Select your carousel style: Twitter or Storyteller</em>
</p>

<p align="center">
  <img src="docs/workspace.png" alt="Workspace Editor" width="800"/>
  <br/>
  <em>Full-featured workspace with live preview and customization options</em>
</p>

## Features

### AI-Powered Content Generation

- **Gemini 3 Pro Integration** - Uses Google's latest AI model for high-quality content
- **Automatic Slide Structuring** - Generates 5-10 slides with proper flow (hook, content, CTA)
- **Smart Slide Types** - Creates Cover slides, Content slides, and Call-to-Action slides
- **Image Prompt Suggestions** - AI suggests relevant image prompts for each slide

### AI Image Generation

- **Gemini 3 Pro Image Model** - Generate stunning images directly in the app
- **Multiple Aspect Ratios** - Support for 1:1 (square), 4:5 (portrait), 9:16 (story), and 16:9 (landscape)
- **Image Stylization** - Upload your own images and transform them with AI style prompts
- **Batch Generation** - Generate images for multiple slides simultaneously
- **Pro & Flash Models** - Choose between quality (Pro) or speed (Flash)

### Multiple Carousel Styles

| Style | Description |
|-------|-------------|
| **Twitter Style** | Classic tweet-screenshot aesthetic. Clean, text-focused, authoritative. Perfect for thought leadership content. |
| **Storyteller** | Image-first with bold typography and cinematic overlays. High visual impact for engaging stories. |

### Rich Customization Options

- **Light & Dark Themes** - Match your brand or preference
- **Custom Accent Colors** - Full color picker for brand consistency
- **Adjustable Header/Footer Size** - Scale from 50% to 200%
- **Slide Numbers** - Toggle slide count indicator
- **Verified Badge** - Add authenticity to your profile display
- **Image Controls**:
  - Height adjustment (10-90%)
  - Vertical position/cropping
  - Gradient overlay intensity (Storyteller mode)
  - Top fade toggle

### Export Options

- **Individual Slide Download** - Export single slides as PNG
- **Full Carousel ZIP** - Download all slides in one click
- **High Resolution** - 1080px width for crisp Instagram uploads
- **What You See Is What You Get** - Export matches preview exactly

## Getting Started

### Prerequisites

- Node.js 18 or higher
- A Google Gemini API key ([Get one free](https://aistudio.google.com/apikey))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/carouselai.git
   cd carouselai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up your API key** (choose one method)

   **Option A: In-app configuration (recommended)**

   Simply launch the app and enter your API key in the UI - it will be saved to your browser's local storage.

   **Option B: Environment file**

   Create a `.env.local` file in the project root:
   ```
   API_KEY=your_gemini_api_key_here
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**

   Navigate to [http://localhost:5173](http://localhost:5173)

## Usage Guide

### Creating a Carousel with AI

1. **Launch the app** and select "Use AI Magic"
2. **Enter your topic** - Be specific for better results (e.g., "10 productivity tips for remote workers")
3. **Choose a style** - Twitter for text-focused, Storyteller for image-heavy
4. **Select aspect ratio** - 1:1 for feed posts, 4:5 for maximum visibility
5. **Review generated content** - Edit text, adjust images, customize styling
6. **Generate images** - Click "AI Generate" on each slide or use batch generation
7. **Export** - Download individual slides or the entire carousel as ZIP

### Manual Creation

1. Select "Manual Creation" from the start screen
2. Add slides using the + button
3. Write your content with Markdown support (bold, italic, headers, lists)
4. Upload or generate images for each slide
5. Customize and export

### Tips for Best Results

- **Be specific with topics** - "5 React hooks every developer should know" works better than "React tips"
- **Use image prompts** - Override the default prompt for more relevant images
- **Match aspect ratios** - Use 16:9 for Storyteller backgrounds, 1:1 for Twitter style
- **Preview before export** - What you see is what you get

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite 6** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Google Gemini AI** - Content and image generation
- **html-to-image** - PNG export

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

## License

MIT
