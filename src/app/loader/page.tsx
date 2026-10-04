import { redirect } from 'next/navigation'

export default function LoaderIndex() {
  redirect('/loader/queue')
}
