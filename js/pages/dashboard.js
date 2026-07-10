import { ROLES, STATUS } from "../utils/constants.js";
import { formatDate } from "../utils/format.js";
import { pageTitle } from "../components/layout.js";
import { escapeAttr, escapeHtml } from "../utils/security.js";
import {
  canSeePurchaseModule,
  formatDuration,
  matchesPurchaseRange,
  profileName,
  purchaseBelongsToUser,
  purchaseExecutionMinutes,
  purchaseRequests,
  purchaseRequestsForUser,
  purchaseStats,
  purchaseUsers
} from "../utils/purchases.js?v=20260709-4";

export function renderDashboard({ user, data, navigate, openRequest }) {
  const page = document.createElement("div");
  page.className = "grid";
  const myRequests = data.solicitudes.filter((item) => item.creado_por === user.id);
  const today = new Date().toDateString();
  const metrics = user.rol === ROLES.ADMIN
    ? [
      ["Total usuarios", data.profiles.length],
      ["Total solicitudes", data.solicitudes.length],
      ["Pendientes", count(data.solicitudes, STATUS.PENDING)],
      ["Aprobadas", count(data.solicitudes, STATUS.APPROVED)],
      ["Rechazadas", count(data.solicitudes, STATUS.REJECTED)],
      ["Usuarios activos", data.profiles.filter((item) => item.activo).length]
    ]
    : user.rol === ROLES.APPROVER
      ? [
        ["Pendientes", count(data.solicitudes, STATUS.PENDING)],
        ["Aprobadas hoy", data.solicitudes.filter((item) => item.estado === STATUS.APPROVED && new Date(item.updated_at).toDateString() === today).length],
        ["Rechazadas hoy", data.solicitudes.filter((item) => item.estado === STATUS.REJECTED && new Date(item.updated_at).toDateString() === today).length]
      ]
      : [
        ["Mis solicitudes", myRequests.length],
        ["Pendientes", count(myRequests, STATUS.PENDING)],
        ["Aprobadas", count(myRequests, STATUS.APPROVED)],
        ["Rechazadas", count(myRequests, STATUS.REJECTED)]
      ];
  const showPurchaseDashboard = canSeePurchaseModule(user, data);

  page.append(pageTitle("Dashboard", "Indicadores principales del sistema."));
  page.insertAdjacentHTML("beforeend", `
    <section class="grid cards">
      ${metrics.map(([label, value]) => `<article class="card metric"><span>${label}</span><strong>${value}</strong></article>`).join("")}
    </section>
    ${user.rol === ROLES.ADMIN ? systemReportShell(data) : ""}
    ${showPurchaseDashboard ? purchaseDashboardShell(user, data) : ""}
    <section class="panel">
      <div class="panel-header">
        <h2>Actividad reciente</h2>
        <button class="button secondary btn btn-outline-secondary" data-route="history">Ver historial</button>
      </div>
      <div class="table-wrap">
        <table class="table table-hover align-middle dashboard-recent-table">
          <thead><tr><th>Codigo</th><th>Titulo</th><th>Estado</th><th>Actualizacion</th></tr></thead>
          <tbody>
            ${data.solicitudes.slice(0, 6).map((item) => `
              <tr class="clickable-row" data-dashboard-request="${escapeAttr(item.id)}" tabindex="0">
                <td data-label="Codigo">${escapeHtml(item.codigo)}</td>
                <td data-label="Titulo">${escapeHtml(item.titulo)}</td>
                <td data-label="Estado"><span class="badge ${escapeHtml(item.estado.split(" ")[0])}">${escapeHtml(item.estado)}</span></td>
                <td data-label="Actualizacion">${formatDate(item.updated_at)}</td>
              </tr>
            `).join("") || `<tr><td data-label="" colspan="4">No hay solicitudes.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  page.querySelector("[data-route]")?.addEventListener("click", () => navigate("history"));
  page.querySelector("[data-generate-system-report]")?.addEventListener("click", () => {
    generateSystemReport(data, {
      departmentId: page.querySelector("[data-report-department]")?.value || "all",
      documentTypeId: page.querySelector("[data-report-document]")?.value || "all",
      range: page.querySelector("[data-report-range]")?.value || "month"
    });
  });
  page.querySelector("[data-generate-advanced-system-report]")?.addEventListener("click", () => {
    generateAdvancedSystemReport(data, {
      departmentId: page.querySelector("[data-report-department]")?.value || "all",
      documentTypeId: page.querySelector("[data-report-document]")?.value || "all",
      range: page.querySelector("[data-report-range]")?.value || "month"
    });
  });
  const purchaseSection = page.querySelector("[data-purchase-dashboard]");
  if (purchaseSection) {
    const renderPurchaseDashboard = () => {
      const selectedUser = page.querySelector("[data-purchase-user-filter]")?.value || "all";
      const selectedRange = page.querySelector("[data-purchase-range]")?.value || "month";
      purchaseSection.innerHTML = purchaseDashboardContent(user, data, selectedUser, selectedRange);
    };
    page.querySelectorAll("[data-purchase-user-filter], [data-purchase-range]").forEach((input) => {
      input.addEventListener("change", renderPurchaseDashboard);
    });
    renderPurchaseDashboard();
  }
  page.querySelectorAll("[data-dashboard-request]").forEach((row) => {
    const open = () => openRequest?.(row.dataset.dashboardRequest);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      open();
    });
  });
  return page;
}

function count(items, status) {
  return items.filter((item) => item.estado === status).length;
}

function systemReportShell(data) {
  const showAdvanced = isAdvancedReportAvailable();
  return `
    <section class="panel executive-report-panel">
      <div class="panel-header">
        <div>
          <h2>Informe ejecutivo del sistema</h2>
          <p class="panel-subtitle">Analiza aprobaciones, tiempos, departamentos, tipos de documento y puntos de mejora.</p>
        </div>
        <div class="toolbar report-toolbar">
          <select class="form-select" data-report-department aria-label="Filtrar informe por departamento">
            <option value="all">Todos los departamentos</option>
            ${data.departamentos.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nombre)}</option>`).join("")}
          </select>
          <select class="form-select" data-report-document aria-label="Filtrar informe por tipo de documento">
            <option value="all">Todos los documentos</option>
            ${data.tipos_documento.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nombre)}</option>`).join("")}
          </select>
          <select class="form-select" data-report-range aria-label="Periodo del informe">
            <option value="month">Este mes</option>
            <option value="today">Hoy</option>
            <option value="7">Ultimos 7 dias</option>
            <option value="30">Ultimos 30 dias</option>
            <option value="all">Todo el historico</option>
          </select>
          <button class="button btn btn-primary" type="button" data-generate-system-report>Generar informe</button>
          ${showAdvanced ? `<button class="button secondary btn btn-outline-secondary" type="button" data-generate-advanced-system-report>Informe avanzado</button>` : ""}
        </div>
      </div>
    </section>
  `;
}

function purchaseDashboardShell(user, data) {
  const users = purchaseUsers(data);
  return `
    <section class="panel purchase-dashboard-panel">
      <div class="panel-header">
        <div>
          <h2>${user.rol === ROLES.ADMIN ? "Dashboard de compras" : "Mis metricas de compras"}</h2>
          <p class="panel-subtitle">${user.rol === ROLES.ADMIN ? "Flujo operativo y tiempos de cierre." : "Seguimiento de las compras que te corresponden."}</p>
        </div>
        <div class="toolbar purchase-toolbar">
          ${user.rol === ROLES.ADMIN ? `
            <select class="form-select" data-purchase-user-filter aria-label="Filtrar compras por usuario">
              <option value="all">Todos los usuarios</option>
              ${users.map((profile) => `<option value="${escapeAttr(profile.id)}">${escapeHtml(profileName(profile))}</option>`).join("")}
            </select>
          ` : ""}
          <select class="form-select" data-purchase-range aria-label="Periodo de compras">
            <option value="month">Este mes</option>
            <option value="today">Hoy</option>
            <option value="7">Ultimos 7 dias</option>
            <option value="30">Ultimos 30 dias</option>
            <option value="all">Todo</option>
          </select>
        </div>
      </div>
      <div data-purchase-dashboard></div>
    </section>
  `;
}

