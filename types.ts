/**
 * CarouselAI Type Definitions
 *
 * Central hub for all TypeScript interfaces and enums used throughout the app.
 * These types define the data models that flow between components.
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Slide role classification for content structure.
 * Used by AI generation to create proper carousel flow.
 */
export enum SlideType {
  COVER = 'COVER',       // First slide: Hook/attention grabber
  CONTENT = 'CONTENT',   // Middle slides: Educational/informational
  CTA = 'CTA'            // Last slide: Call to action
}

/**
 * Visual template/style for the carousel.
 * Each style has its own component (TwitterSlide, StorytellerSlide).
 */
export enum CarouselStyle {
  TWITTER = 'TWITTER',           // Tweet screenshot aesthetic (text-focused)
  APPLE_NOTES = 'APPLE_NOTES',   // Reserved for future implementation
  STORYTELLER = 'STORYTELLER'    // Cinematic image overlays (image-focused)
}

// ============================================================================
// TYPE ALIASES
// ============================================================================

/**
 * Post dimensions using CSS aspect-ratio format.
 * Supported ratios for slide export.
 */
export type AspectRatio = '1/1' | '4/5' | '9/16' | '16/9';

/**
 * Color theme for slides.
 */
export type Theme = 'LIGHT' | 'DARK';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * User/creator profile displayed on slides.
 */
export interface Profile {
  name: string;       // Display name (e.g., "John Doe")
  handle: string;     // Username without @ (e.g., "johndoe")
  avatarUrl: string;  // Profile image URL or base64 data URI
}

/**
 * Individual slide data model.
 *
 * IMAGE PROPERTIES EXPLAINED:
 * These properties work together to control image display:
 *
 * - showImage: Master toggle - if false, no image is shown
 * - imageUrl: The actual image (base64 data URI or URL)
 * - imageScale: How much vertical space the image takes (10-90%)
 *   - Twitter: Image appears below text
 *   - Storyteller: Image height from top of slide
 *
 * - overlayImage (Storyteller only):
 *   - true/undefined: Overlay mode - text floats over image with gradient fade
 *   - false: Split mode - hard line between image and text
 *
 * - imageOffsetY: Vertical crop/alignment (0-100, default 50 = centered)
 *   Controls which part of the image is visible (like CSS object-position)
 *
 * - gradientHeight (Storyteller overlay only): Fade overlay intensity (0-100%)
 *   Higher = more gradual fade from image to background
 */
export interface Slide {
  id: string;                    // Unique identifier (UUID)
  type: SlideType;               // Role in carousel flow
  content: string;               // Markdown-formatted text content
  imageUrl?: string;             // Image source (data URI or URL)
  showImage: boolean;            // Whether to display an image
  imagePrompt?: string;          // AI prompt for (re)generating image
  imageScale?: number;           // Image height percentage (10-90)
  overlayImage?: boolean;        // Storyteller: overlay vs split mode
  imageOffsetY?: number;         // Vertical image alignment (0-100)
  gradientHeight?: number;       // Storyteller: gradient overlay size (0-100)
}

/**
 * Complete carousel project data.
 * Used for saving/loading projects (future feature).
 */
export interface CarouselProject {
  id: string;
  style: CarouselStyle;
  aspectRatio: AspectRatio;
  profile: Profile;
  slides: Slide[];
}

/**
 * Onboarding wizard step identifiers.
 * Controls which screen is displayed in App.tsx.
 */
export type AppStep =
  | 'FORMAT_SELECT'        // Step 1: Choose style
  | 'ASPECT_RATIO_SELECT'  // Step 2: Choose dimensions
  | 'PROFILE_INPUT'        // Step 3: Enter profile info
  | 'METHOD_SELECT'        // Step 4: AI or Manual
  | 'AI_INPUT'             // Step 5: AI topic input
  | 'WORKSPACE';           // Step 6: Main editor
