import Link from 'next/link';

export default function OrderConfirmedPage() {
  return (
    <div className="max-w-[390px] mx-auto min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      
      <h1 className="text-2xl font-bold mb-2">Order Confirmed!</h1>
      <p className="text-gray-600 mb-8">Your order #ORD-9823 has been successfully placed and is being processed.</p>
      
      <div className="w-full space-y-3">
        <Link href="/store/order-tracking" className="block w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
          Track Order
        </Link>
        <Link href="/store" className="block w-full bg-gray-100 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors">
          Back to Store
        </Link>
      </div>
    </div>
  );
}
