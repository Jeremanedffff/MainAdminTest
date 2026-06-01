import { useState, useEffect } from "react";
import { apiUrl } from "../../utils/api";

interface Symptom {
  name: string;
  selected: boolean;
}

interface Prediction {
  disease: string;
  confidence: number;
  explanation: string;
}

interface PredictionResult {
  predictions: Prediction[];
  error?: string;
  input_data: {
    symptoms: string[];
    vital_signs?: Record<string, number>;
    risk_factors?: string[];
    demographics?: Record<string, any>;
  };
}

export default function DiseasePredictor() {
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [vitalSigns, setVitalSigns] = useState<Record<string, number>>({});
  const [riskFactors, setRiskFactors] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [diseaseDetails, setDiseaseDetails] = useState<any>(null);
  const [selectedDisease, setSelectedDisease] = useState<string>("");

  useEffect(() => {
    loadAvailableSymptoms();
  }, []);

  const loadAvailableSymptoms = async () => {
    try {
      const response = await fetch(apiUrl("/medical/symptoms"));
      const data = await response.json();
      if (data.symptoms) {
        setSymptoms(data.symptoms.map((sym: string) => ({ name: sym, selected: false })));
      }
    } catch (err) {
      console.error("Failed to load symptoms:", err);
      // Fallback symptoms if API fails
      setSymptoms([
        "fever", "cough", "shortness_of_breath", "chest_pain", "headache",
        "fatigue", "nausea", "vomiting", "diarrhea", "abdominal_pain",
        "sore_throat", "runny_nose", "congestion", "body_aches", "chills",
        "dizziness", "rash", "swelling", "joint_pain", "back_pain"
      ].map(sym => ({ name: sym, selected: false })));
    }
  };

  const toggleSymptom = (symptomName: string) => {
    setSymptoms(prev => 
      prev.map(sym => 
        sym.name === symptomName ? { ...sym, selected: !sym.selected } : sym
      )
    );
    
    setSelectedSymptoms(prev => {
      if (prev.includes(symptomName)) {
        return prev.filter(s => s !== symptomName);
      } else {
        return [...prev, symptomName];
      }
    });
  };

  const handleVitalSignChange = (vital: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setVitalSigns(prev => ({ ...prev, [vital]: numValue }));
    }
  };

  const predictDiseases = async () => {
    if (selectedSymptoms.length === 0) {
      setError("Please select at least one symptom");
      return;
    }

    setLoading(true);
    setError("");
    setPredictions([]);
    setDiseaseDetails(null);

    try {
      const requestData: any = {
        symptoms: selectedSymptoms,
        vital_signs: Object.keys(vitalSigns).length > 0 ? vitalSigns : undefined,
        risk_factors: riskFactors ? riskFactors.split(",").map(f => f.trim()) : undefined,
        demographics: (age || gender) ? {
          ...(age && { age: parseInt(age) }),
          ...(gender && { gender })
        } : undefined
      };

      const response = await fetch(apiUrl("/medical/predict-disease"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const data: PredictionResult = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setPredictions(data.predictions || []);
      }
    } catch (err) {
      setError("Failed to predict diseases. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getDiseaseInfo = async (disease: string) => {
    setSelectedDisease(disease);
    setLoading(true);
    
    try {
      const response = await fetch(apiUrl("/medical/disease-info"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ disease }),
      });

      const data = await response.json();
      setDiseaseDetails(data);
    } catch (err) {
      console.error("Failed to get disease info:", err);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "#22c55e";
    if (confidence >= 0.6) return "#eab308";
    if (confidence >= 0.4) return "#f97316";
    return "#ef4444";
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "28px", fontWeight: "bold", marginBottom: "24px", color: "#1f2937" }}>
        AI Disease Prediction System
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Input Section */}
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px", color: "#374151" }}>
            Patient Information
          </h2>

          {/* Symptoms Selection */}
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "#4b5563" }}>
              Symptoms (Select all that apply)
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", maxHeight: "200px", overflowY: "auto", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
              {symptoms.map((symptom) => (
                <label key={symptom.name} style={{ display: "flex", alignItems: "center", cursor: "pointer", padding: "4px" }}>
                  <input
                    type="checkbox"
                    checked={symptom.selected}
                    onChange={() => toggleSymptom(symptom.name)}
                    style={{ marginRight: "8px" }}
                  />
                  <span style={{ fontSize: "14px", color: symptom.selected ? "#059669" : "#374151" }}>
                    {symptom.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Vital Signs */}
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "#4b5563" }}>
              Vital Signs (Optional)
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
                  Temperature (°C)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="36.5"
                  onChange={(e) => handleVitalSignChange("temperature_c", e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
                  Heart Rate (bpm)
                </label>
                <input
                  type="number"
                  placeholder="72"
                  onChange={(e) => handleVitalSignChange("heart_rate", e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
                  Blood Pressure Systolic
                </label>
                <input
                  type="number"
                  placeholder="120"
                  onChange={(e) => handleVitalSignChange("sbp", e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
                  SpO2 (%)
                </label>
                <input
                  type="number"
                  placeholder="98"
                  onChange={(e) => handleVitalSignChange("spo2", e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                />
              </div>
            </div>
          </div>

          {/* Demographics */}
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "#4b5563" }}>
              Demographics (Optional)
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
                  Age
                </label>
                <input
                  type="number"
                  placeholder="45"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
                  Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Risk Factors */}
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "#4b5563" }}>
              Risk Factors (Optional, comma-separated)
            </h3>
            <input
              type="text"
              placeholder="smoking, obesity, diabetes"
              value={riskFactors}
              onChange={(e) => setRiskFactors(e.target.value)}
              style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px" }}
            />
          </div>

          <button
            onClick={predictDiseases}
            disabled={loading || selectedSymptoms.length === 0}
            style={{
              width: "100%",
              padding: "12px",
              background: loading || selectedSymptoms.length === 0 ? "#9ca3af" : "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: loading || selectedSymptoms.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Analyzing..." : "Predict Diseases"}
          </button>

          {error && (
            <div style={{ marginTop: "12px", padding: "12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", color: "#dc2626" }}>
              {error}
            </div>
          )}
        </div>

        {/* Results Section */}
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px", color: "#374151" }}>
            Disease Predictions
          </h2>

          {predictions.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
              Select symptoms and click "Predict Diseases" to see results
            </div>
          )}

          {loading && (
            <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
              Analyzing symptoms with AI...
            </div>
          )}

          {predictions.length > 0 && (
            <div>
              {predictions.map((prediction, index) => (
                <div
                  key={index}
                  style={{
                    padding: "16px",
                    marginBottom: "12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    background: selectedDisease === prediction.disease ? "#f0f9ff" : "white"
                  }}
                  onClick={() => getDiseaseInfo(prediction.disease)}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)"}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#1f2937", margin: 0 }}>
                      {prediction.disease.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                    </h3>
                    <div
                      style={{
                        padding: "4px 8px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "600",
                        background: getConfidenceColor(prediction.confidence),
                        color: "white"
                      }}
                    >
                      {(prediction.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                  <p style={{ fontSize: "14px", color: "#6b7280", margin: 0, lineHeight: "1.4" }}>
                    {prediction.explanation}
                  </p>
                </div>
              ))}
            </div>
          )}

          {diseaseDetails && (
            <div style={{ marginTop: "20px", padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "#1f2937" }}>
                {selectedDisease.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} - Details
              </h3>
              
              {diseaseDetails.symptoms && diseaseDetails.symptoms.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <strong style={{ fontSize: "14px", color: "#374151" }}>Common Symptoms:</strong>
                  <div style={{ marginTop: "4px" }}>
                    {diseaseDetails.symptoms.map((sym: string, idx: number) => (
                      <span key={idx} style={{ 
                        display: "inline-block", 
                        padding: "2px 8px", 
                        margin: "2px", 
                        background: "#e0e7ff", 
                        borderRadius: "12px", 
                        fontSize: "12px", 
                        color: "#3730a3" 
                      }}>
                        {sym.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {diseaseDetails.risk_factors && diseaseDetails.risk_factors.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <strong style={{ fontSize: "14px", color: "#374151" }}>Risk Factors:</strong>
                  <div style={{ marginTop: "4px" }}>
                    {diseaseDetails.risk_factors.map((factor: string, idx: number) => (
                      <span key={idx} style={{ 
                        display: "inline-block", 
                        padding: "2px 8px", 
                        margin: "2px", 
                        background: "#fef3c7", 
                        borderRadius: "12px", 
                        fontSize: "12px", 
                        color: "#92400e" 
                      }}>
                        {factor.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {diseaseDetails.explanation && (
                <div>
                  <strong style={{ fontSize: "14px", color: "#374151" }}>Explanation:</strong>
                  <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px", lineHeight: "1.4" }}>
                    {diseaseDetails.explanation}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: "24px", padding: "16px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "8px" }}>
        <p style={{ margin: 0, fontSize: "14px", color: "#92400e" }}>
          <strong>⚠️ Medical Disclaimer:</strong> This AI-powered disease prediction system is for educational purposes only and should not be used as a substitute for professional medical advice, diagnosis, or treatment. Always consult with qualified healthcare providers for medical concerns.
        </p>
      </div>
    </div>
  );
}
