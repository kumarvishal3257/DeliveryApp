"use client"

import React, {useEffect} from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { updateOrderStatus } from '../../store/features/orderSlice';
import LinearProgress from '@mui/material/LinearProgress';
import { Box } from '@mui/material';
import { useRouter } from 'next/navigation';

const Dashboard = () => {
    const orders = useSelector((state) => state.order.orders);
    const dispatch = useDispatch();
    const router = useRouter();
  

    const statusSequence = [
    "scheduled",
    "Reached store",
    "Picked Up",
    "Out for delivery",
    "delivered"
  ];

    useEffect(() => {

  const interval = setInterval(() => {
    orders.forEach(async (order) => {
      const currentIndex = statusSequence.indexOf(order.status);
      // If already delivered, skip updating
      if (order.status === "delivered") return;

      const newStatus = statusSequence[currentIndex + 1];
      const response = await fetch('/api', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderId: order.orderId, status: newStatus })
      });
      const result = await response.json();
      if (result.success) {
        dispatch(updateOrderStatus({ orderId: order.orderId, status: newStatus }));
      }
    });

    // If all orders are delivered, clear interval
    if (orders.every(order => order.status === "delivered")) {
      clearInterval(interval);
    }
  }, 3000); // 10 seconds interval

  return () => clearInterval(interval);
}, [orders, dispatch]);
  return (
    <div>
      {
        orders.length > 0 ? (
          <ul>
            {orders.map((order, id) => {
              const currentIndex = statusSequence.indexOf(order.status);
            const progressValue = ((currentIndex + 1) / statusSequence.length) * 100;
            return (
              <div key={id} className='border p-4 mb-2 bg-gray-100 rounded'>
                <p className='text-xl text-bold'>Order Details</p>
                <p>Order ID: {order.orderId}</p>
                <div className='flex items-center'>
                    <p className='text-green-600 mr-2'>Status: {order.status}</p>
                    {order.status === "Out for delivery" && (
                      <span
                        className='text-blue-600 underline cursor-pointer ml-2'
                        onClick={() => router.push(`/frontend/track?orderId=${order.orderId}`)}
                      >
                        Track live status
                      </span>
                    )}
                  </div>
                <p>Created At: {new Date(order.createdAt).toLocaleString()}</p>
                <h3>Items: {order.items.name}</h3>
                <Box sx={{ width: '100%' }}>
      <LinearProgress variant="determinate" value={progressValue} />
    </Box>
              </div>
              
            )})}
          </ul>
        ) : (
          <p>No orders found.</p>
        )
      }
    </div>
  )
}

export default Dashboard
