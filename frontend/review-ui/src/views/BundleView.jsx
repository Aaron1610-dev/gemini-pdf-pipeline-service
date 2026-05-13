import { useState } from "react";

export default function BundleView({
  loading,
  bundleResult,
  mongoResult,
  onPrepare,
  onPrepareFast,
  onViewBundle,
  onDownloadBundle,
  onImportMongo,
  onViewMongo,
  onBack,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const bundleCounts = bundleResult?.counts || bundleResult?.data?.counts || {};
  const mongoCounts = mongoResult?.counts || mongoResult?.data?.counts || {};
  const assetCounts = bundleResult?.assets || bundleResult?.asset_counts || {};

  return (
    <section className="panel reviewCard">
      <div className="panelHeader">
        <div>
          <span className="stepLabel">Bước 5</span>
          <h2>Bước 5: Hoàn tất dữ liệu</h2>
          <p className="muted">Tạo bundle cuối và import metadata vào MongoDB.</p>
        </div>
        <div className="actionBar compact">
          <button type="button" className="primaryButton" onClick={onPrepareFast} disabled={loading}>Tạo bundle nhanh</button>
          <button type="button" className="primaryButton" onClick={onImportMongo} disabled={loading}>Import MongoDB</button>
          <button type="button" onClick={onViewMongo} disabled={loading}>Xem kết quả import</button>
        </div>
      </div>
      <button type="button" className="linkButton" onClick={() => setAdvancedOpen((value) => !value)}>
        {advancedOpen ? "Ẩn tuỳ chọn nâng cao" : "Tuỳ chọn nâng cao"}
      </button>
      {advancedOpen ? (
        <div className="actionBar advancedActionBar">
          <button type="button" onClick={onPrepare} disabled={loading}>Tạo bundle có Kaggle</button>
          <button type="button" onClick={onViewBundle} disabled={loading}>Xem bundle</button>
          <button type="button" onClick={onDownloadBundle} disabled={loading}>Tải ZIP bundle</button>
        </div>
      ) : null}

      <div className="bundleGrid">
        <div className="bundleBlock">
          <h3>Bundle</h3>
          <dl className="statusGrid">
            <dt>Trạng thái</dt>
            <dd>{bundleResult?.status || "-"}</dd>
            <dt>Chủ đề</dt>
            <dd>{bundleCounts.topics ?? bundleCounts.topic_count ?? "-"}</dd>
            <dt>Bài học</dt>
            <dd>{bundleCounts.lessons ?? bundleCounts.lesson_count ?? "-"}</dd>
            <dt>Chunk</dt>
            <dd>{bundleCounts.chunks ?? bundleCounts.chunk_count ?? "-"}</dd>
          </dl>
          {Object.keys(bundleCounts).length ? <CountGrid counts={bundleCounts} /> : <p className="muted">Chưa có thống kê bundle.</p>}
          {Object.keys(assetCounts).length ? (
            <>
              <h4>Tài sản PDF / keyword</h4>
              <CountGrid counts={assetCounts} keys={["topic_pdfs", "lesson_pdfs", "chunk_pdfs", "keyword_files"]} />
            </>
          ) : null}
          {bundleResult?.kaggle ? (
            <>
              <h4>Kaggle summary</h4>
              <pre className="jsonBox compactJson">{JSON.stringify(bundleResult.kaggle, null, 2)}</pre>
            </>
          ) : null}
        </div>

        <div className="bundleBlock">
          <h3>MongoDB import</h3>
          <dl className="statusGrid">
            <dt>Trạng thái</dt>
            <dd>{mongoResult?.status || "-"}</dd>
            <dt>Database</dt>
            <dd>{mongoResult?.db_name || "-"}</dd>
            <dt>Hoàn tất</dt>
            <dd>{mongoResult?.completed_at || "-"}</dd>
          </dl>
          {Object.keys(mongoCounts).length ? <CountGrid counts={mongoCounts} /> : <p className="muted">Chưa có kết quả import.</p>}
        </div>
      </div>
      <div className="wizardNav">
        <button type="button" onClick={onBack}>Quay lại</button>
      </div>
    </section>
  );
}

function CountGrid({ counts, keys }) {
  const countKeys = keys || ["class_count", "subject_count", "topic_count", "lesson_count", "chunk_count", "keyword_count", "asset_count"];
  return (
    <div className="countGrid">
      {countKeys.map((key) => (
        <div className="countCard" key={key}>
          <span>{key}</span>
          <strong>{counts[key] ?? 0}</strong>
        </div>
      ))}
    </div>
  );
}
