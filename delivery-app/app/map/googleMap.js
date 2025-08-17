import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, useLoadScript, DirectionsRenderer, Marker } from '@react-google-maps/api';
import { useSearchParams } from 'next/navigation';
import { useSelector } from 'react-redux';
import useSocket from '../frontend/hooks/useSocket';

const libraries = ['places'];

// Static configuration - never changes
const MAP_CONFIG = {
  containerStyle: {
    width: '90vw',
    height: '90vh',
  },
  center: { lat: 24.2676, lng: 87.2686 }, // Fixed center - Dumka coordinates
  zoom: 14,
  options: {
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: true,
    styles: [
      {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }]
      }
    ]
  }
};

// Static marker icons - never change
const AGENT_ICON = {
  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="16" fill="#4285F4" stroke="white" stroke-width="4"/>
      <circle cx="20" cy="20" r="6" fill="white"/>
      <circle cx="20" cy="20" r="2" fill="#4285F4"/>
    </svg>
  `),
  scaledSize: { width: 40, height: 40 },
  anchor: { x: 20, y: 20 }
};

const DESTINATION_ICON = {
  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 2C10.477 2 6 6.477 6 12c0 7 10 18 10 18s10-11 10-18c0-5.523-4.477-10-10-10z" fill="#e74c3c" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="12" r="4" fill="white"/>
    </svg>
  `),
  scaledSize: { width: 32, height: 32 },
  anchor: { x: 16, y: 32 }
};

// Static polyline options
const ROUTE_OPTIONS = {
  suppressMarkers: true,
  polylineOptions: {
    strokeColor: '#4285F4',
    strokeWeight: 5,
    strokeOpacity: 0.8,
  },
};

function getLatLng(location) {
  if (typeof location.lat === 'function') {
    return { lat: location.lat(), lng: location.lng() };
  }
  return location;
}

