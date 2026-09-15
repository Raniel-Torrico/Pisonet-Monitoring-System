import { useState } from "react";
import { confirmAction, confirmDanger } from "./confirmDialog";
import { refreshSpecs, archiveMachine, deleteMachine } from "./api";

// Row helper for consistent styling
function DetailRow({ label, value }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      padding: "8px 0", borderBottom: "1px solid #f3f4f6",
      fontSize: 13,
    }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#111827" }}>{value || "—"}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#9ca3af",
        letterSpacing: 0.5, textTransform: "uppercase",
        marginBottom: 6,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function MachineDetailsModal({ machine, onClose, onArchived }) {
  const [refreshing, setRefreshing]       = useState(false);
  const [refreshMsg, setRefreshMsg]       = useState("");
  const [processing, setProcessing]       = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg("");
    try {
      await refreshSpecs(machine.name);
      setRefreshMsg("✓ Refresh requested — specs will update in a few seconds");
    } catch {
      setRefreshMsg("✗ Failed to request refresh");
    } finally {
      setRefreshing(false);
    }
  };

const handleArchive = async () => {
  const result = await confirmAction({
    title: `Archive ${machine.name}?`,
    text: 'This will hide the machine from your dashboard. You can restore it anytime from the Archived tab.',
    confirmText: 'Yes, archive it',
    icon: 'question',
  });

  if (!result.isConfirmed) return;

  setProcessing(true);
  try {
    await archiveMachine(machine.name);
    onArchived?.();
    onClose();
  } catch {
    setRefreshMsg("✗ Failed to archive machine");
  } finally {
    setProcessing(false);
  }
};

const handleDelete = async () => {
  const result = await confirmDanger({
    title: `Delete ${machine.name}?`,
    text: 'This will permanently remove this machine and all its session history, alerts, and logs. This cannot be undone.',
    confirmText: 'Yes, delete permanently',
  });

  if (!result.isConfirmed) return;

  setProcessing(true);
  try {
    await deleteMachine(machine.name);
    onArchived?.();
    onClose();
  } catch {
    setRefreshMsg("✗ Failed to delete machine");
    setProcessing(false);
  }
};

  const specsAge = machine.specs_updated_at
    ? new Date(machine.specs_updated_at.replace(" ", "T") + "Z").toLocaleString('en-PH', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-box"
        style={{ maxWidth: 440 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="modal-title">🖥 {machine.name}</div>
            <div className="modal-subtitle">
              {specsAge ? `Specs last updated ${specsAge}` : "Specs not yet collected"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", fontSize: 18,
              color: "#9ca3af", cursor: "pointer", padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 16, maxHeight: 400, overflowY: "auto" }}>

          <Section title="Network">
            <DetailRow label="MAC Address" value={machine.mac} />
            <DetailRow label="IP Address"  value={machine.ip_address} />
          </Section>

          <Section title="Hardware">
            <DetailRow label="System Model" value={machine.system_model} />
            <DetailRow label="CPU"          value={machine.cpu_model} />
            <DetailRow label="CPU Cores"    value={machine.cpu_cores} />
            <DetailRow label="Total RAM"    value={machine.total_ram ? `${machine.total_ram} GB` : null} />
            <DetailRow label="Total Disk"   value={machine.total_disk ? `${machine.total_disk} GB` : null} />
            <DetailRow label="Free Disk"    value={machine.free_disk ? `${machine.free_disk} GB` : null} />
          </Section>

          <Section title="System">
            <DetailRow label="OS"              value={machine.os} />
            <DetailRow label="Windows User"    value={machine.win_user} />
            <DetailRow label="Client Version"  value={machine.client_version} />
            <DetailRow label="Registered Since" value={
              machine.created_at
                ? new Date(machine.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                : null
            } />
          </Section>

        </div>

        {refreshMsg && (
          <div style={{
            fontSize: 12, marginTop: 8, marginBottom: 8,
            color: refreshMsg.startsWith("✓") ? "#166534" : "#991b1b",
          }}>
            {refreshMsg}
          </div>
        )}

        <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 12, paddingTop: 12 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#9ca3af",
            letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8,
          }}>
            Danger Zone
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleArchive}
              disabled={processing}
              style={{
                flex: 1, fontSize: 12, fontWeight: 600, padding: "8px 0",
                borderRadius: 8, border: "1px solid #fcd34d", background: "#fffbeb",
                color: "#92400e", cursor: "pointer",
              }}
            >
              📦 Archive
            </button>
            <button
  onClick={handleDelete}
  disabled={processing}
  style={{
    flex: 1, fontSize: 12, fontWeight: 600, padding: "8px 0",
    borderRadius: 8, border: "1px solid #fecaca",
    background: "#fef2f2", color: "#991b1b", cursor: "pointer",
  }}
>
  🗑 Delete Permanently
</button>
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-cancel-btn" onClick={onClose}>Close</button>
          <button
            className="settings-btn primary"
            onClick={handleRefresh}
            disabled={refreshing || machine.status === "offline"}
            title={machine.status === "offline" ? "Machine must be online to refresh" : ""}
          >
            {refreshing ? "Requesting…" : "↺ Refresh Specs"}
          </button>
        </div>
      </div>
    </div>
  );
}