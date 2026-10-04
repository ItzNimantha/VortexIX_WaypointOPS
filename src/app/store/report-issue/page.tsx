import Link from 'next/link';

export default function ReportIssuePage() {
  return (
    <div className="max-w-[390px] mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      <header className="px-4 py-4 bg-white border-b sticky top-0 z-10 flex items-center gap-3">
        <Link href="/store/confirm-receipt" className="text-gray-500">← Back</Link>
        <h1 className="text-lg font-semibold">Report Issue</h1>
      </header>

      <main className="flex-1 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Issue Type</label>
          <select className="w-full p-3 bg-white border border-gray-300 rounded-lg text-sm">
            <option>Missing Item(s)</option>
            <option>Damaged Goods</option>
            <option>Wrong Item Delivered</option>
            <option>Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea 
            className="w-full p-3 bg-white border border-gray-300 rounded-lg text-sm min-h-[120px]" 
            placeholder="Please provide details about the issue..."
          ></textarea>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Photo Evidence (Optional)</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-white text-gray-500">
            <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            <span className="text-sm">Tap to upload photo</span>
          </div>
        </div>
      </main>

      <div className="p-4 bg-white border-t sticky bottom-0">
        <button className="w-full bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700">
          Submit Report
        </button>
      </div>
    </div>
  );
}
