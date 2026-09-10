import React, { useEffect, useMemo, useState, useCallback } from "react";
import api, { API_BASE } from "../api";
import { useToast } from "../context/ToastContext.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import FormRenderer from "../components/FormRenderer.jsx";
import PrintPreview from "../components/PrintPreview.jsx";
import { toIndianDate } from "../utils/date.js";
import {
  buildLocationSuffix,
  appendLocationSuffix,
  removeLocationSuffix,
} from "../utils/pincode.js";

const PAGE_SIZES = [10, 30, 50, 100, 500, 1000, 2000, 10000];

export default function Orders() {
  const toast = useToast();
  const [config, setConfig] = useState(undefined); // undefined = loading, null = not set
  const [forms, setForms] = useState([]);
  const [dropdowns, setDropdowns] = useState([]);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ slug: null, dir: "asc" });
  const [loadingRows, setLoadingRows] = useState(false);

  const [visibleCols, setVisibleCols] = useState(null); // null = all visible
  const [showColPicker, setShowColPicker] = useState(false);
  const [openFilterCol, setOpenFilterCol] = useState(null);
  const [filterValues, setFilterValues] = useState([]);
  const [filterSearch, setFilterSearch] = useState("");

  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null); // null | 'new' | order object
  const [formValues, setFormValues] = useState({});
  const [showImport, setShowImport] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkField, setBulkField] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [showPrint, setShowPrint] = useState(false);
  const [confirm, setConfirm] = useState(null);

  // PIN code auto-fill (optional feature — hidden entirely if not configured in Settings)
  // PIN code auto-fill (optional feature — hidden entirely if not configured in Settings).
  // Fetched District/State is APPENDED to a single configured Address field, never split into
  // separate fields — appendedSuffix tracks exactly what we last appended, so re-fetching
  // (PIN changed) or unticking the box can cleanly remove just that text, nothing else.
  const [pincodeConfig, setPincodeConfig] = useState(null);
  const [autoFillEnabled, setAutoFillEnabled] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [appendedSuffix, setAppendedSuffix] = useState("");

  useEffect(() => {
    // Fetch is best-effort: if the feature hasn't been set up (table missing / not configured
    // yet), this silently fails and the checkbox in FormRenderer simply never appears.
    api
      .get("/pincode/config")
      .then((res) => setPincodeConfig(res.data))
      .catch(() => setPincodeConfig(null));
  }, []);

  function toggleOrderAutoFill(checked) {
    setAutoFillEnabled(checked);
    if (!checked && pincodeConfig?.order_address_field_slug) {
      const addressSlug = pincodeConfig.order_address_field_slug;
      setFormValues((f) => ({
        ...f,
        [addressSlug]: removeLocationSuffix(f[addressSlug], appendedSuffix),
      }));
      setAppendedSuffix("");
    }
  }

  useEffect(() => {
    if (
      !autoFillEnabled ||
      !pincodeConfig?.order_pincode_field_slug ||
      !pincodeConfig?.order_address_field_slug
    )
      return;
    const pin = formValues[pincodeConfig.order_pincode_field_slug];
    if (!pin || String(pin).length !== 6) return;
    let cancelled = false;
    setAutoFillLoading(true);
    api
      .get(`/pincode/lookup/${pin}`)
      .then((res) => {
        if (cancelled) return;
        const addressSlug = pincodeConfig.order_address_field_slug;
        const suffix = buildLocationSuffix(res.data.district, res.data.state);
        setFormValues((f) => {
          const base = removeLocationSuffix(f[addressSlug], appendedSuffix);
          return { ...f, [addressSlug]: appendLocationSuffix(base, suffix) };
        });
        setAppendedSuffix(suffix);
      })
      .catch((err) => {
        if (!cancelled)
          toast.error(
            err.response?.data?.error || "Could not fetch district/state.",
          );
      })
      .finally(() => {
        if (!cancelled) setAutoFillLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoFillEnabled,
    pincodeConfig,
    formValues[pincodeConfig?.order_pincode_field_slug],
  ]);

  const fieldsWithOptions = useMemo(() => {
    if (!config?.fields) return [];
    return config.fields.map((f) => ({
      ...f,
      options:
        f.type === "dropdown"
          ? dropdowns.find((d) => d.id === f.dropdown_id)?.options || []
          : undefined,
    }));
  }, [config, dropdowns]);

  const columns = visibleCols
    ? fieldsWithOptions.filter((f) => visibleCols.includes(f.slug))
    : fieldsWithOptions;

  async function loadConfig() {
    const [cfg, f, d] = await Promise.all([
      api.get("/orders/config"),
      api.get("/forms"),
      api.get("/dropdowns"),
    ]);
    setConfig(cfg.data.formId ? cfg.data : null);
    setForms(f.data);
    setDropdowns(d.data);
  }
  useEffect(() => {
    loadConfig();
  }, []);

  const loadRows = useCallback(async () => {
    if (!config?.formId) return;
    setLoadingRows(true);
    try {
      const res = await api.get("/orders", {
        params: {
          formId: config.formId,
          page,
          pageSize,
          search,
          sort: sort.slug,
          dir: sort.dir,
          filters: JSON.stringify(filters),
        },
      });
      setRows(res.data.rows);
      setTotal(res.data.total);
    } finally {
      setLoadingRows(false);
    }
  }, [config, page, pageSize, search, sort, filters]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  async function chooseForm(formId) {
    await api.put("/orders/config", { formId });
    toast.success("Orders form set successfully.");
    loadConfig();
  }

  function openAdd() {
    setEditing("new");
    setFormValues({});
    setAutoFillEnabled(false);
    setAppendedSuffix("");
  }
  function openEdit(order) {
    setEditing(order);
    setFormValues(order.data);
    setAutoFillEnabled(false);
    setAppendedSuffix("");
  }

  async function saveOrder(andAddMore) {
    try {
      if (editing === "new") {
        await api.post("/orders", { formId: config.formId, data: formValues });
      } else {
        await api.put(`/orders/${editing.id}`, { data: formValues });
      }
      toast.success("Order saved successfully.");
      if (andAddMore) {
        setFormValues({});
      } else {
        setEditing(null);
      }
      loadRows();
    } catch (err) {
      toast.error(err.response?.data?.error || "Save failed.");
    }
  }

  function confirmDeleteOne(order) {
    setConfirm({
      title: "Delete this order?",
      danger: true,
      confirmLabel: "Delete Order",
      onConfirm: async () => {
        setConfirm(null);
        await api.delete(`/orders/${order.id}`);
        toast.success("Order deleted successfully.");
        loadRows();
      },
    });
  }

  function confirmBulkDelete() {
    setConfirm({
      title: `Delete ${selected.size} selected order(s)?`,
      danger: true,
      confirmLabel: "Delete Selected",
      onConfirm: async () => {
        setConfirm(null);
        await api.post("/orders/bulk-delete", { ids: [...selected] });
        toast.success("Selected orders deleted successfully.");
        setSelected(new Set());
        loadRows();
      },
    });
  }

  async function runBulkUpdate() {
    if (!bulkField) return toast.error("Choose a field to update.");
    setConfirm({
      title: `Update ${selected.size} order(s)?`,
      message: `Field "${fieldsWithOptions.find((f) => f.slug === bulkField)?.name}" will be set to "${bulkValue}" on all selected orders.`,
      confirmLabel: "Apply Update",
      onConfirm: async () => {
        await api.post("/orders/bulk-update", {
          ids: [...selected],
          updates: { [bulkField]: bulkValue },
        });
        toast.success("Selected orders updated successfully.");
        setConfirm(null);
        setShowBulkUpdate(false);
        setBulkField("");
        setBulkValue("");
        setSelected(new Set());
        loadRows();
      },
    });
  }

  function toggleSelect(id) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleSelectAllOnPage() {
    setSelected((s) => {
      const n = new Set(s);
      const allSelected = rows.every((r) => n.has(r.id));
      rows.forEach((r) => (allSelected ? n.delete(r.id) : n.add(r.id)));
      return n;
    });
  }

  async function openFilter(slug) {
    setOpenFilterCol(slug);
    setFilterSearch("");
    const res = await api.get("/orders/filter-values", {
      params: { formId: config.formId, slug },
    });
    setFilterValues(res.data);
  }
  function applyFilter(slug, value, checked) {
    setFilters((f) => {
      const current = new Set(f[slug] || []);
      checked ? current.add(value) : current.delete(value);
      const next = { ...f };
      if (current.size === 0) delete next[slug];
      else next[slug] = [...current];
      return next;
    });
    setPage(1);
  }
  function clearFilter(slug) {
    setFilters((f) => {
      const n = { ...f };
      delete n[slug];
      return n;
    });
    setOpenFilterCol(null);
    setPage(1);
  }

  function exportUrl(selectedOnly) {
    const params = new URLSearchParams({ formId: config.formId });
    if (selectedOnly) params.set("ids", [...selected].join(","));
    return `${API_BASE}/api/orders/export/run?${params.toString()}`;
  }

  async function doImport(file) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("formId", config.formId);
    try {
      const res = await api.post("/orders/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(
        `Import complete — ${res.data.inserted} added, ${res.data.updated} updated, ${res.data.skipped} skipped.`,
      );
      setShowImport(false);
      loadRows();
    } catch (err) {
      toast.error(err.response?.data?.error || "Import failed.");
    }
  }

  if (config === undefined)
    return <div className="text-gray-400">Loading…</div>;

  if (!config) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-1">Orders</h1>
        <p className="text-sm text-gray-500 mb-5">
          Choose which Form the Orders table should be built from.
        </p>
        <div className="card p-5 max-w-md">
          {forms.length === 0 ? (
            <p className="text-sm text-gray-500">
              No forms exist yet. Create one in the Forms section first.
            </p>
          ) : (
            <ul className="space-y-2">
              {forms.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2"
                >
                  <span className="text-sm font-medium">
                    {f.name}{" "}
                    <span className="text-gray-400 font-normal">
                      ({f.fields.length} fields)
                    </span>
                  </span>
                  <button
                    className="btn-primary text-xs"
                    onClick={() => chooseForm(f.id)}
                  >
                    Use this Form
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Orders</h1>
          <p className="text-sm text-gray-500">
            Using form:{" "}
            <span className="font-medium text-gray-700">
              {config.form.name}
            </span>{" "}
            · {total} order(s)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" onClick={() => setShowImport(true)}>
            ⇪ Import
          </button>
          <a className="btn-secondary" href={exportUrl(false)}>
            ⇩ Export All
          </a>
          {selected.size > 0 && (
            <a className="btn-secondary" href={exportUrl(true)}>
              ⇩ Export Selected ({selected.size})
            </a>
          )}
          <button
            className="btn-secondary"
            onClick={() => setShowColPicker(true)}
          >
            ▤ Columns
          </button>
          {selected.size > 0 && (
            <button
              className="btn-secondary"
              onClick={() => setShowPrint(true)}
            >
              🖨️ Print ({selected.size})
            </button>
          )}
          <button className="btn-primary" onClick={openAdd}>
            + Add Order
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <input
          className="input max-w-xs"
          placeholder="Search all columns…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {selected.size > 0 && (
          <div className="flex gap-2">
            <span className="text-sm text-gray-500 self-center">
              {selected.size} selected
            </span>
            <button
              className="btn-secondary text-xs"
              onClick={() => setShowBulkUpdate(true)}
            >
              Bulk Update
            </button>
            <button className="btn-danger text-xs" onClick={confirmBulkDelete}>
              Bulk Delete
            </button>
            <button
              className="btn-ghost text-xs"
              onClick={() => setSelected(new Set())}
            >
              ✕ Clear Selection
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-max">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={
                    rows.length > 0 && rows.every((r) => selected.has(r.id))
                  }
                  onChange={toggleSelectAllOnPage}
                />
              </th>
              {columns.map((f) => (
                <th
                  key={f.slug}
                  className="px-3 py-3 text-left relative whitespace-nowrap max-w-[220px]"
                >
                  <button
                    className="flex items-center gap-1 hover:text-gray-800"
                    onClick={() =>
                      setSort((s) => ({
                        slug: f.slug,
                        dir:
                          s.slug === f.slug && s.dir === "asc" ? "desc" : "asc",
                      }))
                    }
                  >
                    {f.name}{" "}
                    {sort.slug === f.slug
                      ? sort.dir === "asc"
                        ? "▲"
                        : "▼"
                      : ""}
                  </button>
                  <button
                    className="ml-1 text-gray-400 hover:text-brand-600"
                    onClick={() => openFilter(f.slug)}
                  >
                    ▾
                  </button>
                  {filters[f.slug]?.length > 0 && (
                    <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-brand-500" />
                  )}
                  {openFilterCol === f.slug && (
                    <div className="absolute z-20 top-full left-0 mt-1 w-56 card p-2 normal-case font-normal text-gray-700">
                      <input
                        className="input mb-2 text-xs"
                        placeholder="Search values…"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                      />
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {filterValues
                          .filter((v) =>
                            v
                              .toLowerCase()
                              .includes(filterSearch.toLowerCase()),
                          )
                          .map((v) => (
                            <label
                              key={v}
                              className="flex items-center gap-2 text-xs"
                            >
                              <input
                                type="checkbox"
                                checked={(filters[f.slug] || []).includes(v)}
                                onChange={(e) =>
                                  applyFilter(f.slug, v, e.target.checked)
                                }
                              />
                              {v}
                            </label>
                          ))}
                        {filterValues.length === 0 && (
                          <div className="text-xs text-gray-400">
                            No values yet.
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between mt-2">
                        <button
                          className="text-xs text-red-500"
                          onClick={() => clearFilter(f.slug)}
                        >
                          Clear Filter
                        </button>
                        <button
                          className="text-xs text-brand-600"
                          onClick={() => setOpenFilterCol(null)}
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              ))}
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                  />
                </td>
                {columns.map((f) => (
                  <td
                    key={f.slug}
                    className="px-3 py-2.5 max-w-[220px] truncate"
                    title={
                      f.type === "date"
                        ? toIndianDate(r.data[f.slug])
                        : String(r.data[f.slug] ?? "")
                    }
                    
                  >
                    {f.type === "date"
                      ? toIndianDate(r.data[f.slug])
                      : String(r.data[f.slug] ?? "")}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right space-x-2">
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => openEdit(r)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-ghost text-xs text-red-600"
                    onClick={() => confirmDeleteOne(r)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loadingRows && (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="px-4 py-10 text-center text-gray-400"
                >
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          Rows per page:
          <select
            className="input !w-auto"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span className="text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            className="btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {/* Add / Edit order overlay */}
      {editing && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold mb-3">
              {editing === "new" ? "Add Order" : "Edit Order"}
            </h3>
            <FormRenderer
              fields={fieldsWithOptions}
              values={formValues}
              onChange={(slug, v) =>
                setFormValues((f) => ({ ...f, [slug]: v }))
              }
              pincodeAutoFill={
                pincodeConfig?.order_pincode_field_slug &&
                pincodeConfig?.order_address_field_slug
                  ? {
                      config: {
                        pincodeFieldSlug:
                          pincodeConfig.order_pincode_field_slug,
                        addressFieldSlug:
                          pincodeConfig.order_address_field_slug,
                      },
                      enabled: autoFillEnabled,
                      onToggle: toggleOrderAutoFill,
                      loading: autoFillLoading,
                    }
                  : undefined
              }
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                className="btn-secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              {editing === "new" && (
                <button
                  className="btn-secondary"
                  onClick={() => saveOrder(true)}
                >
                  Save and Add More
                </button>
              )}
              <button className="btn-primary" onClick={() => saveOrder(false)}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column picker */}
      {showColPicker && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-sm p-5">
            <h3 className="text-base font-semibold mb-3">
              Show / Hide Columns
            </h3>
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {fieldsWithOptions.map((f) => (
                <li key={f.slug}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!visibleCols || visibleCols.includes(f.slug)}
                      onChange={(e) => {
                        setVisibleCols((vc) => {
                          const base =
                            vc || fieldsWithOptions.map((x) => x.slug);
                          return e.target.checked
                            ? [...base, f.slug]
                            : base.filter((s) => s !== f.slug);
                        });
                      }}
                    />
                    {f.name}
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-between mt-4">
              <button
                className="text-xs text-brand-600"
                onClick={() => setVisibleCols(null)}
              >
                Show All
              </button>
              <button
                className="btn-primary"
                onClick={() => setShowColPicker(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import overlay */}
      {showImport && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-sm p-5">
            <h3 className="text-base font-semibold mb-3">Import Orders</h3>
            <a
              className="btn-secondary w-full justify-center mb-3"
              href={`${API_BASE}/api/orders/import-template?formId=${config.formId}`}
            >
              ⇩ Download Import Template
            </a>
            <label className="label-text">Upload Filled Excel File</label>
            <input
              type="file"
              accept=".xlsx"
              className="input"
              onChange={(e) => e.target.files[0] && doImport(e.target.files[0])}
            />
            <p className="text-xs text-gray-400 mt-2">
              Re-uploading a file with the same key values will update existing
              orders instead of duplicating them.
            </p>
            <div className="flex justify-end mt-4">
              <button
                className="btn-secondary"
                onClick={() => setShowImport(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk update overlay */}
      {showBulkUpdate && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-sm p-5">
            <h3 className="text-base font-semibold mb-3">
              Bulk Update {selected.size} Order(s)
            </h3>
            <label className="label-text">Field to Update</label>
            <select
              className="input mb-3"
              value={bulkField}
              onChange={(e) => {
                setBulkField(e.target.value);
                setBulkValue("");
              }}
            >
              <option value="">Select field…</option>
              {fieldsWithOptions.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {f.name}
                </option>
              ))}
            </select>
            {bulkField && (
              <>
                <label className="label-text">New Value</label>
                {fieldsWithOptions.find((f) => f.slug === bulkField)?.type ===
                "dropdown" ? (
                  <select
                    className="input"
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {fieldsWithOptions
                      .find((f) => f.slug === bulkField)
                      .options.map((o) => (
                        <option key={o.id} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                  </select>
                ) : fieldsWithOptions.find((f) => f.slug === bulkField)
                    ?.type === "toggle" ? (
                  <select
                    className="input"
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                  >
                    <option value="">Select…</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                ) : (
                  <input
                    className="input"
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                  />
                )}
              </>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                className="btn-secondary"
                onClick={() => setShowBulkUpdate(false)}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={runBulkUpdate}>
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrint && (
        <PrintPreview
          orderIds={[...selected]}
          fields={fieldsWithOptions}
          onClose={() => setShowPrint(false)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        {...confirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
