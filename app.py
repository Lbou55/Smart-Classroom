from flask import Flask, request, jsonify, render_template, session, redirect, url_for, Response, send_file
import joblib
import numpy as np
import time
import socket
from functools import wraps
import firebase_admin
from firebase_admin import auth, credentials, db
import json
import os
import threading
from datetime import datetime, timedelta
from flask_cors import CORS
import csv
from io import StringIO

# ==================== FLASK SETUP ====================
app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'smartclassroom-stable-secret-key-change-in-prod')

CORS(app, supports_credentials=True)

app.config.update(
    PERMANENT_SESSION_LIFETIME=timedelta(days=1),
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=False,
    SESSION_COOKIE_NAME='sc_session',
)

# ==================== CONFIG ====================
FIREBASE_CONFIG = {
    'databaseURL': 'https://smart-classroom-e57a3-default-rtdb.europe-west1.firebasedatabase.app/',
    'service_account_path': 'service-account-key.json'
}

# ==================== GLOBAL STATE ====================
class AppState:
    def __init__(self):
        self.firebase_initialized = False
        self.models_loaded = False
        self.scaler = None
        self.model = None
        self.latest_data = {
            "temp": None,
            "hum": None,
            "pir": None,
            "taux_occupation": None,
            "predicted_temp": None
        }
        self.ac_status = "OFF"
        self.ac_mode = "AUTO"
        self.ac_temp_threshold = 18.0

        self._user_cache = {}
        self._user_cache_lock = threading.Lock()

        self._data_dirty = False
        self._data_lock = threading.Lock()

    def cache_user(self, uid, data):
        with self._user_cache_lock:
            self._user_cache[data['email']] = {'uid': uid, **data}

    def get_cached_user(self, email):
        with self._user_cache_lock:
            return self._user_cache.get(email)

    def invalidate_user_cache(self, email):
        with self._user_cache_lock:
            self._user_cache.pop(email, None)

    def update_sensor_data(self, temp, hum, pir, taux):
        with self._data_lock:
            self.latest_data.update({
                'temp': temp, 'hum': hum,
                'pir': pir, 'taux_occupation': taux
            })
            self._data_dirty = True

    def set_predicted(self, val):
        with self._data_lock:
            self.latest_data['predicted_temp'] = val

    def consume_dirty(self):
        with self._data_lock:
            if self._data_dirty:
                self._data_dirty = False
                return True
            return False

    def snapshot(self):
        with self._data_lock:
            return dict(self.latest_data)

state = AppState()

# ==================== FIREBASE ====================
def init_firebase():
    try:
        if os.path.exists(FIREBASE_CONFIG['service_account_path']):
            cred = credentials.Certificate(FIREBASE_CONFIG['service_account_path'])
        else:
            cred_json = os.environ.get('FIREBASE_CREDENTIALS')
            if cred_json:
                cred = credentials.Certificate(json.loads(cred_json))
            else:
                print("⚠️ Firebase credentials not found")
                return False

        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': FIREBASE_CONFIG['databaseURL']
            })

        setup_database()
        state.firebase_initialized = True
        print("✅ Firebase initialized")
        return True

    except Exception as e:
        print(f"❌ Firebase init error: {e}")
        return False

def setup_database():
    try:
        ref = db.reference('/')
        existing = ref.get() or {}
        nodes = {
            'users': {},
            'sensors': {"latest": {}, "history": {}},
            'config': {"app_name": "SmartClassroom", "ac_threshold": 18.0},
            'devices': {"ac": {"status": "OFF", "mode": "AUTO"}}
        }
        for key, value in nodes.items():
            if key not in existing:
                db.reference(key).set(value)
        return True
    except Exception as e:
        print(f"❌ Database setup error: {e}")
        return False

