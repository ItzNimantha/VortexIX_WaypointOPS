export function isPastCutoff(orderTime: Date, targetDate: Date): boolean {
  // 4 PM cutoff for next day
  const cutoff = new Date(targetDate)
  cutoff.setDate(cutoff.getDate() - 1)
  cutoff.setHours(16, 0, 0, 0)

  return orderTime.getTime() > cutoff.getTime()
}

export function getNextOperatingDay(currentDate: Date, calendar: { date: Date, isOperating: boolean }[]): Date {
  let next = new Date(currentDate)
  next.setDate(next.getDate() + 1)

  while (true) {
    const nextStr = next.toISOString().split('T')[0]
    const day = calendar.find(c => c.date.toISOString().split('T')[0] === nextStr)
    
    // Fallback to basic Mon-Sat if calendar not found
    if (!day) {
      if (next.getDay() !== 0) return next
    } else if (day.isOperating) {
      return next
    }
    
    next.setDate(next.getDate() + 1)
  }
}
