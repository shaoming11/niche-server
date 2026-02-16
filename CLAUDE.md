# Complete Backend Implementation Spec for Claude Code

## Tech Stack
- **Backend**: Express.js (Node.js)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (for images)
- **AI**: Gemini API (gemini-2.5-flash)
- **Background Jobs**: Node.js worker threads or simple queue

---
## Database Functions & Triggers

### Trigger: Update post message count
```sql
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
```

### Trigger: Update message likes count
```sql
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
```

### Trigger: Update business rating
```sql
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
```

### Function: Queue AI summary generation
```sql
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
```

---

## Express.js API Routes

### Project Structure
```
/src
  /config
    database.js         # Supabase client setup
    gemini.js          # Gemini client setup
  /middleware
    auth.js            # Authentication middleware
    validation.js      # Request validation
    errorHandler.js    # Global error handler
  /routes
    auth.routes.js
    profiles.routes.js
    businesses.routes.js
    posts.routes.js
    messages.routes.js
    reviews.routes.js
    bookmarks.routes.js
    deals.routes.js
    ai.routes.js
  /controllers
    [corresponding controllers]
  /services
    aiService.js       # AI summary generation
    backgroundJobs.js  # Background job processor
  /utils
    validators.js
    helpers.js
  app.js
  server.js
```

---

## API Endpoints Specification

### Authentication Routes
**File: `/routes/auth.routes.js`**

```javascript
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/verify
POST   /api/auth/refresh
```

#### POST /api/auth/register
```javascript
// Request Body
{
  "email": "user@example.com",
  "password": "securePassword123",
  "username": "johndoe",
  "name": "John Doe"
}

// Response (201)
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe"
  },
  "session": {
    "access_token": "jwt_token",
    "refresh_token": "refresh_token"
  }
}

// Algorithm:
// 1. Validate input (email format, password strength, username uniqueness) using express-validator middleware
// 2. Create user in Supabase Auth: supabase.auth.signUp()
// 3. Create profile in profiles table with user.id
// 4. Return user and session tokens
```

#### POST /api/auth/login
```javascript
// Request Body
{
  "email": "user@example.com",
  "password": "securePassword123"
}

// Response (200)
{
  "user": { /* user object */ },
  "session": { /* session tokens */ }
}

// Algorithm:
// 1. Authenticate with Supabase: supabase.auth.signInWithPassword()
// 2. Return user and session
```

---

### Profile Routes
**File: `/routes/profiles.routes.js`**

```javascript
GET    /api/profiles/:id
PUT    /api/profiles/:id
GET    /api/profiles/:id/posts
GET    /api/profiles/:id/bookmarks
POST   /api/profiles/:id/upload-picture
```

#### GET /api/profiles/:id
```javascript
// Response (200)
{
  "id": "uuid",
  "username": "johndoe",
  "name": "John Doe",
  "bio": "Food enthusiast",
  "interests": ["pizza", "sushi", "coffee"],
  "profile_picture_url": "https://...",
  "created_at": "2024-01-01T00:00:00Z"
}

// Algorithm:
// 1. Query: SELECT * FROM profiles WHERE id = $1
// 2. Return profile data
```

#### PUT /api/profiles/:id
```javascript
// Request Body
{
  "name": "John Doe Updated",
  "bio": "New bio",
  "interests": ["pizza", "tacos"]
}

// Response (200)
{
  "id": "uuid",
  "username": "johndoe",
  "name": "John Doe Updated",
  // ... updated fields
}

// Algorithm:
// 1. Verify auth.uid() === :id (middleware)
// 2. Validate input
// 3. UPDATE profiles SET ... WHERE id = $1
// 4. Return updated profile
```

#### GET /api/profiles/:id/bookmarks
```javascript
// Query params: ?page=1&limit=20

// Response (200)
{
  "bookmarks": [
    {
      "business": { /* full business object */ },
      "bookmarked_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}

// Algorithm:
// 1. Verify auth.uid() === :id OR public profile
// 2. Query:
//    SELECT b.*, bm.created_at as bookmarked_at
//    FROM bookmarks bm
//    JOIN businesses b ON bm.business_id = b.id
//    WHERE bm.user_id = $1
//    ORDER BY bm.created_at DESC
//    LIMIT $2 OFFSET $3
// 3. Return paginated results
```

---

### Business Routes
**File: `/routes/businesses.routes.js`**

