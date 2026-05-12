export default function StatusPanel({ status, job }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>Trạng thái</h2>
      </div>
      <dl className="statusGrid">
        <dt>Job ID</dt>
        <dd className="mono">{job?.job_id || status?.job_id || "-"}</dd>
        <dt>Status</dt>
        <dd>{status?.status || job?.status || "-"}</dd>
        <dt>Stage</dt>
        <dd>{status?.stage || job?.stage || "-"}</dd>
        <dt>Tiến độ</dt>
        <dd>{status?.percent ?? 0}%</dd>
        <dt>Thông báo</dt>
        <dd>{status?.message || "-"}</dd>
        <dt>PDF nguồn</dt>
        <dd className="mono breakText">{job?.source_pdf_path || job?.paths?.source_pdf_path || "-"}</dd>
      </dl>
      <div className="progressTrack">
        <div className="progressFill" style={{ width: `${Math.min(status?.percent ?? 0, 100)}%` }} />
      </div>
    </section>
  );
}
