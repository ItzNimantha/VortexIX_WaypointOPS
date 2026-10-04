import React from 'react';

const mockReadinessData = [
  { id: 1, vehicle: 'V-101', checklist: { fuel: true, tires: true, engine: true, cleanliness: true } },
  { id: 2, vehicle: 'V-102', checklist: { fuel: true, tires: false, engine: true, cleanliness: true } },
  { id: 3, vehicle: 'V-103', checklist: { fuel: false, tires: false, engine: false, cleanliness: false } },
];

export default function ReadinessPage() {
  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Vehicle Readiness Checklist</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {mockReadinessData.map((data) => (
          <div key={data.id} className="bg-white p-6 rounded-lg shadow border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{data.vehicle}</h2>
              <span className="text-sm font-medium text-gray-500">Checklist</span>
            </div>
            <div className="space-y-3">
              {Object.entries(data.checklist).map(([item, isChecked]) => (
                <div key={item} className="flex items-center">
                  <input 
                    type="checkbox" 
                    defaultChecked={isChecked} 
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label className="ml-3 text-sm font-medium text-gray-700 capitalize">
                    {item} Check
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
