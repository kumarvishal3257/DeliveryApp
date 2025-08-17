import React from 'react'
import Image from 'next/image';

const ProductCard = ({item, setAddressForm, setSelectedItem}) => {
  console.log("product card item: ", item);
  const clickHandler = () => {
    setAddressForm(true);
    setSelectedItem(item);
  }
  return (
    // <div className=''>
      <div className='bg-white shadow-lg rounded-lg p-4'>
        <Image src={item.image.src} alt={item.name} width={100} height={100} 
        priority={true} className='object-fit rounded-t-lg' />
        <h2 className='text-lg font-semibold mt-2'>{item.name}</h2>
        <p className='text-gray-600'>Price: ${item.price}</p>
        <button className='bg-blue-500 text-white px-4 py-2 rounded mt-2'
        onClick={clickHandler}>
          Buy Now
        </button>
      </div>
    // </div>
  )
}

export default ProductCard