```javascript
GET    /api/businesses
GET    /api/businesses/search
GET    /api/businesses/:id
GET    /api/businesses/:id/posts
GET    /api/businesses/:id/reviews
GET    /api/businesses/:id/deals
POST   /api/businesses              // Admin only
PUT    /api/businesses/:id          // Admin only
```

#### GET /api/businesses
```javascript
// Query params: ?category=restaurant&city=Toronto&page=1&limit=20

// Response (200)
{
  "businesses": [
    {
      "id": "uuid",
      "name": "Pizza Palace",
      "description": "Best pizza in town",
      "category": "restaurant",
      "address": "123 Main St",
      "city": "Toronto",
      "average_rating": 4.5,
      "total_ratings": 120,
      "photo_urls": ["https://..."],
      // ... other fields
    }
  ],
  "pagination": { /* pagination object */ }
}

// Algorithm:
// 1. Build dynamic query based on filters:
//    SELECT * FROM businesses
//    WHERE (category = $1 OR $1 IS NULL)
//      AND (city = $2 OR $2 IS NULL)
//    ORDER BY average_rating DESC
//    LIMIT $3 OFFSET $4
// 2. Count total results for pagination
// 3. Return businesses with pagination metadata
```

#### GET /api/businesses/search
```javascript
// Query params: ?q=pizza&category=restaurant&city=Toronto

// Response (200)
{
  "businesses": [ /* array of matching businesses */ ],
  "count": 15
}

// Algorithm:
// 1. Use PostgreSQL full-text search:
//    SELECT * FROM businesses
//    WHERE to_tsvector('english', name || ' ' || description) 
//          @@ plainto_tsquery('english', $1)
//      AND (category = $2 OR $2 IS NULL)
//      AND (city = $3 OR $3 IS NULL)
//    ORDER BY ts_rank(...) DESC
//    LIMIT 50
// 2. Return ranked results
```

#### GET /api/businesses/:id
```javascript
// Response (200)
{
  "id": "uuid",
  "name": "Pizza Palace",
  "description": "Best pizza in town",
  "category": "restaurant",
  "tags": ["pizza", "italian", "delivery"],
  "address": "123 Main St",
  "city": "Toronto",
  "postal_code": "M5V 2T6",
  "latitude": 43.6532,
  "longitude": -79.3832,
  "phone": "+1-416-555-0123",
  "website": "https://pizzapalace.com",
  "order_link": "https://order.pizzapalace.com",
  "menu_url": "https://pizzapalace.com/menu",
  "hours": {
    "monday": "11:00-22:00",
    "tuesday": "11:00-22:00",
    // ...
  },
  "average_rating": 4.5,
  "total_ratings": 120,
  "background_image_url": "https://...",
  "photo_urls": ["https://...", "https://..."],
  "verified": true,
  "created_at": "2024-01-01T00:00:00Z"
}

// Algorithm:
// 1. SELECT * FROM businesses WHERE id = $1
// 2. If not found, return 404
// 3. Return business data
```

#### GET /api/businesses/:id/posts
```javascript
// Query params: ?page=1&limit=20&sort=recent

// Response (200)
{
  "posts": [
    {
      "id": "uuid",
      "title": "Amazing pizza!",
      "content": "Just tried their margherita...",
      "ai_summary": "Users love the authentic taste...",
      "creator": {
        "id": "uuid",
        "username": "johndoe",
        "name": "John Doe",
        "profile_picture_url": "https://..."
      },
      "message_count": 15,
      "last_activity_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-10T08:00:00Z"
    }
  ],
  "pagination": { /* pagination */ }
}

// Algorithm:
// 1. Query:
//    SELECT p.*, 
//           json_build_object(
//             'id', pr.id,
//             'username', pr.username,
//             'name', pr.name,
//             'profile_picture_url', pr.profile_picture_url
//           ) as creator
//    FROM posts p
//    JOIN profiles pr ON p.creator_id = pr.id
//    WHERE p.business_id = $1
//    ORDER BY (sort = 'recent' ? p.last_activity_at : p.created_at) DESC
//    LIMIT $2 OFFSET $3
// 2. Return posts with pagination
```

