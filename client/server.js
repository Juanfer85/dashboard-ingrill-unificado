const express = require('express');
const path = require('path');
const app = express();
const PORT = 4003;

// Set cache prevention headers for all requests
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

app.use('/api', (req, res) => {
    const http = require('http');
    const targetUrl = new URL(`http://localhost:4001/api${req.url}`);
    
    const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: {
            ...req.headers,
            host: targetUrl.host
        }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error('[Proxy Request Error]:', err.message);
        if (!res.headersSent) {
            res.status(500).send('Proxy Error: ' + err.message);
        }
    });

    req.pipe(proxyReq, { end: true });
});

app.use(express.static(__dirname, { etag: false, maxAge: 0 }));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Unified Dashboard Static Server running on port ${PORT}`);
});

