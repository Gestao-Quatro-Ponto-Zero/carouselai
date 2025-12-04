/**
 * Gemini AI Service
 *
 * Handles all interactions with Google's Gemini AI API:
 * - API key management (localStorage with env fallback)
 * - Text generation for carousel content
 * - Image generation from prompts
 * - Image stylization (image-to-image transformation)
 *
 * FALLBACK STRATEGY:
 * - Text models: Pro 3 → Pro 2.5 → Flash (recursive on any error)
 * - Image models: Pro → Flash (only on 403 permission errors)
 */

import { GoogleGenAI, Type } from "@google/genai";
import { Slide, SlideType, AspectRatio } from "../types";

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

/**
 * Retrieves the API key from storage.
 * Priority: localStorage (user-entered) → environment variable → empty string
 *
 * The window check prevents SSR errors in case this is used with frameworks like Next.js
 */
const getStoredApiKey = (): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('gemini_api_key') || process.env.API_KEY || '';
  }
  return process.env.API_KEY || '';
};

// Module-level singleton - recreated when setApiKey() is called
let ai = new GoogleGenAI({ apiKey: getStoredApiKey() });

/**
 * Updates the API key at runtime.
 * Persists to localStorage and recreates the AI client instance.
 */
export const setApiKey = (apiKey: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('gemini_api_key', apiKey);
  }
  ai = new GoogleGenAI({ apiKey });
};

/**
 * Returns a masked version of the API key for display in the UI.
 * Shows first 4 and last 4 characters: "AIza****pzrw"
 */
export const getApiKeyMasked = (): string => {
  const key = getStoredApiKey();
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
};

/**
 * Checks if an API key is configured (either in localStorage or env).
 */
export const hasApiKey = (): boolean => {
  return !!getStoredApiKey();
};

// ============================================================================
// MODEL CONSTANTS
// ============================================================================

// Text generation models (used for carousel content)
// Fallback chain: PRO → PRO_2_5 → FLASH
export const TEXT_MODEL_PRO = "gemini-3-pro-preview";
export const TEXT_MODEL_PRO_2_5 = "gemini-2.5-pro-preview-02-05";
export const TEXT_MODEL_FLASH = "gemini-2.5-flash";

// Image generation models (Gemini's image generation API)
// Pro offers 2K resolution but may have restricted access
// Flash is the fallback with broader availability
export const IMAGE_MODEL_PRO = "gemini-3-pro-image-preview";
export const IMAGE_MODEL_FLASH = "gemini-2.5-flash-image";

// ============================================================================
// ASPECT RATIO MAPPING
// ============================================================================

/**
 * Converts app's aspect ratio format (CSS-style) to API format (colon-separated).
 * Gemini image API supports: "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
 */
const getApiAspectRatio = (ratio: AspectRatio): string => {
  const mapping: Record<AspectRatio, string> = {
    '1/1': '1:1',
    '4/5': '4:5',
    '9/16': '9:16',
    '16/9': '16:9'
  };
  return mapping[ratio] || '1:1';
};

// ============================================================================
// TEXT GENERATION (Carousel Content)
// ============================================================================

/**
 * Schema for the JSON response from Gemini text generation.
 * This is what the AI returns; it gets mapped to the app's Slide interface.
 */
interface GeneratedSlideSchema {
  type: string;           // COVER, CONTENT, or CTA
  content: string;        // Markdown-formatted slide text
  suggestedImagePrompt: string;  // Prompt for later image generation
  needsImage: boolean;    // AI's recommendation on whether slide needs an image
}

/**
 * Generates carousel content (text + structure) using Gemini AI.
 *
 * Uses "structured output" to force the AI to return valid JSON matching our schema.
 * This ensures consistent, parseable responses without manual JSON extraction.
 *
 * @param topic - The subject matter for the carousel (e.g., "10 productivity tips")
 * @param count - Number of slides to generate (default: 7)
 * @param modelName - Which model to use (defaults to Pro, falls back automatically)
 * @returns Array of Slide objects ready for the editor
 *
 * FALLBACK CHAIN (recursive):
 * Pro 3 → Pro 2.5 → Flash
 * If any model fails, it automatically tries the next one down the chain.
 */
