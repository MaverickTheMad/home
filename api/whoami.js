export const config = { runtime: 'edge' };

// Cloudflare Access injects the authenticated user's email as a request
// header once the request has passed the Household policy. A static page
// can't read request headers, so this thin proxy returns it. No secret.
export default function handler(req) {
  const email =
    req.headers.get('cf-access-authenticated-user-email') || null;

  return new Response(JSON.stringify({ email }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
