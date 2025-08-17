"use client";

import React, { lazy, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";

const MapComponent = lazy(() => import("@/app/map/googleMap"));

const Track = () => {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  // Get all orders from Redux store
  const orders = useSelector((state) => state.order.orders);
  // Find the order with the matching orderId
  const order = orders.find((order) => order.orderId === orderId);
  const destination = order?.items?.address;

  return (
    <Suspense fallback={<div>Loading map...</div>}>
      <MapComponent destination={destination} />
    </Suspense>
  );
};

export default Track;