export const generateCarouselContent = async (topic: string, count: number = 7, modelName: string = TEXT_MODEL_PRO): Promise<Slide[]> => {
  // PROMPT ENGINEERING: Creates a Twitter-thread style carousel with:
  // - Slide 1: Hook/Cover to grab attention
  // - Slides 2-N-1: Educational content
  // - Slide N: Call to Action
  const prompt = `
      Act as a viral social media expert. Create an Instagram Carousel in the style of a "Twitter Thread" about the following topic: "${topic}".
      
      Requirements:
      1. Create exactly ${count} slides.
      2. Slide 1 must be a strong Hook (Type: COVER). Use Markdown for emphasis (e.g. # Header, **bold**).
      3. Slides 2-${count - 1} should be the educational content (Type: CONTENT). Keep text concise, punchy, like a tweet. Use bullet points if needed.
      4. Slide ${count} must be a Call to Action (Type: CTA).
      5. Determine if a slide needs an image to be engaging (needsImage).
      6. Provide a 'suggestedImagePrompt' for image generation later. If no image is needed, return an empty string.
      
      Return strictly JSON.
    `;

  // Inner function to call the API with a specific model
  // Uses "structured output" (responseSchema) to guarantee JSON format
  const generate = async (m: string) => {
      const response = await ai.models.generateContent({
        model: m,
        contents: prompt,
        config: {
          // STRUCTURED OUTPUT: Forces Gemini to return valid JSON
          // matching our schema - no regex parsing needed
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              slides: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    content: { type: Type.STRING },
                    needsImage: { type: Type.BOOLEAN },
                    suggestedImagePrompt: { type: Type.STRING }
                  },
                  required: ["type", "content", "needsImage", "suggestedImagePrompt"]
                }
              }
            }
          }
        }
      });
      return response;
  };

  // Transform API response into app's Slide interface
  const parseResponse = (response: any) => {
      const json = JSON.parse(response.text || "{}");
      const rawSlides = (json.slides || []) as GeneratedSlideSchema[];

      return rawSlides.map((s, index) => ({
        id: crypto.randomUUID(),
        type: (s.type as SlideType) || SlideType.CONTENT,
        content: s.content,
        showImage: s.needsImage,
        imagePrompt: s.suggestedImagePrompt,
        imageUrl: undefined,  // Images are generated separately via generateSlideImage()
        imageScale: 50,       // Default: image takes 50% of slide height
        overlayImage: true    // Default: text overlays image (Storyteller mode)
      }));
  };

  try {
    const response = await generate(modelName);
    return parseResponse(response);
  } catch (error) {
    console.warn(`Error generating carousel content with ${modelName}:`, error);
    
    // Recursive Fallback Chain: Pro 3 -> Pro 2.5 -> Flash
    let fallbackModel: string | null = null;

    if (modelName === TEXT_MODEL_PRO) {
        fallbackModel = TEXT_MODEL_PRO_2_5;
    } else if (modelName === TEXT_MODEL_PRO_2_5) {
        fallbackModel = TEXT_MODEL_FLASH;
    }

    if (fallbackModel) {
        console.log(`Attempting fallback to ${fallbackModel}...`);
        try {
            return await generateCarouselContent(topic, count, fallbackModel);
        } catch (fallbackError) {
            // The recursive call will handle its own logging, but if it bubbles up:
            console.error(`Fallback chain failed at ${fallbackModel}:`, fallbackError);
            throw fallbackError;
        }
    }
    
    // If no fallback model defined (e.g. we failed on Flash), throw original error
    throw error;
  }
};

// ============================================================================
// IMAGE GENERATION
// ============================================================================

/**
 * Generates an image from a text prompt using Gemini's image generation API.
 *
 * @param prompt - Description of the image to generate
 * @param aspectRatio - Desired aspect ratio (converted to API format internally)
 * @param modelName - Which model to use (Pro for 2K quality, Flash for broader access)
 * @returns Base64 data URI of the generated image (ready for <img src="">)
 *
 * FALLBACK STRATEGY (permission-based only):
 * Pro → Flash (only triggers on 403 permission errors, not other failures)
 * This is different from text generation which falls back on ANY error.
 *
 * PROMPT ENHANCEMENT:
 * All prompts are prefixed with "Minimalist, high quality, photorealistic, cinematic lighting."
 * to improve output quality consistently.
 */
