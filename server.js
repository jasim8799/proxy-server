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

// --- Proxy to Real API (Render backend) ---
app.use(
  '/proxy/api',
  createProxyMiddleware({
    target: process.env.REAL_API_URL, // e.g. https://api-15hv.onrender.com
    changeOrigin: true,
    pathRewrite: { '^/proxy/api': '/api' },
    onProxyReq: (proxyReq, req, res) => {
      const bypassAuth = req.originalUrl.includes('/proxy-events');

      if (!bypassAuth) {
        const clientAuth = req.headers['authorization'];
        const authHeader = clientAuth || `Bearer ${process.env.API_KEY}`;
        proxyReq.setHeader('Authorization', authHeader);
      }

      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Accept', 'application/json');

      console.log(`🔁 Proxying: ${req.method} ${req.originalUrl}`);
    },
    onError: (err, req, res) => {
      console.error('❌ Proxy Error:', err.message);
      res.status(504).json({ error: 'Proxy error', message: err.message });
    },
    timeout: 60000,
    proxyTimeout: 60000,
  })
);

// --- Proxy to Cloudflare Video (optional) ---
app.use(
  '/proxy/video',
  createProxyMiddleware({
    target: 'https://videodelivery.net',
    changeOrigin: true,
    pathRewrite: { '^/proxy/video': '' },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`🎥 Proxying Video: ${req.originalUrl}`);
    },
    onError: (err, req, res) => {
      console.error('❌ Video Proxy Error:', err.message);
      res.status(504).send('Video Proxy error.');
    },
    timeout: 60000,
    proxyTimeout: 60000,
  })
);

// --- Root Route ---
app.get('/', (req, res) => {
  res.send('🔒 Proxy Server is up and secure.');
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Proxy Server running at http://localhost:${PORT}`);
});
