/**
 * order-download Edge Function
 * 
 * Verifies purchase ownership, then returns a short-lived signed URL
 * for a specific order-content image (or all image URLs for Download All).
 * 
 * DB tables accessed:
 *   - purchases: verify app_user_id owns product_id/product_type
 *   - order_content: fetch image_urls + text_content
 * 
 * Storage bucket: order-content
 *   - Paths: {productId}/{timestamp}_{random}.{ext}
 *   - Signed URLs expire in 3600 seconds (1 hour)
 * 
 * Request body:
 *   { appUserId: string, productId: string, productType: string, imageIndex?: number }
 *   imageIndex = -1 → return ALL signed URLs
 *   imageIndex >= 0 → return single signed URL at that index
 * 
 * Response:
 *   { signedUrl?: string, signedUrls?: string[], filename?: string, filenames?: string[] }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  // CORS preflight — must be first
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { appUserId, productId, productType, imageIndex } = await req.json() as {
      appUserId: string;
      productId: string;
      productType: string;
      imageIndex?: number; // -1 = all, >= 0 = single
    };

    if (!appUserId || !productId || !productType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: appUserId, productId, productType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Service role client — bypasses RLS for server-side verification
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ---- 1. Verify purchase ownership ----
    const { data: purchaseRows, error: purchaseError } = await supabase
      .from('purchases')
      .select('id')
      .eq('app_user_id', appUserId)
      .eq('product_id', productId)
      .eq('product_type', productType)
      .limit(1);

    if (purchaseError) {
      console.error('Purchase lookup error:', purchaseError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to verify purchase' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!purchaseRows || purchaseRows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Access denied: no purchase record found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- 2. Fetch order content ----
    const { data: contentRow, error: contentError } = await supabase
      .from('order_content')
      .select('image_urls, text_content')
      .eq('product_id', productId)
      .eq('product_type', productType)
      .single();

    if (contentError || !contentRow) {
      return new Response(
        JSON.stringify({ error: 'Order content not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const imageUrls: string[] = (contentRow.image_urls as string[]) || [];

    // ---- Helper: extract storage path from public URL ----
    const extractPath = (publicUrl: string): string => {
      // URL format: .../storage/v1/object/public/order-content/{path}
      const marker = '/object/public/order-content/';
      const idx = publicUrl.indexOf(marker);
      if (idx !== -1) return publicUrl.slice(idx + marker.length);
      // Fallback: try sign path directly
      const altMarker = 'order-content/';
      const altIdx = publicUrl.lastIndexOf(altMarker);
      return altIdx !== -1 ? publicUrl.slice(altIdx + altMarker.length) : publicUrl;
    };

    // ---- Helper: get original filename from path ----
    const getFilename = (url: string, index: number): string => {
      const path = extractPath(url);
      const parts = path.split('/');
      const rawName = parts[parts.length - 1] || `image-${index + 1}`;
      // Strip timestamp prefix if present (e.g. "1234567890_abc.jpg" -> keep as-is for authenticity)
      // Add product prefix for recognizability
      const ext = rawName.includes('.') ? rawName.split('.').pop() : 'jpg';
      return `order-${productId.slice(-6)}-${index + 1}.${ext}`;
    };

    // ---- Helper: generate signed URL for a single storage path ----
    const signUrl = async (url: string): Promise<string> => {
      const path = extractPath(url);
      console.log('Signing path:', path);
      const { data, error } = await supabase.storage
        .from('order-content')
        .createSignedUrl(path, 3600); // 1 hour expiry
      if (error || !data?.signedUrl) {
        console.error('Sign URL error for path:', path, error?.message);
        // Fall back to public URL if signing fails
        return url;
      }
      return data.signedUrl;
    };

    // ---- 3. Return signed URL(s) ----
    if (imageIndex === -1 || imageIndex === undefined) {
      // Return ALL signed URLs + text content
      const signedUrls = await Promise.all(imageUrls.map(u => signUrl(u)));
      const filenames = imageUrls.map((u, i) => getFilename(u, i));

      return new Response(
        JSON.stringify({
          signedUrls,
          filenames,
          textContent: contentRow.text_content as string,
          totalImages: imageUrls.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Return single signed URL
      const targetUrl = imageUrls[imageIndex];
      if (!targetUrl) {
        return new Response(
          JSON.stringify({ error: `Image index ${imageIndex} out of range (total: ${imageUrls.length})` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const signedUrl = await signUrl(targetUrl);
      const filename = getFilename(targetUrl, imageIndex);

      return new Response(
        JSON.stringify({ signedUrl, filename }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('order-download error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
