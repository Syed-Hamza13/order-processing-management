import React, { useEffect, useState } from "react";
import api, { API_BASE } from "../api";
import { useToast } from "../context/ToastContext.jsx";

export default function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [retypePassword, setRetypePassword] = useState("");
  const [busy, setBusy] = useState(false);

  // PIN code auto-fill config — optional feature, safe to leave unconfigured.
  const [orderFields, setOrderFields] = useState([]);
  const [pincode, setPincode] = useState(null);
  const [pincodeAvailable, setPincodeAvailable] = useState(true);
  const [pincodeBusy, setPincodeBusy] = useState(false);

  async function load() {
    const res = await api.get("/settings");
    setSettings(res.data);
  }
  async function loadPincode() {
    try {
      const [cfg, p] = await Promise.all([
        api.get("/orders/config"),
        api.get("/pincode/config"),
      ]);
      setOrderFields(cfg.data.fields || []);
      setPincode(p.data);
      setPincodeAvailable(true);
    } catch (err) {
      // Table/route not set up yet — hide the section instead of breaking the page.
      setPincodeAvailable(false);
    }
  }
  useEffect(() => {
    load();
    loadPincode();
  }, []);

  async function uploadBranding(kind, file) {
    const fd = new FormData();
    fd.append("file", file);
    await api.post(`/settings/upload/${kind}`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    toast.success(
      `${kind === "logo" ? "Logo" : "Favicon"} updated successfully.`,
    );
    load();
  }

  async function changePassword(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
        retypePassword,
      });
      toast.success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setRetypePassword("");
    } catch (err) {
      toast.error(err.response?.data?.error || "Password change failed.");
    } finally {
      setBusy(false);
    }
  }

  function setPincodeField(key, value) {
    setPincode((p) => ({ ...p, [key]: value || null }));
  }

  async function savePincodeSettings() {
    setPincodeBusy(true);
    try {
      await api.put("/pincode/config", pincode);
      toast.success("PIN Code Auto-Fill settings saved successfully.");
    } catch (err) {
      toast.error(err.response?.data?.error || "Save failed.");
    } finally {
      setPincodeBusy(false);
    }
  }

  function FieldSelect({ label, value, onChange }) {
    return (
      <div>
        <label className="label-text">{label}</label>
        <select
          className="input"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— None —</option>
          {orderFields.map((f) => (
            <option key={f.id} value={f.slug}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-5">
        This is a single-user application — settings here are minimal.
      </p>

      <div className="card p-5 mb-5">
        <h2 className="text-sm font-semibold mb-3">Branding</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-text">Logo</label>
            {settings?.logo_path && (
              <img
                src={`${API_BASE}${settings.logo_path}`}
                className="h-12 mb-2 object-contain"
              />
            )}
            <input
              type="file"
              accept="image/*"
              className="input"
              onChange={(e) =>
                e.target.files[0] && uploadBranding("logo", e.target.files[0])
              }
            />
          </div>
          <div>
            <label className="label-text">Favicon</label>
            {settings?.favicon_path && (
              <img
                src={`${API_BASE}${settings.favicon_path}`}
                className="h-8 w-8 mb-2 object-contain"
              />
            )}
            <input
              type="file"
              accept="image/*"
              className="input"
              onChange={(e) =>
                e.target.files[0] &&
                uploadBranding("favicon", e.target.files[0])
              }
            />
          </div>
        </div>
      </div>

      {pincodeAvailable && pincode && (
        <div className="card p-5 mb-5">
          <h2 className="text-sm font-semibold mb-1">
            PIN Code Auto-Fill (District &amp; State)
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Configure which field holds the PIN code, and which Address field
            the fetched District/State should be appended to — for the Orders
            form and the Print Preview screen separately.
          </p>

          <div className="text-xs font-semibold text-gray-500 mb-2">
            ORDER FORM
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <FieldSelect
              label="PIN Code Field"
              value={pincode.order_pincode_field_slug}
              onChange={(v) => setPincodeField("order_pincode_field_slug", v)}
            />
            <FieldSelect
              label="Address Field (append District, State here)"
              value={pincode.order_address_field_slug}
              onChange={(v) => setPincodeField("order_address_field_slug", v)}
            />
          </div>

          <div className="text-xs font-semibold text-gray-500 mb-2">
            PRINT PREVIEW (CONSIGNMENT)
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <FieldSelect
              label="PIN Code Field"
              value={pincode.print_pincode_field_slug}
              onChange={(v) => setPincodeField("print_pincode_field_slug", v)}
            />
            <FieldSelect
              label="Address Field (append District, State here)"
              value={pincode.print_address_field_slug}
              onChange={(v) => setPincodeField("print_address_field_slug", v)}
            />
          </div>

          <button
            className="btn-primary"
            disabled={pincodeBusy}
            onClick={savePincodeSettings}
          >
            {pincodeBusy ? "Saving…" : "Save PIN Code Settings"}
          </button>
        </div>
      )}

      <form onSubmit={changePassword} className="card p-5">
        <h2 className="text-sm font-semibold mb-3">Change Password</h2>
        <div className="space-y-3">
          <div>
            <label className="label-text">Current Password</label>
            <input
              type="password"
              className="input"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label-text">New Password</label>
            <input
              type="password"
              className="input"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label-text">Retype New Password</label>
            <input
              type="password"
              className="input"
              required
              minLength={8}
              value={retypePassword}
              onChange={(e) => setRetypePassword(e.target.value)}
            />
          </div>
        </div>
        <button className="btn-primary mt-4" disabled={busy}>
          {busy ? "Updating…" : "Update Password"}
        </button>
      </form>
    </div>
  );
}
