import Link from 'next/link';

export default function OrderDeferredPage() {
  return (
    <div className="max-w-[390px] mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      <header className="px-4 py-4 bg-white border-b sticky top-0 z-10 flex items-center gap-3">
        <Link href="/store" className="text-gray-500">← Back</Link>
        <h1 className="text-lg font-semibold">Order Deferred</h1>
      </header>

      <main className="flex-1 p-4">
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <div>
              <h2 className="font-semibold text-amber-800">Action Required</h2>
              <p className="text-sm text-amber-700 mt-1">Order #ORD-9824 has been deferred due to inventory issues.</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border mb-4">
          <h3 className="font-semibold mb-3">Deferred Items</h3>
          <div className="flex justify-between items-center py-2 border-b">
            <div>
              <p className="text-sm font-medium">Standard Widget</p>
              <p className="text-xs text-gray-500">Requested: 5 | Available: 2</p>
            </div>
            <span className="text-sm font-bold text-red-600">-3 units</span>
          </div>
        </div>
      </main>

      <div className="p-4 bg-white border-t sticky bottom-0 space-y-3">
        <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium">Accept Available (2)</button>
        <button className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium">Cancel Item</button>
      </div>
    </div>
  );
}