def warm_user_cache():
    try:
        users = db.reference('users').get() or {}
        for uid, data in users.items():
            if isinstance(data, dict) and 'email' in data:
                state.cache_user(uid, data)
        print(f"✅ User cache warmed: {len(users)} users loaded")
    except Exception as e:
        print(f"⚠️ User cache warm failed: {e}")

# ==================== ML MODELS ====================
def load_models():
    try:
        if os.path.exists("scaler.pkl") and os.path.exists("temperature_model.pkl"):
            state.scaler = joblib.load("scaler.pkl")
            state.model = joblib.load("temperature_model.pkl")
            state.models_loaded = True
            print("✅ Models loaded")
            return True
    except Exception as e:
        print(f"⚠️ Model loading error: {e}")
    state.models_loaded = False
    return False

# ==================== AC DECISION LOGIC ====================
def evaluate_ac_auto():
    if state.ac_mode != "AUTO":
        return

    with state._data_lock:
        predicted = state.latest_data.get('predicted_temp')
        temp = state.latest_data.get('temp')

    temp_to_check = predicted if predicted is not None else temp

    if temp_to_check is None:
        return

    state.ac_status = "ON" if float(temp_to_check) >= state.ac_temp_threshold else "OFF"

# ==================== DECORATORS ====================
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Unauthorized'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Unauthorized'}), 401
            return redirect(url_for('login'))
        if session.get('role') != 'admin':
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Forbidden'}), 403
            return "Access denied", 403
        return f(*args, **kwargs)
    return decorated

# ==================== BACKGROUND SYNC ====================
def sync_to_firebase():
    while True:
        try:
            if state.firebase_initialized and state.consume_dirty():
                snap = state.snapshot()
                snap['timestamp'] = int(time.time() * 1000)
                db.reference('sensors/latest').update(snap)
                db.reference('sensors/history').push(snap)
                db.reference('devices/ac').set({
                    "status": state.ac_status,
                    "mode": state.ac_mode
                })
        except Exception as e:
            print(f"Sync error: {e}")
        time.sleep(10)

# ==================== UTILS ====================
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

# ==================== STARTUP ====================
load_models()
if init_firebase():
    warm_user_cache()
    threading.Thread(target=sync_to_firebase, daemon=True).start()

# ==================== PAGE ROUTES ====================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login')
def login():
    if session.get('user_id'):
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/signup')
def signup():
    if session.get('user_id'):
        return redirect(url_for('dashboard'))
    return render_template('signup.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/statistics')
@login_required
def statistics():
    return render_template('statistics.html')

@app.route('/admin')
@admin_required
def admin():
    return render_template('admin.html')

@app.route('/settings')
@admin_required
def settings():
    return render_template('settings.html')

@app.route('/chat')
@login_required
def chat():
    return render_template('chat.html')

@app.route('/profile')
@login_required
def profile():
    return render_template('profile.html')

@app.route('/admin/conversations')
@admin_required
def admin_conversations():
    return render_template('admin_conversations.html')

@app.route('/blueprints')
@login_required
def blueprints():
    return render_template('blueprints.html')

# ==================== AUTH API ====================
@app.route('/api/status', methods=['GET'])
def api_status():
    return jsonify({'status': 'ok'})

@app.route('/api/check-session', methods=['GET'])
def check_session():
    authenticated = bool(session.get('user_id'))
    return jsonify({
        'authenticated': authenticated,
        'is_authenticated': authenticated,
        'user_id': session.get('user_id'),
        'user_email': session.get('user_email'),
        'user_name': session.get('user_name'),
        'role': session.get('role'),
    })

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/update-session', methods=['POST'])
@login_required
def update_session():
    data = request.get_json()
    if 'name' in data:
        session['user_name'] = data['name']
    if 'email' in data:
        session['user_email'] = data['email']
    return jsonify({'success': True})

