import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  GoogleMap,
  Marker,
  DirectionsRenderer,
  useLoadScript,
} from "@react-google-maps/api";
import { motion } from "framer-motion";
import { useSelector, shallowEqual } from "react-redux";
import { useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { updateOrderStatus } from "../store/features/orderSlice";

const containerStyle = { width: "100%", height: "100%" };

const START = { lat: 24.26778, lng: 87.24855 }; // Dumka, Jharkhand

function interpolate(p1, p2, factor) {
  return {
    lat: p1.lat + (p2.lat - p1.lat) * factor,
    lng: p1.lng + (p2.lng - p1.lng) * factor,
  };
}

function computeHeading(from, to) {
  const rad = Math.PI / 180;
  const dLng = (to.lng - from.lng) * rad;
  const lat1 = from.lat * rad;
  const lat2 = to.lat * rad;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

const libraries = ["geometry", "places"];

export default function MapComponent({ zoom = 14 }) {
  const dispatch = useDispatch();
  // Memoize selector to prevent rerender warnings
  const orders = useSelector(
    (state) => state.order?.orders || [],
    shallowEqual
  );
  const searchParams = useSearchParams();
  const orderID = searchParams.get("orderId");

  const order = useMemo(
    () => orders.find((order) => order.orderId === orderID),
    [orders, orderID]
  );

  const [destination, setDestination] = useState(null);
  const [agent, setAgent] = useState(START);
  const [heading, setHeading] = useState(0);
  const [polylinePath, setPolylinePath] = useState([]);
  const [etaText, setEtaText] = useState("--");
  const [distText, setDistText] = useState("--");
  const [directions, setDirections] = useState(null);
  const [loading, setLoading] = useState(true);
  const [delivered, setDelivered] = useState(false);
  const stepIndex = useRef(0);
  const progress = useRef(0);
  const animFrame = useRef(null);
  const lastUpdateRef = useRef(Date.now());

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  // Geocode order address into lat/lng
  useEffect(() => {
    if (!isLoaded || !order?.items.address || delivered) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: order.items.address }, (results, status) => {
      if (status === "OK" && results[0]) {
        const loc = results[0].geometry.location;
        setDestination({ lat: loc.lat(), lng: loc.lng() });
      } else {
        console.error("Geocode failed:", status);
      }
    });
  }, [isLoaded, order]);

  // Fetch directions with optimized path
  useEffect(() => {
    if (!isLoaded || !destination || delivered) return;

    setLoading(true);
    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: START,
        destination: destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: true,
        provideRouteAlternatives: false,
      },
      (result, status) => {
        if (status === "OK" && result) {
          setDirections(result);
          const path = result.routes[0].overview_path.map((p) => ({
            lat: p.lat(),
            lng: p.lng(),
          }));
          setPolylinePath(path);
          setAgent(path[0]);
          stepIndex.current = 0;
          progress.current = 0;
          setLoading(false);
        } else {
          console.error("Directions request failed:", status);
          setLoading(false);
        }
      }
    );
  }, [isLoaded, destination]);

  // Animate agent along route
  useEffect(() => {
    if (!isLoaded || polylinePath.length < 2) return;

    const step = () => {
      let idx = stepIndex.current;
      let frac = progress.current;
      const speed = 0.0025;

      frac += speed;
      if (frac >= 1) {
        frac = 0;
        idx++;
        if (idx >= polylinePath.length - 1) {
          // Snap agent to final destination
          setAgent(destination);
          setHeading(
            computeHeading(polylinePath[polylinePath.length - 2], destination)
          );

          // Final ETA update → "0 m" and "Arrived"
          setEtaText("Arrived");
          setDistText("0 m");
          if (!delivered) {
            setDelivered(true);
            dispatch(
              updateOrderStatus({ orderId: orderID, status: "Delivered" })
            );
          }

          cancelAnimationFrame(animFrame.current);
          return;
        }
      }

      const newPos = interpolate(
        polylinePath[idx],
        polylinePath[idx + 1],
        frac
      );
      setAgent(newPos);

      const newHeading = computeHeading(
        polylinePath[idx],
        polylinePath[idx + 1]
      );
      setHeading(newHeading);

      stepIndex.current = idx;
      progress.current = frac;

      const now = Date.now();
      if (now - lastUpdateRef.current > 3000) {
        // Update ETA/Distance every 3s instead of every second
        lastUpdateRef.current = now;
        if (window.google?.maps && destination) {
          const svc = new window.google.maps.DistanceMatrixService();
          svc.getDistanceMatrix(
            {
              origins: [newPos],
              destinations: [destination],
              travelMode: window.google.maps.TravelMode.DRIVING,
              drivingOptions: {
                departureTime: new Date(),
                trafficModel: "bestguess",
              },
            },
            (res, status) => {
              if (status === "OK") {
                const el = res.rows?.[0]?.elements?.[0];
                const newEta =
                  el?.duration_in_traffic?.text || el?.duration?.text || "--";
                const newDist = el?.distance?.text || "--";
                setEtaText(newEta);
                setDistText(newDist);
              }
            }
          );
        }
      }

      animFrame.current = requestAnimationFrame(step);
    };

    animFrame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrame.current);
  }, [isLoaded, polylinePath, destination]);

  if (loadError) {
    return (
      <div className="p-4 text-red-600">
        Failed to load Google Maps. Please try again later.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full h-[80vh] grid grid-rows-[auto_1fr] gap-3">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 shadow-sm border"
      >
        <div className="flex items-center gap-3 flex flex-col">
          <div className="text-xl font-semibold">Order ID : {orderID}</div>
          <div className="text-sm text-gray-500">
            Status: {order?.status || "Unknown"}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <span className="opacity-70">ETA</span>
            <span className="font-medium">{etaText}</span>
            <span className="opacity-70">Distance</span>
            <span className="font-medium">{distText}</span>
          </div>
        </div>
      </motion.div>

      {/* Map */}
      <div className="w-full h-full rounded-2xl overflow-hidden border">
        {isLoaded && directions ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={agent}
            zoom={zoom}
            options={{
              mapTypeControl: false,
              fullscreenControl: false,
              streetViewControl: false,
            }}
          >
            <DirectionsRenderer
              directions={directions}
              options={{ suppressMarkers: true, preserveViewport: true }}
            />
            {agent && (
              <Marker
                position={agent}
                icon={{
                  path: window.google?.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 5,
                  strokeColor: "#1976d2",
                  rotation: heading,
                }}
              />
            )}
            {destination && <Marker position={destination} label="D" />}
          </GoogleMap>
        ) : (
          <div className="flex items-center justify-center h-full">
            Loading map…
          </div>
        )}
      </div>
    </div>
  );
}
