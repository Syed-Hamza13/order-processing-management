import React, { useEffect, useRef, useState } from "react";
import { fabric } from "fabric";
import api from "../api";
import { useToast } from "../context/ToastContext.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { getCanvasDimensions, PAGE_SIZE_OPTIONS } from "../utils/pageSizes.js";

export default function TemplateEditor() {
  const toast = useToast();
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const cropTargetRef = useRef(null);
  const clipboardRef = useRef(null);

  const [templates, setTemplates] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [name, setName] = useState("Untitled Template");
  const [pageSize, setPageSize] = useState("A5");
  const [orientation, setOrientation] = useState("landscape");
  const [orderFields, setOrderFields] = useState([]);
  const [assets, setAssets] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [selectedObj, setSelectedObj] = useState(null);
  const [selectedLayoutId, setSelectedLayoutId] = useState(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [croppingActive, setCroppingActive] = useState(false);
  const [fontSizeValue, setFontSizeValue] = useState(16);
  const [strokeWidthValue, setStrokeWidthValue] = useState(1);

  // Keep the Font Size / Border Width number inputs in sync with whichever object is
  // currently selected, so switching selection always shows that object's real value
  // instead of a stale one left over from whatever was selected before.
  useEffect(() => {
    if (selectedObj?.fontSize !== undefined)
      setFontSizeValue(selectedObj.fontSize);
    if (selectedObj?.strokeWidth !== undefined)
      setStrokeWidthValue(selectedObj.strokeWidth);
  }, [selectedObj]);

  // ---- init canvas once ----
  useEffect(() => {
    const canvas = new fabric.Canvas(canvasElRef.current, {
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
    });
    canvas.perPixelTargetFind = true;
    fabricRef.current = canvas;
    const updateSelection = () => {
      const active = canvas.getActiveObject();
      setSelectedObj(active || null);
      if (active?.data?.layoutType === "layout") {
        setSelectedLayoutId(active.data.layoutId);
      }
    };
    canvas.on("selection:created", updateSelection);
    canvas.on("selection:updated", updateSelection);
    canvas.on("selection:cleared", () => setSelectedObj(null));
    const dims = getCanvasDimensions("A5", "landscape");
    canvas.setWidth(dims.width);
    canvas.setHeight(dims.height);
    return () => canvas.dispose();
  }, []);

  // ---- Copy / Paste (Ctrl+C / Ctrl+V) ----
  useEffect(() => {
    function handleKeyDown(e) {
      const canvas = fabricRef.current;
      if (!canvas) return;

      // Don't hijack Ctrl+C/V while the user is typing in a normal input/textarea on the page,
      // or while actively editing text inside a Fabric textbox (double-click text-edit mode) —
      // in both cases they mean the browser's/textbox's own copy-paste, not canvas copy-paste.
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;
      const activeObj = canvas.getActiveObject();
      if (activeObj?.isEditing) return;

      const isMod = e.ctrlKey || e.metaKey; // metaKey = Cmd on Mac
      if (isMod && e.key.toLowerCase() === "c") {
        if (!activeObj) return;
        e.preventDefault();
        // Include 'data' so placeholder linking (fieldSlug, placeholderType, layoutId, etc.)
        // survives the copy — otherwise a pasted field/consignment placeholder would silently
        // lose its link.
        activeObj.clone(
          (cloned) => {
            clipboardRef.current = cloned;
          },
          ["data"],
        );
      } else if (isMod && e.key.toLowerCase() === "v") {
        if (!clipboardRef.current) return;
        e.preventDefault();
        clipboardRef.current.clone(
          (cloned) => {
            canvas.discardActiveObject();
            cloned.set({
              left: (cloned.left || 0) + 20,
              top: (cloned.top || 0) + 20,
              evented: true,
            });
            restrictTextControls(cloned); // keep the same resize-handle rules as freshly-added text
            if (cloned.type === "activeSelection") {
              // Multiple objects were copied together — add each one back individually.
              cloned.canvas = canvas;
              cloned.forEachObject((obj) => canvas.add(obj));
              cloned.setCoords();
            } else {
              canvas.add(cloned);
            }
            canvas.setActiveObject(cloned);
            canvas.requestRenderAll();
          },
          ["data"],
        );
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    (async () => {
      const [t, cfg, a] = await Promise.all([
        api.get("/templates"),
        api.get("/orders/config"),
        api.get("/assets"),
      ]);
      setTemplates(t.data);
      setOrderFields(cfg.data.fields || []);
      setAssets(a.data);
      const def = t.data.find((x) => x.is_default);
      if (def) loadTemplate(def.id, t.data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resizes the live editing canvas when the Page Size / Orientation dropdowns change.
  // Only touches dimensions — does NOT reload any JSON, since this fires on a canvas
  // that's already being actively edited.
  function resizeCanvas(size, orient) {
    const canvas = fabricRef.current;
    const dims = getCanvasDimensions(size, orient);
    canvas.setWidth(dims.width);
    canvas.setHeight(dims.height);
    canvas.requestRenderAll();
  }

  async function loadTemplate(id, list) {
    const res = await api.get(`/templates/${id}`);
    const t = res.data;
    console.log("[TemplateEditor] loadTemplate:", {
      id: t.id,
      page_size: t.page_size,
      orientation: t.orientation,
      canvas_json_meta: t.canvas_json?.meta,
    });
    setCurrentId(t.id);
    setName(t.name);
    setPageSize(t.page_size);
    setOrientation(t.orientation);
    const canvas = fabricRef.current;
    const json = t.canvas_json || {};
    // Always size from the template's authoritative page_size/orientation — never from
    // json.meta, which can be stale from before a page-size fix and would otherwise keep
    // reloading forever and never self-correct.
    const dims = getCanvasDimensions(t.page_size, t.orientation);
    canvas.setWidth(dims.width);
    canvas.setHeight(dims.height);
    canvas.loadFromJSON(json, () => {
      // Controls-visibility restrictions on text objects (see restrictTextControls) are a
      // runtime-only setting and are not part of the saved JSON, so they must be reapplied
      // to every text object every time a template is loaded back in.
      canvas.getObjects().forEach(restrictTextControls);
      setSelectedLayoutId(null);
      setLayoutVersion((version) => version + 1);
      canvas.requestRenderAll();
    });
  }

  function newTemplate() {
    setCurrentId(null);
    setName("Untitled Template");
    setPageSize("A5");
    setOrientation("landscape");
    fabricRef.current.clear();
    fabricRef.current.backgroundColor = "#ffffff";
    setSelectedObj(null);
    setSelectedLayoutId(null);
    setLayoutVersion((version) => version + 1);
    resizeCanvas("A5", "landscape");
  }

  async function saveTemplate() {
    const canvas = fabricRef.current;
    const json = canvas.toJSON(["data"]);
    json.meta = { width: canvas.getWidth(), height: canvas.getHeight() };
    console.log("[TemplateEditor] saveTemplate:", {
      pageSize,
      orientation,
      meta: json.meta,
    });
    if (currentId) {
      await api.put(`/templates/${currentId}`, {
        name,
        pageSize,
        orientation,
        canvasJson: json,
      });
      toast.success("Template updated successfully.");
    } else {
      const res = await api.post("/templates", {
        name,
        pageSize,
        orientation,
        canvasJson: json,
      });
      setCurrentId(res.data.id);
      toast.success("Template saved successfully.");
    }
    const t = await api.get("/templates");
    setTemplates(t.data);
  }

  async function duplicateTemplate() {
    if (!currentId) return toast.error("Save the template first.");
    await api.post(`/templates/${currentId}/duplicate`);
    toast.success("Template duplicated successfully.");
    const t = await api.get("/templates");
    setTemplates(t.data);
  }

  async function setDefault() {
    if (!currentId) return toast.error("Save the template first.");
    await api.put(`/templates/${currentId}/set-default`);
    toast.success("Set as default template.");
    const t = await api.get("/templates");
    setTemplates(t.data);
  }

  function confirmDeleteTemplate() {
    if (!currentId) return;
    setConfirm({
      title: `Delete "${name}"?`,
      danger: true,
      confirmLabel: "Delete Template",
      onConfirm: async () => {
        await api.delete(`/templates/${currentId}`);
        toast.success("Template deleted successfully.");
        setConfirm(null);
        newTemplate();
        const t = await api.get("/templates");
        setTemplates(t.data);
      },
    });
  }

  // ---- Toolbar actions ----

  // Text objects (Textbox/IText) are only ever meant to grow/shrink via the Font Size
  // number input, never by dragging a resize handle (dragging would scale the object
  // visually instead of changing fontSize, and can conflict with the auto text-wrapping
  // reflow used elsewhere). So every text object gets all of its resize handles hidden,
  // keeping only rotation and normal drag-to-move.
  function restrictTextControls(obj) {
    if (!obj) return;
    if (
      obj.type === "textbox" ||
      obj.type === "i-text" ||
      obj.type === "text"
    ) {
      // ml/mr (the left/right middle handles) are Fabric's dedicated "change width" handles
      // for a Textbox — dragging them reflows the text into a wider/narrower box without
      // touching fontSize, so they stay enabled. Corner handles (tl/tr/bl/br) and the
      // top/bottom middle handles (mt/mb) are hidden because dragging those SCALES the
      // object — which visually changes the font size — and font size should only ever be
      // changed via the Font Size number input.
      obj.setControlsVisibility({
        tl: false,
        tr: false,
        bl: false,
        br: false,
        mt: false,
        mb: false,
        ml: true,
        mr: true,
      });
    }
  }

  function addText() {
    const t = new fabric.Textbox("Label Text", {
      left: 40,
      top: 40,
      fontSize: 18,
      width: 160,
    });
    restrictTextControls(t);
    fabricRef.current.add(t).setActiveObject(t);
  }
  function addRect() {
    const r = new fabric.Rect({
      left: 40,
      top: 40,
      width: 120,
      height: 80,
      fill: "transparent",
      stroke: "#111827",
      strokeWidth: 1,
    });
    fabricRef.current.add(r).setActiveObject(r);
  }
  function addCircle() {
    const c = new fabric.Circle({
      left: 40,
      top: 40,
      radius: 40,
      fill: "transparent",
      stroke: "#111827",
      strokeWidth: 1,
    });
    fabricRef.current.add(c).setActiveObject(c);
  }
  function addLine() {
    const l = new fabric.Line([40, 100, 220, 100], {
      stroke: "#111827",
      strokeWidth: 2,
    });
    fabricRef.current.add(l).setActiveObject(l);
  }
  function addFieldPlaceholder(field) {
    if (!field) return;
    const t = new fabric.Textbox(`{{${field.name}}}`, {
      left: 40,
      top: 40,
      fontSize: 16,
      width: 200,
      fill: "#2f6fed",
      data: {
        placeholderType: "field",
        fieldSlug: field.slug,
        fieldName: field.name,
      },
    });
    restrictTextControls(t);
    fabricRef.current.add(t).setActiveObject(t);
  }
  function addConsignmentPlaceholder() {
    const t = new fabric.Textbox("{{Consignment}}", {
      left: 40,
      top: 40,
      fontSize: 16,
      width: 220,
      fill: "#b45309",
      data: { placeholderType: "consignment" },
    });
    restrictTextControls(t);
    fabricRef.current.add(t).setActiveObject(t);
  }
  function addBoxCountPlaceholder() {
    const t = new fabric.Textbox("{{Box No.}}", {
      left: 40,
      top: 40,
      fontSize: 16,
      width: 140,
      fill: "#047857",
      data: { placeholderType: "boxCount" },
    });
    restrictTextControls(t);
    fabricRef.current.add(t).setActiveObject(t);
  }
  function insertImageFromUrl(url) {
    fabric.Image.fromURL(
      url,
      (img) => {
        img.set({ left: 30, top: 30, crossOrigin: "anonymous" });
        img.scaleToWidth(140);
        fabricRef.current.add(img).setActiveObject(img);
      },
      { crossOrigin: "anonymous" },
    );
  }
  function insertImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => insertImageFromUrl(e.target.result);
    reader.readAsDataURL(file);
  }
  function deleteSelected() {
    const canvas = fabricRef.current;
    const obj = canvas.getActiveObject();
    if (obj?.data?.layoutType === "layout") {
      const layoutId = obj.data.layoutId;
      canvas.getObjects().forEach((member) => {
        if (member.data?.layoutId !== layoutId) return;
        const data = { ...(member.data || {}) };
        delete data.layoutId;
        member.set("data", data);
      });
      canvas.remove(obj);
      setSelectedLayoutId(null);
      setLayoutVersion((version) => version + 1);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    } else if (obj) {
      canvas.remove(obj);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
  }
  function setFontSize(size) {
    const obj = fabricRef.current.getActiveObject();
    if (obj && obj.set) {
      obj.set("fontSize", Number(size));
      fabricRef.current.requestRenderAll();
    }
  }
  function setColor(color) {
    const obj = fabricRef.current.getActiveObject();
    if (obj && obj.set) {
      obj.set("fill", color);
      fabricRef.current.requestRenderAll();
    }
  }
  function setStrokeWidth(width) {
    const obj = fabricRef.current.getActiveObject();
    if (obj && obj.set) {
      obj.set("strokeWidth", Number(width));
      fabricRef.current.requestRenderAll();
    }
  }
  function setStrokeColor(color) {
    const obj = fabricRef.current.getActiveObject();
    if (obj && obj.set) {
      obj.set("stroke", color);
      fabricRef.current.requestRenderAll();
    }
  }
  function setTextAlign(align) {
    const obj = fabricRef.current.getActiveObject();
    if (obj && obj.set) {
      obj.set("textAlign", align);
      fabricRef.current.requestRenderAll();
    }
  }

  function selectedDesignObjects() {
    const active = fabricRef.current?.getActiveObject();
    if (!active) return [];
    const objects =
      active.type === "activeSelection" ? active.getObjects() : [active];
    return objects.filter((obj) => obj.data?.layoutType !== "layout");
  }

  function layoutObjects() {
    return (fabricRef.current?.getObjects() || []).filter(
      (obj) => obj.data?.layoutType === "layout",
    );
  }

  function layoutMembers(layoutId) {
    return (fabricRef.current?.getObjects() || []).filter(
      (obj) => obj.data?.layoutId === layoutId,
    );
  }

  function boundsForObjects(objects) {
    const bounds = objects.map((obj) => obj.getBoundingRect(true, true));
    if (!bounds.length) return null;
    const left = Math.min(...bounds.map((bound) => bound.left));
    const top = Math.min(...bounds.map((bound) => bound.top));
    const right = Math.max(...bounds.map((bound) => bound.left + bound.width));
    const bottom = Math.max(...bounds.map((bound) => bound.top + bound.height));
    return { left, top, width: right - left, height: bottom - top };
  }

  function createLayout() {
    const canvas = fabricRef.current;
    const objects = selectedDesignObjects();
    const existing = layoutObjects();
    const layoutId = `layout_${Date.now()}`;
    const layoutName = `Layout ${existing.length + 1}`;
    const padding = 20;
    const objectBounds = boundsForObjects(objects);
    const left = objectBounds ? objectBounds.left - padding : 40;
    const top = objectBounds ? objectBounds.top - padding : 40;
    const width = objectBounds ? objectBounds.width + padding * 2 : 360;
    const height = objectBounds ? objectBounds.height + padding * 2 : 180;
    const layout = new fabric.Rect({
      left,
      top,
      width,
      height,
      fill: "rgba(47,111,237,0.08)",
      stroke: "#2f6fed",
      strokeDashArray: [8, 5],
      selectable: true,
      objectCaching: false,
      data: { layoutType: "layout", layoutId, layoutName },
    });
    canvas.add(layout);
    canvas.sendToBack(layout);
    objects.forEach((obj) => {
      obj.set("data", { ...(obj.data || {}), layoutId });
    });
    canvas.setActiveObject(layout);
    setSelectedLayoutId(layoutId);
    setLayoutVersion((version) => version + 1);
    canvas.requestRenderAll();
  }

  function addSelectedToLayout() {
    const layoutId = selectedLayoutId;
    if (!layoutId) return toast.error("Select a layout first.");
    const objects = selectedDesignObjects();
    if (!objects.length) return toast.error("Select an object to add.");
    objects.forEach((obj) => {
      obj.set("data", { ...(obj.data || {}), layoutId });
    });
    setLayoutVersion((version) => version + 1);
    fabricRef.current.requestRenderAll();
  }

  function removeSelectedFromLayout() {
    const objects = selectedDesignObjects();
    if (!objects.length) return toast.error("Select an object to remove.");
    objects.forEach((obj) => {
      const data = { ...(obj.data || {}) };
      delete data.layoutId;
      obj.set("data", data);
    });
    setLayoutVersion((version) => version + 1);
    fabricRef.current.requestRenderAll();
  }

  function selectLayout(layoutId) {
    const layout = layoutObjects().find(
      (obj) => obj.data.layoutId === layoutId,
    );
    if (!layout) return;
    setSelectedLayoutId(layoutId);
    fabricRef.current.setActiveObject(layout);
    fabricRef.current.requestRenderAll();
  }

  function renameLayout(layout) {
    const currentName = layout.data?.layoutName || "Layout";
    const nextName = window.prompt("Layout name", currentName)?.trim();
    if (!nextName || nextName === currentName) return;
    layout.set("data", { ...(layout.data || {}), layoutName: nextName });
    setLayoutVersion((version) => version + 1);
    fabricRef.current.requestRenderAll();
  }

  function removeLayout(layout) {
    const layoutId = layout.data.layoutId;
    layoutMembers(layoutId).forEach((member) => {
      const data = { ...(member.data || {}) };
      delete data.layoutId;
      member.set("data", data);
    });
    fabricRef.current.remove(layout);
    if (selectedLayoutId === layoutId) setSelectedLayoutId(null);
    setLayoutVersion((version) => version + 1);
    fabricRef.current.discardActiveObject();
    fabricRef.current.requestRenderAll();
  }

  function startCrop() {
    const canvas = fabricRef.current;
    const img = canvas.getActiveObject();
    if (!img || img.type !== "image")
      return toast.error("Select an image first.");
    const bounds = img.getBoundingRect(true, true);
    const overlay = new fabric.Rect({
      left: bounds.left + bounds.width * 0.1,
      top: bounds.top + bounds.height * 0.1,
      width: bounds.width * 0.8,
      height: bounds.height * 0.8,
      fill: "rgba(47,111,237,0.15)",
      stroke: "#2f6fed",
      strokeDashArray: [5, 5],
    });
    canvas.add(overlay);
    canvas.setActiveObject(overlay);
    cropTargetRef.current = { img, overlay };
    setCroppingActive(true);
  }
  function applyCrop() {
    const canvas = fabricRef.current;
    const target = cropTargetRef.current;
    if (!target) return;
    const rect = target.overlay.getBoundingRect(true, true);
    target.img.clipPath = new fabric.Rect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      absolutePositioned: true,
    });
    canvas.remove(target.overlay);
    canvas.setActiveObject(target.img);
    canvas.requestRenderAll();
    cropTargetRef.current = null;
    setCroppingActive(false);
  }
  function cancelCrop() {
    const canvas = fabricRef.current;
    if (cropTargetRef.current) canvas.remove(cropTargetRef.current.overlay);
    cropTargetRef.current = null;
    setCroppingActive(false);
    canvas.requestRenderAll();
  }

  const layouts = layoutObjects();
  const isTextSelected =
    selectedObj &&
    selectedObj.data?.layoutType !== "layout" &&
    (selectedObj.type === "textbox" || selectedObj.type === "i-text");
  const isShapeSelected =
    selectedObj &&
    selectedObj.data?.layoutType !== "layout" &&
    ["rect", "circle", "line", "triangle", "ellipse", "polygon"].includes(
      selectedObj.type,
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Template Editor</h1>
          <p className="text-sm text-gray-500">
            Design your label and link placeholders to your Orders fields.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" onClick={newTemplate}>
            + New
          </button>
          <button className="btn-secondary" onClick={duplicateTemplate}>
            ⧉ Duplicate
          </button>
          <button className="btn-secondary" onClick={setDefault}>
            ★ Set Default
          </button>
          <button className="btn-danger" onClick={confirmDeleteTemplate}>
            Delete
          </button>
          <button className="btn-primary" onClick={saveTemplate}>
            Save Template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[220px_1fr_240px] gap-4 items-start">
        {/* Left: saved templates + settings */}
        <div className="card p-3 space-y-3">
          <div>
            <label className="label-text">Template Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label-text">Page Size</label>
            <select
              className="input"
              value={pageSize}
              onChange={(e) => {
                setPageSize(e.target.value);
                resizeCanvas(e.target.value, orientation);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Orientation</label>
            <select
              className="input"
              value={orientation}
              onChange={(e) => {
                setOrientation(e.target.value);
                resizeCanvas(pageSize, e.target.value);
              }}
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">
              SAVED TEMPLATES
            </div>
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => loadTemplate(t.id, templates)}
                    className={
                      "w-full text-left px-2 py-1.5 rounded text-xs " +
                      (currentId === t.id
                        ? "bg-brand-50 text-brand-700"
                        : "hover:bg-gray-100")
                    }
                  >
                    {t.is_default ? "★ " : ""}
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Center: canvas */}
        <div className="card p-4 flex flex-col items-center gap-3">
          <div className="flex gap-2 flex-wrap justify-center no-print">
            <button className="btn-secondary text-xs" onClick={addText}>
              + Text
            </button>
            <button className="btn-secondary text-xs" onClick={addRect}>
              + Rectangle
            </button>
            <button className="btn-secondary text-xs" onClick={addCircle}>
              + Circle
            </button>
            <button className="btn-secondary text-xs" onClick={addLine}>
              + Line
            </button>
            <label className="btn-secondary text-xs cursor-pointer">
              + Image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) =>
                  e.target.files[0] && insertImageFromFile(e.target.files[0])
                }
              />
            </label>
            <button className="btn-secondary text-xs" onClick={createLayout}>
              + Layout
            </button>
            {!croppingActive ? (
              <button className="btn-secondary text-xs" onClick={startCrop}>
                Crop Image
              </button>
            ) : (
              <>
                <button className="btn-primary text-xs" onClick={applyCrop}>
                  Apply Crop
                </button>
                <button className="btn-secondary text-xs" onClick={cancelCrop}>
                  Cancel Crop
                </button>
              </>
            )}
            <button className="btn-danger text-xs" onClick={deleteSelected}>
              Delete Selected
            </button>
          </div>
          <div className="border border-gray-300 shadow-inner overflow-auto max-w-full">
            <canvas ref={canvasElRef} />
          </div>

          {/* Text controls: font size only resizes via this input (drag-resize handles are
              hidden on text objects — see restrictTextControls), plus color and alignment. */}
          {isTextSelected && (
            <div className="flex flex-wrap gap-3 items-center text-xs no-print">
              <label>
                Font Size{" "}
                <input
                  type="number"
                  min={1}
                  className="input !w-20 inline-block"
                  value={fontSizeValue}
                  onChange={(e) => {
                    setFontSizeValue(e.target.value);
                    setFontSize(e.target.value);
                  }}
                />
              </label>
              <label>
                Color{" "}
                <input
                  type="color"
                  value={selectedObj.fill || "#000000"}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Align</span>
                <button
                  type="button"
                  className={
                    "btn-secondary !px-2 !py-1 text-xs " +
                    (!selectedObj.textAlign || selectedObj.textAlign === "left"
                      ? "!bg-brand-50"
                      : "")
                  }
                  onClick={() => setTextAlign("left")}
                >
                  Left
                </button>
                <button
                  type="button"
                  className={
                    "btn-secondary !px-2 !py-1 text-xs " +
                    (selectedObj.textAlign === "center" ? "!bg-brand-50" : "")
                  }
                  onClick={() => setTextAlign("center")}
                >
                  Center
                </button>
                <button
                  type="button"
                  className={
                    "btn-secondary !px-2 !py-1 text-xs " +
                    (selectedObj.textAlign === "right" ? "!bg-brand-50" : "")
                  }
                  onClick={() => setTextAlign("right")}
                >
                  Right
                </button>
              </div>
            </div>
          )}

          {/* Shape controls: border (stroke) width/color, plus fill for closed shapes. */}
          {isShapeSelected && (
            <div className="flex flex-wrap gap-3 items-center text-xs no-print">
              <label>
                Border Width{" "}
                <input
                  type="number"
                  min={0}
                  className="input !w-20 inline-block"
                  value={strokeWidthValue}
                  onChange={(e) => {
                    setStrokeWidthValue(e.target.value);
                    setStrokeWidth(e.target.value);
                  }}
                />
              </label>
              <label>
                Border Color{" "}
                <input
                  type="color"
                  value={selectedObj.stroke || "#111827"}
                  onChange={(e) => setStrokeColor(e.target.value)}
                />
              </label>
              {selectedObj.type !== "line" && (
                <label>
                  Fill{" "}
                  <input
                    type="color"
                    value={
                      selectedObj.fill && selectedObj.fill !== "transparent"
                        ? selectedObj.fill
                        : "#ffffff"
                    }
                    onChange={(e) => setColor(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}
        </div>

        {/* Right: placeholders + assets */}
        <div className="card p-3 space-y-4">
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1.5">
              FIELD PLACEHOLDERS
            </div>
            <p className="text-[11px] text-gray-400 mb-2">
              From the form currently used by Orders.
            </p>
            <ul className="space-y-1">
              {orderFields.map((f) => (
                <li key={f.id}>
                  <button
                    className="w-full text-left text-xs px-2 py-1.5 rounded bg-gray-50 hover:bg-brand-50"
                    onClick={() => addFieldPlaceholder(f)}
                  >
                    + {f.name}
                  </button>
                </li>
              ))}
              {orderFields.length === 0 && (
                <li className="text-xs text-gray-400">
                  Set up the Orders form first.
                </li>
              )}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1.5">
              PRINT-TIME PLACEHOLDERS
            </div>
            <button
              className="w-full text-left text-xs px-2 py-1.5 rounded bg-gray-50 hover:bg-brand-50 mb-1"
              onClick={addConsignmentPlaceholder}
            >
              + Consignment (Handle with Care / Printed Books / Custom)
            </button>
            <button
              className="w-full text-left text-xs px-2 py-1.5 rounded bg-gray-50 hover:bg-brand-50"
              onClick={addBoxCountPlaceholder}
            >
              + Number of Boxes
            </button>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1.5">
              LAYOUTS
            </div>
            {layouts.length === 0 ? (
              <p className="text-xs text-gray-400">No layouts created yet.</p>
            ) : (
              <ul className="space-y-2">
                {layouts.map((layout) => {
                  const layoutId = layout.data.layoutId;
                  const isSelected = selectedLayoutId === layoutId;
                  return (
                    <li
                      key={layoutId}
                      className="border border-gray-200 rounded p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          className={
                            "text-xs text-left truncate " +
                            (isSelected
                              ? "text-brand-700 font-medium"
                              : "text-gray-700")
                          }
                          onClick={() => selectLayout(layoutId)}
                        >
                          {layout.data.layoutName || "Layout"}
                        </button>
                        <div className="flex gap-1">
                          <button
                            className="text-[11px] text-gray-500 hover:text-gray-900"
                            onClick={() => renameLayout(layout)}
                          >
                            Rename
                          </button>
                          <button
                            className="text-[11px] text-red-600 hover:text-red-800"
                            onClick={() => removeLayout(layout)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="mt-2 space-y-1">
                          <div className="text-[11px] text-gray-500">
                            Selected Layout:{" "}
                            {layout.data.layoutName || "Layout"}
                          </div>
                          <button
                            className="w-full text-left text-xs px-2 py-1 rounded bg-gray-50 hover:bg-brand-50"
                            onClick={addSelectedToLayout}
                          >
                            Add Selected Object
                          </button>
                          <button
                            className="w-full text-left text-xs px-2 py-1 rounded bg-gray-50 hover:bg-brand-50"
                            onClick={removeSelectedFromLayout}
                          >
                            Remove Selected Object
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1.5">
              YOUR ASSETS
            </div>
            <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
              {assets.map((a) => (
                <button
                  key={a.id}
                  onClick={() =>
                    insertImageFromUrl(
                      `${api.defaults.baseURL.replace("/api", "")}${a.url}`,
                    )
                  }
                  className="border border-gray-200 rounded overflow-hidden aspect-square"
                >
                  <img
                    src={`${api.defaults.baseURL.replace("/api", "")}${a.url}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
              {assets.length === 0 && (
                <div className="text-xs text-gray-400 col-span-3">
                  No assets uploaded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirm}
        {...confirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
