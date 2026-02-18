import { supabaseAdmin } from '../config/database.js';
import { generatePostSummary } from './aiService.js';

async function processAISummaryQueue(): Promise<void> {
  while (true) {
    try {
      // 1. Fetch pending job
      const { data: job, error: fetchError } = await supabaseAdmin
        .from('ai_summary_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (fetchError || !job) {
        // No pending jobs, wait before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue;
      }

      // 2. Mark as processing
      await supabaseAdmin
        .from('ai_summary_queue')
        .update({ status: 'processing' })
        .eq('id', job.id);

      try {
        // 3. Fetch post and messages
        const { data: post } = await supabaseAdmin
          .from('posts')
          .select('title')
          .eq('id', job.post_id)
          .single();

        if (!post) {
          throw new Error('Post not found');
        }

        const { data: messages } = await supabaseAdmin
          .from('messages')
          .select('content')
          .eq('post_id', job.post_id)
          .eq('deleted', false)
          .order('created_at', { ascending: true });

        const messageTexts = (messages || []).map((m: any) => m.content);

        // 4. Generate summary
        const summary = await generatePostSummary(post.title, messageTexts);

        // 5. Update post with summary
        await supabaseAdmin
          .from('posts')
          .update({
            ai_summary: summary,
            ai_summary_updated_at: new Date().toISOString(),
          })
          .eq('id', job.post_id);

        // 6. Mark job as completed
        await supabaseAdmin
          .from('ai_summary_queue')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      } catch (processingError: any) {
        // 7. Mark job as failed
        await supabaseAdmin
          .from('ai_summary_queue')
          .update({
            status: 'failed',
            error_message: processingError.message,
            processed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }
    } catch (err) {
      console.error('Background job error:', err);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

export { processAISummaryQueue };
