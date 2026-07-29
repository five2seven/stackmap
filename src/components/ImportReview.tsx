import type { StackMapExport } from '../domain/types'

interface ImportReviewProps {
  data: StackMapExport
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export function ImportReview({ data, onConfirm, onCancel }: ImportReviewProps) {
  return (
    <section className="import-review" role="alertdialog" aria-labelledby="import-title">
      <div>
        <p className="eyebrow">Confirm replacement</p>
        <h2 id="import-title">Review imported data</h2>
        <p>
          This valid version {data.schemaVersion} backup contains{' '}
          <strong>{data.services.length} services</strong> and{' '}
          <strong>{data.hosts.length} hosts</strong>. Confirming will replace all current data.
        </p>
      </div>
      <div className="form-actions">
        <button className="button danger-fill" type="button" onClick={onConfirm}>
          Replace current data
        </button>
        <button className="button ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