#### GET /api/businesses/:id/reviews
```javascript
// Query params: ?page=1&limit=20

// Response (200)
{
  "reviews": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Best pizza ever!",
      "user": {
        "id": "uuid",
        "username": "johndoe",
        "name": "John Doe",
        "profile_picture_url": "https://..."
      },
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": { /* pagination */ },
  "stats": {
    "average_rating": 4.5,
    "total_ratings": 120,
    "rating_distribution": {
      "5": 80,
      "4": 25,
      "3": 10,
      "2": 3,
      "1": 2
    }
  }
}

// Algorithm:
// 1. Query reviews:
//    SELECT r.*, 
//           json_build_object(...) as user
//    FROM reviews r
//    JOIN profiles p ON r.user_id = p.id
//    WHERE r.business_id = $1
//    ORDER BY r.created_at DESC
//    LIMIT $2 OFFSET $3
// 2. Query rating distribution:
//    SELECT rating, COUNT(*) as count
//    FROM reviews
//    WHERE business_id = $1
//    GROUP BY rating
// 3. Return reviews with stats
```

---

### Post Routes
**File: `/routes/posts.routes.js`**

```javascript
GET    /api/posts
GET    /api/posts/:id
POST   /api/posts
PUT    /api/posts/:id
DELETE /api/posts/:id
POST   /api/posts/:id/regenerate-summary
```

#### GET /api/posts
```javascript
// Query params: ?page=1&limit=20&sort=hot

// Response (200)
{
  "posts": [
    {
      "id": "uuid",
      "title": "Best coffee shops?",
      "content": "Looking for recommendations...",
      "ai_summary": "Community recommends 3 main spots...",
      "business": {
        "id": "uuid",
        "name": "Coffee Corner",
        "category": "cafe"
      },
      "creator": { /* creator object */ },
      "message_count": 25,
      "last_activity_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-10T08:00:00Z"
    }
  ],
  "pagination": { /* pagination */ }
}

// Algorithm:
// 1. Build query based on sort:
//    - 'hot': ORDER BY (message_count / age_in_hours) DESC
//    - 'recent': ORDER BY last_activity_at DESC
//    - 'top': ORDER BY message_count DESC
// 2. Join with businesses and profiles tables
// 3. Return paginated results
```

#### POST /api/posts
```javascript
// Request Body
{
  "business_id": "uuid",
  "title": "Amazing experience!",
  "content": "I just visited this place and..."
}

// Response (201)
{
  "id": "uuid",
  "business_id": "uuid",
  "creator_id": "uuid",
  "title": "Amazing experience!",
  "content": "I just visited...",
  "ai_summary": null,
  "message_count": 0,
  "created_at": "2024-01-15T10:30:00Z"
}

// Algorithm:
// 1. Verify user is authenticated (middleware)
// 2. Validate business_id exists
// 3. Validate title (3-200 chars) and content (10-10000 chars)
// 4. INSERT INTO posts (business_id, creator_id, title, content)
//    VALUES ($1, auth.uid(), $2, $3)
//    RETURNING *
// 5. Queue AI summary generation (async):
//    SELECT queue_ai_summary($post_id)
// 6. Return created post
```

#### DELETE /api/posts/:id
```javascript
// Response (204) or (403) if has messages

// Algorithm:
// 1. Verify user is authenticated (middleware)
// 2. Query post:
//    SELECT * FROM posts WHERE id = $1
// 3. Verify auth.uid() === creator_id
// 4. Check message_count:
//    IF message_count > 0 THEN
//      RETURN 403 { "error": "Cannot delete post with comments" }
// 5. DELETE FROM posts WHERE id = $1
// 6. Return 204 No Content
```

#### POST /api/posts/:id/regenerate-summary
```javascript
// Response (202)
{
  "message": "Summary generation queued",
  "queue_id": "uuid"
}

// Algorithm:
// 1. Verify post exists
// 2. Insert into ai_summary_queue:
//    INSERT INTO ai_summary_queue (post_id, status)
//    VALUES ($1, 'pending')
// 3. Return 202 Accepted
// 4. Background worker will process queue
```

---

### Message Routes
**File: `/routes/messages.routes.js`**

```javascript
GET    /api/posts/:postId/messages
POST   /api/posts/:postId/messages
PUT    /api/messages/:id
DELETE /api/messages/:id
POST   /api/messages/:id/like
DELETE /api/messages/:id/like
```

