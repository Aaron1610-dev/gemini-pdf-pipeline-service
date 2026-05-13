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

  function canEnterStep(step) {
    if (step === WORKFLOW_STEPS.upload || step === WORKFLOW_STEPS.topics) return true;
    if (step === WORKFLOW_STEPS.lessons) return topicsApproved || Array.isArray(lessons);
    if (step === WORKFLOW_STEPS.chunks) return lessonsApproved || Array.isArray(chunks);
    if (step === WORKFLOW_STEPS.bundle) return chunksApproved || Boolean(bundleResult || mongoResult);
    return false;
  }

  function changeStep(step) {
    setDetailsError("");
    if (!selectedJobId && step !== WORKFLOW_STEPS.upload) {
      setDetailsError("Bạn cần chọn hoặc tạo một phiên duyệt trước khi tiếp tục.");
      return;
    }
    if (!canEnterStep(step)) {
      setDetailsError("Bạn cần duyệt bước hiện tại trước khi tiếp tục.");
      return;
    }
    setActiveStep(step);
  }

  return (
    <div className="appShell review-shell">
      <header className="topBar review-header">
        <div className="brandBlock review-brand">
          <h1>AI Tra Cứu</h1>
          <p>Duyệt cấu trúc sách giáo khoa theo Topic → Lesson → Chunk</p>
        </div>
        <div className="headerStepper">
          <ReviewStepper status={selectedStatus} activeStep={activeStep} onStepChange={changeStep} />
        </div>
        <div className="headerActions">
          <button type="button" className={`healthBadge ${backendOk ? "ok" : "down"}`} onClick={checkHealth}>
            Backend: {backendOk ? "OK" : healthError ? "Không kết nối được" : "Đang kiểm tra..."}
          </button>
          {selectedStatus ? <JobStatusBadge status={selectedStatus} /> : null}
          <button type="button" className="secondary-action" onClick={() => setDebugOpen((value) => !value)}>
            {debugOpen ? "Đóng debug" : "Mở debug"}
          </button>
        </div>
      </header>

      {healthError ? <div className="warningBox">{healthError}</div> : null}
      {successMessage ? <div className="successBanner">{successMessage}</div> : null}
      {selectedJobId && isBusy ? <ProgressBanner status={status} fallback="Đang trích xuất, vui lòng chờ..." /> : null}

      <main className="focusShell review-main">
        {!selectedJobId || activeStep === WORKFLOW_STEPS.upload ? (
          <section className="uploadStepGrid uploadLanding">
            <div className="introPanel panel thesisIntro">
              <span className="stepLabel">Phiên duyệt học thuật</span>
              <h2>Chuẩn hoá metadata sách giáo khoa</h2>
              <p>Chọn sách, xem bản PDF đã cắt, chỉnh metadata và lưu từng cấp dữ liệu vào Metadata-Edu.</p>
            </div>
            <BookUploadForm onUploaded={afterUpload} />
            <div>
              {jobsError ? <ErrorState message={jobsError} onRetry={loadJobs} /> : null}
              <JobList jobs={jobs} selectedJobId={selectedJobId} loading={jobsLoading} onSelect={setSelectedJobId} onRefresh={loadJobs} />
            </div>
          </section>
        ) : (
          <div className="focusToolbar currentReviewBar">
            <button type="button" className="secondary-action" onClick={() => setActiveStep(WORKFLOW_STEPS.upload)}>Đổi sách</button>
            {job ? (
              <div className="book-summary-card">
                <div className="source-book-thumbnail" aria-label="Sách gốc">
                  <iframe src={getSourcePreviewUrl(selectedJobId)} title="Sách gốc" />
                </div>
                <div className="currentDocument">
                  <strong>{job.book_name || "Tài liệu chưa đặt tên"}</strong>
                  <span>Section {job.class_name || "-"} · {job.subject_name || "-"} · {job.subject_type || "-"} · {shortJobId}</span>
                </div>
              </div>
            ) : null}
            <button type="button" onClick={() => window.open(getSourcePreviewUrl(selectedJobId), "_blank", "noopener,noreferrer")}>
              Xem sách gốc
            </button>
          </div>
        )}

        {selectedJobId && activeStep !== WORKFLOW_STEPS.upload ? <section className="contentArea">
          {!selectedJobId && !jobsLoading ? (
            <EmptyState title="Chưa chọn job" message="Upload hoặc chọn một sách/job ở danh sách bên trái để bắt đầu review." />
          ) : null}

          {selectedJobId && detailsLoading ? <LoadingState message="Đang tải chi tiết job..." /> : null}
          {selectedJobId && detailsError ? <ErrorState message={detailsError} onRetry={() => loadSelectedJob(selectedJobId)} /> : null}

          {selectedJobId && job && !detailsLoading ? (
            <>
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
                    loadingMessage: "Đang trích xuất chủ đề...",
                    success: "Đang trích xuất chủ đề. Theo dõi tiến độ trong debug khi cần.",
                    reload: async () => startPolling(),
                    onError: setTopicsError,
                  })}
                  onSave={() => runAction(() => saveTopics(selectedJobId, topics || []), { success: "Đã lưu chỉnh sửa.", reload: loadTopics, onError: setTopicsError })}
                  onApproveAll={() => runAction(() => approveTopics(selectedJobId, topics || []), {
                    success: "Đã lưu toàn bộ chủ đề.",
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
                  jobId={selectedJobId}
                  lessons={lessons}
                  groupedByTopic={groupedLessons}
                  selectedTopicNum={selectedTopicNum}
                  approved={lessonsApproved}
                  loading={actionLoading}
                  error={lessonsError}
                  onChange={(index, field, value) => updateItem(setLessons, index, field, value)}
                  onLoad={loadLessons}
                  onExtract={() => runAction(() => extractLessons(selectedJobId), {
                    loadingMessage: "Đang trích xuất bài học...",
                    success: "Đang trích xuất bài học.",
                    reload: async () => startPolling(),
                    onError: setLessonsError,
                  })}
                  onSave={() => runAction(() => saveLessons(selectedJobId, lessons || []), { success: "Đã lưu chỉnh sửa bài học.", reload: loadLessons, onError: setLessonsError })}
                  onApprove={() => runAction(() => approveLessons(selectedJobId, lessons || []), {
                    success: "Đã lưu metadata bài học. Tiếp tục trích xuất chunk.",
                    reload: async () => {
                      await loadLessons();
                      setActiveStep(WORKFLOW_STEPS.chunks);
                    },
                    onError: setLessonsError,
                  })}
                  onApproveLesson={(lesson) => runAction(() => approveLesson(selectedJobId, lesson.lesson_num), {
                    success: `Đã lưu Lesson ${String(lesson.lesson_num).padStart(2, "0")} vào MongoDB/MinIO.`,
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
                  jobId={selectedJobId}
                  chunks={chunks}
                  groupedByLesson={groupedChunks}
                  approved={chunksApproved}
                  loading={actionLoading}
                  error={chunksError}
                  onChange={(index, field, value) => updateItem(setChunks, index, field, value)}
                  onLoad={loadChunks}
                  onExtract={() => runAction(() => extractChunks(selectedJobId), {
                    loadingMessage: "Đang trích xuất chunk...",
                    success: "Đang trích xuất chunk.",
                    reload: async () => startPolling(),
                    onError: setChunksError,
                  })}
                  onSave={() => runAction(() => saveChunks(selectedJobId, chunks || []), { success: "Đã lưu chỉnh sửa chunk.", reload: loadChunks, onError: setChunksError })}
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
      </main>

      <aside className={`debugDrawer debug-drawer ${debugOpen ? "open" : ""}`}>
        <div className="debugDrawerHeader">
          <div>
            <strong>Debug phiên duyệt</strong>
            <span className="mono">{selectedJobId || "Chưa chọn job"}</span>
          </div>
          <button type="button" onClick={() => setDebugOpen(false)}>Đóng</button>
        </div>
        <div className="debugArea">
          <section className="panel inspectorCard">
            <h3>Liên kết nguồn</h3>
            <dl className="statusGrid">
              <dt>Backend</dt><dd className="mono breakText">{API_BASE_URL}</dd>
              <dt>Source</dt><dd className="mono breakText">{selectedJobId ? getSourcePreviewUrl(selectedJobId) : "-"}</dd>
              <dt>Object key</dt><dd className="mono breakText">{job?.minio?.subject_object_key || "-"}</dd>
            </dl>
          </section>
          <StatusPanel job={job} status={status} />
          <LogPanel log={logs} onRefresh={loadLogs} loading={actionLoading} />
          <RawJsonPanel title="JSON gốc" data={rawData} open={rawOpen} onToggle={() => setRawOpen((value) => !value)} />
        </div>
      </aside>
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
