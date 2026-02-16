const { supabase } = require('../config/database');

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
    req.user = user || null;
  } else {
    req.user = null;
  }

  next();
}

module.exports = { requireAuth, optionalAuth };
