import React, { useEffect, useMemo, useState } from "react";
import { fabric } from "fabric";
import api from "../api";
import { useToast } from "../context/ToastContext.jsx";
import { toIndianDate } from "../utils/date.js";
import { buildLocationSuffix } from "../utils/pincode.js";
import {
  PAGE_SIZE_OPTIONS,
  getPageMm,
  getCanvasDimensions,
} from "../utils/pageSizes.js";

export default function PrintPreview({ orderIds, fields, onClose }) {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [templateJson, setTemplateJson] = useState(null);
  const [templateMeta, setTemplateMeta] = useState(null); // { page_size, orientation }
  const [orders, setOrders] = useState([]);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [boxCounts, setBoxCounts] = useState({});
  const [globalBoxCount, setGlobalBoxCount] = useState(1);
  const [consignment, setConsignment] = useState({}); // { [orderId]: { handleWithCare, printedBooks, custom } }
  const [previewSvg, setPreviewSvg] = useState(null);
  const [printLabels, setPrintLabels] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [paperSize, setPaperSize] = useState("A4");
  const [paperOrientation, setPaperOrientation] = useState("portrait");

  // PIN code auto-fill for print (optional — hidden entirely if not configured in Settings).
  // pincodeOverrides[orderId] holds a ", District, State" SUFFIX string — applied only at
  // render time to the configured Address field's text, and always computed fresh from the
  // real order.data on every render, so it can never accumulate or double-append. Unchecking
  // the box just drops the override and the original address text shows again — the real
  // order data in the DB is never touched.
  const [pincodeConfig, setPincodeConfig] = useState(null);
  const [pincodeAutoFillState, setPincodeAutoFillState] = useState({}); // { [orderId]: boolean }
  const [pincodeLoadingState, setPincodeLoadingState] = useState({});  // { [orderId]: boolean }
  const [pincodeOverrides, setPincodeOverrides] = useState({});        // { [orderId]: suffixString }

  useEffect(() => {
    api.get("/pincode/config").then((res) => setPincodeConfig(res.data)).catch(() => setPincodeConfig(null));
  }, []);

  async function togglePincodeAutoFill(order, checked) {
    setPincodeAutoFillState((s) => ({ ...s, [order.id]: checked }));
    if (!checked) {
      setPincodeOverrides((s) => { const n = { ...s }; delete n[order.id]; return n; });
      return;
    }
    const pin = order.data?.[pincodeConfig.print_pincode_field_slug];
    if (!pin) {
      toast.error("This order has no PIN code value.");
      setPincodeAutoFillState((s) => ({ ...s, [order.id]: false }));
      return;
    }
    setPincodeLoadingState((s) => ({ ...s, [order.id]: true }));
    try {
      const res = await api.get(`/pincode/lookup/${pin}`);
      const suffix = buildLocationSuffix(res.data.district, res.data.state);
      setPincodeOverrides((s) => ({ ...s, [order.id]: suffix }));
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not fetch district/state.");
      setPincodeAutoFillState((s) => ({ ...s, [order.id]: false }));
    } finally {
      setPincodeLoadingState((s) => ({ ...s, [order.id]: false }));
    }
  }

  useEffect(() => {
    (async () => {
      const [t, ...orderResults] = await Promise.all([
        api.get("/templates"),
        ...orderIds.map((id) => api.get(`/orders/${id}`)),
      ]);
      setTemplates(t.data);
      const loadedOrders = orderResults.map((r) => r.data);
      setOrders(loadedOrders);
      setActiveOrderId(loadedOrders[0]?.id || null);
      const initialCounts = {};
      const initialConsignment = {};
      loadedOrders.forEach((o) => {
        initialCounts[o.id] = 1;
        initialConsignment[o.id] = {
          handleWithCare: false,
          printedBooks: false,
          custom: "",
        };
      });
      setBoxCounts(initialCounts);
      setConsignment(initialConsignment);
      const def = t.data.find((x) => x.is_default) || t.data[0];
      if (def) selectTemplate(def.id);
    })();
  }, []);

  async function selectTemplate(id) {
    setTemplateId(id);
    const res = await api.get(`/templates/${id}`);
    setTemplateJson(res.data.canvas_json);
    setTemplateMeta({
      page_size: res.data.page_size,
      orientation: res.data.orientation,
    });
  }

  const activeOrder = useMemo(
    () => orders.find((o) => o.id === activeOrderId),
    [orders, activeOrderId],
  );
  useEffect(() => {
    if (!templateJson || !activeOrder) {
      setPreviewSvg(null);
      return;
    }
    let cancelled = false;
    renderLabel(
      templateJson,
      activeOrder,
      consignment[activeOrder.id] || {},
      boxCounts[activeOrder.id] || 1,
      boxCounts[activeOrder.id] || 1,
    ).then((url) => {
      if (!cancelled) setPreviewSvg(url);
    });
    return () => {
      cancelled = true;
    };
  }, [templateJson, activeOrder, consignment, boxCounts, pincodeOverrides]);

  function fieldBySlug(slug) {
    return fields.find((f) => f.slug === slug);
  }
  function makePhysicalSvg(svg, widthMm, heightMm, pxWidth, pxHeight) {
    return svg.replace(/<svg([^>]*)>/, (_, attributes) => {
      const cleaned = attributes
        .replace(/\swidth="[^"]*"/i, "")
        .replace(/\sheight="[^"]*"/i, "")
        .replace(/\sviewBox="[^"]*"/i, "")
        .replace(/\spreserveAspectRatio="[^"]*"/i, "");

      return `<svg${cleaned} width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${pxWidth} ${pxHeight}" preserveAspectRatio="none">`;
    });
  }

  // Renders one label to a physical-size SVG, substituting placeholder text with real order data.
  //
  // IMPORTANT — auto reflow so long content never overlaps the next item:
  // A field like "Address" is a fixed-width Fabric Textbox that was sized at design time around
  // short placeholder text. Real data (or PIN auto-fill appending District/State onto it) can be
  // much longer and wrap onto more lines, growing taller than it was at design time. So after
  // substituting the real text, we measure how much each placeholder grew versus its design-time
  // height, and push every object that sits below it (and overlaps it horizontally) down by that
  // amount — cascading automatically if more than one placeholder grows. Objects that don't grow
  // never move, so a template with no overflow renders exactly as designed.
  function renderLabel(json, order, orderConsignment, boxIndex, boxTotal) {
    return new Promise((resolve) => {
      const labelMm = getPageMm(
        templateMeta?.page_size || "A5",
        templateMeta?.orientation || "landscape",
      );
      const canvasDimensions = getCanvasDimensions(
        templateMeta?.page_size || "A5",
        templateMeta?.orientation || "landscape",
      );
      const canvas = new fabric.StaticCanvas(null, {
        width: canvasDimensions.width,
        height: canvasDimensions.height,
      });
      canvas.loadFromJSON(json, () => {
        const objects = canvas.getObjects();
        const membersByLayout = new Map();
        objects.forEach((obj) => {
          const layoutId = obj.data?.layoutId;
          if (!layoutId || obj.data?.layoutType === "layout") return;
          if (!membersByLayout.has(layoutId)) membersByLayout.set(layoutId, []);
          membersByLayout.get(layoutId).push({
            obj,
            top: obj.top,
            left: obj.left,
            width: obj.getScaledWidth ? obj.getScaledWidth() : obj.width,
            height: obj.getScaledHeight ? obj.getScaledHeight() : obj.height,
          });
        });

        const addressSlug = pincodeConfig?.print_address_field_slug;
        const locationSuffix = pincodeOverrides[order.id];

        objects.forEach((obj) => {
          if (obj.data?.placeholderType === "field") {
            const f = fieldBySlug(obj.data.fieldSlug); 
            let val = order.data?.[obj.data.fieldSlug] ?? "";
            if (f?.type === "date" && val) val = toIndianDate(val);
            // Append District/State to the configured Address field only — computed fresh
            // from the real order value every time, so it never stacks up on repeated renders.
            if (locationSuffix && addressSlug && obj.data.fieldSlug === addressSlug) {
              val = `${val}${locationSuffix}`;
            }
            obj.set("text", String(val));
          } else if (obj.data?.placeholderType === "consignment") {
            const parts = [];
            if (orderConsignment.handleWithCare)
              parts.push("⚠ HANDLE WITH CARE");
            if (orderConsignment.printedBooks) parts.push("PRINTED BOOKS");
            if (orderConsignment.custom) parts.push(orderConsignment.custom);
            obj.set("text", parts.join("   "));
          } else if (obj.data?.placeholderType === "boxCount") {
            obj.set("text", `Box ${boxIndex} of ${boxTotal}`);
          }
        });
        canvas.renderAll(); // let Fabric recalculate each Textbox's wrapped height first

        // Push down anything below (and horizontally overlapping) a placeholder that grew taller
        // than its design-time size, so growing text can never overlap the next item.
        membersByLayout.forEach((members) => {
          const growth = members
            .map(({ obj, top, left, width, height }) => {
              const newHeight = obj.getScaledHeight ? obj.getScaledHeight() : obj.height;
              return { obj, top, left, width, height, delta: Math.max(0, newHeight - height) };
            })
            .sort((a, b) => a.top - b.top || a.left - b.left);

          growth.forEach((member) => {
            let shift = 0;
            growth.forEach((earlier) => {
              if (earlier.obj === member.obj || earlier.delta <= 0) return;
              const earlierBottomOriginal = earlier.top + earlier.height;
              const isBelow = member.top >= earlierBottomOriginal - 1;
              const overlapsHorizontally =
                earlier.left < member.left + member.width && member.left < earlier.left + earlier.width;
              if (isBelow && overlapsHorizontally) shift += earlier.delta;
            });
            if (shift > 0) member.obj.set("top", member.top + shift);
          });
        });

        canvas.renderAll();
        const originalObjects = canvas.getObjects().slice();
        const layoutObjects = originalObjects.filter(
          (obj) => obj.data?.layoutType === "layout",
        );
        layoutObjects.forEach((layout) => canvas.remove(layout));
        canvas.renderAll();
        const svg = canvas.toSVG();
        canvas._objects = originalObjects;
        canvas.renderAll();
        const physicalSvg = makePhysicalSvg(
          svg,
          labelMm.w,
          labelMm.h,
          canvasDimensions.width,
          canvasDimensions.height,
        );
        canvas.dispose();
        resolve(physicalSvg);
      });
    });
  }

  function applyGlobalBoxCount() {
    setBoxCounts((bc) => {
      const next = { ...bc };
      orders.forEach((o) => {
        next[o.id] = globalBoxCount;
      });
      return next;
    });
    toast.success("Number of boxes applied to all selected orders.");
  }

  function updateConsignment(orderId, patch) {
    setConsignment((c) => ({ ...c, [orderId]: { ...c[orderId], ...patch } }));
  }

  async function handlePrint() {
    if (!templateJson) {
      toast.error("Choose a template first.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=900");

    if (!printWindow) {
      toast.error("Print window was blocked by the browser. Allow pop-ups for this site.");
      return;
    }

    setGenerating(true);

    try {
      const labels = [];

      for (const order of orders) {
        const total = boxCounts[order.id] || 1;

        for (let i = 1; i <= total; i += 1) {
          const svg = await renderLabel(
            templateJson,
            order,
            consignment[order.id] || {},
            i,
            total,
          );

          labels.push({
            key: `${order.id}-${i}`,
            svg,
          });
        }
      }

      if (!labels.length) {
        printWindow.close();
        toast.error("No labels available to print.");
        return;
      }

      setPrintLabels(labels);

      const pages = [];

      for (let i = 0; i < labels.length; i += perPage) {
        pages.push(labels.slice(i, i + perPage));
      }

      const pageMarkup = pages
        .map((page) => {
          const labelsMarkup = page
            .map((label, index) => {
              const column = index % cols;
              const row = Math.floor(index / cols);
              const left = column * labelMm.w;
              const top = row * labelMm.h;

              return `
                <div
                  class="print-label"
                  style="
                    left:${left}mm;
                    top:${top}mm;
                    width:${labelMm.w}mm;
                    height:${labelMm.h}mm;
                  "
                >${label.svg}</div>
              `;
            })
            .join("");

          return `
            <section
              class="print-sheet"
              style="
                width:${paperMm.w}mm;
                height:${paperMm.h}mm;
              "
            >${labelsMarkup}</section>
          `;
        })
        .join("");

      printWindow.document.open();
      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Eklavya Pitara Print</title>
            <style>
              @page {
                size: ${paperMm.w}mm ${paperMm.h}mm;
                margin: 0;
              }

              html,
              body {
                margin: 0 !important;
                padding: 0 !important;
                width: ${paperMm.w}mm !important;
                min-width: ${paperMm.w}mm !important;
                background: #fff !important;
              }

              *,
              *::before,
              *::after {
                box-sizing: border-box;
              }

              .print-sheet {
                position: relative;
                display: block;
                width: ${paperMm.w}mm;
                height: ${paperMm.h}mm;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden;
                page-break-after: always;
                break-after: page;
              }

              .print-sheet:last-child {
                page-break-after: auto;
                break-after: auto;
              }

              .print-label {
                position: absolute;
                display: block;
                width: ${labelMm.w}mm;
                height: ${labelMm.h}mm;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden;
              }

              .print-label svg {
                display: block !important;
                width: ${labelMm.w}mm !important;
                height: ${labelMm.h}mm !important;
                min-width: ${labelMm.w}mm !important;
                min-height: ${labelMm.h}mm !important;
                max-width: none !important;
                max-height: none !important;
                margin: 0 !important;
                padding: 0 !important;
              }
            </style>
          </head>
          <body>${pageMarkup}</body>
        </html>
      `);
      printWindow.document.close();

      const startPrint = () => {
        if (printWindow.closed) return;
        printWindow.focus();
        printWindow.print();
      };

      printWindow.onafterprint = () => {
        setTimeout(() => {
          if (!printWindow.closed) printWindow.close();
        }, 300);
      };

      setTimeout(startPrint, 300);
    } catch (error) {
      console.error("Print preparation failed:", error);
      if (!printWindow.closed) printWindow.close();
      toast.error("Print preparation failed.");
    } finally {
      setGenerating(false);
    }
  }

  const labelMm = getPageMm(
    templateMeta?.page_size || "A5",
    templateMeta?.orientation || "landscape",
  );
  const paperMm = getPageMm(paperSize, paperOrientation);
  const cols = Math.max(1, Math.floor(paperMm.w / labelMm.w));
  const rows = Math.max(1, Math.floor(paperMm.h / labelMm.h));
  const perPage = cols * rows;
  const printPages = [];

  for (let i = 0; i < printLabels.length; i += perPage)
    printPages.push(printLabels.slice(i, i + perPage));

  return (
    <>
      <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4 no-print">
        <div className="card w-full max-w-6xl h-[90vh] flex overflow-hidden">
          <div className="w-72 border-r border-gray-200 flex flex-col">
            <div className="p-3 border-b border-gray-100">
              <label className="label-text">Template</label>
              <select
                className="input"
                value={templateId || ""}
                onChange={(e) => selectTemplate(Number(e.target.value))}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="p-3 border-b border-gray-100">
              <label className="label-text">Printer Paper Size</label>
              <div className="flex gap-2">
                <select
                  className="input"
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                >
                  {PAGE_SIZE_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={paperOrientation}
                  onChange={(e) => setPaperOrientation(e.target.value)}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Label is {Math.round(labelMm.w)}×{Math.round(labelMm.h)}mm (
                {templateMeta?.page_size} {templateMeta?.orientation}) — fits{" "}
                <span className="font-medium text-gray-600">
                  {perPage} per {paperSize} {paperOrientation}
                </span>{" "}
                sheet.
              </p>
            </div>
            <div className="p-3 border-b border-gray-100 flex items-end gap-2">
              <div className="flex-1">
                <label className="label-text">
                  Number of Boxes (all selected)
                </label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={globalBoxCount}
                  onChange={(e) =>
                    setGlobalBoxCount(Math.max(1, Number(e.target.value)))
                  }
                />
              </div>
              <button
                className="btn-secondary text-xs"
                onClick={applyGlobalBoxCount}
              >
                Apply to All
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className={
                    "p-3 cursor-pointer " +
                    (activeOrderId === o.id ? "bg-brand-50" : "")
                  }
                  onClick={() => setActiveOrderId(o.id)}
                >
                  <div className="text-sm font-medium truncate">
                    {Object.values(o.data)[0] || `Order #${o.id}`}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <label className="text-xs text-gray-500">Boxes</label>
                    <input
                      type="number"
                      min={1}
                      className="input !w-16 !py-1 text-xs"
                      value={boxCounts[o.id] || 1}
                      onChange={(e) =>
                        setBoxCounts((bc) => ({
                          ...bc,
                          [o.id]: Math.max(1, Number(e.target.value)),
                        }))
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div
                    className="flex flex-col gap-1 mt-2 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={consignment[o.id]?.handleWithCare || false}
                        onChange={(e) =>
                          updateConsignment(o.id, {
                            handleWithCare: e.target.checked,
                          })
                        }
                      />
                      Handle With Care
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={consignment[o.id]?.printedBooks || false}
                        onChange={(e) =>
                          updateConsignment(o.id, {
                            printedBooks: e.target.checked,
                          })
                        }
                      />
                      Printed Books
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={!!consignment[o.id]?.custom}
                        onChange={(e) =>
                          updateConsignment(o.id, {
                            custom: e.target.checked
                              ? consignment[o.id]?.custom || "Custom"
                              : "",
                          })
                        }
                      />
                      Custom:
                      <input
                        className="input !py-0.5 !px-1.5 text-xs flex-1"
                        value={consignment[o.id]?.custom || ""}
                        onChange={(e) =>
                          updateConsignment(o.id, { custom: e.target.value })
                        }
                      />
                    </label>
                    {pincodeConfig?.print_pincode_field_slug && pincodeConfig?.print_address_field_slug && (
                      <label className="flex items-center gap-1.5 pt-1 border-t border-gray-100 mt-1">
                        <input
                          type="checkbox"
                          checked={pincodeAutoFillState[o.id] || false}
                          onChange={(e) => togglePincodeAutoFill(o, e.target.checked)}
                        />
                        Auto-append District/State from PIN
                        {pincodeLoadingState[o.id] && <span className="text-gray-400">…</span>}
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-gray-100">
              <div className="text-sm font-medium">
                Preview —{" "}
                {activeOrder
                  ? Object.values(activeOrder.data)[0] ||
                    `Order #${activeOrder.id}`
                  : ""}
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={onClose}>
                  Close
                </button>
                <button
                  className="btn-primary"
                  onClick={handlePrint}
                  disabled={generating}
                >
                  {generating ? "Preparing…" : "🖨️ Print"}
                </button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center bg-gray-100 p-6 overflow-auto">
              {previewSvg ? (
                <div
                  className="shadow-lg bg-white max-w-full max-h-full"
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              ) : (
                <div className="text-gray-400 text-sm">
                  No template selected.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}