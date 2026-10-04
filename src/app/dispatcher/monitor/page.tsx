import React from 'react';

const mockMonitorData = [
  { id: 1, vehicle: 'V-101', progress: 75, lastSynced: '10:45 AM', status: 'Online' },
  { id: 2, vehicle: 'V-102', progress: 100, lastSynced: '11:00 AM', status: 'Online' },
  { id: 3, vehicle: 'V-103', progress: 30, lastSynced: '09:15 AM', status: 'Offline' },
];

export default function MonitorPage() {
  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Route Monitor</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockMonitorData.map((data) => (
          <div key={data.id} className="bg-white p-6 rounded-lg shadow border relative">
            {data.status === 'Offline' && (
              <span className="absolute top-4 right-4 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                OFFLINE
              </span>
            )}
            <h2 className="text-xl font-bold mb-2">{data.vehicle}</h2>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Progress</span>
                <span>{data.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className={`h-2.5 rounded-full ${data.status === 'Offline' ? 'bg-gray-400' : 'bg-blue-600'}`} 
                  style={{ width: `${data.progress}%` }}
                ></div>
              </div>
            </div>
            <div className="text-sm text-gray-500 flex justify-between items-center">
              <span>Last Synced:</span>
              <span className="font-mono">{data.lastSynced}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
