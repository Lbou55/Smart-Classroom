"""
simulate_sensors.py
====================
Simulates ESP32 sensor data — use this when you don't have hardware.
When your real ESP32 is ready, just stop this script and plug in the hardware.
Nothing in the server or Firebase needs to change.

Usage:
    python simulate_sensors.py

Requirements:
    pip install requests
"""

import requests
import random
import time
import math

SERVER_URL = "http://localhost:5000/data"   # Change IP if Flask is on another machine

# Simulation state
people_count = 0
base_temp    = 22.0     # Starting temperature
hour_offset  = 0        # Simulates time-of-day temperature variation


def simulate_reading(t):
    """Generate realistic sensor readings that change smoothly over time."""
    global people_count

    # Temperature rises slowly, with small random noise + time-of-day curve
    time_variation = 2.0 * math.sin(t / 300)           # slow sine wave over 5 min
    noise          = random.uniform(-0.3, 0.3)
    temp           = round(base_temp + time_variation + noise, 2)

    # Humidity inversely correlated with temperature
    hum  = round(random.uniform(40, 70) - (temp - 22) * 0.5, 2)
    hum  = max(20, min(90, hum))                        # clamp 20–90%

    # PIR: more likely detected if people are present
    pir  = 1 if (people_count > 0 and random.random() > 0.2) else random.randint(0, 1)

    # People count: randomly enter/leave every ~30 seconds
    if random.random() < 0.05:                          # 5% chance each reading
        delta = random.choice([-1, 0, 0, 1, 1])
        people_count = max(0, min(30, people_count + delta))

    return {
        "temp":            temp,
        "hum":             hum,
        "pir":             pir,
        "taux_occupation": people_count
    }


def main():
    print("🚀 Smart Classroom Sensor Simulator")
    print(f"   Sending data to: {SERVER_URL}")
    print("   Press Ctrl+C to stop\n")

    t = 0
    while True:
        data = simulate_reading(t)

        try:
            response = requests.post(SERVER_URL, json=data, timeout=5)
            result   = response.json()
            ac       = result.get("ac_status", "?")
            print(
                f"[t={t:4d}s] Temp={data['temp']:.1f}°C  "
                f"Hum={data['hum']:.1f}%  "
                f"PIR={data['pir']}  "
                f"People={data['taux_occupation']}  "
                f"→ AC={ac}"
            )
        except requests.exceptions.ConnectionError:
            print("❌ Cannot connect to Flask server. Is it running?")
        except Exception as e:
            print(f"❌ Error: {e}")

        t  += 5
        time.sleep(5)   # Send every 5 seconds (same interval as ESP32)


if __name__ == "__main__":
    main()
