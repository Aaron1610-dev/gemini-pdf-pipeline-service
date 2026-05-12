import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_env: str
    app_host: str
    app_port: int
    workspace_dir: Path
    output_dir: Path
    log_dir: Path
    gemini_model: str
    mongo_uri: str
    mongo_db_name: str
    enable_kaggle: bool
    kaggle_username: str
    kaggle_key: str
    kaggle_kernel_ref: str
    kaggle_dataset_id: str
    kaggle_max_attempts: int
    kaggle_poll_seconds: int


@lru_cache
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "gemini-pdf-pipeline-service"),
        app_env=os.getenv("APP_ENV", "development"),
        app_host=os.getenv("APP_HOST", "0.0.0.0"),
        app_port=int(os.getenv("APP_PORT", "8100")),
        workspace_dir=Path(os.getenv("WORKSPACE_DIR", "./workspace")),
        output_dir=Path(os.getenv("OUTPUT_DIR", "./output")),
        log_dir=Path(os.getenv("LOG_DIR", "./logs")),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        mongo_uri=os.getenv("MONGO_URI", "mongodb://localhost:27017"),
        mongo_db_name=os.getenv("MONGO_DB_NAME", "gemini_pipeline_test"),
        enable_kaggle=os.getenv("ENABLE_KAGGLE", "false").lower() in {"1", "true", "yes", "on"},
        kaggle_username=os.getenv("KAGGLE_USERNAME", ""),
        kaggle_key=os.getenv("KAGGLE_KEY", ""),
        kaggle_kernel_ref=os.getenv("KAGGLE_KERNEL_REF", "dat261303/debug-cutlines-auto"),
        kaggle_dataset_id=os.getenv("KAGGLE_DATASET_ID", "dat261303/kaggle-pack"),
        kaggle_max_attempts=int(os.getenv("KAGGLE_MAX_ATTEMPTS", "3")),
        kaggle_poll_seconds=int(os.getenv("KAGGLE_POLL_SECONDS", "20")),
    )
