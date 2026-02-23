# Google Vision API Setup for BETRA

## Step 1: Create Google Cloud Project (if you don't have one)
1. Go to https://console.cloud.google.com
2. Sign in with Google account
3. Click "Select a project" → "New Project"
4. Name it "betra-ocr" → Click "Create"

## Step 2: Enable Vision API
1. Go to https://console.cloud.google.com/apis/library
2. Search for "Cloud Vision API"
3. Click "Enable"

## Step 3: Create API Key
1. Go to https://console.cloud.google.com/apis/credentials
2. Click "Create Credentials" → "API Key"
3. Copy the key (looks like: AIza...)

## Step 4: Add Key to BETRA
Add this line to `/Users/tobiadonadon/Desktop/BetTrackerApp/src/config/ocr.ts`:

```typescript
export const GOOGLE_VISION_API_KEY = 'YOUR_API_KEY_HERE';
```

Or set environment variable:
```bash
export EXPO_PUBLIC_GOOGLE_VISION_API_KEY=your_api_key_here
```

## Current Status
I've already created:
- ✅ OCR Service (`src/services/ocrService.ts`)
- ✅ Configuration file (`src/config/ocr.ts`)
- ✅ Multi-language support (EN/IT/ES/FR/DE)
- ✅ Error handling with mock fallback

As soon as you add the API key, real OCR will work!

## Free Tier Limits
- 1,000 requests/month FREE
- $1.50 per 1,000 requests after that

**Send me the API key when you have it and I'll add it to the config!**
