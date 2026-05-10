export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { pin } = await req.json();
  const correct = process.env.HOME_PIN;

  if (!correct) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const valid = pin === correct;

  return new Response(JSON.stringify({ ok: valid }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
