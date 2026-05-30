# 🚀 HEALTH-SPHERE AI PROJECT - COMPLETE RUN COMMANDS

## 📋 STEP 1: BACKEND SERVER (Terminal 1)

```cmd
# Navigate to backend directory
cd c:\Users\iiii\Music\MainAdminTest\MainAdminTest\backend

# Create virtual environment (first time only)
python -m venv .venv

# Activate virtual environment
.venv\Scripts\activate

# Install dependencies (first time only)
pip install -r requirements.txt

# Set Gemini API key (replace with your actual key)
set GEMINI_API_KEY=your_gemini_api_key_here

# Start backend server
python app.py
```

**Expected Output:**
```
Backend running on http://localhost:8001
```

## 📱 STEP 2: FRONTEND SERVER (Terminal 2)

```cmd
# Navigate to frontend directory
cd c:\Users\iiii\Music\MainAdminTest\MainAdminTest\frontend

# Install dependencies (first time only)
npm install

# Start frontend development server
npm run dev
```

**Expected Output:**
```
Local:   http://localhost:5174/
Network: http://192.168.x.x:5174/
```

## 🔧 STEP 3: TEST THE SYSTEM

1. **Open Browser:** http://localhost:5174
2. **Login with Doctor credentials**
3. **Click "Show Debug"** to test database and AI
4. **Select test patient** or wait for auto-creation
5. **Click "Generate AI Summary"**

## 🛠️ TROUBLESHOOTING COMMANDS

### Check Backend Health
```cmd
curl http://localhost:8001/test
```

### Check AI Endpoint
```cmd
curl http://localhost:8001/ai/test
```

### Test AI Summary
```cmd
curl -X POST http://localhost:8001/ai/patient-summary ^
  -H "Content-Type: application/json" ^
  -d "{\"patient_id\":\"test\",\"notes\":[\"Patient has cough and fever\"]}"
```

### Check Frontend Connection
```cmd
curl http://localhost:5174
```

## 📁 FILE LOCATIONS

- **Backend:** `c:\Users\iiii\Music\MainAdminTest\MainAdminTest\backend\app.py`
- **Frontend:** `c:\Users\iiii\Music\MainAdminTest\MainAdminTest\frontend\src\`
- **Disease Model:** `c:\Users\iiii\Music\MainAdminTest\MainAdminTest\backend\models\custom_ai\linear_svc_disease_model.joblib`
- **Firebase Config:** `c:\Users\iiii\Music\MainAdminTest\MainAdminTest\frontend\src\firebase\firebase.ts`

## 🔑 REQUIRED API KEYS

1. **Gemini API Key:** Set as environment variable
2. **Firebase Config:** Already configured in `firebase.ts`

## 📊 SYSTEM PORTS

- **Backend API:** http://localhost:8001
- **Frontend Web:** http://localhost:5174
- **Database:** Firebase (cloud)

## 🎯 QUICK START (Copy & Paste)

### Terminal 1 - Backend:
```cmd
cd c:\Users\iiii\Music\MainAdminTest\MainAdminTest\backend && .venv\Scripts\activate && set GEMINI_API_KEY=your_key_here && python app.py
```

### Terminal 2 - Frontend:
```cmd
cd c:\Users\iiii\Music\MainAdminTest\MainAdminTest\frontend && npm run dev
```

## ✅ SUCCESS INDICATORS

- Backend shows: `Backend running on http://localhost:8001`
- Frontend shows: `Local: http://localhost:5174/`
- Debug tools show: "Database connected" and "AI working"
- AI Summary generates: Comprehensive medical report

## 🐛 COMMON ISSUES

1. **Port 8001 in use:** Change backend port or kill process
2. **Gemini API error:** Check API key validity
3. **Firebase connection:** Verify internet connection
4. **Frontend errors:** Run `npm install` again
5. **Disease model issues:** Run `POST /ai/disease-model/retrain` after replacing the cleaned CSV
