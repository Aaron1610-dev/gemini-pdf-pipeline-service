export default function LogPanel({ log, onRefresh, loading }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>Log</h2>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? "Đang tải..." : "Làm mới log"}
        </button>
      </div>
      <pre className="logBox">{log || "Chưa có log."}</pre>
    </section>
  );
}
