'use client'

import { ServicesPanel }         from './ServicesPanel'
import { OllamaMetricsProvider, OllamaStatusBlock, OllamaInstalledBlock, OllamaRunningBlock, OllamaPullBlock } from './OllamaMetrics'

interface Props {
  initial: { baseUrl: string; translationModel: string; ocrModel: string; rewriteModel: string; sameModelForAll: boolean }
}

export function OllamaServicesLayout({ initial }: Props) {
  return (
    <OllamaMetricsProvider>
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 items-start">
        {/* Left — form + installed models */}
        <div className="flex flex-col gap-4">
          <ServicesPanel mode="ai" initial={initial} />
          <OllamaInstalledBlock />
        </div>

        {/* Right — status + models in memory + pull */}
        <div className="flex flex-col gap-4">
          <OllamaStatusBlock />
          <OllamaRunningBlock />
          <OllamaPullBlock />
        </div>
      </div>
    </OllamaMetricsProvider>
  )
}
