import { useEffect, useRef, useState } from "react";
import {
  addChunk,
  approveChunks,
  approveTopics,
  approveLessons,
  deleteChunk,
  extractChunks,
  extractLessons,
  extractTopics,
  getChunks,
  getJob,
  getLessons,
  getLogs,
  getStatus,
  getTopics,
  health,
  recutChunk,
  saveChunks,
  saveLessons,
  saveTopics,
  API_BASE_URL,
} from "./api/client.js";
import JobCreateView from "./views/JobCreateView.jsx";
import ChunkReviewView from "./views/ChunkReviewView.jsx";
import JobDetailView from "./views/JobDetailView.jsx";
import LessonReviewView from "./views/LessonReviewView.jsx";
import TopicReviewView from "./views/TopicReviewView.jsx";
import LogPanel from "./components/LogPanel.jsx";
import RawJsonPanel from "./components/RawJsonPanel.jsx";

const LAST_JOB_KEY = "geminiPdfPipeline.lastJobId";
const VIEWS = {
  topics: "topics",
  lessons: "lessons",
  chunks: "chunks",
};

export default function App() {
  const [healthInfo, setHealthInfo] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [jobId, setJobId] = useState("");
  const [lastJobId, setLastJobId] = useState(() => localStorage.getItem(LAST_JOB_KEY) || "");
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState("");
  const [topics, setTopics] = useState(null);
  const [topicsApproved, setTopicsApproved] = useState(false);
  const [rawTopicsResponse, setRawTopicsResponse] = useState(null);
  const [rawTopicsOpen, setRawTopicsOpen] = useState(false);
  const [lessons, setLessons] = useState(null);
  const [groupedLessons, setGroupedLessons] = useState([]);
  const [lessonsApproved, setLessonsApproved] = useState(false);
  const [rawLessonsResponse, setRawLessonsResponse] = useState(null);
  const [rawLessonsOpen, setRawLessonsOpen] = useState(false);
  const [chunks, setChunks] = useState(null);
  const [groupedChunks, setGroupedChunks] = useState([]);
  const [chunksApproved, setChunksApproved] = useState(false);
  const [rawChunksResponse, setRawChunksResponse] = useState(null);
  const [rawChunksOpen, setRawChunksOpen] = useState(false);
  const [statusRawOpen, setStatusRawOpen] = useState(false);
  const [activeView, setActiveView] = useState(VIEWS.topics);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    health()
      .then((data) => {
        setHealthInfo(data);
        setHealthError("");
      })
      .catch((err) => {
        setHealthInfo(null);
        setHealthError(err.message || "Không kết nối được backend");
      });
    return () => stopPolling();
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function loadJob(targetJobId = jobId) {
    if (!targetJobId) return;
    setError("");
    setLoading(true);
    try {
      const [jobData, statusData] = await Promise.all([
        getJob(targetJobId),
        getStatus(targetJobId),
      ]);
      setJobId(targetJobId);
      setJob(jobData);
      setStatus(statusData);
      localStorage.setItem(LAST_JOB_KEY, targetJobId);
      setLastJobId(targetJobId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    if (!jobId) return;
    setError("");
    try {
      const statusData = await getStatus(jobId);
      setStatus(statusData);
      const jobData = await getJob(jobId);
      setJob(jobData);
      if (
        statusData.status === "reviewing_topics" ||
        statusData.status === "reviewing_lessons" ||
        statusData.status === "reviewing_chunks" ||
        statusData.status === "error"
      ) {
        stopPolling();
      }
    } catch (err) {
      setError(err.message);
      stopPolling();
    }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(refreshStatus, 3000);
  }

  async function handleCreated(newJobId, created) {
    setJobId(newJobId);
    localStorage.setItem(LAST_JOB_KEY, newJobId);
    setLastJobId(newJobId);
    setTopics(null);
    setRawTopicsResponse(null);
    setLessons(null);
    setGroupedLessons([]);
    setRawLessonsResponse(null);
    setChunks(null);
    setGroupedChunks([]);
    setRawChunksResponse(null);
    setLogs("");
    setJob(created);
    await loadJob(newJobId);
  }

  async function handleExtractTopics() {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      await extractTopics(jobId);
      await refreshStatus();
      startPolling();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadTopics() {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      const response = await getTopics(jobId);
      if (!Array.isArray(response?.topics)) {
        throw new Error("Backend response does not contain a topics list.");
      }
      setRawTopicsResponse(response);
      setTopics(response.topics);
      setTopicsApproved(Boolean(response.approved));
      setActiveView(VIEWS.topics);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExtractLessons() {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      await extractLessons(jobId);
      await refreshStatus();
      startPolling();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadLessons() {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      const response = await getLessons(jobId);
      if (!Array.isArray(response?.lessons)) {
        throw new Error("Backend response does not contain a lessons list.");
      }
      setRawLessonsResponse(response);
      setLessons(response.lessons);
      setGroupedLessons(Array.isArray(response.grouped_by_topic) ? response.grouped_by_topic : []);
      setLessonsApproved(Boolean(response.approved));
      setActiveView(VIEWS.lessons);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveLessons() {
    if (!jobId || !lessons) return;
    setError("");
    setLoading(true);
    try {
      const response = await saveLessons(jobId, lessons);
      setRawLessonsResponse(response);
      setLessons(response.lessons || []);
      setGroupedLessons(Array.isArray(response.grouped_by_topic) ? response.grouped_by_topic : []);
      setLessonsApproved(Boolean(response.approved));
      await refreshStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveLessons() {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      await approveLessons(jobId);
      await handleLoadLessons();
      await refreshStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExtractChunks() {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      await extractChunks(jobId);
      await refreshStatus();
      startPolling();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadChunks() {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      const response = await getChunks(jobId);
      if (!Array.isArray(response?.chunks)) {
        throw new Error("Backend response does not contain a chunks list.");
      }
      setRawChunksResponse(response);
      setChunks(response.chunks);
      setGroupedChunks(Array.isArray(response.grouped_by_lesson) ? response.grouped_by_lesson : []);
      setChunksApproved(Boolean(response.approved));
      setActiveView(VIEWS.chunks);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveChunks() {
    if (!jobId || !chunks) return;
    setError("");
    setLoading(true);
    try {
      const response = await saveChunks(jobId, chunks);
      setRawChunksResponse(response);
      setChunks(response.chunks || []);
      setGroupedChunks(Array.isArray(response.grouped_by_lesson) ? response.grouped_by_lesson : []);
      setChunksApproved(Boolean(response.approved));
      await refreshStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveChunks() {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      await approveChunks(jobId);
      await handleLoadChunks();
      await refreshStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddChunk(payload) {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      await addChunk(jobId, payload);
      await handleLoadChunks();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteChunk(chunkId) {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      await deleteChunk(jobId, chunkId);
      await handleLoadChunks();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecutChunk(payload) {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      await recutChunk(jobId, payload);
      await handleLoadChunks();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveTopics() {
    if (!jobId || !topics) return;
    setError("");
    setLoading(true);
    try {
      const response = await saveTopics(jobId, topics);
      setRawTopicsResponse(response);
      setTopics(response.topics || []);
      setTopicsApproved(Boolean(response.approved));
      await refreshStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveTopics() {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      await approveTopics(jobId);
      await handleLoadTopics();
      await refreshStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadLogs() {
    if (!jobId) return;
    setError("");
    setLoading(true);
    try {
      const response = await getLogs(jobId, 200);
      setLogs(response.log || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateTopic(index, field, value) {
    setTopics((current) =>
      (Array.isArray(current) ? current : []).map((topic, topicIndex) =>
        topicIndex === index ? { ...topic, [field]: value } : topic
      )
    );
  }

  function updateLesson(index, field, value) {
    setLessons((current) =>
      (Array.isArray(current) ? current : []).map((lesson, lessonIndex) =>
        lessonIndex === index ? { ...lesson, [field]: value } : lesson
      )
    );
  }

  function updateChunk(index, field, value) {
    setChunks((current) =>
      (Array.isArray(current) ? current : []).map((chunk, chunkIndex) =>
        chunkIndex === index ? { ...chunk, [field]: value } : chunk
      )
    );
  }

  const backendOk = healthInfo?.status === "ok";

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <h1>Review-first PDF UI</h1>
          <p>Backend: <span className="mono">{API_BASE_URL}</span></p>
        </div>
        <div className={`healthBadge ${backendOk ? "ok" : "down"}`}>
          Backend: {backendOk ? "OK" : healthError ? "Không kết nối được" : "Đang kiểm tra..."}
        </div>
      </header>

      {healthError ? <div className="warningBox">{healthError}</div> : null}
      {error ? <div className="errorBox">{error}</div> : null}

      <main className="mainGrid">
        <div className="leftColumn">
          <JobCreateView
            onCreated={handleCreated}
            lastJobId={lastJobId}
            onLoadLast={() => loadJob(lastJobId)}
          />
          <section className="panel">
            <div className="panelHeader">
              <h2>Tải job bằng ID</h2>
            </div>
            <div className="loadJobRow">
              <input
                value={jobId}
                onChange={(event) => setJobId(event.target.value)}
                placeholder="Nhập job_id"
              />
              <button type="button" onClick={() => loadJob(jobId)} disabled={!jobId || loading}>
                Tải job
              </button>
            </div>
          </section>
          <JobDetailView
            jobId={jobId}
            job={job}
            status={status}
            loading={loading}
            onRefreshStatus={refreshStatus}
            onExtractTopics={handleExtractTopics}
            onLoadTopics={handleLoadTopics}
            onExtractLessons={handleExtractLessons}
            onLoadLessons={handleLoadLessons}
            onExtractChunks={handleExtractChunks}
            onLoadChunks={handleLoadChunks}
            onLoadLogs={handleLoadLogs}
          />
          <RawJsonPanel
            title="JSON trạng thái"
            data={{ job, status }}
            open={statusRawOpen}
            onToggle={() => setStatusRawOpen((value) => !value)}
          />
          <LogPanel log={logs} onRefresh={handleLoadLogs} loading={loading} />
        </div>

        <div className="rightColumn">
          <section className="panel viewShell">
            <div className="panelHeader">
              <div>
                <h2>Khu vực review</h2>
                <p className="muted">Chọn một bước để xem dữ liệu, chỉnh sửa và duyệt.</p>
              </div>
              {loading ? <span className="loadingPill">Đang xử lý...</span> : null}
            </div>
            <nav className="viewTabs" aria-label="Review views">
              <button
                type="button"
                className={activeView === VIEWS.topics ? "active" : ""}
                onClick={() => setActiveView(VIEWS.topics)}
              >
                Chủ đề
              </button>
              <button
                type="button"
                className={activeView === VIEWS.lessons ? "active" : ""}
                onClick={() => setActiveView(VIEWS.lessons)}
              >
                Bài học
              </button>
              <button
                type="button"
                className={activeView === VIEWS.chunks ? "active" : ""}
                onClick={() => setActiveView(VIEWS.chunks)}
              >
                Chunk
              </button>
            </nav>
          </section>

          {activeView === VIEWS.topics ? (
            <TopicReviewView
              topics={topics}
              approved={topicsApproved}
              rawTopicsResponse={rawTopicsResponse}
              rawOpen={rawTopicsOpen}
              loading={loading}
              onToggleRaw={() => setRawTopicsOpen((value) => !value)}
              onChangeTopic={updateTopic}
              onSave={handleSaveTopics}
              onApprove={handleApproveTopics}
              onReload={handleLoadTopics}
            />
          ) : null}

          {activeView === VIEWS.lessons ? (
            <LessonReviewView
              lessons={lessons}
              groupedByTopic={groupedLessons}
              approved={lessonsApproved}
              rawLessonsResponse={rawLessonsResponse}
              rawOpen={rawLessonsOpen}
              loading={loading}
              log={logs}
              onToggleRaw={() => setRawLessonsOpen((value) => !value)}
              onChangeLesson={updateLesson}
              onSave={handleSaveLessons}
              onApprove={handleApproveLessons}
              onReload={handleLoadLessons}
              onLoadLogs={handleLoadLogs}
            />
          ) : null}

          {activeView === VIEWS.chunks ? (
            <ChunkReviewView
              jobId={jobId}
              chunks={chunks}
              groupedByLesson={groupedChunks}
              approved={chunksApproved}
              rawChunksResponse={rawChunksResponse}
              rawOpen={rawChunksOpen}
              loading={loading}
              log={logs}
              onToggleRaw={() => setRawChunksOpen((value) => !value)}
              onChangeChunk={updateChunk}
              onSave={handleSaveChunks}
              onApprove={handleApproveChunks}
              onReload={handleLoadChunks}
              onLoadLogs={handleLoadLogs}
              onAddChunk={handleAddChunk}
              onDeleteChunk={handleDeleteChunk}
              onRecutChunk={handleRecutChunk}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
