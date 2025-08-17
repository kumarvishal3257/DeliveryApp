let orders = [];

export async function POST(request) {
// Parse the incoming request body
  const body = await request.json();
  
  // Add the order to the orders array
  const order = {
    orderId: `ORD-${Date.now()  + Math.floor(Math.random() * 1000)}`,
    items: body.items,
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };
  
  orders.push(order);

  // Return a success response with the order data
  const data = {
    message: 'Order placed successfully',
    order
  };

  // Return the response
  return Response.json({ success: true, data })
}

export async function PATCH(request) {
  const body = await request.json();
  const { orderId, status } = body;

  // Find the order by ID and update its status
  const orderIndex = orders.findIndex(order => order.orderId === orderId);
  
  if (orderIndex !== -1) {
    orders[orderIndex].status = status;
    return Response.json({ success: true, message: 'Order status updated successfully' });
  } else {
    return Response.json({ success: false, message: 'Order not found' }, { status: 404 });
  }
}