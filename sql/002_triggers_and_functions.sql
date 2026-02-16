-- ============================================
-- Triggers and Functions
-- ============================================

-- Trigger: Update post message count
CREATE OR REPLACE FUNCTION update_post_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts
    SET message_count = message_count + 1,
        last_activity_at = NOW()
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.deleted = false THEN
    UPDATE posts
    SET message_count = GREATEST(message_count - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_post_message_count
AFTER INSERT OR UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION update_post_message_count();

-- Trigger: Update message likes count
CREATE OR REPLACE FUNCTION update_message_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE messages
    SET likes_count = likes_count + 1
    WHERE id = NEW.message_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE messages
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = OLD.message_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_message_likes_count
AFTER INSERT OR DELETE ON likes
FOR EACH ROW
EXECUTE FUNCTION update_message_likes_count();

-- Trigger: Update business rating
CREATE OR REPLACE FUNCTION update_business_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE businesses
    SET rating_sum = rating_sum + NEW.rating,
        total_ratings = total_ratings + 1,
        average_rating = ROUND((rating_sum + NEW.rating)::numeric / (total_ratings + 1), 2)
    WHERE id = NEW.business_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE businesses
    SET rating_sum = rating_sum - OLD.rating + NEW.rating,
        average_rating = ROUND(rating_sum::numeric / total_ratings, 2)
    WHERE id = NEW.business_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE businesses
    SET rating_sum = GREATEST(rating_sum - OLD.rating, 0),
        total_ratings = GREATEST(total_ratings - 1, 0),
        average_rating = CASE
          WHEN total_ratings - 1 = 0 THEN 0
          ELSE ROUND((rating_sum - OLD.rating)::numeric / (total_ratings - 1), 2)
        END
    WHERE id = OLD.business_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_business_rating
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_business_rating();

-- Function: Queue AI summary generation
CREATE OR REPLACE FUNCTION queue_ai_summary(p_post_id UUID)
RETURNS UUID AS $$
DECLARE
  queue_id UUID;
BEGIN
  INSERT INTO ai_summary_queue (post_id, status)
  VALUES (p_post_id, 'pending')
  RETURNING id INTO queue_id;

  RETURN queue_id;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_businesses_updated_at
BEFORE UPDATE ON businesses
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_posts_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_messages_updated_at
BEFORE UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_reviews_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_deals_updated_at
BEFORE UPDATE ON deals
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
