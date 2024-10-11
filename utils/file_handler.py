import os
from werkzeug.utils import secure_filename
import uuid

def allowed_file(filename, allowed_extensions):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in allowed_extensions

def save_file(file, upload_folder, subfolder):
    if file and allowed_file(file.filename, {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mp3'}):
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        file_path = os.path.join(upload_folder, subfolder, unique_filename)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        file.save(file_path)
        return unique_filename
    return None