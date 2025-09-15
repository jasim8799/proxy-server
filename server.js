const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression'); // ✅ Added
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

const app = express();
// --- Compression ---
app.use(compression()); // ✅ Added

// --- Security Middleware ---
app.use(helmet());
app.use(cors());
app.use(express.json());

// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per minute
});
app.use(limiter);

// --- Proxy Real API (Render backend) ---
app.use(
  '/proxy',
  createProxyMiddleware({
    target: process.env.REAL_API_URL, // Example: https://api-15hv.onrender.com
    changeOrigin: true,
    pathRewrite: { '^/proxy': '' },
    onProxyReq: (proxyReq, req, res) => {
      // 🔁 Fix here: Set correct API key header
      proxyReq.setHeader('x-api-key', process.env.API_KEY); // ✅ Required by auth.js
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Accept', 'application/json');
      console.log(`🔁 Proxying API: ${req.method} ${req.originalUrl}`);
    },
    onError: (err, req, res) => {
      console.error('❌ API Proxy error:', err.message);
      res.status(504).json({ error: 'API proxy server error', message: err.message });
    },
    timeout: 60000,
    proxyTimeout: 60000,
  })
);

// --- Proxy Cloudflare Video ---
app.use(
  '/proxy/video',
  createProxyMiddleware({
    target: 'http://dummy', // dummy, will be overridden
    changeOrigin: true,
    selfHandleResponse: false,
    router: function (req) {
      const url = req.query.url || req.originalUrl;
      if (!url) return 'https://cloudflare-default.com'; // fallback

      if (url.includes('b-cdn.net') || url.includes('cloudflare')) {
        return url; // Cloudflare URL
      }
      if (url.includes('wasabisys.com') || url.includes('wasabi')) {
        return url; // Wasabi URL
      }
      return url; // fallback to original
    },
    onProxyReq: (proxyReq, req, res) => {
      proxyReq.setHeader('Accept', '*/*');
      proxyReq.setHeader('User-Agent', 'Mozilla/5.0');
      console.log(`🎥 Proxying video: ${req.originalUrl}`);
    },
    onError: (err, req, res) => {
      console.error('❌ Video Proxy error:', err.message);
      res.status(504).send('Video Proxy error.');
    },
    timeout: 60000,
    proxyTimeout: 60000,
  })
);

// --- Default Route ---
app.get('/', (req, res) => {
  res.send('🔒 Proxy Server is running securely.');
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Proxy Server running at http://localhost:${PORT}`);
});



