const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// --- Body Capture Middleware (RAW Body Buffer for POST) ---
const getRawBody = require('raw-body');
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb',
      encoding: 'utf-8',
    }, function (err, string) {
      if (err) return next(err);
      req.rawBody = string;
      next();
    });
  } else {
    next();
  }
});

// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
});
app.use(limiter);

// ✅ Main API Proxy (No Change)
app.use(
  '/proxy/api',
  createProxyMiddleware({
    target: process.env.REAL_API_URL || 'https://api-15hv.onrender.com',
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
    },
    timeout: 60000,
    proxyTimeout: 60000,
  })
);

// ✅ FINAL FIXED: Proxy for /proxy-events
app.use(
  '/proxy-events',
  createProxyMiddleware({
    target: process.env.REAL_API_URL || 'https://api-15hv.onrender.com',
    changeOrigin: true,
    pathRewrite: { '^/proxy-events': '/api/proxy-events' },
    onProxyReq: (proxyReq, req, res) => {
      const clientAuth = req.headers['authorization'];
      const authHeader = clientAuth || `Bearer ${process.env.API_KEY}`;
      proxyReq.setHeader('Authorization', authHeader);
      proxyReq.setHeader('Content-Type', 'application/json');

      // ✅ Inject raw body if present
      if (req.rawBody) {
        proxyReq.setHeader('Content-Length', Buffer.byteLength(req.rawBody));
        proxyReq.write(req.rawBody);
      }
    },
    onError: (err, req, res) => {
      console.error('❌ proxy-events Error:', err.message);
      if (!res.headersSent) {
        res.status(504).json({ error: 'Proxy-events failed', message: err.message });
      }
    },
    timeout: 60000,
    proxyTimeout: 60000,
  })
);

// Optional: Video Proxy (No Change)
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

// Health check
app.get('/', (req, res) => {
  res.send('🔒 Proxy Server is running securely.');
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Proxy Server running on http://localhost:${PORT}`);
});
