import Link from 'next/link';

export default function UpdatesPage() {
  return (
    <div className="max-w-[390px] mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      <header className="px-4 py-4 bg-white border-b sticky top-0 z-10 flex items-center gap-3">
        <Link href="/store" className="text-gray-500">←</Link>
        <h1 className="text-lg font-semibold">Store Updates</h1>
      </header>

      <main className="flex-1 p-4 space-y-3">
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex justify-between items-start mb-2">
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">Alert</span>
            <span className="text-xs text-gray-500">10 mins ago</span>
          </div>
          <h3 className="font-semibold text-sm">Delivery Delay: Route 4</h3>
          <p className="text-sm text-gray-600 mt-1">Heavy traffic is causing a 30-minute delay for expected deliveries.</p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border opacity-75">
          <div className="flex justify-between items-start mb-2">
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded">Notice</span>
            <span className="text-xs text-gray-500">2 hours ago</span>
          </div>
          <h3 className="font-semibold text-sm">Inventory Restock Completed</h3>
          <p className="text-sm text-gray-600 mt-1">Morning restock has been fully processed.</p>
        </div>
      </main>
    </div>
  );
}
