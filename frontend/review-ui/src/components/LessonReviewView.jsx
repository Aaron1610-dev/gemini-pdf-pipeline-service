import { useMemo, useState } from "react";
import EmptyState from "./EmptyState.jsx";
import ErrorState from "./ErrorState.jsx";
import LoadingState from "./LoadingState.jsx";

const COLUMNS = ["lesson_num", "lesson_name", "start", "end"];

function groupsFrom(lessons, groupedByTopic) {
  if (Array.isArray(groupedByTopic) && groupedByTopic.length) return groupedByTopic;
  const map = new Map();
  for (const lesson of Array.isArray(lessons) ? lessons : []) {
    const key = `${lesson.topic_num || ""}-${lesson.topic_name || ""}`;
    if (!map.has(key)) map.set(key, { topic_num: lesson.topic_num, topic_name: lesson.topic_name, lessons: [] });
    map.get(key).lessons.push(lesson);
  }
  return Array.from(map.values());
}

export default function LessonReviewView({ lessons, groupedByTopic, approved, loading, error, onChange, onLoad, onExtract, onSave, onApprove, onBack, onNext }) {
  const safeLessons = Array.isArray(lessons) ? lessons : [];
  const groups = useMemo(() => groupsFrom(safeLessons, groupedByTopic), [safeLessons, groupedByTopic]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [selectedLessonName, setSelectedLessonName] = useState("");
  const selectedGroup = groups[Math.min(selectedGroupIndex, Math.max(groups.length - 1, 0))] || { lessons: [] };
  const selectedLesson = selectedGroup.lessons?.find((lesson) => lesson.name === selectedLessonName) || selectedGroup.lessons?.[0] || safeLessons[0];

  return (
    <section className="panel reviewCard">
      <div className="panelHeader">
        <div>
          <span className="stepLabel">Bước 3</span>
          <h2>Bước 3: Duyệt bài học</h2>
          <p className="muted">Kiểm tra các bài học thuộc từng chủ đề trước khi chia chunk.</p>
        </div>
      </div>
      <div className="summaryCards">
        <div className="summaryCard"><span>Tổng bài học</span><strong>{safeLessons.length}</strong></div>
        <div className="summaryCard"><span>Nhóm topic</span><strong>{groups.length}</strong></div>
        <div className="summaryCard"><span>Trạng thái</span><strong>{approved ? "Đã duyệt" : "Chưa duyệt"}</strong></div>
      </div>
      <div className="actionBar">
        <button type="button" onClick={onExtract} disabled={loading}>Trích xuất bài học</button>
        <button type="button" onClick={onLoad} disabled={loading}>Tải danh sách bài học</button>
        <button type="button" onClick={onSave} disabled={loading || approved || safeLessons.length === 0}>Lưu bài học</button>
        <button type="button" className="primaryButton" onClick={onApprove} disabled={loading || approved || safeLessons.length === 0}>Duyệt và sang bước chunk</button>
      </div>
      {loading ? <LoadingState message="Đang tải lessons..." /> : null}
      {error ? <ErrorState message={error} onRetry={onLoad} /> : null}
      {!loading && !error && lessons == null ? <EmptyState message="Chưa có dữ liệu lesson. Approve topics trước khi trích xuất lessons." /> : null}
      {!loading && !error && lessons != null && safeLessons.length === 0 ? <EmptyState message="Danh sách lesson đang trống." /> : null}
      {groups.length > 0 ? (
        <div className="reviewThreeColumn lessonReviewLayout">
          <aside className="reviewSideList">
            <h3>Chủ đề</h3>
            {groups.map((group, groupIndex) => (
              <button
                type="button"
                key={`${group.topic_num}-${group.topic_name}-${groupIndex}`}
                className={`sideListItem ${groupIndex === selectedGroupIndex ? "active" : ""}`}
                onClick={() => {
                  setSelectedGroupIndex(groupIndex);
                  setSelectedLessonName("");
                }}
              >
                <strong>{group.topic_num ? `Topic ${group.topic_num}` : "Topic"}</strong>
                <span>{group.topic_name || "-"}</span>
                <small>{group.lessons?.length || 0} bài học</small>
              </button>
            ))}
          </aside>
          <div className="reviewGroup">
              <h3>{selectedGroup.topic_num ? `Topic ${selectedGroup.topic_num}` : "Topic"}: {selectedGroup.topic_name || "-"}</h3>
              <div className="tableWrap">
                <table className="reviewTable">
                  <thead>
                    <tr>
                      <th>#</th>
                      {COLUMNS.map((column) => <th key={column}>{column}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedGroup.lessons || []).map((lesson, localIndex) => {
                      const globalIndex = safeLessons.findIndex((item) => item === lesson || item.name === lesson.name);
                      return (
                        <tr key={lesson.name || `${selectedGroupIndex}-${localIndex}`} className={selectedLesson?.name === lesson.name ? "selectedRow" : ""} onClick={() => setSelectedLessonName(lesson.name)}>
                          <td>{localIndex + 1}</td>
                          {COLUMNS.map((column) => (
                            <td key={column}>
                              <input
                                type={column === "start" || column === "end" ? "number" : "text"}
                                value={lesson[column] ?? ""}
                                disabled={approved}
                                onChange={(event) => onChange(globalIndex, column, column === "start" || column === "end" ? Number(event.target.value) : event.target.value)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </div>
          <aside className="reviewDetail">
            <h3>Chi tiết bài học</h3>
            {selectedLesson ? (
              <dl className="statusGrid">
                <dt>Số bài</dt><dd>{selectedLesson.lesson_num || "-"}</dd>
                <dt>Tên bài</dt><dd>{selectedLesson.lesson_name || "-"}</dd>
                <dt>Topic</dt><dd>{selectedLesson.topic_num || "-"}</dd>
                <dt>Trang</dt><dd>{selectedLesson.start} - {selectedLesson.end}</dd>
                <dt>name</dt><dd className="mono breakText">{selectedLesson.name || "-"}</dd>
              </dl>
            ) : <p className="muted">Chưa chọn bài học.</p>}
          </aside>
        </div>
      ) : null}
      <div className="wizardNav">
        <button type="button" onClick={onBack}>Quay lại</button>
        <button type="button" className="primaryButton" onClick={onNext}>Tiếp tục chunk</button>
      </div>
    </section>
  );
}
