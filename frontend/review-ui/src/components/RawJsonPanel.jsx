export default function RawJsonPanel({ title = "JSON gốc", data, open, onToggle }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>{title}</h2>
        <button type="button" onClick={onToggle}>
          {open ? "Ẩn JSON" : "Xem JSON gốc"}
        </button>
      </div>
      {open ? <pre className="jsonBox">{JSON.stringify(data, null, 2)}</pre> : null}
    </section>
  );
}
