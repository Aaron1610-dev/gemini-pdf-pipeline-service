const STEPS = [
  { key: "upload", label: "Tải sách", description: "Đã tạo job", statuses: ["uploaded"] },
  { key: "topics", label: "Chủ đề", description: "Duyệt mục lục", statuses: ["extracting_topics", "reviewing_topics"] },
  { key: "lessons", label: "Bài học", description: "Duyệt bài", statuses: ["extracting_lessons", "reviewing_lessons"] },
  { key: "chunks", label: "Chunk", description: "Duyệt đoạn", statuses: ["extracting_chunks", "reviewing_chunks"] },
  {
    key: "bundle",
    label: "Bundle / MongoDB",
    description: "Import cuối",
    statuses: ["preparing_bundle", "running_kaggle", "extracting_keywords", "bundle_ready", "importing_mongodb", "mongodb_imported"],
  },
];

function progressIndex(status) {
  if (status === "mongodb_imported") return STEPS.length;
  if (status === "uploaded") return 1;
  const index = STEPS.findIndex((step) => step.statuses.includes(status));
  return index >= 0 ? index : 0;
}

export default function ReviewStepper({ status, activeStep = "upload", onStepChange }) {
  const progress = progressIndex(status);
  return (
    <ol className="stepper" aria-label="Pipeline stages">
      {STEPS.map((step, index) => {
        const isSelected = activeStep === step.key;
        const state = status === "error" && isSelected ? "error" : isSelected ? "active" : index < progress ? "done" : "pending";
        return (
          <li key={step.key} className={`stepItem ${state}`}>
            <button type="button" className="stepButton" onClick={() => onStepChange?.(step.key)}>
            <span className="stepDot">{index + 1}</span>
            <span className="stepText">
              <strong>{step.label}</strong>
              <small>{step.description}</small>
            </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
