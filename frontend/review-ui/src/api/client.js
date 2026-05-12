const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8100";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!response.ok) {
    const detail = data?.detail || data?.message || response.statusText;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

export function health() {
  return request("/health");
}

export function createJob(formData) {
  return request("/api/jobs", {
    method: "POST",
    body: formData,
  });
}

export function getJob(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export function getStatus(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/status`);
}

export function getLogs(jobId, lines = 100) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/logs?lines=${encodeURIComponent(lines)}`);
}

export function extractTopics(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/extract/topics`, {
    method: "POST",
  });
}

export function getTopics(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/topics`);
}

export function saveTopics(jobId, topics) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/topics`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topics }),
  });
}

export function approveTopics(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/topics/approve`, {
    method: "POST",
  });
}

export function extractLessons(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/extract/lessons`, {
    method: "POST",
  });
}

export function getLessons(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/lessons`);
}

export function saveLessons(jobId, lessons) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/lessons`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessons }),
  });
}

export function approveLessons(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/lessons/approve`, {
    method: "POST",
  });
}

export function extractChunks(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/extract/chunks`, {
    method: "POST",
  });
}

export function getChunks(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/chunks`);
}

export function saveChunks(jobId, chunks) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/chunks`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunks }),
  });
}

export function addChunk(jobId, payload) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/chunks/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteChunk(jobId, chunkId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/chunks/${encodeURIComponent(chunkId)}`, {
    method: "DELETE",
  });
}

export function recutChunk(jobId, payload) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/chunks/recut`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function approveChunks(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/chunks/approve`, {
    method: "POST",
  });
}

export { API_BASE_URL };
