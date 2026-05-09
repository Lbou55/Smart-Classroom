# Smart Classroom – IoT Energy Management System

## 📌 Context & Problem Statement

Educational equipment represents a significant portion of national energy consumption. In classrooms, air conditioning is often active regardless of actual occupancy or environmental conditions. This leads to unnecessary energy waste and discomfort for occupants.

The **Smart Classroom** project addresses this dual challenge — thermal comfort and energy efficiency — by developing an embedded system that continuously monitors temperature, humidity, motion, and the number of people present in the room. This data feeds an artificial intelligence model that predicts the temperature 10 minutes ahead, allowing the system to anticipate cooling needs rather than simply react.

## 🎯 Project Objectives

- **Real-time monitoring** of temperature, humidity, motion, and room occupancy.
- **Temperature prediction** at a 10-minute horizon using a regression model trained on historical data.
- **Automated AC control**:
  - **AUTO mode**: decision based on threshold + AI prediction
  - **MANUAL mode**: direct control by administrator
- **Web dashboard** accessible to all users (administrators, teachers, students) to view real-time data and consult historical statistics.
- **Internal communication** between users via an integrated chat system.

## 🧱 System Architecture

### Hardware Components

| Component | Role |
|-----------|------|
| ESP32 | Main microcontroller |
| BME280 | Temperature and humidity (I²C) |
| PIR | Motion detection |
| RFID-RC522 | People counting |
| Relay | AC control |

### Backend (Flask)
- Receives sensor data via `POST /data`
- Predicts temperature using SGDRegressor model
- Manages user sessions (authentication)
- Synchronizes with Firebase

### Database (Firebase Realtime Database)
- `users/` – user profiles, roles, unread message counters
- `sensors/` – history and latest sensor readings
- `chats/` – messages and conversations
- `devices/` – AC state (ON/OFF, AUTO/MANUAL)
- `config/` – temperature threshold, app name

### Frontend (HTML/CSS/JS)
- Real-time dashboard
- Historical statistics (date picker, 2-hour summaries)
- Private chat between users
- User profile (edit name, email, password)
- Admin panel (AC control, CSV export, user management)
- Admin conversation viewer
- Blueprints page (technical documentation, PDF download)
- 8 visual themes + instant EN/FR translation

## 📦 Installation & Deployment

### 1. Prerequisites

- Python 3.9 or higher
- Firebase account (free tier)
- Arduino IDE (for ESP32)
- VS Code or any text editor

### 2. Backend (Flask)

bash
 Clone the repository
git clone https://github.com/your-username/smart-classroom.git
cd smart-classroom

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install flask firebase-admin scikit-learn pandas numpy joblib flask-cors


3. Firebase Configuration :

Create a project at Firebase Console ;  
Enable Realtime Database and Authentication (Email/Password) ;
Go to Project Settings → Service Accounts ;
Click Generate New Private Key ;
Download the JSON file and rename it to service-account-key.json ;
Place this file in the project root directory ;


4. Start Flask server :
   python app.py

5. Update Arduino code :
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";

   const char* serverName = "http://192.168.X.X:5000/data";
   const char* acUrl = "http://192.168.X.X:5000/ac-command";

6. Testing without Hardware :
   python simulate_sensors.py
