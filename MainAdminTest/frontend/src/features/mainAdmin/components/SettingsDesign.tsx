import React, { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, LayoutTemplate, Palette, PanelTop, Trash2 } from "lucide-react";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type {
  AdminSettings,
  DesignDensity,
  DesignTheme,
} from "./AdminSettingsPanel";
import { storage } from "../../../firebase/firebase";

type Props = {
  settings: AdminSettings;
  onSave: (next: AdminSettings) => void;
};

const themePresets: Array<{
  name: DesignTheme;
  description: string;
  swatches: [string, string, string];
}> = [
  {
    name: "Default",
    description: "Clean blue accents for everyday admin work.",
    swatches: ["#2563eb", "#eff6ff", "#0f172a"],
  },
  {
    name: "Ocean",
    description: "A fresher teal direction with softer surfaces.",
    swatches: ["#0f766e", "#ecfeff", "#134e4a"],
  },
  {
    name: "Midnight",
    description: "Higher-contrast controls for focused operations.",
    swatches: ["#1d4ed8", "#e0e7ff", "#111827"],
  },
];

const LOGO_UPLOAD_TIMEOUT_MS = 15000;

const SettingsDesign: React.FC<Props> = ({ settings, onSave }) => {
  const [theme, setTheme] = useState<DesignTheme>(settings.design.theme);
  const [density, setDensity] = useState<DesignDensity>(settings.design.density);
  const [showSidebarLabels, setShowSidebarLabels] = useState(settings.design.showSidebarLabels);
  const [useRoundedCards, setUseRoundedCards] = useState(settings.design.useRoundedCards);
  const [showHospitalLogo, setShowHospitalLogo] = useState(settings.design.showHospitalLogo);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTheme(settings.design.theme);
    setDensity(settings.design.density);
    setShowSidebarLabels(settings.design.showSidebarLabels);
    setUseRoundedCards(settings.design.useRoundedCards);
    setShowHospitalLogo(settings.design.showHospitalLogo);
  }, [settings]);

  const saveDesign = (next: Partial<AdminSettings["design"]>) => {
    onSave({
      ...settings,
      design: {
        ...settings.design,
        ...next,
      },
    });
  };

  const clearLogoFeedback = () => {
    setLogoMessage(null);
    setLogoError(null);
  };

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number) => {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error("Upload timed out. Firebase Storage is likely blocked by CORS or Storage rules."));
        }, timeoutMs);
      }),
    ]);
  };

  const handleUploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    clearLogoFeedback();

    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLogoError("Logo image must be 5MB or smaller.");
      event.target.value = "";
      return;
    }

    setUploadingLogo(true);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "png";
      const logoPath = `branding/main-admin-logo.${safeExtension}`;
      const storageRef = ref(storage, logoPath);

      await withTimeout(
        uploadBytes(storageRef, file, {
          contentType: file.type,
          cacheControl: "public,max-age=3600",
        }),
        LOGO_UPLOAD_TIMEOUT_MS
      );

      const logoUrl = await withTimeout(getDownloadURL(storageRef), LOGO_UPLOAD_TIMEOUT_MS);

      await onSave({
        ...settings,
        design: {
          ...settings.design,
          showHospitalLogo: true,
          logoPath,
          logoUrl,
        },
      });

      setShowHospitalLogo(true);
      setLogoMessage("Logo uploaded and shared successfully.");
    } catch (error: any) {
      console.error("UPLOAD LOGO ERROR:", error);
      const rawMessage = error?.message || "Failed to upload logo.";
      const friendlyMessage =
        rawMessage.includes("CORS") ||
        rawMessage.includes("timed out") ||
        rawMessage.includes("Network")
          ? "Upload could not reach Firebase Storage. Check Storage CORS and Storage rules, then try again."
          : rawMessage;
      setLogoError(friendlyMessage);
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    clearLogoFeedback();
    setUploadingLogo(true);

    try {
      if (settings.design.logoPath) {
        await deleteObject(ref(storage, settings.design.logoPath));
      }

      await onSave({
        ...settings,
        design: {
          ...settings.design,
          logoPath: "",
          logoUrl: "",
        },
      });

      setLogoMessage("Shared logo removed.");
    } catch (error: any) {
      console.error("REMOVE LOGO ERROR:", error);
      setLogoError(error?.message || "Failed to remove logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <h2 style={styles.title}>Design Settings</h2>
          <p style={styles.sub}>
            Control the look and feel of the admin workspace, from theme tone to layout density.
          </p>
        </div>
        <div style={styles.previewChip}>
          <Palette size={16} />
          <span>{theme} theme preview</span>
        </div>
      </div>

      <div style={styles.grid}>
        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionIcon}>
              <Palette size={18} />
            </div>
            <div>
              <h3 style={styles.sectionTitle}>Theme</h3>
              <p style={styles.sectionSub}>Choose a visual direction for the admin interface.</p>
            </div>
          </div>

          <div style={styles.themeGrid}>
            {themePresets.map((preset) => {
              const active = theme === preset.name;

              return (
                <button
                  key={preset.name}
                  type="button"
                  style={{
                    ...styles.themeCard,
                    ...(active ? styles.themeCardActive : {}),
                  }}
                  onClick={() => {
                    setTheme(preset.name);
                    saveDesign({ theme: preset.name });
                  }}
                >
                  <div style={styles.themeSwatches}>
                    {preset.swatches.map((color) => (
                      <span key={color} style={{ ...styles.swatch, background: color }} />
                    ))}
                  </div>
                  <div style={styles.themeNameRow}>
                    <span style={styles.themeName}>{preset.name}</span>
                    {active && (
                      <span style={styles.themeSelected}>
                        <Check size={14} />
                        Selected
                      </span>
                    )}
                  </div>
                  <p style={styles.themeDescription}>{preset.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionIcon}>
              <PanelTop size={18} />
            </div>
            <div>
              <h3 style={styles.sectionTitle}>Branding</h3>
              <p style={styles.sectionSub}>Prepare the main admin surface for logo and identity controls.</p>
            </div>
          </div>

          <div style={styles.brandPreview}>
            {settings.design.logoUrl ? (
              <img
                src={settings.design.logoUrl}
                alt="Hospital logo"
                style={styles.logoImage}
              />
            ) : (
              <div style={styles.logoMock}>HA</div>
            )}
            <div>
              <div style={styles.brandName}>Hospital Admin</div>
              <div style={styles.brandMeta}>Logo slot, app title, and accent pairing preview</div>
            </div>
          </div>

          <label style={styles.toggleRow}>
            <div>
              <div style={styles.toggleTitle}>Show hospital logo</div>
              <div style={styles.toggleText}>Keeps branding visible in the header and sign-in areas.</div>
            </div>
            <input
              type="checkbox"
              checked={showHospitalLogo}
              onChange={(e) => {
                setShowHospitalLogo(e.target.checked);
                saveDesign({ showHospitalLogo: e.target.checked });
              }}
            />
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={styles.hiddenInput}
            onChange={handleUploadLogo}
          />

          <div style={styles.brandingActions}>
            <button
              type="button"
              style={styles.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingLogo}
            >
              <ImagePlus size={16} />
              {uploadingLogo ? "Uploading..." : settings.design.logoUrl ? "Replace Logo" : "Upload Logo"}
            </button>

            {settings.design.logoUrl && (
              <button
                type="button"
                style={styles.removeBtn}
                onClick={handleRemoveLogo}
                disabled={uploadingLogo}
              >
                <Trash2 size={16} />
                Remove
              </button>
            )}
          </div>

          {(logoMessage || logoError) && (
            <div style={logoError ? styles.logoError : styles.logoSuccess}>
              {logoError || logoMessage}
            </div>
          )}

          <div style={styles.placeholderBox}>
            Upload a shared logo here as Super Admin and every admin dashboard will pick it up from backend storage.
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionIcon}>
              <LayoutTemplate size={18} />
            </div>
            <div>
              <h3 style={styles.sectionTitle}>Layout</h3>
              <p style={styles.sectionSub}>Adjust spacing and navigation presentation for staff workflows.</p>
            </div>
          </div>

          <div style={styles.segmented}>
            {(["Comfortable", "Compact"] as DesignDensity[]).map((option) => (
              <button
                key={option}
                type="button"
                style={{
                  ...styles.segment,
                  ...(density === option ? styles.segmentActive : {}),
                }}
                onClick={() => {
                  setDensity(option);
                  saveDesign({ density: option });
                }}
              >
                {option}
              </button>
            ))}
          </div>

          <label style={styles.toggleRow}>
            <div>
              <div style={styles.toggleTitle}>Show sidebar labels</div>
              <div style={styles.toggleText}>Helps new admins navigate the workspace faster.</div>
            </div>
            <input
              type="checkbox"
              checked={showSidebarLabels}
              onChange={(e) => {
                setShowSidebarLabels(e.target.checked);
                saveDesign({ showSidebarLabels: e.target.checked });
              }}
            />
          </label>

          <label style={styles.toggleRow}>
            <div>
              <div style={styles.toggleTitle}>Use rounded cards</div>
              <div style={styles.toggleText}>Applies a softer container style across admin panels.</div>
            </div>
            <input
              type="checkbox"
              checked={useRoundedCards}
              onChange={(e) => {
                setUseRoundedCards(e.target.checked);
                saveDesign({ useRoundedCards: e.target.checked });
              }}
            />
          </label>
        </section>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 980,
    display: "grid",
    gap: 20,
  },
  hero: {
    border: "1px solid #dbe5f0",
    borderRadius: 20,
    padding: 24,
    background: "linear-gradient(135deg, #f8fbff 0%, #eef6ff 100%)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    boxShadow: "0 16px 32px rgba(37, 99, 235, 0.08)",
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: "#0f172a",
  },
  sub: {
    margin: "8px 0 0 0",
    maxWidth: 620,
    color: "#475569",
    fontSize: 15,
    lineHeight: 1.6,
  },
  previewChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.82)",
    border: "1px solid rgba(37, 99, 235, 0.16)",
    color: "#1d4ed8",
    fontWeight: 700,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 18,
  },
  card: {
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 20,
    background: "#ffffff",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    display: "grid",
    gap: 16,
  },
  sectionHeader: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: "#eff6ff",
    color: "#2563eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: "#0f172a",
  },
  sectionSub: {
    margin: "4px 0 0 0",
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.5,
  },
  themeGrid: {
    display: "grid",
    gap: 12,
  },
  themeCard: {
    width: "100%",
    textAlign: "left",
    border: "1px solid #dbe5f0",
    borderRadius: 16,
    padding: 14,
    background: "#f8fafc",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  themeCardActive: {
    border: "1px solid #2563eb",
    background: "#eff6ff",
    boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)",
  },
  themeSwatches: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 999,
    border: "2px solid rgba(255,255,255,0.9)",
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.08)",
  },
  themeNameRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  themeName: {
    fontSize: 15,
    fontWeight: 700,
    color: "#0f172a",
  },
  themeSelected: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color: "#2563eb",
    fontSize: 12,
    fontWeight: 700,
  },
  themeDescription: {
    margin: 0,
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.5,
  },
  brandPreview: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 16,
    background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
    display: "flex",
    gap: 14,
    alignItems: "center",
  },
  logoImage: {
    width: 54,
    height: 54,
    borderRadius: 16,
    objectFit: "cover",
    background: "white",
    border: "1px solid #dbe5f0",
    flexShrink: 0,
  },
  logoMock: {
    width: 54,
    height: 54,
    borderRadius: 16,
    background: "linear-gradient(135deg, #2563eb 0%, #0f766e 100%)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    letterSpacing: 0.6,
    flexShrink: 0,
  },
  brandName: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0f172a",
  },
  brandMeta: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
  },
  placeholderBox: {
    borderRadius: 14,
    padding: 14,
    background: "#f8fafc",
    border: "1px dashed #cbd5e1",
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.5,
  },
  hiddenInput: {
    display: "none",
  },
  brandingActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  uploadBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 12,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  removeBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#b42318",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  logoSuccess: {
    background: "#ecfdf3",
    border: "1px solid #b7ebc6",
    borderRadius: 12,
    padding: "10px 12px",
    color: "#166534",
    fontSize: 13,
    fontWeight: 600,
  },
  logoError: {
    background: "#fff1f2",
    border: "1px solid #fecaca",
    borderRadius: 12,
    padding: "10px 12px",
    color: "#b42318",
    fontSize: 13,
    fontWeight: 600,
  },
  segmented: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  segment: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #dbe5f0",
    background: "#f8fafc",
    color: "#334155",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  segmentActive: {
    background: "#0f172a",
    color: "white",
    border: "1px solid #0f172a",
  },
  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: "14px 16px",
    background: "#ffffff",
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
  toggleText: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.45,
  },
};

export default SettingsDesign;