function MapComponent() {
  const { socket, isConnected } = useSocket();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const orders = useSelector((state) => state.order.orders);
  const order = orders.find(order => order.orderId === orderId);
  const destinationAddress = order?.items?.address;

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  // State
  const [agentPosition, setAgentPosition] = useState(null);
  const [destinationPosition, setDestinationPosition] = useState(null);
  const [eta, setEta] = useState('Calculating...');
  const [trackingStatus, setTrackingStatus] = useState('connecting');
  const [connectionError, setConnectionError] = useState(null);

  // Refs for stable operations
  const mapRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const agentMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const isCalculatingRef = useRef(false);
  const lastCalculationTime = useRef(0);
  const lastCalculationPosition = useRef(null);
  const etaStabilizer = useRef({ value: null, timestamp: 0 });

  const destination = destinationAddress;

  // Initialize Google Maps services once
  const initializeMapServices = useCallback((map) => {
    if (!window.google?.maps) return;

    // Initialize DirectionsService
    if (!directionsServiceRef.current) {
      directionsServiceRef.current = new window.google.maps.DirectionsService();
    }

    // Initialize DirectionsRenderer
    if (!directionsRendererRef.current) {
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer(ROUTE_OPTIONS);
      directionsRendererRef.current.setMap(map);
    }

    console.log('Map services initialized');
  }, []);

  // Calculate accurate ETA based on current position and remaining distance
  const calculateAccurateETA = useCallback((agentPos, destinationPos, route = null) => {
    if (!agentPos || !destinationPos) return null;

    try {
      // If we have a route, calculate remaining distance along the route
      let remainingDistance = 0;
      let remainingDuration = 0;

      if (route && route.routes && route.routes[0] && route.routes[0].legs) {
        const leg = route.routes[0].legs[0];
        const routePath = leg.steps;
        
        // Find the closest point on the route to current agent position
        let closestPointIndex = 0;
        let minDistance = Infinity;
        let totalSteps = 0;

        routePath.forEach((step, stepIndex) => {
          totalSteps++;
          const stepStart = getLatLng(step.start_location);
          const distance = calculateDistanceInKm(agentPos, stepStart);
          
          if (distance < minDistance) {
            minDistance = distance;
            closestPointIndex = stepIndex;
          }
        });

        // Calculate remaining distance from current position
        for (let i = closestPointIndex; i < routePath.length; i++) {
          remainingDistance += routePath[i].distance.value; // in meters
          remainingDuration += routePath[i].duration.value; // in seconds
        }

        // Add distance from agent to closest route point
        remainingDistance += minDistance * 1000; // convert km to meters

      } else {
        // Fallback: direct distance calculation
        const directDistance = calculateDistanceInKm(agentPos, destinationPos);
        remainingDistance = directDistance * 1000; // convert to meters
        
        // Estimate duration based on average city driving speed (25 km/h in traffic)
        const avgSpeedKmh = 25;
        remainingDuration = (directDistance / avgSpeedKmh) * 3600; // convert to seconds
      }

      // Convert to readable format
      const remainingMinutes = Math.ceil(remainingDuration / 60);
      const hours = Math.floor(remainingMinutes / 60);
      const mins = remainingMinutes % 60;

      // Format ETA string
      if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min`;
      } else {
        return `${Math.max(1, mins)} min`; // Minimum 1 minute
      }

    } catch (error) {
      console.error('Error calculating accurate ETA:', error);
      return null;
    }
  }, []);

  // Helper function to calculate distance between two points in km
  const calculateDistanceInKm = useCallback((pos1, pos2) => {
    if (!pos1 || !pos2) return 0;
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }, []);

  // Check if agent is near destination (within 50 meters)
  const isAgentNearDestination = useCallback((agentPos, destPos) => {
    if (!agentPos || !destPos) return false;
    const distance = calculateDistanceInKm(agentPos, destPos) * 1000; // convert to meters
    return distance <= 50; // 50 meters threshold
  }, [calculateDistanceInKm]);

  // Advanced ETA stabilization with moving average and accurate calculation
  const updateETA = useCallback((newEta, agentPos = null, destPos = null, route = null) => {
    // If we have position data, calculate our own ETA
    let calculatedEta = null;
    if (agentPos && destPos) {
      calculatedEta = calculateAccurateETA(agentPos, destPos, route);
      console.log('Calculated ETA:', calculatedEta);
    }

    // Use calculated ETA if available, otherwise use provided ETA
    const etaToUse = calculatedEta || newEta;
    
    if (!etaToUse || etaToUse === 'Calculating...' || typeof etaToUse !== 'string') return;

    const now = Date.now();
    const currentEta = etaStabilizer.current;

    // Parse ETA to minutes for comparison
    const parseMinutes = (eta) => {
      if (!eta || typeof eta !== 'string') return 0;
      const hourMatch = eta.match(/(\d+)\s*hour/i);
      const minMatch = eta.match(/(\d+)\s*min/i);
      const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
      const minutes = minMatch ? parseInt(minMatch[1]) : 0;
      return hours * 60 + minutes;
    };

    const newMinutes = parseMinutes(etaToUse);
    
    // Ignore unrealistic ETAs
    if (newMinutes > 300 || newMinutes < 1) {
      console.log('Ignoring unrealistic ETA:', etaToUse);
      return;
    }

    // Initialize with first valid ETA
    if (!currentEta.value || !currentEta.samples) {
      etaStabilizer.current = { 
        value: etaToUse, 
        timestamp: now, 
        samples: [newMinutes],
        lastMinutes: newMinutes
      };
      setEta(etaToUse);
      console.log('Initial ETA set:', etaToUse);
      return;
    }

    const currentMinutes = parseMinutes(currentEta.value);
    const timeSinceLastUpdate = now - currentEta.timestamp;

    // Add new sample to moving average (keep last 3 samples for faster response)
    const samples = [...(currentEta.samples || []), newMinutes].slice(-3);
    const avgMinutes = samples.reduce((sum, val) => sum + val, 0) / samples.length;
    
    // Update more frequently for calculated ETAs (they're more accurate)
    const updateThreshold = calculatedEta ? 10000 : 15000; // 10s for calculated, 15s for others
    const changeThreshold = calculatedEta ? 2 : 3; // 2min for calculated, 3min for others
    
    const avgDiff = Math.abs(avgMinutes - currentMinutes);
    const isConsistentChange = samples.length >= 2;

    if (timeSinceLastUpdate > updateThreshold && 
        avgDiff > changeThreshold && 
        isConsistentChange) {
      
      // Format the averaged time back to string
      const hours = Math.floor(avgMinutes / 60);
      const mins = Math.round(avgMinutes % 60);
      const formattedEta = hours > 0 ? `${hours} hour${hours > 1 ? 's' : ''} ${mins} min` : `${Math.max(1, mins)} min`;
      
      etaStabilizer.current = { 
        value: formattedEta, 
        timestamp: now, 
        samples: samples,
        lastMinutes: avgMinutes
      };
      setEta(formattedEta);
      console.log('ETA updated:', formattedEta, calculatedEta ? '(calculated)' : '(provided)');
    } else {
      // Update samples but keep current ETA
      etaStabilizer.current = { 
        ...currentEta, 
        samples: samples
      };
    }
  }, [calculateAccurateETA]);

  // Snap agent position to the nearest point on the route
  const snapToRoute = useCallback((agentPos, route) => {
    if (!route || !route.routes || !route.routes[0] || !agentPos) {
      return agentPos; // Return original position if no route available
    }

    try {
      const routePath = route.routes[0].overview_path;
      if (!routePath || routePath.length === 0) {
        return agentPos;
      }

      let closestPoint = null;
      let minDistance = Infinity;

      // Find the closest point on the route path
      routePath.forEach((point) => {
        const routePoint = getLatLng(point);
        const distance = calculateDistanceInKm(agentPos, routePoint);
        
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = routePoint;
        }
      });

      // Only snap if agent is within reasonable distance of route (200 meters)
      if (minDistance <= 0.2 && closestPoint) { // 0.2 km = 200 meters
        console.log('Snapping agent to route, distance:', Math.round(minDistance * 1000), 'meters');
        return closestPoint;
      }

      return agentPos; // Return original if too far from route
    } catch (error) {
      console.error('Error snapping to route:', error);
      return agentPos;
    }
  }, [calculateDistanceInKm]);

  // Get current route directions
  const getCurrentRoute = useCallback(() => {
    return directionsRendererRef.current?.getDirections() || null;
  }, []);

  // Calculate route using DirectionsService - only when necessary
  const calculateRoute = useCallback((origin, dest) => {
    if (!directionsServiceRef.current || 
        !origin || 
        !dest || 
        isCalculatingRef.current) {
      return;
    }

    const now = Date.now();
    
    // Only recalculate route if agent has moved significantly from the original route
    // or if no route exists yet
    const currentRoute = getCurrentRoute();
    
    if (currentRoute && lastCalculationTime.current) {
      // Check if agent is still reasonably close to the existing route
      const snapDistance = calculateDistanceInKm(origin, snapToRoute(origin, currentRoute)) * 1000;
      
      // Only recalculate if agent is far from route (>500m) or it's been a long time (>2 minutes)
      const timeSinceLastCalc = now - lastCalculationTime.current;
      if (snapDistance < 500 && timeSinceLastCalc < 120000) {
        console.log('Using existing route, agent is close enough:', Math.round(snapDistance), 'meters');
        return;
      }
    }

    // Minimum 45 seconds between route recalculations for stability
    if (now - lastCalculationTime.current < 45000) {
      console.log('Route calculation throttled');
      return;
    }

    isCalculatingRef.current = true;
    console.log('Calculating new route from:', origin, 'to:', dest);

    directionsServiceRef.current.route({
      origin: origin,
      destination: dest,
      travelMode: window.google.maps.TravelMode.DRIVING,
      avoidHighways: false,
      avoidTolls: false,
      unitSystem: window.google.maps.UnitSystem.METRIC,
      region: 'IN',
      optimizeWaypoints: false, // Don't optimize to maintain route consistency
      provideRouteAlternatives: false
    }, (result, status) => {
      isCalculatingRef.current = false;
      
      if (status === 'OK' && result && directionsRendererRef.current) {
        try {
          // Update route display
          directionsRendererRef.current.setDirections(result);
          console.log('New route calculated and displayed');
          
          // Update destination position from route result
          const endLocation = result.routes[0].legs[0].end_location;
          const destPos = getLatLng(endLocation);
          setDestinationPosition(destPos);
          
          // Update tracking info
          lastCalculationTime.current = now;
          lastCalculationPosition.current = { ...origin };
          
        } catch (error) {
          console.error('Error processing route result:', error);
        }
      } else {
        console.error('Route calculation failed:', status);
      }
    });
  }, [getCurrentRoute, snapToRoute, calculateDistanceInKm]);

  // Update agent marker position with route snapping
  const updateAgentMarker = useCallback((position) => {
    if (!position || !position.lat || !position.lng) {
      console.error('Invalid agent position:', position);
      return;
    }

    try {
      // Try to snap agent position to route if available
      const currentRoute = getCurrentRoute();
      const displayPosition = snapToRoute(position, currentRoute);
      
      // Log if position was snapped
      if (displayPosition !== position) {
        const snapDistance = calculateDistanceInKm(position, displayPosition) * 1000;
        console.log('Agent position snapped to route, snap distance:', Math.round(snapDistance), 'meters');
      }

      if (agentMarkerRef.current) {
        // Update existing marker position with snapped position
        agentMarkerRef.current.setPosition(displayPosition);
        console.log('Agent marker position updated:', displayPosition);
      } else if (mapRef.current && window.google?.maps) {
        // Create new agent marker with snapped position
        agentMarkerRef.current = new window.google.maps.Marker({
          position: displayPosition,
          map: mapRef.current,
          icon: {
            ...AGENT_ICON,
            scaledSize: new window.google.maps.Size(40, 40),
            anchor: new window.google.maps.Point(20, 20)
          },
          title: `Delivery Agent - Order ${orderId}`,
          animation: trackingStatus === 'tracking' ? window.google.maps.Animation.BOUNCE : null,
          optimized: false
        });
        console.log('Agent marker created at:', displayPosition);
      }
    } catch (error) {
      console.error('Error updating agent marker:', error);
    }
  }, [orderId, trackingStatus, getCurrentRoute, snapToRoute, calculateDistanceInKm]);

  // Update destination marker position with proper error handling
  const updateDestinationMarker = useCallback((position) => {
    if (!position || !position.lat || !position.lng) {
      console.error('Invalid destination position:', position);
      return;
    }

    try {
      if (destinationMarkerRef.current) {
        // Update existing marker position
        destinationMarkerRef.current.setPosition(position);
        console.log('Destination marker updated:', position);
      } else if (mapRef.current && window.google?.maps) {
        // Create new destination marker
        destinationMarkerRef.current = new window.google.maps.Marker({
          position,
          map: mapRef.current,
          icon: {
            ...DESTINATION_ICON,
            scaledSize: new window.google.maps.Size(32, 32),
            anchor: new window.google.maps.Point(16, 32)
          },
          title: `Destination: ${destination}`,
          optimized: false
        });
        console.log('Destination marker created at:', position);
      }
    } catch (error) {
      console.error('Error updating destination marker:', error);
    }
  }, [destination]);

  // Center map on agent (with bounds checking)
  const centerOnAgent = useCallback((position) => {
    if (!mapRef.current || !position) return;

    const map = mapRef.current;
    const bounds = map.getBounds();
    
    // Only re-center if agent is outside current view
    if (bounds && !bounds.contains(position)) {
      map.panTo(position);
    }
  }, []);

  // Handle agent position updates with stable route management
  useEffect(() => {
    if (agentPosition) {
      console.log('Processing agent position update:', agentPosition);
      
      // Update marker (which will snap to route if available)
      updateAgentMarker(agentPosition);
      
      // Center map if needed (less frequent)
      const centerTimeoutId = setTimeout(() => {
        centerOnAgent(agentPosition);
      }, 2000);
      
      // Calculate initial route or recalculate if agent has deviated significantly
      if (destination) {
        const routeTimeoutId = setTimeout(() => {
          calculateRoute(agentPosition, destination);
        }, 1000);
        
        return () => {
          clearTimeout(centerTimeoutId);
          clearTimeout(routeTimeoutId);
        };
      }
      
      return () => clearTimeout(centerTimeoutId);
    }
  }, [agentPosition, destination, updateAgentMarker, centerOnAgent, calculateRoute]);

  // Handle destination position updates
  useEffect(() => {
    if (destinationPosition) {
      updateDestinationMarker(destinationPosition);
    }
  }, [destinationPosition, updateDestinationMarker]);

  // Socket connection and updates
  useEffect(() => {
    if (!orderId || !socket || !isConnected) {
      if (!orderId) {
        setConnectionError('No order ID provided');
        setTrackingStatus('error');
      } else if (!socket) {
        setTrackingStatus('connecting');
      } else {
        setTrackingStatus('disconnected');
        setConnectionError('Socket connection lost');
      }
      return;
    }

    console.log('Setting up socket listeners for order:', orderId);
    setTrackingStatus('connected');
    setConnectionError(null);
    
    socket.emit('track-order', { orderId });

    const handleTrackingStarted = (data) => {
      console.log('Tracking started:', data);
      setTrackingStatus('tracking');
    };

    const handleAgentUpdate = (data) => {
      if (data.orderId === orderId && data.lat && data.lng) {
        const newPosition = { 
          lat: parseFloat(data.lat), 
          lng: parseFloat(data.lng) 
        };
        
        // Validate coordinates
        if (isNaN(newPosition.lat) || isNaN(newPosition.lng) ||
            newPosition.lat < -90 || newPosition.lat > 90 ||
            newPosition.lng < -180 || newPosition.lng > 180) {
          console.error('Invalid coordinates received:', data);
          return;
        }
        
        console.log('Raw agent position update:', newPosition);
        
        // Always update agent position state (this is the real GPS position)
        setAgentPosition(newPosition);
        
        // Check if agent is near destination using real GPS position
        if (destinationPosition) {
          const isNearDestination = isAgentNearDestination(newPosition, destinationPosition);
          const distanceToDestination = calculateDistanceInKm(newPosition, destinationPosition) * 1000;
          console.log('Distance to destination:', Math.round(distanceToDestination), 'meters');
          
          if (isNearDestination && trackingStatus === 'tracking') {
            console.log('Agent reached destination');
            setEta('Delivered!');
            setTrackingStatus('delivered');
            return;
          }
        }
        
        // Calculate ETA using real GPS position but display marker snapped to route
        if (destinationPosition) {
          const currentRoute = getCurrentRoute();
          const currentEta = calculateAccurateETA(newPosition, destinationPosition, currentRoute);
          if (currentEta) {
            updateETA(currentEta, newPosition, destinationPosition, currentRoute);
          }
        }
        
        // Use socket ETA as backup only if we don't have destination
        if (data.eta && typeof data.eta === 'string' && data.eta !== 'Calculating...' && !destinationPosition) {
          console.log('Using socket ETA as fallback:', data.eta);
          updateETA(data.eta);
        }
      } else {
        console.log('Agent update ignored - missing data or wrong order:', data);
      }
    };

    const handleOrderUpdate = (data) => {
      if (data.orderId === orderId) {
        if (data.status === 'delivered') {
          setEta('Delivered!');
          setTrackingStatus('delivered');
        } else if (data.status === 'cancelled') {
          setEta('Order Cancelled');
          setTrackingStatus('cancelled');
        }
      }
    };

    const handleSocketError = (error) => {
      console.error('Socket error:', error);
      setConnectionError(error.message || 'Connection error');
      setTrackingStatus('error');
    };

    socket.on('tracking-started', handleTrackingStarted);
    socket.on('agent-update', handleAgentUpdate);
    socket.on('order-update', handleOrderUpdate);
    socket.on('error', handleSocketError);

    return () => {
      socket.off('tracking-started', handleTrackingStarted);
      socket.off('agent-update', handleAgentUpdate);
      socket.off('order-update', handleOrderUpdate);
      socket.off('error', handleSocketError);
    };
  }, [orderId, socket, isConnected, updateETA]);

  // Status functions
  const getStatusColor = () => {
    switch (trackingStatus) {
      case 'connecting': return '#f39c12';
      case 'connected': return '#3498db';
      case 'tracking': return '#27ae60';
      case 'delivered': return '#2ecc71';
      case 'cancelled': return '#e74c3c';
      case 'error': return '#e74c3c';
      case 'disconnected': return '#95a5a6';
      default: return '#95a5a6';
    }
  };

  const getStatusText = () => {
    switch (trackingStatus) {
      case 'connecting': return 'Connecting...';
      case 'connected': return 'Connected';
      case 'tracking': return 'Tracking Active';
      case 'delivered': return 'Delivered';
      case 'cancelled': return 'Cancelled';
      case 'error': return connectionError || 'Error';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  };

  // Loading states
  if (loadError) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#e74c3c'
      }}>
        Error loading Google Maps
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px'
      }}>
        Loading Maps...
      </div>
    );
  }

  if (!orderId) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#e74c3c'
      }}>
        No order ID provided
      </div>
    );
  }

  return (
    <div>
      {/* Status Panel */}
      <div style={{ 
        position: 'absolute', 
        zIndex: 1, 
        background: 'white', 
        padding: '16px', 
        borderRadius: '12px', 
        left: 20, 
        top: 20,
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        minWidth: '280px',
        border: `3px solid ${getStatusColor()}`
      }}>
        <div style={{ marginBottom: '8px' }}>
          <strong>Order ID:</strong> {orderId}
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Status:</strong> 
          <span style={{ 
            color: getStatusColor(), 
            marginLeft: '8px',
            fontWeight: 'bold'
          }}>
            {getStatusText()}
          </span>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>ETA:</strong> {eta}
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Destination:</strong> {destination || 'Not specified'}
        </div>
        {agentPosition && (
          <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
            <strong>Agent Position:</strong><br/>
            {agentPosition.lat.toFixed(6)}, {agentPosition.lng.toFixed(6)}
          </div>
        )}
        {connectionError && (
          <div style={{ 
            fontSize: '12px', 
            color: '#e74c3c', 
            marginTop: '8px',
            fontStyle: 'italic'
          }}>
            Error: {connectionError}
          </div>
        )}
      </div>

      {/* Map - completely static, never re-renders */}
      <GoogleMap
        mapContainerStyle={MAP_CONFIG.containerStyle}
        center={MAP_CONFIG.center}
        zoom={MAP_CONFIG.zoom}
        options={MAP_CONFIG.options}
        onLoad={(map) => {
          mapRef.current = map;
          initializeMapServices(map);
        }}
      >
        {/* No conditional rendering - everything is handled imperatively */}
      </GoogleMap>
    </div>
  );
}

export default MapComponent;