@app.route('/api/signup', methods=['POST'])
def signup_api():
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        name = data.get('name', 'User')
        role = data.get('role', 'user')

        if not email or not password:
            return jsonify({"success": False, "error": "Email and password are required"}), 400

        if state.get_cached_user(email):
            return jsonify({"success": False, "error": "Email already registered"}), 400

        if state.firebase_initialized:
            existing = db.reference('users').order_by_child('email').equal_to(email).get()
            if existing:
                return jsonify({"success": False, "error": "Email already registered"}), 400

        try:
            user = auth.create_user(email=email, password=password, display_name=name)
            user_id = user.uid
        except Exception:
            user_id = str(int(time.time() * 1000))

        user_record = {
            'name': name,
            'email': email,
            'password': password,
            'role': role,
            'createdAt': int(time.time() * 1000),
            'verified': False
        }

        if state.firebase_initialized:
            db.reference(f'users/{user_id}').set(user_record)

        state.cache_user(user_id, user_record)

        return jsonify({"success": True, "uid": user_id})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/login-local', methods=['POST'])
def login_local():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data received'}), 400

        email = data.get('email', '').strip()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({'success': False, 'error': 'Email and password are required'}), 400

        user = state.get_cached_user(email)

        if not user and state.firebase_initialized:
            users = db.reference('users').order_by_child('email').equal_to(email).get()
            if users:
                uid = list(users.keys())[0]
                user_data = users[uid]
                state.cache_user(uid, user_data)
                user = state.get_cached_user(email)

        if not user:
            return jsonify({'success': False, 'error': 'User not found'}), 400

        if user.get('password') != password:
            return jsonify({'success': False, 'error': 'Incorrect password'}), 400

        session.clear()
        session['user_id'] = user['uid']
        session['user_email'] = email
        session['user_name'] = user.get('name', '')
        session['role'] = user.get('role', 'user')
        session.permanent = True
        session.modified = True

        print(f"✅ Login: {email} | role: {session['role']}")

        return jsonify({
            'success': True,
            'role': session['role'],
            'name': session['user_name']
        })

    except Exception as e:
        print(f"❌ Login error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ==================== SENSOR DATA API ====================
@app.route('/data', methods=['POST'])
def receive_data():
    try:
        data = request.get_json()
        required = ['temp', 'hum', 'pir', 'taux_occupation']

        if not data or not all(k in data for k in required):
            return jsonify({"status": "error", "message": "Missing fields"}), 400

        try:
            temp = float(data['temp'])
            hum  = float(data['hum'])
            pir  = float(data['pir'])
            taux = float(data['taux_occupation'])
        except (ValueError, TypeError) as e:
            return jsonify({"status": "error", "message": f"Invalid value: {e}"}), 400

        state.update_sensor_data(temp, hum, pir, taux)

        if state.models_loaded:
            try:
                features = np.array([[temp, hum, pir, taux]])
                features_scaled = state.scaler.transform(features)
                pred = round(float(state.model.predict(features_scaled)[0]), 2)
                state.set_predicted(pred)
            except Exception:
                state.set_predicted(temp)
        else:
            state.set_predicted(temp)

        evaluate_ac_auto()

        return jsonify({
            "status": "ok",
            "ac_status": state.ac_status,
            "ac_mode": state.ac_mode
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==================== AC COMMAND (ESP32) ====================
@app.route('/ac-command', methods=['GET'])
def ac_command():
    return jsonify({
        "status": state.ac_status,
        "mode": state.ac_mode,
        "threshold": state.ac_temp_threshold
    })

# ==================== LIVE DATA API ====================
@app.route('/api/latest', methods=['GET'])
@login_required
def get_latest():
    return jsonify({
        **state.snapshot(),
        "ac_status": state.ac_status,
        "ac_mode": state.ac_mode,
        "threshold": state.ac_temp_threshold
    })

@app.route('/api/get-ac', methods=['GET'])
@login_required
def get_ac():
    return jsonify({
        "status": state.ac_status,
        "mode": state.ac_mode,
        "threshold": state.ac_temp_threshold
    })

@app.route('/api/set-ac', methods=['POST'])
@admin_required
def set_ac():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No data"}), 400

        requested_mode = data.get("mode", "").upper()
        if requested_mode == "AUTO":
            state.ac_mode = "AUTO"
            evaluate_ac_auto()
            return jsonify({
                "success": True,
                "mode": "AUTO",
                "status": state.ac_status
            })

        status = data.get("status", "").upper()
        if status not in ["ON", "OFF"]:
            return jsonify({"success": False, "error": "Invalid status. Use ON or OFF"}), 400

        state.ac_mode = "MANUAL"
        state.ac_status = status

        if state.firebase_initialized:
            db.reference('devices/ac').set({
                "status": state.ac_status,
                "mode": state.ac_mode
            })

        return jsonify({
            "success": True,
            "status": state.ac_status,
            "mode": state.ac_mode
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/set-threshold', methods=['POST'])
@admin_required
def set_threshold():
    try:
        data = request.get_json()
        threshold = float(data.get('threshold', 18.0))
        if threshold < 10 or threshold > 40:
            return jsonify({"success": False, "error": "Threshold must be between 10–40°C"}), 400

        state.ac_temp_threshold = threshold
        if state.firebase_initialized:
            db.reference('config/ac_threshold').set(state.ac_temp_threshold)
        evaluate_ac_auto()
        return jsonify({"success": True, "threshold": state.ac_temp_threshold})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/get-threshold', methods=['GET'])
@login_required
def get_threshold():
    return jsonify({"threshold": state.ac_temp_threshold})

# ==================== CSV EXPORT ====================
@app.route('/api/export-csv', methods=['GET'])
@admin_required
def export_csv():
    try:
        if not state.firebase_initialized:
            return jsonify({"error": "Firebase not ready"}), 503

        history_ref = db.reference('sensors/history')
        history = history_ref.order_by_key().limit_to_last(10000).get()

        if not history:
            return jsonify({"error": "No data available"}), 404

        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(['timestamp', 'temp', 'hum', 'pir', 'taux_occupation', 'ac_status', 'predicted_temp'])

        for key, entry in history.items():
            ts = entry.get('timestamp', '')
            if isinstance(ts, (int, float)) and ts > 1e11:
                ts = datetime.fromtimestamp(ts/1000).isoformat()
            writer.writerow([
                ts,
                entry.get('temp', ''),
                entry.get('hum', ''),
                entry.get('pir', ''),
                entry.get('taux_occupation', ''),
                entry.get('ac_status', ''),
                entry.get('predicted_temp', '')
            ])

        output.seek(0)
        filename = f"sensor_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return Response(
            output,
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment;filename={filename}'}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==================== BLUEPRINT PDF DOWNLOAD ====================
@app.route('/api/download-blueprint')
@login_required
def download_blueprint():
    lang = request.args.get('lang', 'en')
    filename = f'blueprint_{lang}.pdf'
    path = os.path.join('static', 'docs', filename)
    if not os.path.exists(path):
        return jsonify({'error': 'File not found'}), 404
    return send_file(path, as_attachment=True)

# ==================== DEBUG ====================
@app.route('/api/debug-ac', methods=['GET'])
@login_required
def debug_ac():
    snap = state.snapshot()
    return jsonify({
        "ac_status": state.ac_status,
        "ac_mode": state.ac_mode,
        "threshold": state.ac_temp_threshold,
        "temp": snap.get('temp'),
        "predicted_temp": snap.get('predicted_temp'),
        "hum": snap.get('hum'),
        "pir": snap.get('pir'),
        "taux_occupation": snap.get('taux_occupation'),
        "models_loaded": state.models_loaded,
        "firebase_ok": state.firebase_initialized,
    })

# ==================== MAIN ====================
if __name__ == "__main__":
    ip = get_local_ip()
    print(f"🌐 Server running at http://{ip}:5000")
    print(f"📱 Open http://localhost:5000 in your browser")
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False, threaded=True)