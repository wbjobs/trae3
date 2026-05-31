import uvicorn
from app.utils.config import load_config


def main():
    config = load_config()
    server_cfg = config.get("server", {})
    uvicorn.run(
        "app.main:app",
        host=server_cfg.get("host", "0.0.0.0"),
        port=server_cfg.get("port", 8000),
        workers=server_cfg.get("workers", 1),
        log_level=server_cfg.get("log_level", "info"),
        reload=server_cfg.get("log_level") == "debug",
    )


if __name__ == "__main__":
    main()
