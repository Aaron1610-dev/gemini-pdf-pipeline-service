import { useEffect, useMemo, useState } from "react";
import { getAssetPreviewUrl, getTopicPreviewInfo, getTopicPreviewUrl } from "../api/reviewApi.js";
import EmptyState from "./EmptyState.jsx";
import ErrorState from "./ErrorState.jsx";
import LoadingState from "./LoadingState.jsx";

const ADVANCED_COLUMNS = ["topic_num", "topic_name", "start", "end", "raw_heading", "raw_title"];

function pad2(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed).padStart(2, "0") : String(value || "--");
}

function topicStatus(topic) {
  if (topic?.metadata_edu_saved || topic?.minio_uploaded) return { label: "Đã lưu MinIO/MongoDB", tone: "done" };
  if (topic?.approved) return { label: "Đã duyệt", tone: "done" };
  if (topic?.error) return { label: "Lỗi", tone: "danger" };
  return { label: "Chờ duyệt", tone: "pending" };
}

export default function TopicReviewView({
  jobId,
  topics,
  approved,
  loading,
  error,
  onChange,
  onLoad,
  onExtract,
  onSave,
  onApproveAll,
  onApproveTopic,
  onExtractLessonsForTopic,
  onBack,
  onNext,
}) {
  const safeTopics = Array.isArray(topics) ? topics : [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewInfo, setPreviewInfo] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [frameLoading, setFrameLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [localMessage, setLocalMessage] = useState("");
  const [localError, setLocalError] = useState("");

  const approvedCount = safeTopics.filter((topic) => topic.approved || topic.metadata_edu_saved).length;
  const selectedTopic = safeTopics[Math.min(selectedIndex, Math.max(safeTopics.length - 1, 0))] || null;
  const selectedTopicNum = selectedTopic?.topic_num;
  const previewUrl = useMemo(() => {
    if (!jobId || !selectedTopicNum) return "";
    return `${getTopicPreviewUrl(jobId, selectedTopicNum)}?v=${previewVersion}`;
  }, [jobId, selectedTopicNum, previewVersion]);

  useEffect(() => {
    if (selectedIndex > safeTopics.length - 1) setSelectedIndex(0);
  }, [safeTopics.length, selectedIndex]);

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      if (!jobId || !selectedTopicNum) {
        setPreviewInfo(null);
        setPreviewError("");
        return;
      }
      setPreviewLoading(true);
      setFrameLoading(true);
      setPreviewError("");
      try {
        const info = await getTopicPreviewInfo(jobId, selectedTopicNum);
        if (!cancelled) setPreviewInfo(info);
      } catch (err) {
        if (!cancelled) {
          setPreviewInfo(null);
          setPreviewError(err.message || "Không tải được preview topic.");
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [jobId, selectedTopicNum, previewVersion]);

  function updateSelected(field, value) {
    if (!selectedTopic) return;
    onChange(selectedIndex, field, value);
  }

  async function approveSelected() {
    if (!selectedTopic || !onApproveTopic) return;
    setApproving(true);
    setLocalError("");
    setLocalMessage(`Đang lưu Topic ${pad2(selectedTopic.topic_num)} lên MinIO/MongoDB...`);
    try {
      if (onSave) await onSave();
      const result = await onApproveTopic(selectedTopic);
      if (result === null) {
        throw new Error("Duyệt topic thất bại. Vui lòng xem thông báo lỗi hoặc nhật ký.");
      }
      setLocalMessage(`Đã duyệt Topic ${pad2(selectedTopic.topic_num)} và lưu lên MinIO/MongoDB.`);
      setPreviewVersion((value) => value + 1);
    } catch (err) {
      setLocalError(err.message || "Duyệt topic thất bại.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <section className="panel reviewCard topicReviewWorkspace">
      <div className="topicReviewHeader">
        <div>
          <span className="stepLabel">Bước 2</span>
          <h2>Bước 2: Duyệt chủ đề</h2>
          <p className="muted">Chọn từng chủ đề để xem preview PDF, chỉnh sửa thông tin và duyệt.</p>
        </div>
        <div className="topicHeaderActions">
          <button type="button" onClick={onExtract} disabled={loading || approving}>
            {safeTopics.length ? "Trích xuất lại" : "Trích xuất chủ đề"}
          </button>
          <button type="button" onClick={onLoad} disabled={loading || approving}>Tải lại danh sách</button>
        </div>
      </div>

      <div className="summaryCards">
        <div className="summaryCard"><span>Tổng chủ đề</span><strong>{safeTopics.length}</strong></div>
        <div className="summaryCard"><span>Đã duyệt</span><strong>{approvedCount}/{safeTopics.length}</strong></div>
        <div className="summaryCard"><span>Trạng thái</span><strong>{approved ? "Đã duyệt tất cả" : "Chờ duyệt"}</strong></div>
      </div>

      {localMessage ? <div className="successBanner compactBanner">{localMessage}</div> : null}
      {localError ? <ErrorState message={localError} /> : null}
      {loading ? <LoadingState message="Đang tải topics..." /> : null}
      {error ? <ErrorState message={error} onRetry={onLoad} /> : null}
      {!loading && !error && topics == null ? <EmptyState message="Chưa có dữ liệu topic. Hãy trích xuất hoặc tải topics cho job đang chọn." /> : null}
      {!loading && !error && topics != null && safeTopics.length === 0 ? <EmptyState message="Danh sách topic đang trống." /> : null}

      {safeTopics.length > 0 ? (
        <div className="topicReviewGrid">
          <TopicList topics={safeTopics} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />

          <main className="topicReviewMain">
            <TopicPreviewPanel
              topic={selectedTopic}
              previewInfo={previewInfo}
              previewUrl={previewUrl}
              loading={previewLoading}
              frameLoading={frameLoading}
              error={previewError}
              onFrameLoad={() => setFrameLoading(false)}
              onRetry={() => setPreviewVersion((value) => value + 1)}
            />

            <TopicEditorCard
              topic={selectedTopic}
              loading={loading || approving}
              onUpdate={updateSelected}
              onSave={onSave}
              onApprove={approveSelected}
              onExtractLessons={onExtractLessonsForTopic}
            />
          </main>
        </div>
      ) : null}

      <div className="advancedActions">
        <button type="button" className="linkButton" onClick={() => setBulkOpen((value) => !value)}>
          {bulkOpen ? "Ẩn nâng cao" : "Nâng cao"}
        </button>
        {bulkOpen ? (
          <div className="advancedBox">
            <p className="muted">Thao tác này sẽ lưu toàn bộ topic lên MongoDB/MinIO.</p>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Thao tác này sẽ lưu toàn bộ topic lên MongoDB/MinIO. Tiếp tục?")) onApproveAll?.();
              }}
              disabled={loading || approving || approved}
            >
              Duyệt tất cả topic
            </button>
            <button type="button" className="linkButton" onClick={() => setAdvancedOpen((value) => !value)}>
              {advancedOpen ? "Ẩn chỉnh sửa nâng cao" : "Chỉnh sửa nâng cao"}
            </button>
          </div>
        ) : null}
      </div>

      {advancedOpen ? <AdvancedTopicTable topics={safeTopics} onChange={onChange} disabled={loading || approving} /> : null}

      <div className="wizardNav">
        <button type="button" onClick={onBack}>Quay lại</button>
        <button type="button" className="primaryButton" onClick={onNext}>Tiếp tục bài học</button>
      </div>
    </section>
  );
}

function TopicList({ topics, selectedIndex, onSelect }) {
  return (
    <aside className="topicListPanel">
      <div className="cardHeaderCompact">
        <h3>Danh sách chủ đề</h3>
        <span>{topics.length} topic</span>
      </div>
      <div className="topicList">
        {topics.map((topic, index) => {
          const status = topicStatus(topic);
          return (
            <button
              type="button"
              className={`topicListItem ${index === selectedIndex ? "active" : ""}`}
              key={topic.name || `${topic.topic_num}-${index}`}
              onClick={() => onSelect(index)}
            >
              <div>
                <strong>Topic {pad2(topic.topic_num)}</strong>
                <span>{topic.topic_name || "-"}</span>
                <small>Trang {topic.start || "-"}-{topic.end || "-"}</small>
              </div>
              <em className={`inlineStatus ${status.tone}`}>{status.label}</em>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function TopicPreviewPanel({ topic, previewInfo, previewUrl, loading, frameLoading, error, onFrameLoad, onRetry }) {
  const assetPreviewUrl = previewInfo?.asset_object_key ? getAssetPreviewUrl(previewInfo.asset_object_key) : "";
  const hasPreview = Boolean(previewUrl && (previewInfo?.local_preview_available || previewInfo?.asset_object_key));
  const status = topicStatus(topic);
  return (
    <section className="topicPreviewPanel">
      <div className="previewHeader">
        <div>
          <h3>Preview chủ đề</h3>
          <p className="muted">{topic ? `Topic ${pad2(topic.topic_num)}: ${topic.topic_name || "-"}` : "Chưa chọn topic"}</p>
        </div>
        <span className={`inlineStatus ${topic?.approved ? "done" : "pending"}`}>
          {topic?.approved ? "Đã lưu MinIO/MongoDB" : "Preview qua backend"}
        </span>
      </div>

      {topic ? (
        <div className="previewMetaLine">
          <span>Trang {topic.start || "-"}-{topic.end || "-"}</span>
          <span>{status.label}</span>
          {previewInfo?.asset_object_key ? <span className="mono truncate">MinIO: {previewInfo.asset_object_key}</span> : null}
        </div>
      ) : null}
      {previewInfo?.asset_object_key ? (
        <div className="backendPreviewNotice">
          <span>Bucket MinIO đang private. Hệ thống sẽ hiển thị file thông qua backend preview.</span>
          <button type="button" onClick={() => window.open(assetPreviewUrl, "_blank", "noopener,noreferrer")}>Xem qua backend</button>
        </div>
      ) : null}

      {loading ? <LoadingState message="Đang tải preview..." /> : null}
      {!loading && error ? (
        <div className="previewMissing">
          <EmptyState message="Không tìm thấy file PDF preview. Vui lòng kiểm tra log trích xuất chủ đề." />
          <button type="button" onClick={onRetry}>Tải lại preview</button>
        </div>
      ) : null}
      {!loading && !error && hasPreview ? (
        <div className="previewFrameWrap">
          {frameLoading ? <div className="previewLoadingOverlay">Đang tải preview...</div> : null}
          <iframe className="topicPreviewFrame" src={previewUrl} title={`Preview topic ${topic?.topic_num}`} onLoad={onFrameLoad} />
        </div>
      ) : null}
      {!loading && !error && !hasPreview ? (
        <div className="previewMissing">
          <EmptyState message="Không tìm thấy file PDF preview. Vui lòng kiểm tra log trích xuất chủ đề." />
          <button type="button" onClick={onRetry}>Tải lại preview</button>
        </div>
      ) : null}
    </section>
  );
}

function TopicEditorCard({ topic, loading, onUpdate, onSave, onApprove, onExtractLessons }) {
  if (!topic) return null;
  return (
    <section className="topicEditorCard">
      <div>
        <h3>Thông tin chủ đề</h3>
        <p className="muted">Chỉnh sửa metadata của topic đang chọn trước khi duyệt.</p>
      </div>
      <div className="topicEditorGrid">
        <label>
          <span>Topic number</span>
          <input type="number" value={topic.topic_num ?? ""} disabled={topic.approved} onChange={(event) => onUpdate("topic_num", Number(event.target.value))} />
        </label>
        <label className="wide">
          <span>Tên chủ đề</span>
          <input type="text" value={topic.topic_name ?? ""} disabled={topic.approved} onChange={(event) => onUpdate("topic_name", event.target.value)} />
        </label>
        <label>
          <span>Trang bắt đầu</span>
          <input type="number" value={topic.start ?? ""} disabled={topic.approved} onChange={(event) => onUpdate("start", Number(event.target.value))} />
        </label>
        <label>
          <span>Trang kết thúc</span>
          <input type="number" value={topic.end ?? ""} disabled={topic.approved} onChange={(event) => onUpdate("end", Number(event.target.value))} />
        </label>
      </div>
      {topic.asset_object_key ? (
        <details className="minioDetails">
          <summary>Thông tin MinIO</summary>
          <p className="mono breakText">{topic.asset_object_key}</p>
          <button type="button" onClick={() => window.open(getAssetPreviewUrl(topic.asset_object_key), "_blank", "noopener,noreferrer")}>
            Xem qua backend
          </button>
          {topic.asset_url ? (
            <details className="advancedMinioUrl">
              <summary>Nâng cao</summary>
              <p className="muted">URL MinIO trực tiếp có thể bị AccessDenied vì bucket đang private.</p>
              <p className="mono breakText">{topic.asset_url}</p>
            </details>
          ) : null}
        </details>
      ) : null}
      <div className="approvalActions">
        <button type="button" onClick={onSave} disabled={loading || topic.approved}>Lưu chỉnh sửa</button>
        <button type="button" className="primaryButton" onClick={onApprove} disabled={loading || topic.approved}>
          Duyệt topic này
        </button>
        {topic.approved ? (
          <button type="button" className="primaryButton" onClick={() => onExtractLessons?.(topic)} disabled={loading}>
            Trích xuất bài học topic này
          </button>
        ) : null}
      </div>
    </section>
  );
}

function AdvancedTopicTable({ topics, onChange, disabled }) {
  return (
    <div className="tableWrap advancedTopicTableWrap">
      <table className="reviewTable topicReviewTable">
        <thead>
          <tr>
            <th>#</th>
            {ADVANCED_COLUMNS.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {topics.map((topic, index) => (
            <tr key={topic.name || `${topic.topic_num}-${index}`}>
              <td>{index + 1}</td>
              {ADVANCED_COLUMNS.map((column) => (
                <td key={column}>
                  <input
                    type={column === "start" || column === "end" || column === "topic_num" ? "number" : "text"}
                    value={topic[column] ?? ""}
                    disabled={disabled || topic.approved}
                    onChange={(event) => onChange(index, column, column === "start" || column === "end" || column === "topic_num" ? Number(event.target.value) : event.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
