import React from 'react';

const mockDeferrals = [
  { id: 1, vehicle: 'V-101', deferredYesterday: true, daysSinceLastServed: 3, type: 'Forced', reason: 'Maintenance' },
  { id: 2, vehicle: 'V-102', deferredYesterday: false, daysSinceLastServed: 1, type: 'Choice', reason: 'Driver fatigue' },
  { id: 3, vehicle: 'V-103', deferredYesterday: true, daysSinceLastServed: 5, type: 'Forced', reason: 'Awaiting parts' },
];

export default function DeferralsPage() {
  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Deferrals Management</h1>
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-4 font-semibold">Vehicle</th>
              <th className="p-4 font-semibold">Deferred Yesterday</th>
              <th className="p-4 font-semibold">Days Since Last Served</th>
              <th className="p-4 font-semibold">Type (Forced/Choice)</th>
              <th className="p-4 font-semibold">Reason (Editable)</th>
            </tr>
          </thead>
          <tbody>
            {mockDeferrals.map((deferral) => (
              <tr key={deferral.id} className="border-b hover:bg-gray-50">
                <td className="p-4">{deferral.vehicle}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs ${deferral.deferredYesterday ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {deferral.deferredYesterday ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="p-4">{deferral.daysSinceLastServed}</td>
                <td className="p-4">{deferral.type}</td>
                <td className="p-4">
                  <input 
                    type="text" 
                    defaultValue={deferral.reason} 
                    className="border rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
