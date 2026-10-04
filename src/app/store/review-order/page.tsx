import Link from 'next/link';

export default function ReviewOrderPage() {
  return (
    <div className="max-w-[390px] mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      <header className="px-4 py-4 bg-white border-b sticky top-0 z-10 flex items-center gap-3">
        <Link href="/store" className="text-blue-600 font-medium">← Back</Link>
        <h1 className="text-lg font-semibold">Review Order</h1>
      </header>

      <main className="flex-1 p-4 space-y-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <h2 className="font-semibold mb-3">Order Items</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>2x Premium Widgets</span>
              <span className="font-medium">$45.00</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>1x Standard Widget</span>
              <span className="font-medium">$15.00</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t flex justify-between font-bold">
            <span>Total</span>
            <span>$60.00</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <h2 className="font-semibold mb-2">Delivery Details</h2>
          <p className="text-sm text-gray-600">Store #104 - Main St Location</p>
          <p className="text-sm text-gray-600">Expected: Today, 3:00 PM</p>
        </div>
      </main>

      <div className="p-4 bg-white border-t sticky bottom-0">
        <Link href="/store/order-confirmed" className="block w-full bg-blue-600 text-white text-center py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
          Confirm Order
        </Link>
      </div>
    </div>
  );
}
