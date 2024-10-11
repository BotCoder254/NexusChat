import os
from flask import Flask, render_template, request, redirect, url_for, jsonify, session, flash
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_pymongo import PyMongo
from bson.objectid import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import secrets
from datetime import datetime
from config import Config
from utils.auth import login_required
from utils.db import get_db
from utils.file_handler import allowed_file, save_file

app = Flask(__name__)
app.config.from_object(Config)

socketio = SocketIO(app)
mongo = get_db(app)

@app.route('/')
def index():
    return render_template('landing.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        if not username or not password:
            flash('Username and password are required.', 'error')
            return redirect(url_for('register'))
        
        users = mongo.db.users
        existing_user = users.find_one({'username': username})

        if existing_user is None:
            hashpass = generate_password_hash(password)
            users.insert_one({
                'username': username,
                'password': hashpass,
                'profile_image': 'default_profile.png',
                'bio': ''
            })
            flash('Registration successful. Please log in.', 'success')
            return redirect(url_for('login'))

        flash('Username already exists.', 'error')
        return redirect(url_for('register'))

    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        if not username or not password:
            flash('Username and password are required.', 'error')
            return redirect(url_for('login'))
        
        users = mongo.db.users
        login_user = users.find_one({'username': username})

        if login_user and check_password_hash(login_user['password'], password):
            session['username'] = username
            flash('Logged in successfully.', 'success')
            return redirect(url_for('chat'))

        flash('Invalid username/password combination.', 'error')
        return redirect(url_for('login'))

    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('username', None)
    flash('Logged out successfully.', 'success')
    return redirect(url_for('index'))

@app.route('/chat')
@login_required
def chat():
    groups = list(mongo.db.groups.find())
    users = list(mongo.db.users.find({}, {'password': 0}))
    return render_template('chat.html', groups=groups, users=users)

@app.route('/create_group', methods=['POST'])
@login_required
def create_group():
    group_name = request.form['group_name']
    is_private = request.form.get('is_private', 'false').lower() == 'true'
    creator = session['username']

    if not group_name:
        return jsonify({'success': False, 'message': 'Group name is required.'})

    invite_link = secrets.token_urlsafe(16) if is_private else None

    group_id = mongo.db.groups.insert_one({
        'name': group_name,
        'is_private': is_private,
        'creator': creator,
        'members': [creator],
        'invite_link': invite_link
    }).inserted_id

    return jsonify({'success': True, 'group_id': str(group_id), 'invite_link': invite_link})

@app.route('/join_group/<group_id>')
@login_required
def join_group(group_id):
    username = session['username']
    group = mongo.db.groups.find_one({'_id': ObjectId(group_id)})
    
    if group and (not group['is_private'] or username in group['members']):
        mongo.db.groups.update_one({'_id': ObjectId(group_id)}, {'$addToSet': {'members': username}})
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'message': 'Unable to join group'})

@app.route('/join_private_group/<invite_link>')
@login_required
def join_private_group(invite_link):
    username = session['username']
    group = mongo.db.groups.find_one({'invite_link': invite_link})
    
    if group:
        mongo.db.groups.update_one({'_id': group['_id']}, {'$addToSet': {'members': username}})
        return jsonify({'success': True, 'group_id': str(group['_id'])})
    
    return jsonify({'success': False, 'message': 'Invalid invite link'})

@app.route('/update_profile', methods=['POST'])
@login_required
def update_profile():
    username = session['username']
    bio = request.form.get('bio', '')
    
    if 'profile_image' in request.files:
        file = request.files['profile_image']
        if file and allowed_file(file.filename, {'png', 'jpg', 'jpeg', 'gif'}):
            filename = save_file(file, app.config['UPLOAD_FOLDER'], 'profile_pics')
            mongo.db.users.update_one({'username': username}, {'$set': {'profile_image': filename}})
    
    mongo.db.users.update_one({'username': username}, {'$set': {'bio': bio}})
    flash('Profile updated successfully.', 'success')
    return jsonify({'success': True})

@app.route('/get_messages/<group_id>')
@login_required
def get_messages(group_id):
    messages = list(mongo.db.messages.find({'group_id': group_id}).sort('timestamp', 1))
    return jsonify([{
        'username': msg['username'],
        'msg': msg['msg'],
        'timestamp': msg['timestamp'].isoformat(),
        'file': msg.get('file')
    } for msg in messages])

@app.route('/get_group_members/<group_id>')
@login_required
def get_group_members(group_id):
    group = mongo.db.groups.find_one({'_id': ObjectId(group_id)})
    if group:
        members = list(mongo.db.users.find({'username': {'$in': group['members']}}, {'password': 0}))
        return jsonify(members)
    return jsonify({'success': False, 'message': 'Group not found'})

@socketio.on('join')
def on_join(data):
    username = session['username']
    room = data['room']
    join_room(room)
    emit('status', {'msg': f"{username} has entered the room."}, room=room)

@socketio.on('leave')
def on_leave(data):
    username = session['username']
    room = data['room']
    leave_room(room)
    emit('status', {'msg': f"{username} has left the room."}, room=room)

@socketio.on('message')
def handle_message(data):
    username = session['username']
    room = data['room']
    msg = data['msg']
    timestamp = datetime.now()
    user = mongo.db.users.find_one({'username': username}, {'password': 0})
    
    message_data = {
        'username': username,
        'msg': msg,
        'timestamp': timestamp,
        'group_id': room,
        'profile_image': user['profile_image']
    }
    
    if 'file' in data:
        file_data = data['file']
        if allowed_file(file_data['name'], {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mp3'}):
            filename = save_file(file_data, app.config['UPLOAD_FOLDER'], 'media')
            message_data['file'] = {
                'name': filename,
                'type': file_data['type']
            }
    
    mongo.db.messages.insert_one(message_data)
    
    emit('message', {
        'username': username,
        'msg': msg,
        'timestamp': timestamp.isoformat(),
        'file': message_data.get('file'),
        'profile_image': user['profile_image']
    }, room=room)

if __name__ == '__main__':
    socketio.run(app, debug=True) 