#### GET /api/posts/:postId/messages
```javascript
// Query params: ?page=1&limit=50&parent_id=null

// Response (200)
{
  "messages": [
    {
      "id": "uuid",
      "content": "Great post!",
      "user": {
        "id": "uuid",
        "username": "janedoe",
        "name": "Jane Doe",
        "profile_picture_url": "https://..."
      },
      "parent_message_id": null,
      "depth": 0,
      "likes_count": 5,
      "deleted": false,
      "created_at": "2024-01-15T10:30:00Z",
      "replies": [
        {
          "id": "uuid",
          "content": "I agree!",
          "user": { /* user object */ },
          "parent_message_id": "parent_uuid",
          "depth": 1,
          "likes_count": 2,
          "deleted": false,
          "created_at": "2024-01-15T11:00:00Z",
          "replies": []
        }
      ]
    }
  ],
  "pagination": { /* pagination */ }
}

// Algorithm:
// 1. If parent_id is null, fetch top-level messages:
//    SELECT m.*, 
//           json_build_object(...) as user
//    FROM messages m
//    JOIN profiles p ON m.user_id = p.id
//    WHERE m.post_id = $1 AND m.parent_message_id IS NULL
//    ORDER BY m.created_at ASC
//    LIMIT $2 OFFSET $3
// 2. For each top-level message, recursively fetch replies:
//    WITH RECURSIVE message_tree AS (
//      SELECT * FROM messages WHERE id = $parent_id
//      UNION ALL
//      SELECT m.* FROM messages m
//      JOIN message_tree mt ON m.parent_message_id = mt.id
//      WHERE m.depth <= 5  -- Limit nesting depth
//    )
//    SELECT * FROM message_tree ORDER BY created_at ASC
// 3. Build nested structure
// 4. Return messages with nested replies
```

#### POST /api/posts/:postId/messages
```javascript
// Request Body
{
  "content": "This is my comment",
  "parent_message_id": "uuid" // Optional, null for top-level
}

// Response (201)
{
  "id": "uuid",
  "post_id": "uuid",
  "user_id": "uuid",
  "content": "This is my comment",
  "parent_message_id": "uuid",
  "depth": 1,
  "likes_count": 0,
  "created_at": "2024-01-15T10:30:00Z"
}

// Algorithm:
// 1. Verify user is authenticated
// 2. Validate content (1-5000 chars)
// 3. If parent_message_id provided:
//    a. Verify parent message exists and belongs to same post
//    b. Get parent depth: SELECT depth FROM messages WHERE id = $1
//    c. Set depth = parent_depth + 1
//    d. Enforce max depth (e.g., 5 levels)
// 4. INSERT INTO messages (post_id, user_id, content, parent_message_id, depth)
//    VALUES ($1, auth.uid(), $2, $3, $4)
//    RETURNING *
// 5. Trigger will auto-update post.message_count
// 6. Check if should queue AI summary regeneration:
//    IF (SELECT message_count FROM posts WHERE id = $1) % 10 == 0 THEN
//      SELECT queue_ai_summary($1)
// 7. Return created message
```

#### DELETE /api/messages/:id (Soft Delete)
```javascript
// Response (200)
{
  "id": "uuid",
  "deleted": true
}

// Algorithm:
// 1. Verify user is authenticated
// 2. Query message: SELECT * FROM messages WHERE id = $1
// 3. Verify auth.uid() === user_id
// 4. UPDATE messages SET deleted = true, content = '[deleted]'
//    WHERE id = $1
// 5. Do NOT decrement post.message_count (keep thread structure)
// 6. Return updated message
```

#### POST /api/messages/:id/like
```javascript
// Response (201)
{
  "message_id": "uuid",
  "liked": true,
  "likes_count": 6
}

// Algorithm:
// 1. Verify user is authenticated
// 2. INSERT INTO likes (user_id, message_id)
//    VALUES (auth.uid(), $1)
//    ON CONFLICT DO NOTHING
// 3. Trigger will auto-update message.likes_count
// 4. Return updated like status
```

---

### Review Routes
**File: `/routes/reviews.routes.js`**

```javascript
POST   /api/businesses/:businessId/reviews
PUT    /api/reviews/:id
DELETE /api/reviews/:id
```

#### POST /api/businesses/:businessId/reviews
```javascript
// Request Body
{
  "rating": 5,
  "comment": "Amazing food and service!"
}

// Response (201)
{
  "id": "uuid",
  "business_id": "uuid",
  "user_id": "uuid",
  "rating": 5,
  "comment": "Amazing food and service!",
  "created_at": "2024-01-15T10:30:00Z"
}

// Algorithm:
// 1. Verify user is authenticated
// 2. Validate rating (1-5) and comment (optional, max 1000 chars)
// 3. Check if user already reviewed this business:
//    SELECT * FROM reviews 
//    WHERE business_id = $1 AND user_id = auth.uid()
// 4. If exists, return 409 Conflict (or allow update)
// 5. INSERT INTO reviews (business_id, user_id, rating, comment)
//    VALUES ($1, auth.uid(), $2, $3)
//    RETURNING *
// 6. Trigger will auto-update business rating
// 7. Return created review
```

