import React from "react";
import { useDispatch } from "react-redux";
import { addOrder } from "../store/features/orderSlice";

const AddressForm = ({ setAddressForm, selectedItem }) => {
  const dispatch = useDispatch();

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());

    const orderData = {
      ...selectedItem,
      ...data,
    };
    const response = await fetch("/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: orderData }),
    });
    setAddressForm(false);
    const result = await response.json();
    dispatch(addOrder(result.data.order));

    if (result.success) {
      alert(
        `Order placed successfully! Order ID: ${result.data.order.orderId}`
      );
    } else {
      alert("Failed to place order");
    }
  };

  const handleCancel = () => {
    // Logic to cancel the form submission
    alert("Order cancelled");
    setAddressForm(false);
  };
  return (
    <form
      onSubmit={handleSubmit}
      className=" mx-auto p-4 bg-gray-100 rounded-lg shadow-md"
    >
      <label htmlFor="name">Name:</label>
      <input
        type="text"
        id="name"
        name="name"
        required
        className="border p-2 rounded mb-4 w-full"
      />

      <label htmlFor="address">Address:</label>
      <input
        type="text"
        id="address"
        name="address"
        required
        className="border p-2 rounded mb-4 w-full"
      />

      <label htmlFor="phone">Phone:</label>
      <input
        type="tel"
        id="phone"
        name="phone"
        required
        className="border p-2 rounded mb-4 w-full"
      />

      <label htmlFor="postalCode">Postal Code:</label>
      <input
        type="number"
        id="postalCode"
        name="postalCode"
        required
        className="border p-2 rounded mb-4 w-full"
      />

      <label htmlFor="city">City:</label>
      <input
        type="text"
        id="city"
        name="city"
        required
        className="border p-2 rounded mb-4 w-full"
      />

      <button
        type="submit"
        className="bg-blue-500 text-white px-4 py-2 rounded mt-2"
      >
        Submit
      </button>

      <button
        type="button"
        className="bg-green-500 text-white px-4 py-2 rounded mt-2 ml-2"
        onClick={handleCancel}
      >
        Cancel
      </button>
    </form>
  );
};

export default AddressForm;