function purchaseDashboardContent(user, data, selectedUser, selectedRange) {
  const model = purchaseDashboardModel(user, data, selectedUser, selectedRange);
  const flowRows = purchaseFlowRows(model);
  const maxFlow = Math.max(1, ...flowRows.map(([, value]) => value));

  return `
    <section class="grid cards purchase-kpis">
      ${[
        ["Por completar", model.stats.pendingExecution],
        ["Completadas", model.stats.completed],
        ["Promedio ejecucion", formatDuration(model.stats.averageMinutes)],
        ["Mas de 3 dias", model.stats.slowPending],
        ["Tasa de cierre", `${model.stats.completionRate}%`],
        ["Solicitudes compra", model.stats.total]
      ].map(([label, value]) => `<article class="card metric metric-compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`).join("")}
    </section>
    <section class="analytics-grid ${user.rol === ROLES.ADMIN ? "" : "analytics-grid-single"}">
      <article class="analytics-card">
        <div class="compact-section-header">
          <h3>${user.rol === ROLES.ADMIN ? "Flujo de compras" : "Mi flujo de compras"}</h3>
          <span>${escapeHtml(model.rangeLabel)}${user.rol === ROLES.ADMIN ? "" : " · personal"}</span>
        </div>
        <div class="bar-chart">
          ${flowRows.map(([label, value]) => barRow(label, value, maxFlow)).join("")}
        </div>
      </article>
      ${user.rol === ROLES.ADMIN ? `
        <article class="analytics-card">
          <div class="compact-section-header">
            <h3>Por usuario de Compras</h3>
            <span>${escapeHtml(model.userLabel)}</span>
          </div>
          <div class="user-flow-list">
            ${model.userBreakdown.length ? model.userBreakdown.map((row) => `
              <div class="user-flow-row">
                <span title="${escapeAttr(row.name)}">${escapeHtml(row.name)}</span>
                <strong>${row.completed} cerradas</strong>
                <em>${row.pending} pendientes</em>
              </div>
            `).join("") : `<p class="empty-state">No hay usuarios de Compras con actividad.</p>`}
          </div>
        </article>
      ` : ""}
    </section>
    ${user.rol === ROLES.ADMIN ? "" : `<p class="analytics-note">Este flujo cuenta las solicitudes que creaste, completaste o tienes asignadas dentro de Compras.</p>`}
  `;
}

function purchaseDashboardModel(user, data, selectedUser, selectedRange) {
  const rangeLabel = rangeLabelText(selectedRange);
  const baseItems = user.rol === ROLES.ADMIN
    ? purchaseRequests(data.solicitudes)
    : purchaseRequestsForUser(user, data);
  const scopedItems = user.rol === ROLES.ADMIN && selectedUser !== "all"
    ? baseItems.filter((item) => purchaseBelongsToUser(item, data, selectedUser))
    : baseItems;
  const items = scopedItems.filter((item) => matchesPurchaseRange(item, selectedRange));
  const selectedProfile = data.profiles.find((profile) => profile.id === selectedUser);
  const userLabel = selectedProfile ? profileName(selectedProfile) : "Vista global";

  return {
    items,
    stats: purchaseStats(items),
    rangeLabel,
    userLabel,
    userBreakdown: user.rol === ROLES.ADMIN ? purchaseUserBreakdown(data, selectedRange) : []
  };
}

function purchaseUserBreakdown(data, selectedRange) {
  return purchaseUsers(data)
    .map((profile) => {
      const rows = purchaseRequests(data.solicitudes)
        .filter((item) => purchaseBelongsToUser(item, data, profile.id))
        .filter((item) => matchesPurchaseRange(item, selectedRange));
      return {
        name: profileName(profile),
        completed: rows.filter((item) => item.ejecucion_estado === "Completada").length,
        pending: rows.filter((item) => item.estado === STATUS.APPROVED && item.ejecucion_estado !== "Completada").length
      };
    })
    .filter((row) => row.completed || row.pending)
    .sort((a, b) => (b.pending + b.completed) - (a.pending + a.completed));
}

function purchaseFlowRows(model) {
  return [
    ["Pendientes de aprobacion", model.items.filter((item) => item.estado === STATUS.PENDING).length],
    ["Aprobadas por completar", model.stats.pendingExecution],
    ["Completadas", model.stats.completed],
    ["Rechazadas", model.stats.rejected],
    ["En correccion", model.stats.correction]
  ];
}

function barRow(label, value, maxValue) {
  const width = Math.max(4, Math.round((value / maxValue) * 100));
  return `
    <div class="bar-row">
      <span>${escapeHtml(label)}</span>
      <div class="bar-track" aria-hidden="true"><i style="width: ${width}%"></i></div>
      <strong>${value}</strong>
    </div>
  `;
}

function generateSystemReport(data, filters) {
  const model = systemReportModel(data, filters);
  const reportHtml = systemReportMarkup(model);
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    downloadHtmlReport(reportHtml, "informe-ejecutivo-sad");
    return;
  }
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
  reportWindow.opener = null;
  reportWindow.focus();
  window.setTimeout(() => reportWindow.print(), 350);
}

function generateAdvancedSystemReport(data, filters) {
  if (!isAdvancedReportAvailable()) {
    generateSystemReport(data, filters);
    return;
  }
  const model = systemReportModel(data, filters);
  const reportHtml = advancedSystemReportMarkup(model);
  const reportWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!reportWindow) {
    downloadHtmlReport(reportHtml, "informe-avanzado-sad");
    return;
  }
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
  reportWindow.opener = null;
  reportWindow.focus();
}

function isAdvancedReportAvailable() {
  const host = window.location.hostname;
  return host === "localhost"
    || host === "127.0.0.1"
    || host.endsWith(".local")
    || host.startsWith("192.168.")
    || host.startsWith("10.")
    || host.startsWith("172.");
}

function systemReportModel(data, filters) {
  const rows = data.solicitudes.filter((item) => (
    matchesReportRange(item, filters.range)
    && (filters.departmentId === "all" || item.departamento_id === filters.departmentId)
    && (filters.documentTypeId === "all" || item.tipo_documento_id === filters.documentTypeId)
  ));
  const finalRows = rows.filter((item) => [STATUS.APPROVED, STATUS.REJECTED, STATUS.CORRECTION].includes(item.estado));
  const approved = rows.filter((item) => item.estado === STATUS.APPROVED);
  const purchases = purchaseRequests(rows);
  const purchaseMetrics = purchaseStats(purchases);
  const averageMinutes = average(finalRows.map(approvalCycleMinutes).filter((value) => value !== null));
  const pendingRows = rows.filter((item) => item.estado === STATUS.PENDING);
  const oldPending = pendingRows.filter((item) => requestAgeDays(item) >= 3);
  const departmentLabel = filters.departmentId === "all"
    ? "Todos los departamentos"
    : data.departamentos.find((item) => item.id === filters.departmentId)?.nombre || "Departamento";
  const documentLabel = filters.documentTypeId === "all"
    ? "Todos los documentos"
    : data.tipos_documento.find((item) => item.id === filters.documentTypeId)?.nombre || "Documento";
  const approvalRate = rows.length ? Math.round((approved.length / rows.length) * 100) : 0;
  const correctionRate = rows.length ? Math.round((rows.filter((item) => item.estado === STATUS.CORRECTION).length / rows.length) * 100) : 0;

  return {
    data,
    filters,
    rows,
    stats: {
      total: rows.length,
      pending: pendingRows.length,
      approved: approved.length,
      rejected: rows.filter((item) => item.estado === STATUS.REJECTED).length,
      correction: rows.filter((item) => item.estado === STATUS.CORRECTION).length,
      approvalRate,
      correctionRate,
      averageMinutes,
      oldPending: oldPending.length
    },
    purchases,
    purchaseMetrics,
    departmentLabel,
    documentLabel,
    rangeLabel: rangeLabelText(filters.range),
    departmentBreakdown: groupRequestMetrics(rows, data.departamentos, "departamento_id", "Sin departamento"),
    documentBreakdown: groupRequestMetrics(rows, data.tipos_documento, "tipo_documento_id", "Sin tipo"),
    approverBreakdown: approverMetrics(rows, data),
    delayedCompletions: delayedCompletionRows(rows, data),
    oldPending: [...oldPending].sort((a, b) => requestAgeDays(b) - requestAgeDays(a)).slice(0, 8),
    recentActivity: [...rows].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 12)
  };
}

function systemReportMarkup(model) {
  const flowRows = systemFlowRows(model);
  const maxFlow = Math.max(1, ...flowRows.map(([, value]) => value));
  const strengths = reportStrengths(model);
  const weaknesses = reportWeaknesses(model);
  const actions = reportActions(model);
  const generatedAt = new Date().toISOString();

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Informe ejecutivo SAD</title>
  <style>
    :root { --text:#101828; --muted:#667085; --line:#d7dee8; --soft:#f5f7fb; --primary:#2563eb; --success:#0f8f61; --warning:#b7791f; --danger:#c2413d; --ink:#0b1220; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--text); background:#fff; font-family:Inter, Arial, sans-serif; }
    main { max-width:1120px; margin:0 auto; padding:34px; }
    header { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:22px; align-items:start; padding-bottom:22px; border-bottom:3px solid var(--ink); }
    h1 { margin:0; font-size:34px; line-height:1.05; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:20px; }
    h3 { margin:0 0 8px; font-size:15px; }
    p { margin:0; line-height:1.45; }
    ul { margin:0; padding-left:18px; }
    li { margin:5px 0; }
    .muted { color:var(--muted); }
    .cover { display:flex; gap:16px; align-items:flex-start; }
    .brand { display:grid; place-items:center; width:64px; height:64px; flex:0 0 auto; color:#fff; border-radius:16px; background:linear-gradient(135deg,#0f2f86,#2563eb); font-size:22px; font-weight:900; }
    .meta { text-align:right; color:var(--muted); font-size:12px; font-weight:800; }
    .grid { display:grid; gap:14px; }
    .kpis { grid-template-columns:repeat(4,1fr); margin:22px 0; }
    .card { border:1px solid var(--line); border-radius:14px; padding:15px; background:#fff; break-inside:avoid; }
    .card.metric span { display:block; color:var(--muted); font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
    .card.metric strong { display:block; margin-top:9px; font-size:25px; }
    .section { margin-top:22px; break-inside:avoid; }
    .two-col { grid-template-columns:1fr 1fr; }
    .three-col { grid-template-columns:1fr 1fr 1fr; }
    .executive { border-left:5px solid var(--primary); background:var(--soft); }
    .pill-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .pill { border-radius:999px; padding:5px 10px; background:#eaf1ff; color:#1d4ed8; font-size:12px; font-weight:900; }
    .chart { display:grid; gap:11px; }
    .bar { display:grid; grid-template-columns:190px minmax(0,1fr) 42px; gap:12px; align-items:center; }
    .bar label { font-weight:850; }
    .track { height:14px; overflow:hidden; border-radius:999px; background:var(--soft); }
    .track i { display:block; height:100%; border-radius:inherit; background:var(--primary); }
    .bar strong { text-align:right; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th { color:var(--muted); text-align:left; text-transform:uppercase; letter-spacing:.04em; font-size:10px; }
    th, td { padding:9px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
    td strong { display:block; }
    .badge { display:inline-block; border-radius:999px; padding:3px 8px; background:var(--soft); font-size:11px; font-weight:900; }
    .ok { color:var(--success); background:#e9f8f1; }
    .warn { color:var(--warning); background:#fff7df; }
    .danger { color:var(--danger); background:#fff0ef; }
    .split { display:grid; grid-template-columns:1.15fr .85fr; gap:14px; }
    footer { margin-top:28px; padding-top:12px; border-top:1px solid var(--line); color:var(--muted); font-size:11px; }
    @media print {
      body { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
      main { max-width:none; padding:22px; }
      .card, .section { break-inside:avoid; }
    }
    @media (max-width:820px) {
      main { padding:18px; }
      header, .split, .two-col, .three-col { grid-template-columns:1fr; }
      .meta { text-align:left; }
      .kpis { grid-template-columns:repeat(2,1fr); }
      .bar { grid-template-columns:1fr 38px; }
      .track { grid-column:1 / -1; order:3; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="cover">
        <div class="brand">SAD</div>
        <div>
          <h1>Informe ejecutivo del flujo documental</h1>
          <p class="muted">Evaluacion de aprobaciones, tiempos, carga operativa y oportunidades de mejora.</p>
          <div class="pill-row">
            <span class="pill">${escapeHtml(model.rangeLabel)}</span>
            <span class="pill">${escapeHtml(model.departmentLabel)}</span>
            <span class="pill">${escapeHtml(model.documentLabel)}</span>
          </div>
        </div>
      </div>
      <div class="meta">
        <p>Generado: ${formatDate(generatedAt)}</p>
        <p>Solicitudes analizadas: ${model.stats.total}</p>
      </div>
    </header>

    <section class="grid kpis">
      ${systemKpis(model).map(([label, value]) => `<article class="card metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`).join("")}
    </section>

    <section class="section card executive">
      <h2>Lectura ejecutiva</h2>
      <p>${escapeHtml(executiveNarrative(model))}</p>
    </section>

    <section class="section split">
      <article class="card">
        <h2>Flujo general</h2>
        <div class="chart">${flowRows.map(([label, value]) => reportBarRow(label, value, maxFlow)).join("")}</div>
      </article>
      <article class="card">
        <h2>Fortalezas y debilidades</h2>
        <div class="grid two-col">
          <div><h3>Fortalezas</h3><ul>${strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
          <div><h3>Debilidades</h3><ul>${weaknesses.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
        </div>
      </article>
    </section>

    <section class="section card">
      <h2>Acciones sugeridas</h2>
      <ul>${actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>

    <section class="section grid two-col">
      <article class="card">
        <h2>Metricas por departamento</h2>
        ${metricsTable(model.departmentBreakdown, "Departamento")}
      </article>
      <article class="card">
        <h2>Metricas por tipo de documento</h2>
        ${metricsTable(model.documentBreakdown, "Documento")}
      </article>
    </section>

    <section class="section grid two-col">
      <article class="card">
        <h2>Carga por aprobador</h2>
        ${approverTable(model.approverBreakdown)}
      </article>
      <article class="card">
        <h2>Compras y ejecucion</h2>
        ${purchaseExecutionSummary(model)}
      </article>
    </section>

    <section class="section card">
      <h2>Solicitudes que requieren atencion</h2>
      ${attentionTable(model.oldPending)}
    </section>

    <section class="section card">
      <h2>Detalle operativo</h2>
      ${detailTable(model.recentActivity)}
    </section>

    <footer>Reporte generado desde SAD. Se recomienda revisarlo mensualmente junto a responsables de departamentos y aprobadores.</footer>
  </main>
</body>
</html>`;
}

function advancedSystemReportMarkup(model) {
  const chartPayload = advancedChartPayload(model);
  const generatedAt = new Date().toISOString();
  const csvHref = reportCsvHref(chartPayload.csvRows);
  const excelHref = reportExcelHref(chartPayload.csvRows);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Informe avanzado SAD</title>
  <style>
    :root { --text:#111827; --muted:#64748b; --line:#dbe4ef; --primary:#2563eb; --shadow:0 22px 60px rgba(15,23,42,.12); }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--text); background:linear-gradient(135deg,#eef5ff 0%,#f8fbff 52%,#fff5f3 100%); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width:1320px; margin:0 auto; padding:32px; }
    header { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:22px; align-items:start; margin-bottom:24px; }
    h1, h2, h3, p { margin:0; }
    h1 { font-size:clamp(30px,4vw,52px); line-height:1; letter-spacing:0; }
    h2 { font-size:20px; }
    h3 { font-size:15px; }
    p { line-height:1.45; }
    a { color:inherit; text-decoration:none; }
    .brand-line { display:flex; gap:16px; align-items:center; }
    .logo { display:grid; place-items:center; width:72px; height:72px; border-radius:22px; color:#fff; font-size:25px; font-weight:950; background:linear-gradient(135deg,#051b63,#2563eb); box-shadow:var(--shadow); }
    .subtitle { margin-top:8px; color:var(--muted); font-size:17px; }
    .filters { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; color:#1d4ed8; font-weight:850; }
    .chip { border:1px solid #bfdbfe; border-radius:999px; padding:8px 12px; background:rgba(255,255,255,.72); }
    .actions { display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end; align-items:center; margin-top:14px; }
    .btn { display:inline-flex; align-items:center; justify-content:center; border-radius:12px; padding:10px 14px; color:#111827; background:#fff; border:1px solid var(--line); font-weight:850; box-shadow:var(--shadow); }
    .print-note { color:var(--muted); font-size:12px; font-weight:800; text-align:right; }
    .grid { display:grid; gap:18px; }
    .kpis { grid-template-columns:repeat(4,minmax(0,1fr)); margin-bottom:18px; }
    .card { border:1px solid rgba(148,163,184,.28); border-radius:24px; padding:22px; background:rgba(255,255,255,.86); box-shadow:var(--shadow); break-inside:avoid; }
    .metric span { display:block; color:var(--muted); font-size:12px; font-weight:950; text-transform:uppercase; letter-spacing:.05em; }
    .metric strong { display:block; margin-top:12px; font-size:32px; line-height:1; }
    .metric em { display:block; margin-top:8px; color:var(--muted); font-style:normal; font-weight:750; }
    .charts { grid-template-columns:1.25fr .75fr; }
    .two { grid-template-columns:1fr 1fr; }
    .chart-box { min-height:330px; }
    .chart-box.small { min-height:285px; }
    .chart-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:14px; }
    .chart-head p { color:var(--muted); font-size:13px; }
    .svg-chart { display:block; width:100%; height:auto; min-height:230px; }
    .chart-empty { display:grid; min-height:230px; place-items:center; color:var(--muted); border:1px dashed var(--line); border-radius:18px; font-weight:850; }
    .legend { display:flex; flex-wrap:wrap; gap:8px 14px; margin-top:12px; color:var(--muted); font-size:12px; font-weight:850; }
    .legend i { display:inline-block; width:10px; height:10px; margin-right:6px; border-radius:999px; vertical-align:-1px; }
    .narrative { font-size:17px; color:#334155; }
    .insight-list { display:grid; gap:10px; padding:0; margin:0; list-style:none; }
    .insight-list li { display:flex; gap:10px; align-items:flex-start; color:#334155; }
    .dot { width:10px; height:10px; flex:0 0 auto; margin-top:7px; border-radius:999px; background:var(--primary); }
    .table-wrap { overflow:auto; border:1px solid var(--line); border-radius:18px; background:#fff; }
    table { width:100%; min-width:940px; border-collapse:collapse; font-size:13px; }
    th, td { padding:12px 14px; border-bottom:1px solid var(--line); text-align:left; vertical-align:middle; }
    th { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
    tr:last-child td { border-bottom:0; }
    td strong { display:block; }
    .muted { color:var(--muted); }
    .badge { display:inline-flex; align-items:center; max-width:100%; border-radius:999px; padding:4px 10px; font-weight:900; font-size:12px; white-space:nowrap; }
    .ok { color:#047857; background:#dff8ed; }
    .warn { color:#92400e; background:#fff3cf; }
    .danger { color:#b91c1c; background:#fee2e2; }
    .neutral { color:#334155; background:#e2e8f0; }
    @media print {
      body { background:#fff; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
      main { max-width:none; padding:18px; }
      .actions { display:none; }
      .card { box-shadow:none; }
    }
    @media (max-width:980px) {
      main { padding:18px; }
      header, .charts, .two { grid-template-columns:1fr; }
      .kpis { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .filters, .actions { justify-content:flex-start; }
    }
    @media (max-width:560px) {
      .kpis { grid-template-columns:1fr; }
      .brand-line { align-items:flex-start; }
      .logo { width:58px; height:58px; border-radius:18px; font-size:20px; }
      .card { padding:16px; border-radius:18px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand-line">
        <div class="logo">SAD</div>
        <div>
          <h1>Informe avanzado del flujo documental</h1>
          <p class="subtitle">Analisis visual para detectar volumen, cuellos de botella, tiempos de respuesta y comportamiento por area.</p>
        </div>
      </div>
      <div>
        <div class="filters">
          <span class="chip">${escapeHtml(model.rangeLabel)}</span>
          <span class="chip">${escapeHtml(model.departmentLabel)}</span>
          <span class="chip">${escapeHtml(model.documentLabel)}</span>
        </div>
        <div class="actions">
          <a class="btn" href="${escapeAttr(csvHref)}" download="informe-sad-datos.csv">Datos CSV</a>
          <a class="btn" href="${escapeAttr(excelHref)}" download="informe-sad-tabla.xls">Tabla Excel</a>
          <span class="print-note">PDF: usa Imprimir / Guardar como PDF</span>
        </div>
      </div>
    </header>

    <section class="grid kpis">
      ${systemKpis(model).map(([label, value]) => `<article class="card metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><em>${escapeHtml(kpiHint(label, value))}</em></article>`).join("")}
    </section>

    <section class="grid charts">
      <article class="card chart-box">
        <div class="chart-head"><div><h2>Tendencia diaria</h2><p>Solicitudes creadas y cerradas durante el periodo.</p></div></div>
        ${lineChartSvg(chartPayload.trend)}
      </article>
      <article class="card chart-box">
        <div class="chart-head"><div><h2>Estados</h2><p>Distribucion del flujo actual.</p></div></div>
        ${donutChartSvg(chartPayload.status.labels, chartPayload.status.values)}
      </article>
    </section>

    <section class="grid two" style="margin-top:18px">
      <article class="card chart-box small">
        <div class="chart-head"><div><h2>Departamentos</h2><p>Total y pendientes por area.</p></div></div>
        ${groupedBarChartSvg(chartPayload.departments.labels, [
          { name: "Total", values: chartPayload.departments.total, color: "#2563eb" },
          { name: "Pendientes", values: chartPayload.departments.pending, color: "#f59e0b" }
        ])}
      </article>
      <article class="card chart-box small">
        <div class="chart-head"><div><h2>Tipos de documento</h2><p>Documentos con mayor uso.</p></div></div>
        ${horizontalBarChartSvg(chartPayload.documents.labels, chartPayload.documents.total, "#14b8a6")}
      </article>
    </section>

    <section class="grid two" style="margin-top:18px">
      <article class="card chart-box small">
        <div class="chart-head"><div><h2>Carga de aprobadores</h2><p>Asignaciones pendientes y aprobadas.</p></div></div>
        ${groupedBarChartSvg(chartPayload.approvers.labels, [
          { name: "Pendientes", values: chartPayload.approvers.pending, color: "#f59e0b" },
          { name: "Aprobadas", values: chartPayload.approvers.approved, color: "#10b981" }
        ])}
      </article>
      <article class="card chart-box small">
        <div class="chart-head"><div><h2>Compras</h2><p>Aprobadas, completadas y pendientes de ejecucion.</p></div></div>
        ${radialBarsSvg(chartPayload.purchases.labels, chartPayload.purchases.values)}
      </article>
    </section>

    <section class="grid two" style="margin-top:18px">
      <article class="card">
        <h2>Lectura ejecutiva</h2>
        <p class="narrative">${escapeHtml(executiveNarrative(model))}</p>
      </article>
      <article class="card">
        <h2>Acciones recomendadas</h2>
        <ul class="insight-list">${reportActions(model).map((item) => `<li><span class="dot"></span><span>${escapeHtml(item)}</span></li>`).join("")}</ul>
      </article>
    </section>

    <section class="grid two" style="margin-top:18px">
      <article class="card">
        <h2>Fortalezas</h2>
        <ul class="insight-list">${reportStrengths(model).map((item) => `<li><span class="dot" style="background:#10b981"></span><span>${escapeHtml(item)}</span></li>`).join("")}</ul>
      </article>
      <article class="card">
        <h2>Riesgos o debilidades</h2>
        <ul class="insight-list">${reportWeaknesses(model).map((item) => `<li><span class="dot" style="background:#f59e0b"></span><span>${escapeHtml(item)}</span></li>`).join("")}</ul>
      </article>
    </section>

    <section class="card" style="margin-top:18px">
      <div class="chart-head"><div><h2>Solicitudes con mas de 3 dias en completarse</h2><p>Casos cerrados tarde, responsable asignado y datos clave para seguimiento.</p></div><span class="muted">Generado: ${formatDate(generatedAt)}</span></div>
      <div class="table-wrap">${delayedCompletionTable(model.delayedCompletions)}</div>
    </section>
  </main>
</body>
</html>`;
}

function advancedChartPayload(model) {
  const statusRows = [
    ["Pendientes", model.stats.pending],
    ["Aprobadas", model.stats.approved],
    ["Rechazadas", model.stats.rejected],
    ["Correccion", model.stats.correction]
  ];
  const departments = model.departmentBreakdown.slice(0, 8);
  const documents = model.documentBreakdown.slice(0, 8);
  const approvers = model.approverBreakdown.slice(0, 8);
  return {
    status: {
      labels: statusRows.map(([label]) => label),
      values: statusRows.map(([, value]) => value)
    },
    departments: {
      labels: departments.map((row) => row.name),
      total: departments.map((row) => row.total),
      pending: departments.map((row) => row.pending)
    },
    documents: {
      labels: documents.map((row) => row.name),
      total: documents.map((row) => row.total)
    },
    approvers: {
      labels: approvers.map((row) => row.name),
      pending: approvers.map((row) => row.pending),
      approved: approvers.map((row) => row.approved)
    },
    purchases: {
      labels: ["Aprobadas", "Completadas", "Por completar", "Rechazadas"],
      values: [
        model.purchaseMetrics.approved,
        model.purchaseMetrics.completed,
        model.purchaseMetrics.pendingExecution,
        model.purchaseMetrics.rejected
      ]
    },
    trend: trendPayload(model.rows),
    csvRows: reportCsvRows(model)
  };
}

function trendPayload(rows) {
  const buckets = new Map();
  rows.forEach((item) => {
    const createdKey = dayKey(item.created_at);
    if (createdKey) {
      const bucket = buckets.get(createdKey) || { created: 0, closed: 0 };
      bucket.created += 1;
      buckets.set(createdKey, bucket);
    }
    if ([STATUS.APPROVED, STATUS.REJECTED, STATUS.CORRECTION].includes(item.estado)) {
      const closedKey = dayKey(item.updated_at);
      if (closedKey) {
        const bucket = buckets.get(closedKey) || { created: 0, closed: 0 };
        bucket.closed += 1;
        buckets.set(closedKey, bucket);
      }
    }
  });
  const labels = [...buckets.keys()].sort().slice(-18);
  return {
    labels: labels.map((label) => label.slice(5)),
    created: labels.map((label) => buckets.get(label)?.created || 0),
    closed: labels.map((label) => buckets.get(label)?.closed || 0)
  };
}

function dayKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function delayedCompletionTable(rows) {
  if (!rows.length) return `<p class="muted" style="padding:16px">No hay solicitudes completadas con mas de 3 dias para este filtro.</p>`;
  return `
    <table>
      <thead>
        <tr><th>Solicitud</th><th>Responsable</th><th>Departamento</th><th>Tipo</th><th>Etapa</th><th>Estado</th><th>Duracion</th><th>Completada</th></tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><strong>${escapeHtml(row.title)}</strong><span class="muted">${escapeHtml(row.code)}</span></td>
            <td>${escapeHtml(row.responsible)}</td>
            <td>${escapeHtml(row.department)}</td>
            <td>${escapeHtml(row.type)}</td>
            <td>${escapeHtml(row.stage)}</td>
            <td>${statusBadge(row.status)}</td>
            <td><strong>${escapeHtml(row.duration)}</strong></td>
            <td>${escapeHtml(formatDate(row.completedAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function delayedCompletionRows(rows, data) {
  return rows
    .map((item) => completionInsight(item, data))
    .filter((row) => row && row.minutes > 4320)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 30);
}

function completionInsight(item, data) {
  if (item.ejecucion_estado === "Completada" && item.fecha_completada) {
    const minutes = purchaseExecutionMinutes(item);
    return {
      id: item.id,
      code: item.codigo || "",
      title: item.titulo || item.codigo || "Solicitud",
      responsible: profileName(data.profiles.find((profile) => profile.id === item.completado_por)),
      department: item.departamento?.nombre || "-",
      type: item.tipo?.nombre || "-",
      stage: "Ejecucion de compra",
      status: item.ejecucion_estado,
      minutes,
      duration: formatDuration(minutes),
      createdAt: item.created_at,
      completedAt: item.fecha_completada,
      comments: item.comentario_completado || ""
    };
  }

  if (![STATUS.APPROVED, STATUS.REJECTED, STATUS.CORRECTION].includes(item.estado)) return null;
  const minutes = approvalCycleMinutes(item);
  if (minutes === null) return null;
  const responsibleProfile = item.aprobador || latestApprovalProfile(item.id, data) || item.creador;
  return {
    id: item.id,
    code: item.codigo || "",
    title: item.titulo || item.codigo || "Solicitud",
    responsible: profileName(responsibleProfile),
    department: item.departamento?.nombre || "-",
    type: item.tipo?.nombre || "-",
    stage: "Decision documental",
    status: item.estado,
    minutes,
    duration: formatDuration(minutes),
    createdAt: item.created_at,
    completedAt: item.fecha_aprobacion || item.updated_at,
    comments: item.comentario_aprobacion || ""
  };
}

function latestApprovalProfile(solicitudId, data) {
  const approval = data.solicitud_aprobadores
    .filter((item) => item.solicitud_id === solicitudId && item.fecha_accion)
    .sort((a, b) => new Date(b.fecha_accion) - new Date(a.fecha_accion))[0];
  return approval ? data.profiles.find((profile) => profile.id === approval.usuario_id) : null;
}

function reportCsvRows(model) {
  const delayedById = new Map(model.delayedCompletions.map((row) => [row.id, row]));
  return model.rows.map((item) => {
    const insight = completionInsight(item, model.data);
    const delayed = delayedById.get(item.id);
    return [
      item.codigo || "",
      item.titulo || "",
      item.departamento?.nombre || "",
      item.tipo?.nombre || "",
      item.estado || "",
      item.ejecucion_estado || "No aplica",
      insight?.responsible || profileName(item.aprobador || item.creador),
      insight?.stage || "-",
      insight?.duration || "-",
      delayed ? "Si" : "No",
      formatDate(item.created_at),
      formatDate(insight?.completedAt || item.fecha_aprobacion || item.updated_at),
      insight?.comments || item.observaciones || ""
    ];
  });
}

function lineChartSvg(trend) {
  const labels = trend.labels || [];
  const created = trend.created || [];
  const closed = trend.closed || [];
  if (!labels.length) return chartEmpty("No hay tendencia para mostrar.");
  const width = 760;
  const height = 260;
  const pad = { left: 42, right: 18, top: 18, bottom: 34 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(1, ...created, ...closed);
  const x = (index) => pad.left + (labels.length === 1 ? chartWidth / 2 : (index / (labels.length - 1)) * chartWidth);
  const y = (value) => pad.top + chartHeight - (value / maxValue) * chartHeight;
  const path = (values) => values.map((value, index) => `${index ? "L" : "M"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const area = (values) => `${path(values)} L ${x(values.length - 1).toFixed(1)} ${pad.top + chartHeight} L ${x(0).toFixed(1)} ${pad.top + chartHeight} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const gy = pad.top + chartHeight - step * chartHeight;
    return `<line x1="${pad.left}" y1="${gy}" x2="${width - pad.right}" y2="${gy}" stroke="#e2e8f0"/><text x="8" y="${gy + 4}" fill="#64748b" font-size="11">${Math.round(maxValue * step)}</text>`;
  }).join("");
  const labelStep = Math.max(1, Math.ceil(labels.length / 8));
  const xLabels = labels.map((label, index) => index % labelStep ? "" : `<text x="${x(index)}" y="${height - 8}" fill="#64748b" font-size="11" text-anchor="middle">${escapeHtml(label)}</text>`).join("");

  return `
    <svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia diaria de solicitudes">
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#f8fafc"/>
      ${grid}
      <path d="${area(created)}" fill="rgba(37,99,235,.12)"></path>
      <path d="${area(closed)}" fill="rgba(20,184,166,.10)"></path>
      <path d="${path(created)}" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="${path(closed)}" fill="none" stroke="#14b8a6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      ${created.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4" fill="#2563eb"/>`).join("")}
      ${closed.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4" fill="#14b8a6"/>`).join("")}
      ${xLabels}
    </svg>
    ${legendItems([{ name: "Creadas", color: "#2563eb" }, { name: "Cerradas", color: "#14b8a6" }])}
  `;
}

function donutChartSvg(labels, values) {
  const colors = ["#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#2563eb"];
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return chartEmpty("No hay estados para mostrar.");
  const radius = 82;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const rings = values.map((value, index) => {
    const length = (value / total) * circumference;
    const circle = `<circle cx="150" cy="128" r="${radius}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="30" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 150 128)" stroke-linecap="round"/>`;
    offset += length;
    return circle;
  }).join("");

  return `
    <svg class="svg-chart" viewBox="0 0 520 260" role="img" aria-label="Distribucion por estado">
      <rect x="0" y="0" width="520" height="260" rx="18" fill="#f8fafc"/>
      <circle cx="150" cy="128" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="30"/>
      ${rings}
      <text x="150" y="120" text-anchor="middle" fill="#111827" font-size="30" font-weight="900">${total}</text>
      <text x="150" y="145" text-anchor="middle" fill="#64748b" font-size="13" font-weight="800">solicitudes</text>
      ${labels.map((label, index) => `
        <g transform="translate(300 ${62 + index * 34})">
          <circle cx="0" cy="0" r="6" fill="${colors[index % colors.length]}"/>
          <text x="16" y="5" fill="#334155" font-size="14" font-weight="800">${escapeHtml(label)}</text>
          <text x="170" y="5" fill="#111827" font-size="14" font-weight="900" text-anchor="end">${values[index]}</text>
        </g>
      `).join("")}
    </svg>
    ${legendItems(labels.map((label, index) => ({ name: `${label}: ${values[index]}`, color: colors[index % colors.length] })))}
  `;
}

function groupedBarChartSvg(labels, series) {
  if (!labels.length || !series.some((item) => item.values.some(Boolean))) return chartEmpty("No hay datos para esta grafica.");
  const width = 760;
  const height = 280;
  const pad = { left: 42, right: 18, top: 18, bottom: 54 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(1, ...series.flatMap((item) => item.values));
  const groupWidth = chartWidth / labels.length;
  const barWidth = Math.max(7, Math.min(28, (groupWidth - 10) / series.length));
  const grid = [0, 0.5, 1].map((step) => {
    const gy = pad.top + chartHeight - step * chartHeight;
    return `<line x1="${pad.left}" y1="${gy}" x2="${width - pad.right}" y2="${gy}" stroke="#e2e8f0"/><text x="8" y="${gy + 4}" fill="#64748b" font-size="11">${Math.round(maxValue * step)}</text>`;
  }).join("");
  const bars = labels.map((label, groupIndex) => {
    const start = pad.left + groupIndex * groupWidth + (groupWidth - barWidth * series.length) / 2;
    return series.map((item, seriesIndex) => {
      const value = item.values[groupIndex] || 0;
      const barHeight = (value / maxValue) * chartHeight;
      const bx = start + seriesIndex * barWidth;
      const by = pad.top + chartHeight - barHeight;
      return `<rect x="${bx}" y="${by}" width="${barWidth - 3}" height="${Math.max(2, barHeight)}" rx="6" fill="${escapeAttr(item.color)}"><title>${escapeHtml(label)} · ${escapeHtml(item.name)}: ${value}</title></rect>`;
    }).join("");
  }).join("");
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));
  const xLabels = labels.map((label, index) => index % labelStep ? "" : `<text x="${pad.left + index * groupWidth + groupWidth / 2}" y="${height - 22}" fill="#64748b" font-size="11" font-weight="800" text-anchor="middle">${escapeHtml(truncate(label, 13))}</text>`).join("");

  return `
    <svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafica de barras">
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#f8fafc"/>
      ${grid}
      ${bars}
      ${xLabels}
    </svg>
    ${legendItems(series)}
  `;
}

function horizontalBarChartSvg(labels, values, color) {
  if (!labels.length || !values.some(Boolean)) return chartEmpty("No hay datos para esta grafica.");
  const width = 760;
  const rowHeight = 34;
  const height = Math.max(230, 36 + labels.length * rowHeight);
  const labelWidth = 190;
  const maxValue = Math.max(1, ...values);
  return `
    <svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafica horizontal">
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#f8fafc"/>
      ${labels.map((label, index) => {
        const rowY = 28 + index * rowHeight;
        const barWidth = ((values[index] || 0) / maxValue) * (width - labelWidth - 80);
        return `
          <text x="22" y="${rowY + 15}" fill="#334155" font-size="13" font-weight="850">${escapeHtml(truncate(label, 24))}</text>
          <rect x="${labelWidth}" y="${rowY}" width="${width - labelWidth - 62}" height="20" rx="10" fill="#e2e8f0"/>
          <rect x="${labelWidth}" y="${rowY}" width="${Math.max(4, barWidth)}" height="20" rx="10" fill="${escapeAttr(color)}"/>
          <text x="${width - 24}" y="${rowY + 15}" fill="#111827" font-size="13" font-weight="900" text-anchor="end">${values[index] || 0}</text>
        `;
      }).join("")}
    </svg>
  `;
}

function radialBarsSvg(labels, values) {
  const colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444"];
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return chartEmpty("No hay compras para mostrar.");
  const maxValue = Math.max(1, ...values);
  const rings = values.map((value, index) => {
    const radius = 92 - index * 18;
    const circumference = 2 * Math.PI * radius;
    const length = (value / maxValue) * circumference;
    return `<circle cx="160" cy="128" r="${radius}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="12" stroke-dasharray="${length} ${circumference - length}" transform="rotate(-90 160 128)" stroke-linecap="round"/>`;
  }).join("");

  return `
    <svg class="svg-chart" viewBox="0 0 560 260" role="img" aria-label="Flujo de compras">
      <rect x="0" y="0" width="560" height="260" rx="18" fill="#f8fafc"/>
      ${values.map((_, index) => `<circle cx="160" cy="128" r="${92 - index * 18}" fill="none" stroke="#e2e8f0" stroke-width="12"/>`).join("")}
      ${rings}
      <text x="160" y="122" text-anchor="middle" fill="#111827" font-size="30" font-weight="900">${total}</text>
      <text x="160" y="146" text-anchor="middle" fill="#64748b" font-size="13" font-weight="800">movimientos</text>
      ${labels.map((label, index) => `
        <g transform="translate(330 ${60 + index * 36})">
          <circle cx="0" cy="0" r="6" fill="${colors[index % colors.length]}"/>
          <text x="16" y="5" fill="#334155" font-size="14" font-weight="800">${escapeHtml(label)}</text>
          <text x="190" y="5" fill="#111827" font-size="14" font-weight="900" text-anchor="end">${values[index] || 0}</text>
        </g>
      `).join("")}
    </svg>
    ${legendItems(labels.map((label, index) => ({ name: `${label}: ${values[index] || 0}`, color: colors[index % colors.length] })))}
  `;
}

function legendItems(items) {
  return `<div class="legend">${items.map((item) => `<span><i style="background:${escapeAttr(item.color)}"></i>${escapeHtml(item.name)}</span>`).join("")}</div>`;
}

function chartEmpty(message) {
  return `<div class="chart-empty">${escapeHtml(message)}</div>`;
}

function reportCsvHref(rows) {
  const csvRows = [reportExportHeader()].concat(rows || []);
  const csv = csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

function reportExcelHref(rows) {
  const tableRows = [reportExportHeader()].concat(rows || []);
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${tableRows.map((row, index) => `<tr>${row.map((cell) => index === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
  return `data:application/vnd.ms-excel;charset=utf-8,${encodeURIComponent(html)}`;
}

function reportExportHeader() {
  return ["Codigo", "Titulo", "Departamento", "Tipo", "Estado documental", "Estado compras", "Responsable", "Etapa", "Duracion", "Mas de 3 dias", "Creacion", "Completada o actualizada", "Comentarios"];
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}...` : text;
}

function kpiHint(label, value) {
  const text = String(label).toLowerCase();
  if (text.includes("tiempo")) return "Promedio del ciclo documental";
  if (text.includes("tasa")) return "Relacion de aprobadas vs. total";
  if (text.includes("+3")) return "Riesgo de atraso";
  if (Number(value) === 0) return "Sin casos en el periodo";
  return "Dato del alcance seleccionado";
}

function systemKpis(model) {
  return [
    ["Total solicitudes", model.stats.total],
    ["Pendientes", model.stats.pending],
    ["Aprobadas", model.stats.approved],
    ["Rechazadas", model.stats.rejected],
    ["Correcciones", model.stats.correction],
    ["Tasa aprobacion", `${model.stats.approvalRate}%`],
    ["Tiempo promedio", formatDuration(model.stats.averageMinutes)],
    ["Pendientes +3 dias", model.stats.oldPending]
  ];
}

function systemFlowRows(model) {
  return [
    ["Pendientes", model.stats.pending],
    ["Aprobadas", model.stats.approved],
    ["Rechazadas", model.stats.rejected],
    ["Correccion solicitada", model.stats.correction],
    ["Compras por completar", model.purchaseMetrics.pendingExecution]
  ];
}

function reportBarRow(label, value, maxValue) {
  const width = Math.max(4, Math.round((value / maxValue) * 100));
  return `
    <div class="bar">
      <label>${escapeHtml(label)}</label>
      <div class="track"><i style="width:${width}%"></i></div>
      <strong>${value}</strong>
    </div>
  `;
}

function executiveNarrative(model) {
  if (!model.stats.total) return "No hay solicitudes para el alcance seleccionado. No es posible identificar fortalezas o debilidades operativas con este filtro.";
  const parts = [
    `Se analizaron ${model.stats.total} solicitudes para ${model.departmentLabel.toLowerCase()} y ${model.documentLabel.toLowerCase()}.`,
    `La tasa de aprobacion es ${model.stats.approvalRate}% y el tiempo promedio de ciclo es ${formatDuration(model.stats.averageMinutes)}.`
  ];
  if (model.stats.oldPending) parts.push(`${model.stats.oldPending} solicitud${model.stats.oldPending === 1 ? "" : "es"} llevan mas de 3 dias pendientes, lo que indica riesgo de atraso operativo.`);
  if (model.purchaseMetrics.pendingExecution) parts.push(`En compras hay ${model.purchaseMetrics.pendingExecution} orden${model.purchaseMetrics.pendingExecution === 1 ? "" : "es"} aprobada${model.purchaseMetrics.pendingExecution === 1 ? "" : "s"} pendiente${model.purchaseMetrics.pendingExecution === 1 ? "" : "s"} de marcar como completada${model.purchaseMetrics.pendingExecution === 1 ? "" : "s"}.`);
  return parts.join(" ");
}

function reportStrengths(model) {
  const strengths = [];
  if (model.stats.approvalRate >= 75) strengths.push("Buen nivel de aprobacion documental en el periodo.");
  if (model.stats.averageMinutes && model.stats.averageMinutes <= 2880) strengths.push("El tiempo promedio de respuesta se mantiene dentro de un rango operativo razonable.");
  if (!model.stats.oldPending) strengths.push("No hay solicitudes pendientes con mas de 3 dias para el alcance seleccionado.");
  if (model.purchaseMetrics.completed >= model.purchaseMetrics.pendingExecution && model.purchaseMetrics.completed > 0) strengths.push("Compras muestra cierres operativos registrados, no solo aprobaciones documentales.");
  return strengths.length ? strengths : ["El sistema ya centraliza trazabilidad, aprobadores, documentos y comentarios en un solo flujo."];
}

function reportWeaknesses(model) {
  const weaknesses = [];
  if (model.stats.oldPending) weaknesses.push(`${model.stats.oldPending} solicitud${model.stats.oldPending === 1 ? "" : "es"} pendiente${model.stats.oldPending === 1 ? "" : "s"} supera${model.stats.oldPending === 1 ? "" : "n"} 3 dias sin decision.`);
  if (model.stats.correctionRate >= 20) weaknesses.push(`La tasa de correcciones es ${model.stats.correctionRate}%, conviene revisar calidad inicial de las solicitudes.`);
  if (model.stats.rejected > model.stats.approved && model.stats.total) weaknesses.push("Hay mas rechazos que aprobaciones en el alcance filtrado.");
  if (model.purchaseMetrics.pendingExecution) weaknesses.push("Existen compras aprobadas que aun no fueron marcadas como completadas.");
  return weaknesses.length ? weaknesses : ["No se detectan debilidades criticas con los filtros seleccionados."];
}

function reportActions(model) {
  const actions = [];
  if (model.stats.oldPending) actions.push("Revisar diariamente la cola pendiente y priorizar solicitudes con mas de 3 dias.");
  if (model.stats.correctionRate >= 20) actions.push("Crear una guia minima por tipo de documento para reducir correcciones por informacion incompleta.");
  if (model.purchaseMetrics.pendingExecution) actions.push("Pedir al departamento de Compras cerrar ordenes aprobadas cuando la compra este entregada o ejecutada.");
  const busiestDepartment = model.departmentBreakdown[0];
  if (busiestDepartment?.pending) actions.push(`Validar capacidad del departamento ${busiestDepartment.name}, actualmente con ${busiestDepartment.pending} pendiente${busiestDepartment.pending === 1 ? "" : "s"}.`);
  return actions.length ? actions : ["Mantener revision semanal de metricas y usar comentarios para documentar decisiones relevantes."];
}

function groupRequestMetrics(rows, catalog, field, fallback) {
  const names = new Map(catalog.map((item) => [item.id, item.nombre]));
  const grouped = new Map();
  rows.forEach((item) => {
    const id = item[field] || "none";
    const current = grouped.get(id) || { name: names.get(id) || fallback, rows: [] };
    current.rows.push(item);
    grouped.set(id, current);
  });
  return [...grouped.values()]
    .map(({ name, rows: groupRows }) => {
      const finals = groupRows.filter((item) => [STATUS.APPROVED, STATUS.REJECTED, STATUS.CORRECTION].includes(item.estado));
      return {
        name,
        total: groupRows.length,
        pending: groupRows.filter((item) => item.estado === STATUS.PENDING).length,
        approved: groupRows.filter((item) => item.estado === STATUS.APPROVED).length,
        rejected: groupRows.filter((item) => item.estado === STATUS.REJECTED).length,
        correction: groupRows.filter((item) => item.estado === STATUS.CORRECTION).length,
        averageMinutes: average(finals.map(approvalCycleMinutes).filter((value) => value !== null))
      };
    })
    .sort((a, b) => b.total - a.total || b.pending - a.pending);
}

function approverMetrics(rows, data) {
  const rowIds = new Set(rows.map((item) => item.id));
  const grouped = new Map();
  data.solicitud_aprobadores
    .filter((approval) => rowIds.has(approval.solicitud_id))
    .forEach((approval) => {
      const current = grouped.get(approval.usuario_id) || {
        name: profileName(data.profiles.find((profile) => profile.id === approval.usuario_id)),
        assigned: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        correction: 0
      };
      current.assigned += 1;
      if (approval.estado === STATUS.PENDING) current.pending += 1;
      if (approval.estado === STATUS.APPROVED) current.approved += 1;
      if (approval.estado === STATUS.REJECTED) current.rejected += 1;
      if (approval.estado === STATUS.CORRECTION) current.correction += 1;
      grouped.set(approval.usuario_id, current);
    });
  return [...grouped.values()].sort((a, b) => b.pending - a.pending || b.assigned - a.assigned);
}

function metricsTable(rows, firstColumn) {
  if (!rows.length) return `<p class="muted">No hay datos para este filtro.</p>`;
  return `<table><thead><tr><th>${escapeHtml(firstColumn)}</th><th>Total</th><th>Pend.</th><th>Aprob.</th><th>Tiempo</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${row.total}</td><td>${row.pending}</td><td>${row.approved}</td><td>${formatDuration(row.averageMinutes)}</td></tr>`).join("")}</tbody></table>`;
}

function approverTable(rows) {
  if (!rows.length) return `<p class="muted">No hay aprobadores en el alcance seleccionado.</p>`;
  return `<table><thead><tr><th>Aprobador</th><th>Asignadas</th><th>Pend.</th><th>Aprob.</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${row.assigned}</td><td>${row.pending}</td><td>${row.approved}</td></tr>`).join("")}</tbody></table>`;
}

function purchaseExecutionSummary(model) {
  if (!model.purchases.length) return `<p class="muted">No hay documentos de compra en este alcance.</p>`;
  const rows = [
    ["Compras aprobadas", model.purchaseMetrics.approved],
    ["Pendientes de completar", model.purchaseMetrics.pendingExecution],
    ["Completadas", model.purchaseMetrics.completed],
    ["Tiempo promedio ejecucion", formatDuration(model.purchaseMetrics.averageMinutes)]
  ];
  return `<div class="chart">${rows.map(([label, value]) => `<div class="bar"><label>${escapeHtml(label)}</label><div class="track"><i style="width:${typeof value === "number" ? Math.max(4, Math.min(100, value * 10)) : 60}%"></i></div><strong>${escapeHtml(String(value))}</strong></div>`).join("")}</div>`;
}

function attentionTable(rows) {
  if (!rows.length) return `<p class="muted">No hay solicitudes pendientes con mas de 3 dias.</p>`;
  return `<table><thead><tr><th>Solicitud</th><th>Departamento</th><th>Tipo</th><th>Dias</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${escapeHtml(item.titulo || item.codigo)}</strong><span class="muted">${escapeHtml(item.codigo)}</span></td><td>${escapeHtml(item.departamento?.nombre || "-")}</td><td>${escapeHtml(item.tipo?.nombre || "-")}</td><td>${requestAgeDays(item)}</td></tr>`).join("")}</tbody></table>`;
}

function detailTable(rows) {
  if (!rows.length) return `<p class="muted">No hay solicitudes para este filtro.</p>`;
  return `<table><thead><tr><th>Codigo</th><th>Titulo</th><th>Departamento</th><th>Tipo</th><th>Estado</th><th>Actualizacion</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(item.codigo)}</td><td><strong>${escapeHtml(item.titulo || "-")}</strong></td><td>${escapeHtml(item.departamento?.nombre || "-")}</td><td>${escapeHtml(item.tipo?.nombre || "-")}</td><td>${statusBadge(item.estado)}</td><td>${formatDate(item.updated_at)}</td></tr>`).join("")}</tbody></table>`;
}

function matchesReportRange(item, range) {
  if (!range || range === "all") return true;
  const value = item.created_at || item.updated_at;
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (range === "today") return date >= today;
  if (range === "month") return date >= new Date(now.getFullYear(), now.getMonth(), 1);
  const days = Number(range);
  if (!days) return true;
  const since = new Date(now);
  since.setDate(now.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  return date >= since;
}

function approvalCycleMinutes(item) {
  const end = item.fecha_aprobacion || item.updated_at;
  if (!item.created_at || !end) return null;
  return Math.max(0, new Date(end) - new Date(item.created_at)) / 60000;
}

function requestAgeDays(item) {
  if (!item.created_at) return 0;
  return Math.max(0, Math.ceil((new Date() - new Date(item.created_at)) / 86400000));
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function statusBadge(value = "") {
  const normalized = String(value);
  const className = normalized === "Aprobado" || normalized === "Completada"
    ? "ok"
    : normalized === "Rechazado"
      ? "danger"
      : normalized === "No aplica"
        ? ""
        : "warn";
  return `<span class="badge ${className}">${escapeHtml(normalized || "-")}</span>`;
}

function downloadHtmlReport(reportHtml, baseName = "informe-ejecutivo-sad") {
  const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName}-${new Date().toISOString().slice(0, 10)}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

function rangeLabelText(value) {
  if (value === "today") return "Hoy";
  if (value === "7") return "Ultimos 7 dias";
  if (value === "30") return "Ultimos 30 dias";
  if (value === "all") return "Todo el historico";
  return "Este mes";
}
