"use client"

import React from 'react'
import { useRouter } from 'next/navigation';

const NavBar = () => {
    const router = useRouter();
  return (
      <nav className='w-full h-[20%] flex bg-gray-800 text-white'>
        <ul className='flex justify-between bg-gray-800 text-white p-4 '>
            <li className='hover:cursor-pointer'
            onClick={() => router.push('/frontend/dashboard')}>Dashboard</li>
        </ul>
      </nav>
  )
}

export default NavBar