export const generateSlideImage = async (prompt: string, aspectRatio: AspectRatio, modelName: string = IMAGE_MODEL_PRO): Promise<string> => {
  const apiAspectRatio = getApiAspectRatio(aspectRatio);

  const generate = async (m: string) => {
      const isPro = m === IMAGE_MODEL_PRO;
      const response = await ai.models.generateContent({
        model: m,
        contents: {
          // Enhance all prompts with quality modifiers
          parts: [{ text: `Minimalist, high quality, photorealistic, cinematic lighting. ${prompt}` }]
        },
        config: {
          imageConfig: {
            aspectRatio: apiAspectRatio,
            // Pro model supports 2K resolution; Flash doesn't support imageSize
            ...(isPro ? { imageSize: "2K" } : {})
          }
        }
      });
      return response;
  }

  try {
    const response = await generate(modelName);
    return extractImage(response);
  } catch (error: any) {
    // PERMISSION-BASED FALLBACK: Only fall back on 403 errors
    // Other errors (rate limits, network issues) should bubble up immediately
    if (modelName === IMAGE_MODEL_PRO && (error?.status === 'PERMISSION_DENIED' || error?.status === 403 || error.message?.includes('403'))) {
       console.warn(`Falling back to ${IMAGE_MODEL_FLASH} due to permission error on ${IMAGE_MODEL_PRO}`);
       try {
           const response = await generate(IMAGE_MODEL_FLASH);
           return extractImage(response);
       } catch (fallbackError) {
           console.error("Fallback image generation also failed:", fallbackError);
           throw fallbackError;
       }
    }
    console.error("Error generating image:", error);
    throw error;
  }
};

/**
 * Extracts the base64 image data from a Gemini API response.
 *
 * Gemini returns a nested structure: response.candidates[0].content.parts[]
 * We look for a part with inlineData.data and wrap it as a data URI.
 *
 * @throws Error if no image data found in response
 */
const extractImage = (response: any): string => {
   for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned from API");
}

// ============================================================================
// IMAGE STYLIZATION (Image-to-Image)
// ============================================================================

/**
 * Transforms an uploaded image using Gemini's image-to-image capability.
 *
 * This is different from generateSlideImage() - instead of generating from text,
 * it takes an existing image and applies a style transformation while preserving
 * the core subject matter.
 *
 * HOW IT WORKS:
 * 1. User uploads an image (converted to base64)
 * 2. User provides a style prompt (e.g., "watercolor painting", "cyberpunk style")
 * 3. Gemini regenerates the image with the requested style applied
 *
 * @param imageBase64 - Raw base64 data (NOT a data URI - no "data:image/..." prefix)
 * @param mimeType - Image MIME type (e.g., "image/png", "image/jpeg")
 * @param stylePrompt - Description of desired transformation
 * @param apiAspectRatio - Already in API format (e.g., "1:1") - preserves original ratio
 * @param modelName - Model to use (Pro for 2K, Flash for fallback)
 * @returns Base64 data URI of the stylized image
 */
export const stylizeImage = async (
  imageBase64: string,
  mimeType: string,
  stylePrompt: string,
  apiAspectRatio: string,
  modelName: string = IMAGE_MODEL_PRO
): Promise<string> => {

  const generate = async (m: string) => {
    const isPro = m === IMAGE_MODEL_PRO;
    const response = await ai.models.generateContent({
      model: m,
      contents: {
        // IMAGE-TO-IMAGE: Send both the source image and transformation prompt
        parts: [
          {
            // Source image as inline data (base64)
            inlineData: {
              mimeType: mimeType,
              data: imageBase64
            }
          },
          {
            // Transformation instructions
            text: `Transform this image with the following style: ${stylePrompt}. Maintain the core subject matter but apply the artistic transformation.`
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: apiAspectRatio,
          ...(isPro ? { imageSize: "2K" } : {})
        }
      }
    });
    return response;
  };

  try {
    const response = await generate(modelName);
    return extractImage(response);
  } catch (error: any) {
    // Same permission-based fallback as generateSlideImage
    if (modelName === IMAGE_MODEL_PRO && (error?.status === 'PERMISSION_DENIED' || error?.status === 403 || error.message?.includes('403'))) {
      console.warn(`Falling back to ${IMAGE_MODEL_FLASH} for stylization`);
      try {
        const response = await generate(IMAGE_MODEL_FLASH);
        return extractImage(response);
      } catch (fallbackError) {
        console.error("Fallback stylization also failed:", fallbackError);
        throw fallbackError;
      }
    }
    console.error("Error stylizing image:", error);
    throw error;
  }
};
