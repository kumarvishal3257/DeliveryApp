"use client"
import React, {useState} from 'react'
import ProductCard from './productCard';
import AddressForm from './addressForm';
import product_items from '../../constants/productItems'; // Assuming items.json contains the product data

const Product = () => {
    const [addressForm, setAddressForm] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
  return (
    <div className='flex flex-wrap  gap-4 p-4 relative'>
        {product_items.map((item) => 
        <ProductCard key={item.id} item={item} setAddressForm={setAddressForm} addressForm={addressForm} setSelectedItem={setSelectedItem}/>)}

        <div className='absolute top-5  right-15 bg-white p-2 rounded shadow-lg'>
        {addressForm && 
        (<AddressForm setAddressForm={setAddressForm} selectedItem={selectedItem}/>) }
      </div>

    </div>
  )
}

export default Product
