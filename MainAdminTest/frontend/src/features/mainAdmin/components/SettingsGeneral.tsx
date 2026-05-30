import React from "react";
import AdminSettingsPanel, { type AdminSettings } from "./AdminSettingsPanel";

type Props = {
  settings: AdminSettings;
  onSave: (s: AdminSettings) => void;
};

const SettingsGeneral: React.FC<Props> = ({ settings, onSave }) => {
  return (
    <div style={styles.wrap}>
      <AdminSettingsPanel settings={settings} onSave={onSave} />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 760 },
};

export default SettingsGeneral;