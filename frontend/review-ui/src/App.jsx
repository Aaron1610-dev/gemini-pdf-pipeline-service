import { useEffect, useRef, useState } from "react";
import {
  API_BASE_URL,
  addChunk,
  approveChunk,
  approveChunks,
  approveLesson,
  approveLessons,
  approveTopic,
  approveTopics,
  deleteChunk,
  downloadBundle,
  extractChunks,
  extractChunksForLesson,
  extractLessons,
  extractLessonsForTopic,
  extractTopics,
  finalizeChunksAfterKaggle,
  getBundle,
  getChunks,
  getJob,
  getLessons,
  getLogs,
  getMongoImportResult,
  getSourcePreviewUrl,
  getStatus,
  getTopics,
  health,
  importMongo,
  itemsFromResponse,
  listJobs,
  prepareBundle,
  recutChunk,
  saveChunks,
  saveLessons,
  saveTopics,
} from "./api/reviewApi.js";
import BookUploadForm from "./components/BookUploadForm.jsx";
import ChunkReviewView from "./components/ChunkReviewView.jsx";
import EmptyState from "./components/EmptyState.jsx";
import ErrorState from "./components/ErrorState.jsx";
import JobList from "./components/JobList.jsx";
import JobStatusBadge from "./components/JobStatusBadge.jsx";
import LessonReviewView from "./components/LessonReviewView.jsx";
import LoadingState from "./components/LoadingState.jsx";
import LogPanel from "./components/LogPanel.jsx";
import RawJsonPanel from "./components/RawJsonPanel.jsx";
import ReviewStepper from "./components/ReviewStepper.jsx";
import StatusPanel from "./components/StatusPanel.jsx";
import TopicReviewView from "./components/TopicReviewView.jsx";
import BundleView from "./views/BundleView.jsx";

const WORKFLOW_STEPS = { upload: "upload", topics: "topics", lessons: "lessons", chunks: "chunks", bundle: "bundle" };
const BUSY_STATUSES = new Set([
  "extracting_topics",
  "extracting_lessons",
  "extracting_chunks",
  "preparing_bundle",
  "running_kaggle",
  "extracting_keywords",
  "importing_mongodb",
]);

