import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://yourdomain.com'
  : 'http://localhost:3000';

const useSocket = () => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Prevent multiple connections
    if (socketRef.current) return;

    console.log('🔌 Connecting to socket server:', SOCKET_URL);

    const socketInstance = io(SOCKET_URL, {
      // Force polling first, then upgrade
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: false, // Always start with polling
      
      // Connection settings
      timeout: 20000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      reconnectionDelayMax: 5000,
      
      // Polling settings
      forceNew: false,
      multiplex: true,
      
      // Query parameters for debugging
      query: {
        client: 'map-tracking',
        version: '1.0',
        timestamp: Date.now()
      },

      // Additional options
      autoConnect: true,
      withCredentials: false
    });

    // Connection events
    socketInstance.on('connect', () => {
      console.log('✅ Connected to Socket.io server');
      console.log(`   Socket ID: ${socketInstance.id}`);
      console.log(`   Transport: ${socketInstance.io.engine.transport.name}`);
      setIsConnected(true);
      setConnectionError(null);
      
      // Send a test ping
      socketInstance.emit('ping', { message: 'Connection test', timestamp: Date.now() });
    });

    // Connection error handling
    socketInstance.on('connect_error', (error) => {
      console.error('🚨 Socket connection error:', error);
      console.error('   Error type:', error.type);
      console.error('   Error message:', error.message);
      console.error('   Error description:', error.description);
      
      setIsConnected(false);
      setConnectionError(`Connection failed: ${error.message}`);
    });

    // Disconnection handling
    socketInstance.on('disconnect', (reason, details) => {
      console.log('❌ Socket disconnected:', reason);
      if (details) console.log('   Details:', details);
      
      setIsConnected(false);
      setConnectionError(`Disconnected: ${reason}`);
    });

    // Reconnection events
    socketInstance.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
      console.log(`   New Socket ID: ${socketInstance.id}`);
      console.log(`   Transport: ${socketInstance.io.engine.transport.name}`);
      setIsConnected(true);
      setConnectionError(null);
    });

    socketInstance.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}`);
      setConnectionError(`Reconnecting... (attempt ${attemptNumber})`);
    });

    socketInstance.on('reconnect_error', (error) => {
      console.error('🚨 Reconnection failed:', error);
      setConnectionError(`Reconnection failed: ${error.message}`);
    });

    socketInstance.on('reconnect_failed', () => {
      console.error('🚨 Reconnection failed after maximum attempts');
      setIsConnected(false);
      setConnectionError('Reconnection failed - maximum attempts reached');
    });

    // Transport upgrade events
    socketInstance.io.on('upgrade', () => {
      console.log('🚀 Transport upgraded to:', socketInstance.io.engine.transport.name);
    });

    socketInstance.io.on('upgradeError', (error) => {
      console.warn('⚠️ Transport upgrade failed:', error);
      // This is not critical, polling will continue to work
    });

    // Test response handler
    socketInstance.on('pong', (data) => {
      console.log('🏓 Pong received:', data);
    });

    // Error handler
    socketInstance.on('error', (error) => {
      console.error('🚨 Socket error:', error);
      setConnectionError(`Socket error: ${error.message || error}`);
    });

    // Debug: log all events
    if (process.env.NODE_ENV === 'development') {
      const originalEmit = socketInstance.emit;
      socketInstance.emit = function(...args) {
        console.log('📤 Emitting:', args[0], args.slice(1));
        return originalEmit.apply(this, args);
      };

      const originalOn = socketInstance.on;
      socketInstance.on = function(event, handler) {
        return originalOn.call(this, event, (...args) => {
          if (!['connect', 'disconnect', 'pong'].includes(event)) {
            console.log('📥 Received:', event, args);
          }
          return handler(...args);
        });
      };
    }

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    // Cleanup function
    return () => {
      if (socketRef.current) {
        console.log('🧹 Cleaning up socket connection');
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
        setConnectionError(null);
      }
    };
  }, []);

  return { 
    socket, 
    isConnected, 
    connectionError 
  };
};

export default useSocket;