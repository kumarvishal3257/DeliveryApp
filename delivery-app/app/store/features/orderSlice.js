import { createSlice } from '@reduxjs/toolkit';

export const orderSlice = createSlice({
  name: 'order',
  initialState: { orders: [] },
  reducers: {
    addOrder: (state, action) => {
      state.orders.push(action.payload);
    },
    updateOrderStatus: (state, action) => {
      const order = state.orders.find(order => order.orderId === action.payload.orderId);
      if (order) {
        order.status = action.payload.status;
      }
    }
  },
});

export const { addOrder, updateOrderStatus } = orderSlice.actions;

export default orderSlice.reducer;