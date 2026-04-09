export function GlobalBanner({ message }: { message: string }) {
  if (!message.trim()) return null
  return (
    <div
      role="status"
      className="w-full bg-primary text-on-primary text-xs font-medium text-center px-4 py-2"
    >
      {message}
    </div>
  )
}
