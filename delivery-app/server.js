import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

console.log(`🚀 Starting server in ${dev ? 'development' : 'production'} mode`);

// Create Next.js app
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Add CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Handle socket.io endpoint manually
    if (req.url === '/api/socket') {
      console.log(`📡 Socket API called: ${req.method} ${req.url}`);
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify({ 
        success: true, 
        message: 'Socket.io server is running',
        transport: 'http-polling',
        timestamp: new Date().toISOString()
      }));
      return;
    }
    
    // Handle all other requests with Next.js
    return handler(req, res);
  });

  // Initialize Socket.io server
  console.log('🔌 Initializing Socket.io server...');
  
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: dev ? "*" : ["https://yourdomain.com"],
      methods: ["GET", "POST"],
      credentials: false,
      allowedHeaders: ["Content-Type"]
    },
    // Start with polling, allow upgrade to websocket
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    
    // Connection settings
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e6,
    
    // Enable compression
    compression: true,
    
    // Allow upgrades
    allowUpgrades: true,
    perMessageDeflate: false,
    
    // Cookie settings
    cookie: false
  });

  console.log('✅ Socket.io server configured');

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id} (Transport: ${socket.conn.transport.name})`);

    // Log transport upgrades
    socket.conn.on('upgrade', () => {
      console.log(`🚀 Client ${socket.id} upgraded to: ${socket.conn.transport.name}`);
    });

    // Basic ping-pong for connection testing
    socket.on('ping', (data) => {
      console.log(`🏓 Ping from ${socket.id}:`, data);
      socket.emit('pong', { ...data, serverTime: Date.now() });
    });

    // Message handling
    socket.on('message', (msg) => {
      console.log(`📨 Message from ${socket.id}:`, msg);
      io.emit('message', { ...msg, from: socket.id, timestamp: Date.now() });
    });

    // Order tracking
    socket.on('track-order', (data) => {
      const { orderId } = data;
      console.log(`🚚 Client ${socket.id} tracking order: ${orderId}`);
      
      if (!orderId) {
        socket.emit('error', { message: 'Order ID is required' });
        return;
      }

      // Join order-specific room
      socket.join(`order-${orderId}`);
      
      // Send confirmation
      socket.emit('tracking-started', { 
        orderId,
        message: `Tracking started for order ${orderId}`,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });

      console.log(`✅ Tracking started for order ${orderId}`);

      // Simulate real-time updates
      let updateCount = 0;
      const maxUpdates = 15;
      
      const sendUpdate = () => {
        if (updateCount < maxUpdates && socket.connected) {
          const progress = updateCount / maxUpdates;
          
          // Simulate movement from Dumka towards destination
          const startLat = 24.2676;
          const startLng = 87.2686;
          const endLat = 24.2976;  // ~3km north
          const endLng = 87.2986;  // ~3km east
          
          const currentLat = startLat + (progress * (endLat - startLat));
          const currentLng = startLng + (progress * (endLng - startLng));
          
          const remainingMinutes = Math.max(1, Math.round((maxUpdates - updateCount) * 1.5));
          
          const updateData = {
            orderId,
            lat: currentLat + (Math.random() - 0.5) * 0.0001, // Small random variation
            lng: currentLng + (Math.random() - 0.5) * 0.0001,
            eta: `${remainingMinutes} minutes`,
            progress: Math.round(progress * 100),
            timestamp: new Date().toISOString()
          };

          // Send to specific order room
          io.to(`order-${orderId}`).emit('agent-update', updateData);
          
          console.log(`📍 Update ${updateCount + 1}/${maxUpdates} sent for order ${orderId} (${Math.round(progress * 100)}%)`);
          updateCount++;
          
          // Schedule next update
          setTimeout(sendUpdate, 3000 + Math.random() * 2000); // 3-5 seconds
        } else if (updateCount >= maxUpdates && socket.connected) {
          // Order delivered
          const deliveredData = {
            orderId,
            status: 'delivered',
            message: 'Order has been delivered successfully!',
            timestamp: new Date().toISOString()
          };
          
          io.to(`order-${orderId}`).emit('order-update', deliveredData);
          console.log(`✅ Order ${orderId} marked as delivered`);
          
          // Leave the room
          socket.leave(`order-${orderId}`);
        }
      };

      // Start updates after 2 seconds
      setTimeout(sendUpdate, 2000);
    });

    // Stop tracking
    socket.on('stop-tracking', (data) => {
      const { orderId } = data;
      console.log(`⏹️ Client ${socket.id} stopped tracking order: ${orderId}`);
      
      if (orderId) {
        socket.leave(`order-${orderId}`);
      }
      
      socket.emit('tracking-stopped', { orderId, timestamp: Date.now() });
    });

    // Error handling
    socket.on('error', (error) => {
      console.error(`🚨 Socket error from ${socket.id}:`, error);
    });

    // Disconnection
    socket.on('disconnect', (reason, details) => {
      console.log(`❌ Client ${socket.id} disconnected: ${reason}`);
      if (details) {
        console.log(`   Details:`, details);
      }
    });
  });

  // Global error handling
  io.on('error', (error) => {
    console.error('🚨 Socket.io server error:', error);
  });

  // Start the server
  httpServer
    .once('error', (err) => {
      console.error('🚨 Server error:', err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`🚀 Server ready on http://${hostname}:${port}`);
      console.log(`🔌 Socket.io server running on same port`);
      console.log(`📡 Test socket endpoint: http://${hostname}:${port}/api/socket`);
      console.log(`📊 Socket.io admin: http://${hostname}:${port}/admin (if enabled)`);
      console.log('');
      console.log('Ready for connections! 🎉');
    });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🔄 SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🔄 SIGINT received, shutting down gracefully');
    httpServer.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
});