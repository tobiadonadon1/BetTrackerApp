// OCR Configuration
// To use Google Vision API:
// 1. Get API key from https://cloud.google.com/vision
// 2. Set EXPO_PUBLIC_GOOGLE_VISION_API_KEY in your .env file

export const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY;

export const GOOGLE_VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

// Supported languages for OCR
export const SUPPORTED_LANGUAGES = ['en', 'it', 'es', 'fr', 'de'];

