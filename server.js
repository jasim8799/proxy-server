const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

const app = express();

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
      // ✅ Bypass Authorization for specific public endpoint
      const bypassAuth = req.originalUrl.includes('/proxy-events');

      if (!bypassAuth) {
        const clientAuth = req.headers['authorization'];
        const authHeader = clientAuth || `Bearer ${process.env.API_KEY}`;
        proxyReq.setHeader('Authorization', authHeader);
      }

      // Common headers
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
    target: 'https://videodelivery.net',
    changeOrigin: true,
    pathRewrite: { '^/proxy/video': '' },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`🎥 Proxying Cloudflare video: ${req.originalUrl}`);
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