#### PUT /api/reviews/:id
```javascript
// Request Body
{
  "rating": 4,
  "comment": "Updated review"
}

// Response (200)
{ /* updated review */ }

// Algorithm:
// 1. Verify user is authenticated
// 2. Query review: SELECT * FROM reviews WHERE id = $1
// 3. Verify auth.uid() === user_id
// 4. UPDATE reviews SET rating = $2, comment = $3, updated_at = NOW()
//    WHERE id = $1
// 5. Trigger will recalculate business rating
// 6. Return updated review
```

---

### Bookmark Routes
**File: `/routes/bookmarks.routes.js`**

```javascript
POST   /api/bookmarks
DELETE /api/bookmarks/:businessId
```

#### POST /api/bookmarks
```javascript
// Request Body
{
  "business_id": "uuid"
}

// Response (201)
{
  "user_id": "uuid",
  "business_id": "uuid",
  "created_at": "2024-01-15T10:30:00Z"
}

// Algorithm:
// 1. Verify user is authenticated
// 2. Verify business exists
// 3. INSERT INTO bookmarks (user_id, business_id)
//    VALUES (auth.uid(), $1)
//    ON CONFLICT DO NOTHING
// 4. Return bookmark
```

#### DELETE /api/bookmarks/:businessId
```javascript
// Response (204)

// Algorithm:
// 1. Verify user is authenticated
// 2. DELETE FROM bookmarks 
//    WHERE user_id = auth.uid() AND business_id = $1
// 3. Return 204 No Content
```

---

### Deal Routes
**File: `/routes/deals.routes.js`**

```javascript
GET    /api/businesses/:businessId/deals
POST   /api/businesses/:businessId/deals    // Admin/Business owner only
PUT    /api/deals/:id                       // Admin/Business owner only
DELETE /api/deals/:id                       // Admin/Business owner only
```

#### GET /api/businesses/:businessId/deals
```javascript
// Response (200)
{
  "deals": [
    {
      "id": "uuid",
      "business_id": "uuid",
      "title": "20% off lunch special",
      "description": "Valid Monday-Friday 11am-2pm",
      "discount_percentage": 20,
      "code": "LUNCH20",
      "valid_from": "2024-01-01T00:00:00Z",
      "valid_until": "2024-12-31T23:59:59Z",
      "active": true
    }
  ]
}

// Algorithm:
// 1. Query active deals:
//    SELECT * FROM deals
//    WHERE business_id = $1 
//      AND active = true
//      AND valid_until > NOW()
//    ORDER BY created_at DESC
// 2. Return deals
```

---

### AI Routes
**File: `/routes/ai.routes.js`**

```javascript
POST   /api/ai/summarize/:postId    // Manually trigger (admin/testing)
GET    /api/ai/queue                // Check queue status (admin)
```

#### POST /api/ai/summarize/:postId
```javascript
// Response (202)
{
  "message": "Summary generation queued",
  "queue_id": "uuid"
}

// Algorithm:
// Same as POST /api/posts/:id/regenerate-summary
```

---

## Background Job Service

### File: `/services/backgroundJobs.js`

```javascript
/**
 * AI Summary Generation Worker
 * Runs continuously, processes ai_summary_queue
 */

async function processAISummaryQueue() {
  while (true) {
    // 1. Fetch pending job from supabase

    // 2. Mark as processing update supabase status
      // 3. Fetch post and messages from supabase

      // 4. Build prompt

      const prompt = `Summarize the following discussion about "${post.title}":

${messages}

Provide a concise 2-3 sentence summary of the main points and overall sentiment.`;

      // 5. Call Gemini

      // 6. Update post with summary

      // 7. Mark job as completed

      // 8. Mark job as failed
    }
  }
}

// Start worker
processAISummaryQueue();
```

---

## Key Algorithms & Logic

### 1. Nested Comment Tree Builder
```javascript
function buildCommentTree(flatMessages) {
  const messageMap = new Map();
  const rootMessages = [];

  // First pass: Create map
  flatMessages.forEach(msg => {
    messageMap.set(msg.id, { ...msg, replies: [] });
  });

  // Second pass: Build tree
  flatMessages.forEach(msg => {
    if (msg.parent_message_id) {
      const parent = messageMap.get(msg.parent_message_id);
      if (parent) {
        parent.replies.push(messageMap.get(msg.id));
      }
    } else {
      rootMessages.push(messageMap.get(msg.id));
    }
  });

  return rootMessages;
}
```

