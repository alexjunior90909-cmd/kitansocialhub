/**
 * config.ts — Shared edge function configuration
 *
 * HOW TO USE:
 * 1. Set SMS_POOL_API_KEY in the Secrets panel (Cloud → Secrets)
 * 2. Or replace the fallback string below with your real SMSPool API key
 *
 * The env variable takes priority when available.
 */

export const SMS_POOL_API_KEY =
  Deno.env.get('SMS_POOL_API_KEY') || 'PASTE_YOUR_SMSPOOL_API_KEY_HERE';
