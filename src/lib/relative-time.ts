import type { Messages } from '@/locales/en'

type TimeMessages = Pick<
  Messages['adminPages'],
  'dashboardTimeJustNow' | 'dashboardTimeMinAgo' | 'dashboardTimeHoursAgo' | 'dashboardTimeDaysAgo'
>

export function timeAgo(iso: string, at: TimeMessages): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return at.dashboardTimeJustNow
  if (mins < 60) return at.dashboardTimeMinAgo.replace('{0}', String(mins))
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return at.dashboardTimeHoursAgo.replace('{0}', String(hrs))
  return at.dashboardTimeDaysAgo.replace('{0}', String(Math.floor(hrs / 24)))
}
