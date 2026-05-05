# ================================
# AI Temperature Prediction Model
# Trains on 3 datasets sequentially
# ================================

import pandas as pd
import numpy as np
import joblib

from sklearn.linear_model import SGDRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error

# -------------------------------
# DATASETS
# -------------------------------
datasets = [
    "data_batch1.csv",
    "data_batch2.csv",
    "data_batch3.csv"
]

# -------------------------------
# CREATE SCALER AND MODEL
# -------------------------------
scaler = StandardScaler()

model = SGDRegressor(
    max_iter=1000,
    learning_rate="invscaling",
    random_state=42
)

first_dataset = True

# -------------------------------
# TRAIN MODEL
# -------------------------------
for file in datasets:

    print("Loading dataset:", file)

    data = pd.read_csv(file)

    # Features (inputs)
    X = data[['temp','hum','pir','taux_occupation']]

    # Target (output)
    y = data['temp_future']

    # Normalize data
    if first_dataset:
        X_scaled = scaler.fit_transform(X)
        first_dataset = False
    else:
        X_scaled = scaler.transform(X)

    # Train model incrementally
    model.partial_fit(X_scaled, y)

    print("Finished training on", file)

print("\nTraining completed!")

# -------------------------------
# SAVE MODEL
# -------------------------------
joblib.dump(model, "temperature_model.pkl")
joblib.dump(scaler, "scaler.pkl")

print("Model saved as temperature_model.pkl")
print("Scaler saved as scaler.pkl")