// OCR + Gemini text (match lookup). Set EXPO_PUBLIC_GEMINI_API_KEY in .env

export const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY;
export const GOOGLE_VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

export const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

export const SUPPORTED_LANGUAGES = ['en', 'it', 'es', 'fr', 'de'];
