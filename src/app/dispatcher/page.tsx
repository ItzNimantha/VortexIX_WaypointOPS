import { redirect } from 'next/navigation'

export default function DispatcherIndex() {
  redirect('/dispatcher/queue')
}
