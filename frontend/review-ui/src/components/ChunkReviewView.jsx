import { useMemo, useState } from "react";
import EmptyState from "./EmptyState.jsx";
import ErrorState from "./ErrorState.jsx";
import LoadingState from "./LoadingState.jsx";

const COLUMNS = ["chunk_num", "chunk_name", "start", "end"];

function groupsFrom(chunks, groupedByLesson) {
  if (Array.isArray(groupedByLesson) && groupedByLesson.length) return groupedByLesson;
  const map = new Map();
  for (const chunk of Array.isArray(chunks) ? chunks : []) {
    const key = `${chunk.lesson_stem || ""}-${chunk.lesson_num || ""}-${chunk.lesson_name || ""}`;
    if (!map.has(key)) map.set(key, { lesson_num: chunk.lesson_num, lesson_name: chunk.lesson_name, lesson_stem: chunk.lesson_stem, chunks: [] });
    map.get(key).chunks.push(chunk);
  }
  return Array.from(map.values());
}

export default function ChunkReviewView({
  chunks,
  groupedByLesson,
  approved,
  loading,
  error,
  onChange,
  onLoad,
  onExtract,
  onSave,
  onApprove,
  onAdd,
  onDelete,
  onRecut,
  onBack,
  onNext,
}) {
  const safeChunks = Array.isArray(chunks) ? chunks : [];
  const groups = useMemo(() => groupsFrom(safeChunks, groupedByLesson), [safeChunks, groupedByLesson]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [selectedChunkId, setSelectedChunkId] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [addForm, setAddForm] = useState({ chunk_num: "", chunk_name: "", title: "", heading: "", start: 1, end: 1, content_head: false });
  const selectedGroup = groups[Math.min(selectedGroupIndex, Math.max(groups.length - 1, 0))] || { chunks: [] };
  const selectedChunk = selectedGroup.chunks.find((chunk) => (chunk.chunk_id || chunk.id) === selectedChunkId) || selectedGroup.chunks[0] || null;

  function chunkId(chunk, index) {
    return chunk.chunk_id || chunk.id || `${chunk.lesson_stem || "lesson"}:${chunk.chunk_num || index}`;
  }

  function updateAdd(field, value) {
    setAddForm((current) => ({ ...current, [field]: value }));
  }

  async function submitAdd(event) {
    event.preventDefault();
    if (!onAdd || (!selectedGroup.lesson_stem && !selectedGroup.lesson_num)) return;
    await onAdd({
      ...addForm,
      lesson_stem: selectedGroup.lesson_stem,
      lesson_num: selectedGroup.lesson_num,
      start: Number(addForm.start),
      end: Number(addForm.end),
    });
  }

  return (
    <section className="panel reviewCard">
      <div className="panelHeader">
        <div>
          <span className="stepLabel">Bước 4</span>
          <h2>Bước 4: Duyệt chunk</h2>
          <p className="muted">Kiểm tra các đoạn nội dung nhỏ được cắt từ từng bài học.</p>
        </div>
      </div>
      <div className="summaryCards">
        <div className="summaryCard"><span>Tổng chunk</span><strong>{safeChunks.length}</strong></div>
        <div className="summaryCard"><span>Nhóm bài học</span><strong>{groups.length}</strong></div>
        <div className="summaryCard"><span>Trạng thái</span><strong>{approved ? "Đã duyệt" : "Chưa duyệt"}</strong></div>
      </div>
      <div className="actionBar">
        <button type="button" onClick={onExtract} disabled={loading}>Trích xuất chunk</button>
        <button type="button" onClick={onLoad} disabled={loading}>Tải danh sách chunk</button>
        <button type="button" onClick={onSave} disabled={loading || approved || safeChunks.length === 0}>Lưu chunk</button>
        <button type="button" className="primaryButton" onClick={onApprove} disabled={loading || approved || safeChunks.length === 0}>Duyệt và sang bước hoàn tất</button>
      </div>
      {loading ? <LoadingState message="Đang tải chunks..." /> : null}
      {error ? <ErrorState message={error} onRetry={onLoad} /> : null}
      {!loading && !error && chunks == null ? <EmptyState message="Chưa có dữ liệu chunk. Approve lessons trước khi trích xuất chunks." /> : null}
      {!loading && !error && chunks != null && safeChunks.length === 0 ? <EmptyState message="Danh sách chunk đang trống." /> : null}
      {groups.length > 0 ? (
        <div className="reviewThreeColumn">
          <aside className="reviewSideList">
            <h3>Lesson</h3>
            {groups.map((group, groupIndex) => (
              <button
                type="button"
                key={`${group.lesson_stem}-${groupIndex}`}
                className={`sideListItem ${selectedGroupIndex === groupIndex ? "active" : ""}`}
                onClick={() => {
                  setSelectedGroupIndex(groupIndex);
                  setSelectedChunkId("");
                }}
              >
                <strong>{group.lesson_num ? `Lesson ${group.lesson_num}` : "Lesson"}</strong>
                <span>{group.lesson_name || group.lesson_stem || "-"}</span>
                <small>{group.chunks?.length || 0} chunk</small>
              </button>
            ))}
          </aside>

          <div className="reviewGroup">
              <h3>{selectedGroup.lesson_num ? `Lesson ${selectedGroup.lesson_num}` : "Lesson"}: {selectedGroup.lesson_name || selectedGroup.lesson_stem || "-"}</h3>
              <div className="tableWrap">
                <table className="reviewTable chunkReviewTable">
                  <thead>
                    <tr>
                      <th>#</th>
                      {COLUMNS.map((column) => <th key={column}>{column}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedGroup.chunks || []).map((chunk, localIndex) => {
                      const globalIndex = safeChunks.findIndex((item) => item === chunk || item.chunk_id === chunk.chunk_id || item.id === chunk.id);
                      const id = chunkId(chunk, localIndex);
                      return (
                        <tr key={id} className={selectedChunk && chunkId(selectedChunk, localIndex) === id ? "selectedRow" : ""} onClick={() => setSelectedChunkId(id)}>
                          <td>{localIndex + 1}</td>
                          {COLUMNS.map((column) => (
                            <td key={column}>
                              {column === "content_head" ? (
                                <input type="checkbox" checked={Boolean(chunk[column])} disabled={approved} onChange={(event) => onChange(globalIndex, column, event.target.checked)} />
                              ) : (
                                <input
                                  type={column === "start" || column === "end" ? "number" : "text"}
                                  value={chunk[column] ?? ""}
                                  disabled={approved}
                                  onChange={(event) => onChange(globalIndex, column, column === "start" || column === "end" ? Number(event.target.value) : event.target.value)}
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            <div className="advancedTools">
              <button type="button" className="linkButton" onClick={() => setToolsOpen((value) => !value)}>
                {toolsOpen ? "Ẩn công cụ nâng cao" : "Công cụ nâng cao"}
              </button>
              {toolsOpen ? (
                <form className="addChunkForm" onSubmit={submitAdd}>
                  <h3>Thêm chunk</h3>
                  <div className="addChunkGrid">
                    <input placeholder="chunk_num" value={addForm.chunk_num} onChange={(event) => updateAdd("chunk_num", event.target.value)} />
                    <input placeholder="chunk_name" value={addForm.chunk_name} onChange={(event) => updateAdd("chunk_name", event.target.value)} />
                    <input placeholder="title" value={addForm.title} onChange={(event) => updateAdd("title", event.target.value)} />
                    <input placeholder="heading" value={addForm.heading} onChange={(event) => updateAdd("heading", event.target.value)} />
                    <input type="number" placeholder="start" value={addForm.start} onChange={(event) => updateAdd("start", event.target.value)} />
                    <input type="number" placeholder="end" value={addForm.end} onChange={(event) => updateAdd("end", event.target.value)} />
                    <label className="checkboxRow">
                      <input type="checkbox" checked={addForm.content_head} onChange={(event) => updateAdd("content_head", event.target.checked)} />
                      <span>content_head</span>
                    </label>
                  </div>
                  <button type="submit" disabled={loading || approved || !onAdd}>Thêm chunk</button>
                </form>
              ) : null}
            </div>
          </div>

          <aside className="reviewDetail">
            <h3>Chi tiết chunk</h3>
            {selectedChunk ? (
              <>
                <dl className="statusGrid">
                  <dt>Chunk</dt><dd>{selectedChunk.chunk_name || selectedChunk.title || "-"}</dd>
                  <dt>Lesson</dt><dd>{selectedChunk.lesson_num || selectedChunk.lesson_name || "-"}</dd>
                  <dt>Trang</dt><dd>{selectedChunk.start} - {selectedChunk.end}</dd>
                </dl>
                {toolsOpen ? <div className="buttonRow">
                  <button type="button" disabled={loading || approved || !onDelete} onClick={() => onDelete(selectedChunk.chunk_id || selectedChunk.id)}>Xóa chunk</button>
                  <button type="button" disabled={loading || approved || !onRecut} onClick={() => onRecut(selectedChunk)}>Cắt lại chunk</button>
                </div> : null}
              </>
            ) : <p className="muted">Chưa chọn chunk.</p>}
          </aside>
        </div>
      ) : null}
      <div className="wizardNav">
        <button type="button" onClick={onBack}>Quay lại</button>
        <button type="button" className="primaryButton" onClick={onNext}>Tiếp tục hoàn tất</button>
      </div>
    </section>
  );
}
