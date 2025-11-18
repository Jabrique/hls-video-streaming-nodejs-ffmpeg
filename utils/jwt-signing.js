const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables
require('dotenv').config();

/**
 * Load JWT configuration from environment variables
 */
function loadJWTConfig() {
  return {
    issuer: process.env.JWT_ISSUER || 'CDN URI Authority',
    audience: process.env.JWT_AUDIENCE || 'mycdn',
    primaryKid: process.env.JWT_PRIMARY_KID || 'primary-key-2024',
    primarySecret: process.env.JWT_PRIMARY_SECRET,
    algorithm: process.env.JWT_ALGORITHM || 'HS256',
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN) || 3600,
    renewalDuration: parseInt(process.env.JWT_RENEWAL_DURATION) || 300
  };
}

/**
 * Convert base64url encoded key to buffer for signing (for jwks.json compatibility)
 */
function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  return Buffer.from(base64 + padding, 'base64');
}

/**
 * Generate JWT token for HLS manifest with URI Signing claims
 * 
 * @param {string} videoName - The name of the video/movie directory (e.g., 'movies1', 'movies2')
 * @param {Object} options - Token generation options
 * @param {string} options.issuer - Token issuer name (default: 'CDN URI Authority')
 * @param {string} options.audience - Token audience (default: 'mycdn')
 * @param {number} options.expiresIn - Token expiration in seconds (default: 3600)
 * @param {number} options.renewalDuration - Cookie renewal duration in seconds (default: 300)
 * @param {string} options.keyId - Key ID to use for signing (default: 'primary-key-2024')
 * @param {string} options.hostname - Hostname for cdniuc regex (default: '[^/]*')
 * @returns {string} JWT token
 */
function generateManifestToken(videoName, options = {}) {
  const config = loadJWTConfig();
  
  const issuer = options.issuer || config.issuer;
  const audience = options.audience || config.audience;
  const expiresIn = options.expiresIn || config.expiresIn;
  const renewalDuration = options.renewalDuration || config.renewalDuration;
  const keyId = options.keyId || config.primaryKid;
  const hostname = options.hostname || '[^/]*';
  
  // Get secret key from environment (only primary key is used for signing at origin)
  const secretKey = process.env.JWT_PRIMARY_SECRET;
  const algorithm = config.algorithm;
  
  if (!secretKey) {
    throw new Error('JWT_PRIMARY_SECRET not found in environment');
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  // Build JWT payload with Apache Traffic Server URI Signing claims
  const payload = {
    // Standard JWT claims
    iss: issuer,                    // Issuer - required
    sub: `manifest:${videoName}`,   // Subject - optional but useful for tracking
    aud: audience,                  // Audience - must match CDN's configured id
    iat: now,                       // Issued at - optional but good practice
    exp: now + expiresIn,           // Expiration time - required
    nbf: now,                       // Not before - optional, prevents token use before this time
    
    // CDN-specific claims for URI Signing
    cdniv: 1,                       // CDN interface version - must be 1 or missing
    
    // cdniuc: Container URI Constraint - regex pattern for allowed paths
    // Path: /videos/videoName/*.ts or *.m3u8 (videoName in lowercase)
    cdniuc: `regex:https?://${hostname}/videos/${videoName}/.*\\.(ts|m3u8|mpd|m4s)`,
    
    // Token renewal claims
    cdnistt: 1,                     // Signed Token Transport - must be 1 for renewal
    cdniets: renewalDuration,       // Token renewal duration in seconds
    //cdnistd: 3                      // Path depth for cookie - /videos/videoName/* = 3 segments
  };
  
  // Sign the token
  const token = jwt.sign(payload, secretKey, {
    algorithm: algorithm,
    header: {
      kid: keyId,                   // Key ID in header for quick key selection
      typ: 'JWT'
    },
    noTimestamp: true               // We manually set iat
  });
  
  return token;
}

/**
 * Verify JWT token (for testing purposes)
 * 
 * @param {string} token - JWT token to verify
 * @param {string} issuer - Expected issuer name
 * @param {string} keyId - Key ID to use for verification
 * @returns {Object} Decoded payload
 */
function verifyToken(token, issuer = null, keyId = null) {
  const config = loadJWTConfig();
  
  // Decode header to get kid if not provided
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) {
    throw new Error('Invalid token format');
  }
  
  const kid = keyId || decoded.header.kid;
  const iss = issuer || config.issuer;
  
  // Get secret key from environment (only primary key for verification at origin)
  const secretKey = process.env.JWT_PRIMARY_SECRET;
  
  if (!secretKey) {
    throw new Error('JWT_PRIMARY_SECRET not found in environment');
  }
  
  // Verify kid matches primary key
  if (kid !== config.primaryKid) {
    throw new Error(`Token signed with unexpected key ID: ${kid} (expected: ${config.primaryKid})`);
  }
  
  // Verify the token
  const payload = jwt.verify(token, secretKey, {
    algorithms: [config.algorithm],
    issuer: iss,
    audience: config.audience
  });
  
  return payload;
}

/**
 * Generate token specifically for a video request
 * Extracts video name from path and generates appropriate token
 * 
 * @param {string} videoPath - Path like '/videos/movies1/playlist.m3u8'
 * @param {Object} options - Token options
 * @returns {string} JWT token
 */
function generateTokenForPath(videoPath, options = {}) {
  // Extract video name from path
  // Expected format: /videos/videoName/playlist.m3u8 or /videoName/playlist.m3u8
  const pathParts = videoPath.split('/').filter(p => p);
  
  // Find the video name (directory before the file)
  let videoName;
  if (pathParts.length >= 2) {
    // If path includes 'videos', get the next part
    const videosIndex = pathParts.indexOf('videos');
    if (videosIndex >= 0 && pathParts.length > videosIndex + 1) {
      videoName = pathParts[videosIndex + 1];
    } else {
      // Otherwise assume second-to-last part is video name
      videoName = pathParts[pathParts.length - 2];
    }
  }
  
  if (!videoName) {
    throw new Error(`Cannot extract video name from path: ${videoPath}`);
  }
  
  return generateManifestToken(videoName, options);
}

module.exports = {
  generateManifestToken,
  generateTokenForPath,
  verifyToken,
  loadJWTConfig
};