### 2. Hot Post Ranking Algorithm
```javascript
function calculateHotScore(post) {
  const hoursSinceCreated = (Date.now() - new Date(post.created_at)) / (1000 * 60 * 60);
  const hoursSinceActivity = (Date.now() - new Date(post.last_activity_at)) / (1000 * 60 * 60);
  
  // Decay factor: newer activity = higher score
  const activityDecay = 1 / (hoursSinceActivity + 2);
  
  // Message count factor
  const messageFactor = Math.log10(post.message_count + 1);
  
  // Combined score
  return (messageFactor * activityDecay) / Math.pow(hoursSinceCreated + 2, 1.5);
}
```

### 3. Business Search Ranking
```javascript
// PostgreSQL query with ranking
SELECT 
  b.*,
  ts_rank(
    to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || array_to_string(tags, ' ')),
    plainto_tsquery('english', $searchQuery)
  ) AS search_rank,
  (average_rating / 5.0) * 0.3 + -- 30% weight on rating
  (total_ratings / 100.0) * 0.2 + -- 20% weight on popularity
  ts_rank(...) * 0.5 -- 50% weight on text relevance
  AS combined_score
FROM businesses b
WHERE to_tsvector('english', name || ' ' || COALESCE(description, '')) 
      @@ plainto_tsquery('english', $searchQuery)
ORDER BY combined_score DESC;
```

### 4. AI Summary Trigger Logic
```javascript
// In POST /api/posts/:postId/messages controller
async function afterMessageCreated(postId) {
  const post = await getPost(postId);
  
  // Trigger summary regeneration at thresholds
  const thresholds = [5, 10, 25, 50, 100];
  
  if (thresholds.includes(post.message_count)) {
    await queueAISummary(postId);
  }
  
  // Or: regenerate if last summary is stale
  const hoursSinceLastSummary = 
    (Date.now() - new Date(post.ai_summary_updated_at)) / (1000 * 60 * 60);
  
  if (hoursSinceLastSummary > 24 && post.message_count > 10) {
    await queueAISummary(postId);
  }
}
```

---

## Middleware

### Authentication Middleware
```javascript
// /middleware/auth.js
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.user = user;
  next();
}

async function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    req.user = user;
  }
  
  next();
}
```

### Validation Middleware
```javascript
// /middleware/validation.js
function validatePostCreation(req, res, next) {
  const { title, content, business_id } = req.body;
  
  const errors = [];
  
  if (!title || title.length < 3 || title.length > 200) {
    errors.push('Title must be 3-200 characters');
  }
  
  if (!content || content.length < 10 || content.length > 10000) {
    errors.push('Content must be 10-10000 characters');
  }
  
  if (!business_id || !isValidUUID(business_id)) {
    errors.push('Valid business_id required');
  }
  
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  
  next();
}
```

---

## Environment Variables

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Gemini
GEMINI_API_KEY=sk-...

# Server
PORT=3000
NODE_ENV=development

# Security
JWT_SECRET=your_jwt_secret
CORS_ORIGIN=http://localhost:3000
```

---

## Implementation Checklist

### Phase 1: Core Setup
- [ ] Initialize Express.js project
- [ ] Set up Supabase client
- [ ] Create all database tables with RLS policies
- [ ] Create database triggers and functions
- [ ] Set up authentication middleware

### Phase 2: Basic CRUD
- [ ] Auth routes (register, login, verify)
- [ ] Profile routes (get, update)
- [ ] Business routes (list, get, search)
- [ ] Post routes (create, list, get, delete)
- [ ] Message routes (create, list, nested structure)
- Unit Testing using Jest

### Phase 3: Social Features
- [ ] Review system (create, update, delete)
- [ ] Rating calculation (triggers)
- [ ] Like system (messages)
- [ ] Bookmark system
- Unit Testing using Jest

### Phase 4: AI Integration
- [ ] Gemini service setup
- [ ] AI summary queue system
- [ ] Background job worker
- [ ] Summary generation logic
- Unit Testing using Jest

### Phase 5: Advanced Features
- [ ] Deal/coupon system
- [ ] Advanced search with ranking
- [ ] Hot post algorithm
- [ ] Image upload (Supabase Storage)
- Unit Testing using Jest

### Phase 6: Optimization
- [ ] Add database indexes
- [ ] Implement caching (Redis optional)
- [ ] Rate limiting
- [ ] Error handling
- [ ] Logging
- Unit Testing using Jest