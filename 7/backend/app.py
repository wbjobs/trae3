from flask import Flask, send_from_directory
from flask_cors import CORS
from config import Config
from api.routes import api_bp
from core.logging_config import setup_logging
import os

def create_app():
    app = Flask(__name__, static_folder='../frontend', static_url_path='')

    setup_logging()

    app.config.from_object(Config)

    CORS(app, resources={r"/api/*": {"origins": Config.CORS_ORIGINS}})

    app.register_blueprint(api_bp, url_prefix='/api')

    Config.ensure_dirs()

    @app.route('/')
    def index():
        return send_from_directory('../frontend', 'index.html')

    @app.route('/<path:path>')
    def serve_static(path):
        static_folder = os.path.join(os.path.dirname(__file__), '..', 'frontend')
        return send_from_directory(static_folder, path)

    @app.errorhandler(404)
    def not_found(e):
        return {"success": False, "message": "Resource not found"}, 404

    @app.errorhandler(500)
    def internal_error(e):
        return {"success": False, "message": "Internal server error"}, 500

    return app

if __name__ == '__main__':
    app = create_app()
    print("=" * 60)
    print("工业设备运维时序数据分析平台")
    print("Industrial IoT Time Series Analytics Platform")
    print("=" * 60)
    print(f"后端API地址: http://localhost:5000/api")
    print(f"前端页面地址: http://localhost:5000/")
    print(f"数据模式: {'模拟数据' if Config.USE_SIMULATION else 'InfluxDB'}")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
