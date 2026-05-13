import { useMemo, useState } from "react";
import EmptyState from "./EmptyState.jsx";
import JobStatusBadge from "./JobStatusBadge.jsx";
import LoadingState from "./LoadingState.jsx";

export default function JobList({ jobs, selectedJobId, loading, onSelect, onRefresh }) {
  const [query, setQuery] = useState("");
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return safeJobs;
    return safeJobs.filter((job) =>
      [job.book_name, job.class_name, job.subject_name, job.job_id, job.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [query, safeJobs]);

  function shortId(jobId = "") {
    return jobId ? `${jobId.slice(0, 8)}...${jobId.slice(-4)}` : "-";
  }

  return (
    <section className="panel jobListPanel">
      <div className="panelHeader">
        <div>
          <h2>Phiên duyệt gần đây</h2>
          <p className="muted">{safeJobs.length} phiên duyệt gần đây</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          Làm mới
        </button>
      </div>
      <input
        className="searchInput"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm theo tên sách, môn học hoặc mã phiên..."
      />
      {loading ? <LoadingState message="Đang tải danh sách sách/job..." /> : null}
      {!loading && safeJobs.length === 0 ? (
        <EmptyState message="Chưa có sách nào. Hãy upload một file PDF để bắt đầu." />
      ) : null}
      {!loading && safeJobs.length > 0 && filteredJobs.length === 0 ? (
        <EmptyState message="Không tìm thấy job phù hợp với bộ lọc." />
      ) : null}
      {!loading && filteredJobs.length > 0 ? (
        <div className="jobList">
          {filteredJobs.map((job) => (
            <button
              type="button"
              key={job.job_id}
              className={`jobListItem ${selectedJobId === job.job_id ? "active" : ""}`}
              onClick={() => onSelect(job.job_id)}
            >
              <span className="jobTitle">{job.book_name || "Chưa đặt tên sách"}</span>
              <span className="jobSubline">Khối {job.class_name || "-"} · {job.subject_name || "-"} · {job.subject_type || "-"}</span>
              <span className="mono smallText">{shortId(job.job_id)}</span>
              <span className="jobMeta">
                <JobStatusBadge status={job.status} />
                <span>{job.updated_at || job.created_at || "-"}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
