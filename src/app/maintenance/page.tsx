export default function MaintenancePage({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-on-background px-6">
      <div className="text-center max-w-md space-y-4">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant" aria-hidden="true">
          engineering
        </span>
        <h1 className="font-headline font-bold text-2xl text-on-surface">Maintenance en cours</h1>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          {message?.trim() || 'Le site est temporairement en maintenance. Merci de réessayer plus tard.'}
        </p>
      </div>
    </div>
  )
}
