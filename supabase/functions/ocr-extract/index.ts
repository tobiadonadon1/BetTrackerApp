import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GOOGLE_VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();

    if (!image) {
      return new Response(
        JSON.stringify({ error: 'No image data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try Google Vision API
    const visionKey = Deno.env.get('GOOGLE_VISION_API_KEY');
    if (visionKey) {
      try {
        const visionResponse = await fetch(`${GOOGLE_VISION_ENDPOINT}?key=${visionKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: image },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
            }],
          }),
        });

        if (visionResponse.ok) {
          const data = await visionResponse.json();
          const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
          if (text) {
            return new Response(
              JSON.stringify({ text, source: 'google_vision' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } catch (err) {
        console.error('Google Vision failed:', err);
      }
    }

    // Try OCR.space API
    const ocrSpaceKey = Deno.env.get('OCR_SPACE_API_KEY');
    if (ocrSpaceKey) {
      try {
        const formData = new FormData();
        formData.append('base64Image', `data:image/jpeg;base64,${image}`);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2');

        const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          headers: { 'apikey': ocrSpaceKey },
          body: formData,
        });

        if (ocrResponse.ok) {
          const data = await ocrResponse.json();
          if (data.ParsedResults?.[0]?.ParsedText) {
            return new Response(
              JSON.stringify({ text: data.ParsedResults[0].ParsedText, source: 'ocr_space' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } catch (err) {
        console.error('OCR.space failed:', err);
      }
    }

    // No OCR backend configured
    return new Response(
      JSON.stringify({
        error: 'OCR not configured. Set GOOGLE_VISION_API_KEY or OCR_SPACE_API_KEY in Supabase secrets.',
        text: null,
      }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('OCR extraction error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
