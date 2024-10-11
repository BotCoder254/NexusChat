import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or '7500abc53daf2db65c33761732aaf928f16c61748bc784737f1d27f8ebdece3e'
    MONGO_URI = os.environ.get('MONGO_URI') or 'mongodb://localhost:27017/nexus_chat'
    UPLOAD_FOLDER = os.path.join(os.getcwd(), 'static', 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max upload size