export default function App() {
  const [healthInfo, setHealthInfo] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [activeStep, setActiveStep] = useState(WORKFLOW_STEPS.upload);
  const [topics, setTopics] = useState(null);
  const [topicsApproved, setTopicsApproved] = useState(false);
  const [topicsError, setTopicsError] = useState("");
  const [selectedTopicNum, setSelectedTopicNum] = useState("");
  const [lessons, setLessons] = useState(null);
  const [groupedLessons, setGroupedLessons] = useState([]);
  const [lessonsApproved, setLessonsApproved] = useState(false);
  const [lessonsError, setLessonsError] = useState("");
  const [selectedLessonNum, setSelectedLessonNum] = useState("");
  const [chunks, setChunks] = useState(null);
  const [groupedChunks, setGroupedChunks] = useState([]);
  const [chunksApproved, setChunksApproved] = useState(false);
  const [chunksError, setChunksError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [bundleResult, setBundleResult] = useState(null);
  const [mongoResult, setMongoResult] = useState(null);
  const [logs, setLogs] = useState("");
  const [rawOpen, setRawOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    checkHealth();
    loadJobs();
    return stopPolling;
  }, []);

  useEffect(() => {
    if (selectedJobId) {
      loadSelectedJob(selectedJobId);
    }
  }, [selectedJobId]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      if (!selectedJobId) return;
      try {
        const nextStatus = await getStatus(selectedJobId);
        const nextJob = await getJob(selectedJobId);
        setStatus(nextStatus);
        setJob(nextJob);
        await loadJobs(false);
        if (!BUSY_STATUSES.has(nextStatus?.status)) stopPolling();
      } catch (err) {
        setDetailsError(err.message);
        stopPolling();
      }
    }, 2000);
  }

  function inferStepFromStatus(value) {
    if (value === "uploaded") return WORKFLOW_STEPS.topics;
    if (value === "extracting_topics" || value === "reviewing_topics") return WORKFLOW_STEPS.topics;
    if (value === "extracting_lessons" || value === "reviewing_lessons") return WORKFLOW_STEPS.lessons;
    if (value === "extracting_chunks" || value === "reviewing_chunks") return WORKFLOW_STEPS.chunks;
    if (
      value === "preparing_bundle" ||
      value === "running_kaggle" ||
      value === "extracting_keywords" ||
      value === "bundle_ready" ||
      value === "importing_mongodb" ||
      value === "mongodb_imported"
    ) {
      return WORKFLOW_STEPS.bundle;
    }
    if (value === "error") return activeStep === WORKFLOW_STEPS.upload ? WORKFLOW_STEPS.topics : activeStep;
    return WORKFLOW_STEPS.upload;
  }

  async function checkHealth() {
    try {
      const data = await health();
      setHealthInfo(data);
      setHealthError("");
    } catch (err) {
      setHealthInfo(null);
      setHealthError(err.message || "Không kết nối được backend");
    }
  }

  async function loadJobs(showLoading = true) {
    if (showLoading) setJobsLoading(true);
    setJobsError("");
    try {
      const response = await listJobs();
      const nextJobs = itemsFromResponse(response, "items");
      setJobs(nextJobs);
    } catch (err) {
      setJobs([]);
      setJobsError(`Không tải được danh sách sách/job. Kiểm tra backend tại ${API_BASE_URL}. ${err.message}`);
    } finally {
      if (showLoading) setJobsLoading(false);
    }
  }

  async function loadSelectedJob(jobId, options = {}) {
    setDetailsLoading(true);
    setDetailsError("");
    if (!options.keepMessage) setSuccessMessage("");
    if (!options.keepResults) {
      setBundleResult(null);
      setMongoResult(null);
    }
    try {
      const [jobData, statusData, logsData] = await Promise.all([getJob(jobId), getStatus(jobId), getLogs(jobId, 200).catch(() => null)]);
      setJob(jobData);
      setStatus(statusData);
      if (!options.keepReview) resetReviewData();
      if (!options.keepStep) setActiveStep(inferStepFromStatus(jobData?.status || statusData?.status));
      if (logsData?.log) setLogs(logsData.log);
      if (BUSY_STATUSES.has(statusData?.status)) startPolling();
    } catch (err) {
      setJob(null);
      setStatus(null);
      setDetailsError(err.message);
    } finally {
      setDetailsLoading(false);
    }
  }

  function resetReviewData() {
    setTopics(null);
    setTopicsApproved(false);
    setTopicsError("");
    setSelectedTopicNum("");
    setLessons(null);
    setGroupedLessons([]);
    setLessonsApproved(false);
    setLessonsError("");
    setSelectedLessonNum("");
    setChunks(null);
    setGroupedChunks([]);
    setChunksApproved(false);
    setChunksError("");
  }

  async function afterUpload(created) {
    const bucket = created?.minio?.bucket || "ai-tra-cuu";
    setSuccessMessage(`Sách đã được tải lên MinIO bucket ${bucket}. Đang chờ trích xuất chủ đề.`);
    setActiveStep(WORKFLOW_STEPS.topics);
    await loadJobs(false);
    if (created?.job_id) setSelectedJobId(created.job_id);
  }

  function updateItem(setter, index, field, value) {
    setter((current) => (Array.isArray(current) ? current : []).map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  async function runAction(action, options = {}) {
    const { success, reload } = options;
    if (!selectedJobId) return;
    setActionLoading(true);
    setSuccessMessage(options.loadingMessage || "");
    try {
      const result = await action();
      if (success) setSuccessMessage(success);
      await Promise.all([loadJobs(false), loadSelectedJob(selectedJobId, { keepMessage: true, keepReview: true, keepResults: true, keepStep: true })]);
      if (BUSY_STATUSES.has(result?.status) || BUSY_STATUSES.has(status?.status)) startPolling();
      if (reload) await reload(result);
      return result;
    } catch (err) {
      options.onError?.(err.message);
      if (!options.onError) setDetailsError(err.message);
      return null;
    } finally {
      setActionLoading(false);
    }
  }

  async function loadTopics() {
    if (!selectedJobId) return;
    setTopicsError("");
    setActionLoading(true);
    try {
      const response = await getTopics(selectedJobId);
      setTopics(itemsFromResponse(response, "topics"));
      setTopicsApproved(Boolean(response?.approved));
      setActiveStep(WORKFLOW_STEPS.topics);
    } catch (err) {
      setTopics(null);
      setTopicsError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function loadLessons() {
    if (!selectedJobId) return;
    setLessonsError("");
    setActionLoading(true);
    try {
      const response = await getLessons(selectedJobId);
      setLessons(itemsFromResponse(response, "lessons"));
      setGroupedLessons(Array.isArray(response?.grouped_by_topic) ? response.grouped_by_topic : []);
      setLessonsApproved(Boolean(response?.approved));
      setActiveStep(WORKFLOW_STEPS.lessons);
    } catch (err) {
      setLessons(null);
      setLessonsError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function loadChunks() {
    if (!selectedJobId) return;
    setChunksError("");
    setActionLoading(true);
    try {
      const response = await getChunks(selectedJobId);
      setChunks(itemsFromResponse(response, "chunks"));
      setGroupedChunks(Array.isArray(response?.grouped_by_lesson) ? response.grouped_by_lesson : []);
      setChunksApproved(Boolean(response?.approved));
      setActiveStep(WORKFLOW_STEPS.chunks);
    } catch (err) {
      setChunks(null);
      setChunksError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function runHeavyStage() {
    if (!selectedJobId) return;
    setActionLoading(true);
    setDetailsError("");
    setSuccessMessage("");
    try {
      let result;
      if (status?.status === "bundle_ready" || status?.status === "mongodb_imported") {
        result = await importMongo(selectedJobId);
        setMongoResult(result);
        setSuccessMessage("Đã chạy import MongoDB.");
      } else {
        result = await prepareBundle(selectedJobId);
        setSuccessMessage("Đã bắt đầu chuẩn bị bundle/heavy stage.");
        startPolling();
      }
      await Promise.all([loadJobs(false), loadSelectedJob(selectedJobId, { keepMessage: true, keepReview: true, keepResults: true, keepStep: true })]);
      return result;
    } catch (err) {
      setDetailsError(err.message);
      try {
        const previous = await getMongoImportResult(selectedJobId);
        setMongoResult(previous);
      } catch {
        // No previous import result available.
      }
      return null;
    } finally {
      setActionLoading(false);
    }
  }

  async function refreshBundleResult() {
    if (!selectedJobId) return;
    setActionLoading(true);
    try {
      const result = status?.status === "mongodb_imported" ? await getMongoImportResult(selectedJobId) : await getBundle(selectedJobId);
      if (status?.status === "mongodb_imported") setMongoResult(result);
      else setBundleResult(result);
    } catch (err) {
      setDetailsError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function loadLogs() {
    if (!selectedJobId) return;
    setActionLoading(true);
    try {
      const response = await getLogs(selectedJobId, 300);
      setLogs(response?.log || "");
    } catch (err) {
      setDetailsError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function prepareBundleAction(options = {}) {
    return runAction(() => prepareBundle(selectedJobId, options), {
      success: "Đã bắt đầu chuẩn bị bundle.",
      reload: async () => {
        setActiveStep(WORKFLOW_STEPS.bundle);
        startPolling();
      },
    });
  }

  async function viewBundle() {
    if (!selectedJobId) return;
    setActionLoading(true);
    try {
      setBundleResult(await getBundle(selectedJobId));
      setActiveStep(WORKFLOW_STEPS.bundle);
    } catch (err) {
      setDetailsError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function importMongoAction() {
    if (!selectedJobId) return;
    setActionLoading(true);
    try {
      setMongoResult(await importMongo(selectedJobId));
      setSuccessMessage("Đã import MongoDB.");
      await loadSelectedJob(selectedJobId, { keepMessage: true, keepReview: true, keepResults: true, keepStep: true });
    } catch (err) {
      setDetailsError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function viewMongoResult() {
    if (!selectedJobId) return;
    setActionLoading(true);
    try {
      setMongoResult(await getMongoImportResult(selectedJobId));
      setActiveStep(WORKFLOW_STEPS.bundle);
    } catch (err) {
      setDetailsError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const backendOk = healthInfo?.status === "ok";
  const selectedStatus = job?.status || status?.status;
  const isBusy = actionLoading || BUSY_STATUSES.has(selectedStatus);
  const shortJobId = selectedJobId ? `${selectedJobId.slice(0, 8)}...${selectedJobId.slice(-4)}` : "-";
  const rawData = {
    job,
    status,
    topics,
    lessons,
    chunks,
    bundleResult,
    mongoResult,
    minio: job?.minio,
  };

  function goBack() {
    const order = Object.values(WORKFLOW_STEPS);
    const index = order.indexOf(activeStep);
    setDetailsError("");
    setActiveStep(order[Math.max(0, index - 1)]);
  }

  function goNext() {
    setDetailsError("");
    if (activeStep === WORKFLOW_STEPS.upload) {
      if (!selectedJobId) {
        setDetailsError("Bạn cần chọn hoặc tạo job trước khi tiếp tục.");
        return;
      }
      setActiveStep(WORKFLOW_STEPS.topics);
      return;
    }
    if (activeStep === WORKFLOW_STEPS.topics && !topicsApproved) {
      setDetailsError("Bạn cần trích xuất và duyệt dữ liệu ở bước này trước khi tiếp tục.");
      return;
    }
    if (activeStep === WORKFLOW_STEPS.lessons && !lessonsApproved) {
      setDetailsError("Bạn cần trích xuất và duyệt dữ liệu ở bước này trước khi tiếp tục.");
      return;
    }
    if (activeStep === WORKFLOW_STEPS.chunks && !chunksApproved) {
      setDetailsError("Bạn cần trích xuất và duyệt dữ liệu ở bước này trước khi tiếp tục.");
      return;
    }
    const order = Object.values(WORKFLOW_STEPS);
    const index = order.indexOf(activeStep);
    setActiveStep(order[Math.min(order.length - 1, index + 1)]);
  }

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandBlock">
          <span className="brandEyebrow">KLTN Demo Dashboard</span>
          <h1>AI Tra Cứu - Review-first PDF Pipeline</h1>
          <p>Duyệt cấu trúc sách giáo khoa theo Chủ đề → Bài học → Chunk</p>
        </div>
        <div className="headerActions">
          <span className="apiBase mono">{API_BASE_URL}</span>
          <button type="button" className={`healthBadge ${backendOk ? "ok" : "down"}`} onClick={checkHealth}>
            Backend: {backendOk ? "OK" : healthError ? "Không kết nối được" : "Đang kiểm tra..."}
          </button>
          {selectedStatus ? <JobStatusBadge status={selectedStatus} /> : null}
        </div>
      </header>

      {healthError ? <div className="warningBox">{healthError}</div> : null}
      {successMessage ? <div className="successBanner">{successMessage}</div> : null}
      {selectedJobId && isBusy ? <ProgressBanner status={status} fallback="Đang trích xuất, vui lòng chờ..." /> : null}

      <main className="focusShell">
        {activeStep === WORKFLOW_STEPS.upload ? (
          <section className="uploadStepGrid">
            <div className="introPanel panel">
              <span className="stepLabel">Bước 1</span>
              <h2>Chọn hoặc tải sách giáo khoa</h2>
              <p>Khởi tạo tài liệu PDF, sau đó hệ thống sẽ dẫn qua từng bước duyệt Chủ đề, Bài học, Chunk và hoàn tất import.</p>
            </div>
            <BookUploadForm onUploaded={afterUpload} />
            <div>
              {jobsError ? <ErrorState message={jobsError} onRetry={loadJobs} /> : null}
              <JobList jobs={jobs} selectedJobId={selectedJobId} loading={jobsLoading} onSelect={setSelectedJobId} onRefresh={loadJobs} />
            </div>
          </section>
        ) : (
          <div className="focusToolbar">
            <button type="button" onClick={() => setActiveStep(WORKFLOW_STEPS.upload)}>Đổi sách / Chọn job khác</button>
            {job ? <span className="focusJobTitle">{job.book_name || "Tài liệu chưa đặt tên"} · {shortJobId}</span> : null}
          </div>
        )}

        {activeStep !== WORKFLOW_STEPS.upload ? <section className="contentArea">
          {!selectedJobId && !jobsLoading ? (
            <EmptyState title="Chưa chọn job" message="Upload hoặc chọn một sách/job ở danh sách bên trái để bắt đầu review." />
          ) : null}

          {selectedJobId && detailsLoading ? <LoadingState message="Đang tải chi tiết job..." /> : null}
          {selectedJobId && detailsError ? <ErrorState message={detailsError} onRetry={() => loadSelectedJob(selectedJobId)} /> : null}

          {selectedJobId && job && !detailsLoading ? (
            <>
              {activeStep !== WORKFLOW_STEPS.upload ? <section className="panel jobSummary">
                <div className="panelHeader">
                  <div>
                    <h2>{job.book_name || "Tài liệu chưa đặt tên"}</h2>
                    <p className="muted">Chọn một bước để duyệt dữ liệu trước khi tạo bundle và import.</p>
                  </div>
                  <JobStatusBadge status={selectedStatus} />
                </div>
                <ReviewStepper status={selectedStatus} activeStep={activeStep} onStepChange={setActiveStep} />
                <dl className="summaryGrid">
                  <dt>Tài liệu</dt><dd>{job.book_name || "-"}</dd>
                  <dt>Section</dt><dd>{job.class_name || "-"}</dd>
                  <dt>Môn học</dt><dd>{job.subject_name || "-"}</dd>
                  <dt>Bộ sách</dt><dd>{job.subject_type || "-"}</dd>
                  <dt>Trạng thái</dt><dd>{selectedStatus || "-"}</dd>
                  <dt>Job ID</dt><dd className="mono">{shortJobId}</dd>
                  <dt>Cập nhật</dt><dd>{job.updated_at || status?.updated_at || "-"}</dd>
                </dl>
                <div className="sourcePreviewActions">
                  <button type="button" onClick={() => window.open(getSourcePreviewUrl(selectedJobId), "_blank", "noopener,noreferrer")}>
                    Xem sách gốc
                  </button>
                </div>
                {job?.minio?.subject_asset_uploaded ? (
                  <details className="minioDetails">
                    <summary>Sách đã được tải lên MinIO</summary>
                    <dl className="summaryGrid">
                      <dt>Bucket</dt><dd>{job.minio.bucket || "ai-tra-cuu"}</dd>
                      <dt>Object key</dt><dd className="mono breakText">{job.minio.subject_object_key || "-"}</dd>
                      <dt>Backend preview</dt>
                      <dd>
                        <button type="button" onClick={() => window.open(getSourcePreviewUrl(selectedJobId), "_blank", "noopener,noreferrer")}>
                          Xem qua backend
                        </button>
                      </dd>
                    </dl>
                    <details className="advancedMinioUrl">
                      <summary>Nâng cao</summary>
                      <p className="muted">URL MinIO trực tiếp có thể bị AccessDenied vì bucket đang private.</p>
                      <p className="mono breakText">{job.minio.subject_url || "-"}</p>
                    </details>
                  </details>
                ) : null}
              </section> : null}

              {activeStep === WORKFLOW_STEPS.upload ? (
                <section className="panel stepIntro">
                  <span className="stepLabel">Bước 1</span>
                  <h2>Tải hoặc chọn tài liệu</h2>
                  <p>
                    Dùng khung bên trái để tạo job mới từ file PDF hoặc chọn một job đã có. Sau đó chuyển sang bước Chủ đề để bắt đầu quy trình duyệt review-first.
                  </p>
                </section>
              ) : null}

              {activeStep === WORKFLOW_STEPS.topics ? (
                <TopicReviewView
                  jobId={selectedJobId}
                  topics={topics}
                  approved={topicsApproved}
                  loading={actionLoading}
                  error={topicsError}
                  onChange={(index, field, value) => updateItem(setTopics, index, field, value)}
                  onLoad={loadTopics}
                  onExtract={() => runAction(() => extractTopics(selectedJobId), {
                    loadingMessage: "Đang trích xuất, vui lòng chờ...",
                    success: "Đang trích xuất chủ đề. Theo dõi tiến độ bên trên.",
                    reload: async () => startPolling(),
                    onError: setTopicsError,
                  })}
                  onSave={() => runAction(() => saveTopics(selectedJobId, topics || []), { success: "Đã lưu topics.", reload: loadTopics, onError: setTopicsError })}
                  onApproveAll={() => runAction(() => approveTopics(selectedJobId, topics || []), {
                    success: "Đã duyệt toàn bộ chủ đề.",
                    reload: loadTopics,
                    onError: setTopicsError,
                  })}
                  onApproveTopic={(topic) => runAction(() => approveTopic(selectedJobId, topic.topic_num), {
                    success: `Đã lưu Topic ${String(topic.topic_num).padStart(2, "0")} vào MongoDB và MinIO.`,
                    reload: async () => {
                      await loadTopics();
                    },
                    onError: setTopicsError,
                  })}
                  onExtractLessonsForTopic={(topic) => {
                    setSelectedTopicNum(String(topic.topic_num || ""));
                    return runAction(() => extractLessonsForTopic(selectedJobId, topic.topic_num), {
                      loadingMessage: `Đang trích xuất bài học cho Topic ${String(topic.topic_num).padStart(2, "0")}...`,
                      success: `Đang trích xuất bài học cho Topic ${String(topic.topic_num).padStart(2, "0")}.`,
                      reload: async () => {
                        setActiveStep(WORKFLOW_STEPS.lessons);
                        startPolling();
                      },
                      onError: setTopicsError,
                    });
                  }}
                  onBack={goBack}
                  onNext={goNext}
                />
              ) : null}

              {activeStep === WORKFLOW_STEPS.lessons ? (
                <LessonReviewView
                  lessons={lessons}
                  groupedByTopic={groupedLessons}
                  selectedTopicNum={selectedTopicNum}
                  approved={lessonsApproved}
                  loading={actionLoading}
                  error={lessonsError}
                  onChange={(index, field, value) => updateItem(setLessons, index, field, value)}
                  onLoad={loadLessons}
                  onExtract={() => runAction(() => extractLessons(selectedJobId), {
                    loadingMessage: "Đang trích xuất, vui lòng chờ...",
                    success: "Đang trích xuất bài học. Theo dõi tiến độ bên trên.",
                    reload: async () => startPolling(),
                    onError: setLessonsError,
                  })}
                  onSave={() => runAction(() => saveLessons(selectedJobId, lessons || []), { success: "Đã lưu lessons.", reload: loadLessons, onError: setLessonsError })}
                  onApprove={() => runAction(() => approveLessons(selectedJobId, lessons || []), {
                    success: "Đã duyệt bài học. Tiếp tục trích xuất chunk.",
                    reload: async () => {
                      await loadLessons();
                      setActiveStep(WORKFLOW_STEPS.chunks);
                    },
                    onError: setLessonsError,
                  })}
                  onApproveLesson={(lesson) => runAction(() => approveLesson(selectedJobId, lesson.lesson_num), {
                    success: `Đã duyệt Lesson ${String(lesson.lesson_num).padStart(2, "0")} và lưu MongoDB/MinIO.`,
                    reload: loadLessons,
                    onError: setLessonsError,
                  })}
                  onExtractChunksForLesson={(lesson) => {
                    setSelectedLessonNum(String(lesson.lesson_num || ""));
                    return runAction(() => extractChunksForLesson(selectedJobId, lesson.lesson_num), {
                      loadingMessage: `Đang trích xuất chunk cho Lesson ${String(lesson.lesson_num).padStart(2, "0")}...`,
                      success: `Đang trích xuất chunk cho Lesson ${String(lesson.lesson_num).padStart(2, "0")}.`,
                      reload: async () => {
                        setActiveStep(WORKFLOW_STEPS.chunks);
                        startPolling();
                      },
                      onError: setLessonsError,
                    });
                  }}
                  onBack={goBack}
                  onNext={goNext}
                />
              ) : null}

              {activeStep === WORKFLOW_STEPS.chunks ? (
                <ChunkReviewView
                  chunks={chunks}
                  groupedByLesson={groupedChunks}
                  approved={chunksApproved}
                  loading={actionLoading}
                  error={chunksError}
                  onChange={(index, field, value) => updateItem(setChunks, index, field, value)}
                  onLoad={loadChunks}
                  onExtract={() => runAction(() => extractChunks(selectedJobId), {
                    loadingMessage: "Đang trích xuất, vui lòng chờ...",
                    success: "Đang trích xuất chunk. Theo dõi tiến độ bên trên.",
                    reload: async () => startPolling(),
                    onError: setChunksError,
                  })}
                  onSave={() => runAction(() => saveChunks(selectedJobId, chunks || []), { success: "Đã lưu chunks.", reload: loadChunks, onError: setChunksError })}
                  onApprove={() => runAction(() => approveChunks(selectedJobId, chunks || []), {
                    success: "Đã duyệt chunk. Chunk sẽ được lưu vào MongoDB/MinIO sau khi Kaggle xử lý xong.",
                    reload: async () => {
                      await loadChunks();
                      setActiveStep(WORKFLOW_STEPS.bundle);
                    },
                    onError: setChunksError,
                  })}
                  onApproveChunk={(chunk) => runAction(() => approveChunk(selectedJobId, chunk.chunk_id || chunk.id), {
                    success: "Chunk đã duyệt. Chunk sẽ được lưu vào MongoDB/MinIO sau khi Kaggle xử lý xong.",
                    reload: loadChunks,
                    onError: setChunksError,
                  })}
                  onAdd={(payload) => runAction(() => addChunk(selectedJobId, payload), { success: "Đã thêm chunk.", reload: loadChunks, onError: setChunksError })}
                  onDelete={(chunkId) => runAction(() => deleteChunk(selectedJobId, chunkId), { success: "Đã xóa chunk.", reload: loadChunks, onError: setChunksError })}
                  onRecut={(chunk) => runAction(() => recutChunk(selectedJobId, {
                    chunk_id: chunk.chunk_id || chunk.id,
                    lesson_stem: chunk.lesson_stem,
                    chunk_num: chunk.chunk_num,
                    start: Number(chunk.start),
                    end: Number(chunk.end),
                    heading: chunk.heading || "",
                    title: chunk.title || chunk.chunk_name || "",
                    content_head: Boolean(chunk.content_head),
                  }), { success: "Đã cắt lại chunk.", reload: loadChunks, onError: setChunksError })}
                  onBack={goBack}
                  onNext={goNext}
                />
              ) : null}

              {activeStep === WORKFLOW_STEPS.bundle ? (
                <BundleView
                  loading={actionLoading}
                  bundleResult={bundleResult}
                  mongoResult={mongoResult}
                  onPrepare={() => prepareBundleAction()}
                  onPrepareFast={() => prepareBundleAction({ skip_kaggle: true, skip_keywords: true })}
                  onViewBundle={viewBundle}
                  onDownloadBundle={() => downloadBundle(selectedJobId)}
                  onImportMongo={importMongoAction}
                  onViewMongo={viewMongoResult}
                  onFinalizeChunks={() => runAction(() => finalizeChunksAfterKaggle(selectedJobId, { force_without_kaggle: true }), {
                    success: "Đã lưu chunk cuối vào MongoDB/MinIO.",
                    reload: viewBundle,
                  })}
                  onBack={goBack}
                />
              ) : null}
            </>
          ) : null}
        </section> : null}

        <section className={`debugDrawer ${debugOpen ? "open" : ""}`}>
          <button type="button" className="debugToggle" onClick={() => setDebugOpen((value) => !value)}>
            {debugOpen ? "Ẩn debug" : "Mở debug"}
          </button>
          {debugOpen ? (
            <div className="debugArea">
              <StatusPanel job={job} status={status} />
              <LogPanel log={logs} onRefresh={loadLogs} loading={actionLoading} />
              <RawJsonPanel title="JSON gốc" data={rawData} open={rawOpen} onToggle={() => setRawOpen((value) => !value)} />
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function ProgressBanner({ status, fallback }) {
  const rawPercent = Number(status?.percent);
  const hasPercent = Number.isFinite(rawPercent) && rawPercent > 0;
  const percent = Math.max(0, Math.min(rawPercent || 0, 100));

  return (
    <section className="progressBanner">
      <div>
        <strong>{status?.message || fallback}</strong>
        <span>{status?.stage || "Đang xử lý"}</span>
      </div>
      <div className={`progressTrack ${hasPercent ? "" : "indeterminate"}`}>
        <div className="progressFill" style={{ width: hasPercent ? `${percent}%` : "42%" }} />
      </div>
      <span className="progressPercent">{hasPercent ? `${percent}%` : "Đang chạy"}</span>
    </section>
  );
}
