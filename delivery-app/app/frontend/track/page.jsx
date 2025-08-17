"use client"

import React, { lazy, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSelector } from 'react-redux'

const MapComponent = lazy(() => import('@/app/map/googleMap'));

const Track = () => {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  // Get all orders from Redux store
  const orders = useSelector((state) => state.order.orders);
  // Find the order with the matching orderId
  const order = orders.find(order => order.orderId === orderId);
   const destination = order?.items?.address;

  return (
    <div>
      <h2>Tracking Order: {orderId}</h2>
      {order ? (
        <div>
          <p>Status: {order.status}</p>
          <p>Estimated Delivery: {order.estimatedDeliveryTime || 'Calculating...'}</p>
          {/* Render map and other details here */}
        </div>
      ) : (
        <p>Order not found in store.</p>
      )}

      <Suspense fallback={<div>Loading map...</div>}>
        <MapComponent destination={destination} />
      </Suspense>
    </div>
  )
}

export default Track