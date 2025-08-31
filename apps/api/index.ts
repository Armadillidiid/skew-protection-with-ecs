import { createServer } from "node:http";
import { parse } from "node:url";

const PORT = process.env.PORT || 3000;

const server = createServer((req, res) => {
  // Parse the URL to get pathname and query
  const parsedUrl = parse(req.url || "", true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Set common headers
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle OPTIONS requests for CORS
  if (method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Routing
  if (pathname === "/health" && method === "GET") {
    // Health check endpoint
    res.writeHead(200);
    res.end(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      }),
    );
  } else if (pathname === "/api/data" && method === "GET") {
    // Simple JSON object endpoint
    res.writeHead(200);
    res.end(
      JSON.stringify({
        message: "Hello from the API!",
        data: {
          users: [
            { id: 1, name: "John Doe", email: "john@example.com" },
            { id: 2, name: "Jane Smith", email: "jane@example.com" },
          ],
          timestamp: new Date().toISOString(),
          version: "1.0.0",
        },
      }),
    );
  } else {
    // 404 for unknown routes
    res.writeHead(404);
    res.end(
      JSON.stringify({
        error: "Not Found",
        message: `Route ${pathname} not found`,
        availableRoutes: ["/health", "/api/data"],
      }),
    );
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📦 API data: http://localhost:${PORT}/api/data`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});
