import { Request } from 'express';

interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Post {
  message_count: number;
  created_at: string;
  last_activity_at: string;
}

interface Message {
  id: string;
  parent_message_id: string | null;
  replies?: Message[];
  [key: string]: unknown;
}

function getPagination(query: Request['query']): PaginationParams {
  const page = parseInt(query.page as string) || 1;
  const limit = Math.min(parseInt(query.limit as string) || 20, 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

function calculateHotScore(post: Post): number {
  const hoursSinceCreated = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
  const hoursSinceActivity = (Date.now() - new Date(post.last_activity_at).getTime()) / (1000 * 60 * 60);

  const activityDecay = 1 / (hoursSinceActivity + 2);
  const messageFactor = Math.log10(post.message_count + 1);

  return (messageFactor * activityDecay) / Math.pow(hoursSinceCreated + 2, 1.5);
}

function buildCommentTree(flatMessages: Message[]): Message[] {
  const messageMap = new Map<string, Message>();
  const rootMessages: Message[] = [];

  flatMessages.forEach(msg => {
    messageMap.set(msg.id, { ...msg, replies: [] });
  });

  flatMessages.forEach(msg => {
    if (msg.parent_message_id) {
      const parent = messageMap.get(msg.parent_message_id);
      if (parent) {
        parent.replies!.push(messageMap.get(msg.id)!);
      }
    } else {
      rootMessages.push(messageMap.get(msg.id)!);
    }
  });

  return rootMessages;
}

export { getPagination, buildPaginationMeta, calculateHotScore, buildCommentTree, PaginationParams, PaginationMeta, Message };
