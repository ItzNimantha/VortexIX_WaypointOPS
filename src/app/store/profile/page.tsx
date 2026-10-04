import Link from 'next/link';
import { LogoutButton } from '@/components/LogoutButton';

export default function ProfilePage() {
  return (
    <div className="max-w-[390px] mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      <header className="px-4 py-4 bg-white border-b sticky top-0 z-10 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Profile</h1>
        <Link href="/store" className="text-blue-600 text-sm font-medium">Done</Link>
      </header>

      <main className="flex-1 p-4 space-y-6">
        <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xl font-bold">
            SM
          </div>
          <div>
            <h2 className="font-bold text-lg">Sarah Manager</h2>
            <p className="text-sm text-gray-500">Store #104 (Main St)</p>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-2">Settings</h3>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <span className="text-sm font-medium">Notifications</span>
              <div className="w-10 h-6 bg-blue-600 rounded-full relative">
                <div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1"></div>
              </div>
            </div>
            <div className="p-4 border-b flex justify-between items-center text-sm font-medium text-gray-700">
              Change Password
              <span className="text-gray-400">›</span>
            </div>
            <div className="p-4 flex justify-between items-center text-sm font-medium text-gray-700">
              Help & Support
              <span className="text-gray-400">›</span>
            </div>
          </div>
        </div>

        <LogoutButton className="w-full bg-white border border-red-200 text-red-600 py-3 rounded-lg font-medium shadow-sm" />
      </main>
    </div>
  );
}
