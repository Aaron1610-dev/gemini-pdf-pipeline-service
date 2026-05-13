import { useState } from "react";
import EmptyState from "./EmptyState.jsx";
import ErrorState from "./ErrorState.jsx";
import LoadingState from "./LoadingState.jsx";

const COLUMNS = ["topic_num", "topic_name", "start", "end"];
const ADVANCED_COLUMNS = ["raw_heading", "raw_title"];

export default function TopicReviewView({ topics, approved, loading, error, onChange, onLoad, onExtract, onSave, onApprove, onBack, onNext }) {
  const safeTopics = Array.isArray(topics) ? topics : [];
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <section className="panel reviewCard">
      <div className="panelHeader">
        <div>
          <span className="stepLabel">Bước 2</span>
          <h2>Bước 2: Duyệt chủ đề</h2>
          <p className="muted">
            Kiểm tra danh sách chủ đề được AI trích xuất từ sách.
          </p>
        </div>
      </div>
      <SummaryBar items={[["Tổng chủ đề", safeTopics.length], ["Trạng thái", approved ? "Đã duyệt" : "Chưa duyệt"]]} />
      <ActionBar loading={loading} approved={approved} count={safeTopics.length} onExtract={onExtract} onLoad={onLoad} onSave={onSave} onApprove={onApprove} />
      <button type="button" className="linkButton" onClick={() => setAdvancedOpen((value) => !value)}>
        {advancedOpen ? "Ẩn nâng cao" : "Nâng cao"}
      </button>
      {loading ? <LoadingState message="Đang tải topics..." /> : null}
      {error ? <ErrorState message={error} onRetry={onLoad} /> : null}
      {!loading && !error && topics == null ? (
        <EmptyState message="Chưa có dữ liệu topic. Hãy trích xuất hoặc tải topics cho job đang chọn." />
      ) : null}
      {!loading && !error && topics != null && safeTopics.length === 0 ? (
        <EmptyState message="Danh sách topic đang trống." />
      ) : null}
      {safeTopics.length > 0 ? (
        <div className="tableWrap">
          <table className="reviewTable">
            <thead>
              <tr>
                <th>#</th>
                {[...COLUMNS, ...(advancedOpen ? ADVANCED_COLUMNS : [])].map((column) => <th key={column}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {safeTopics.map((topic, index) => (
                <tr key={topic.name || `${topic.topic_num}-${index}`}>
                  <td>{index + 1}</td>
                  {[...COLUMNS, ...(advancedOpen ? ADVANCED_COLUMNS : [])].map((column) => (
                    <td key={column}>
                      <input
                        type={column === "start" || column === "end" ? "number" : "text"}
                        value={topic[column] ?? ""}
                        disabled={approved}
                        onChange={(event) => onChange(index, column, column === "start" || column === "end" ? Number(event.target.value) : event.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <WizardNav onBack={onBack} onNext={onNext} nextLabel="Tiếp tục bài học" />
    </section>
  );
}

function SummaryBar({ items }) {
  return (
    <div className="summaryCards">
      {items.map(([label, value]) => (
        <div className="summaryCard" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ActionBar({ loading, approved, count, onExtract, onLoad, onSave, onApprove, bottom }) {
  return (
    <div className={`actionBar ${bottom ? "bottom" : ""}`}>
      <button type="button" className={count === 0 ? "primaryButton" : ""} onClick={onExtract} disabled={loading}>
        {count === 0 ? "Bắt đầu trích xuất chủ đề" : "Trích xuất lại chủ đề"}
      </button>
      <button type="button" onClick={onLoad} disabled={loading}>Tải danh sách chủ đề</button>
      <button type="button" onClick={onSave} disabled={loading || approved || count === 0}>Lưu chủ đề</button>
      <button type="button" className="primaryButton" onClick={onApprove} disabled={loading || approved || count === 0}>Duyệt và sang bước bài học</button>
    </div>
  );
}

function WizardNav({ onBack, onNext, nextLabel }) {
  return (
    <div className="wizardNav">
      <button type="button" onClick={onBack}>Quay lại</button>
      <button type="button" className="primaryButton" onClick={onNext}>{nextLabel}</button>
    </div>
  );
}
