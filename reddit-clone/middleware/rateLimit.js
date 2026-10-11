const rateLimit = new Map();

/**
 * Check if a request should be rate limited
 * @param {Object} req - Request object
 * @param {string} identifier - Unique identifier (usually IP address)
 * @param {number} maxRequests - Maximum requests allowed in the time window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} - True if request is allowed, false if rate limited
 */
export function checkRateLimit(req, identifier, maxRequests = 100, windowMs = 60000) {
  if (process.env.DISABLE_RATE_LIMIT === '1') return true;
  const now = Date.now();
  // Each endpoint has its own budget: a page load fetches many icons, which
  // must not use up the allowance for feeds
  const key = `${(req.url || '').split('?')[0]}|${identifier}`;
  const userRequests = rateLimit.get(key) || [];
  
  // Remove old requests outside the window
  const recentRequests = userRequests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimit.set(key, recentRequests);
  
  return true;
}

/**
 * Get client IP address from request
 * @param {Object} req - Request object
 * @returns {string} - IP address
 */
export function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// Clean up old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  const maxAge = 60000; // 1 minute
  
  for (const [key, timestamps] of rateLimit.entries()) {
    const recentTimestamps = timestamps.filter(time => now - time < maxAge);
    
    if (recentTimestamps.length === 0) {
      rateLimit.delete(key);
    } else {
      rateLimit.set(key, recentTimestamps);
    }
  }
}, 300000); // 5 minutes