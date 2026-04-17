'use client'

import { ServicesPanel }         from './ServicesPanel'
import { OllamaMetricsProvider, OllamaStatusBlock, OllamaInstalledBlock, OllamaRunningBlock } from './OllamaMetrics'

interface Props {
  initial: { baseUrl: string; translationModel: string; ocrModel: string; rewriteModel: string; sameModelForAll: boolean }
}

export function OllamaServicesLayout({ initial }: Props) {
  return (
    <OllamaMetricsProvider>
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-8 items-start">
        {/* Left — form + installed models */}
        <div className="flex flex-col gap-4">
          <ServicesPanel mode="ai" initial={initial} />
          <OllamaInstalledBlock />
        </div>

        {/* Right — status + models in memory */}
        <div className="flex flex-col gap-4">
          <OllamaStatusBlock />
          <OllamaRunningBlock />
        </div>
      </div>
    </OllamaMetricsProvider>
  )
}
