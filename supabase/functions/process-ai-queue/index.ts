import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── Gemini setup (replaces your getModel() ───────────────────────────────────
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function generatePostSummary(title: string, messages: string[]): Promise<string> {
  const prompt = `Summarize the following discussion about "${title}":

${messages.join('\n')}

Provide a concise 2-3 sentence summary of the main points and overall sentiment.`;

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(30_000), // replaces your Promise.race timeout
  });

  if (!response.ok) throw new Error(`Gemini error: ${response.statusText}`);

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // 🔒 Secure the function - only allow calls from cron (service role) or your server
  const authHeader = req.headers.get('Authorization');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey,
  );

  // Process up to 5 jobs per invocation (avoids edge function timeouts)
  const BATCH_SIZE = 5;
  const results = { processed: 0, failed: 0, skipped: 0 };

  for (let i = 0; i < BATCH_SIZE; i++) {
    // 1. Atomically claim a pending job (prevents double-processing)
    const { data: job, error } = await supabase
      .from('ai_summary_queue')
      .update({ status: 'processing' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .select()
      .single();

    if (error || !job) {
      results.skipped++;
      break; // No more pending jobs
    }

    console.log(`Processing job ${job.id} for post ${job.post_id}`);

    try {
      // 2. Fetch post title
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('title')
        .eq('id', job.post_id)
        .single();

      if (postError || !post) throw new Error('Post not found');

      // 3. Fetch messages
      const { data: messages } = await supabase
        .from('messages')
        .select('content')
        .eq('post_id', job.post_id)
        .eq('deleted', false)
        .order('created_at', { ascending: true });

      const messageTexts = (messages ?? []).map((m: { content: string }) => m.content);

      // 4. Generate summary
      const summary = await generatePostSummary(post.title, messageTexts);

      // 5. Update post
      await supabase
        .from('posts')
        .update({
          ai_summary: summary,
          ai_summary_updated_at: new Date().toISOString(),
        })
        .eq('id', job.post_id);

      // 6. Mark complete
      await supabase
        .from('ai_summary_queue')
        .update({ status: 'completed', processed_at: new Date().toISOString() })
        .eq('id', job.id);

      results.processed++;
    } catch (err: any) {
      console.error(`Job ${job.id} failed:`, err.message);

      // 7. Mark failed + store error
      await supabase
        .from('ai_summary_queue')
        .update({
          status: 'failed',
          error_message: err.message,
          processed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      results.failed++;
    }
  }

  console.log('Batch complete:', results);
  return Response.json(results);
});