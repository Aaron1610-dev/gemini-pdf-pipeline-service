import { useEffect, useState } from "react";

function PdfPreviewCard({ kind, label, url, pageHint, missingMessage, onLoadKey }) {
  const [loading, setLoading] = useState(Boolean(url));
  const [available, setAvailable] = useState(Boolean(url));

  useEffect(() => {
    setLoading(Boolean(url));
    setAvailable(Boolean(url));
    let cancelled = false;
    async function checkPreview() {
      if (!url) return;
      try {
        const response = await fetch(url, { method: "HEAD" });
        if (!cancelled) {
          setAvailable(response.ok);
          if (!response.ok) setLoading(false);
        }
      } catch {
        if (!cancelled) setAvailable(true);
      }
    }
    checkPreview();
    return () => {
      cancelled = true;
    };
  }, [url, onLoadKey]);

  return (
    <section className={`pdf-preview-card ${kind}`}>
      <div className="pdfPreviewHeader">
        <div>
          <h3>{label}</h3>
          {pageHint ? <p>{pageHint}</p> : null}
        </div>
      </div>
      {url && available ? (
        <div className="pdfFrameWrap">
          {loading ? <div className="previewLoadingOverlay">Đang tải preview...</div> : null}
          <iframe className="pdf-frame" src={url} title={label} onLoad={() => setLoading(false)} />
        </div>
      ) : (
        <div className="pdfMissingState">{missingMessage || "Chưa có file preview."}</div>
      )}
    </section>
  );
}

export default function SplitPdfReview({
  title,
  description,
  sourcePreviewUrl,
  extractedPreviewUrl,
  sourceLabel = "Sách giáo khoa gốc",
  extractedLabel = "Kết quả trích xuất",
  sourcePageHint,
  extractedPageHint,
  extractedStatusBadge,
  missingExtractedMessage,
  children,
}) {
  return (
    <section className="split-review">
      <div className="split-review-header">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {extractedStatusBadge ? <div className="splitStatusSlot">{extractedStatusBadge}</div> : null}
      </div>
      <div className="split-preview-grid">
        <PdfPreviewCard
          kind="source"
          label={sourceLabel}
          url={sourcePreviewUrl}
          pageHint={sourcePageHint}
          missingMessage="Chưa có preview sách gốc."
          onLoadKey={sourcePreviewUrl}
        />
        <PdfPreviewCard
          kind="extracted"
          label={extractedLabel}
          url={extractedPreviewUrl}
          pageHint={extractedPageHint}
          missingMessage={missingExtractedMessage}
          onLoadKey={extractedPreviewUrl}
        />
      </div>
      {children ? <div className="review-metadata-panel">{children}</div> : null}
    </section>
  );
}
