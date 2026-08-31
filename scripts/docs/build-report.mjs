import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const docs = path.join(root, 'docs');
const catalogPath = path.join(docs, 'reference', 'api-catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const escape = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const list = (value) => Array.isArray(value) && value.length
  ? `<ul>${value.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>`
  : '<span class="muted">None documented</span>';

const objectTable = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `<p>${escape(value || 'None')}</p>`;
  return `<div class="table-scroll"><table><tbody>${Object.entries(value).map(([key, item]) => `<tr><th>${escape(key)}</th><td><code>${escape(item)}</code></td></tr>`).join('')}</tbody></table></div>`;
};

const placeholderPath = (value) => String(value).replace(/\{([^}]+)\}/g, '<$1>');
const commandExamples = (endpoint) => {
  const url = `http://localhost:8080${catalog.basePath}${placeholderPath(endpoint.path)}`;
  const auth = endpoint.auth === 'public' ? '' : ' -H "Authorization: Bearer <access-token>"';
  const body = endpoint.body && typeof endpoint.body === 'object' ? ` -H "Content-Type: application/json" -d '${JSON.stringify(endpoint.body)}'` : '';
  const curl = `curl -X ${endpoint.method} "${url}"${auth}${body}`;
  const psHeaders = endpoint.auth === 'public' ? '' : ' -Headers @{ Authorization = "Bearer <access-token>" }';
  const psBody = body ? ` -ContentType "application/json" -Body '${JSON.stringify(endpoint.body)}'` : '';
  const powershell = `Invoke-RestMethod -Method ${endpoint.method} -Uri "${url}"${psHeaders}${psBody}`;
  return { curl, powershell };
};

const endpointHtml = (group, endpoint, index) => {
  const method = endpoint.method.toLowerCase();
  const permission = endpoint.permission || 'public';
  const id = `example-${group.id}-${index}`.replace(/[^a-z0-9-]/gi, '-');
  const headers = endpoint.headers && Object.keys(endpoint.headers).length ? objectTable(endpoint.headers) : '<span class="muted">No special header.</span>';
  const query = endpoint.query && Object.keys(endpoint.query).length ? objectTable(endpoint.query) : '<span class="muted">No query parameters.</span>';
  const pathParams = endpoint.pathParams && Object.keys(endpoint.pathParams).length ? objectTable(endpoint.pathParams) : '<span class="muted">No path parameters.</span>';
  const body = typeof endpoint.body === 'string' ? `<pre>${escape(endpoint.body)}</pre>` : objectTable(endpoint.body);
  const source = (group.source || []).map((item) => `<code>${escape(item)}</code>`).join(', ');
  const commands = commandExamples(endpoint);
  return `<details class="endpoint" data-endpoint data-method="${escape(endpoint.method)}" data-permission="${escape(permission)}"><summary><span class="method ${method}">${escape(endpoint.method)}</span> <code>${escape(catalog.basePath + endpoint.path)}</code> <span class="muted">${escape(endpoint.summary)}</span></summary><div class="endpoint-body"><div class="header-meta"><span class="badge">${escape(group.label)}</span><span class="badge">Auth: ${escape(endpoint.auth)}</span><span class="badge">Permission: ${escape(permission)}</span></div><p>${escape(endpoint.summary)}</p><h3>Parameters</h3><h4>Path</h4>${pathParams}<h4>Query</h4>${query}<h4>Headers</h4>${headers}<h4>Body</h4>${body}<h4>Validation</h4>${list(endpoint.validation)}<h3>Response and failure handling</h3><p><strong>Success:</strong> ${escape(endpoint.success?.status)} · ${escape(endpoint.success?.shape)}${endpoint.success?.location ? ` · Location: <code>${escape(endpoint.success.location)}</code>` : ''}</p><p><strong>Possible statuses:</strong> ${(endpoint.errors || []).map((code) => `<span class="badge ${code >= 500 ? 'red' : code === 409 ? 'amber' : ''}">${escape(code)}</span>`).join(' ')}</p><p>Handle domain errors through <code>ApiProblem</code>; use the correlation ID when reporting a failure. Do not log bearer tokens, refresh cookies, OTPs, or secret variable values.</p><h3>Safe examples</h3><p class="small muted">Replace angle-bracket placeholders only in a local QA environment. The examples never contain real credentials.</p><pre id="${id}">${escape(endpoint.example || `${endpoint.method} ${catalog.basePath + endpoint.path}`)}\n\n# curl\n${escape(commands.curl)}\n\n# PowerShell\n${escape(commands.powershell)}</pre><p class="small muted">Source: ${source}</p></div></details>`;
};

const groupsHtml = catalog.groups.map((group) => `<section class="section" id="${escape(group.id)}"><h2>${escape(group.label)}</h2><p class="section-lede">${escape(group.endpoints.length)} endpoint(s) · Source: ${(group.source || []).map(escape).join(', ')}</p>${group.endpoints.map((endpoint, index) => endpointHtml(group, endpoint, index)).join('')}</section>`).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Complete TestOps REST API handbook generated from the source-grounded API catalog."><title>TestOps API handbook</title><link rel="stylesheet" href="../assets/report.css"></head>
<body id="top"><header class="report-header"><div class="report-header-inner"><p class="eyebrow">Reference · ${escape(catalog.schemaVersion)} · ${escape(catalog.verifiedSource)} · revision ${escape(catalog.verifiedRevision || 'unrecorded')}</p><h1>TestOps API handbook</h1><p class="lede">Every current controller route is listed with authentication, permissions, path/query/header requirements, request bodies, validation, success responses, failure statuses, and a safe copyable example.</p><div class="header-meta"><span class="chip current">Base path: ${escape(catalog.basePath)}</span><span class="chip current">${catalog.groups.reduce((sum, group) => sum + group.endpoints.length, 0)} documented endpoints</span><span class="chip runtime">Examples use placeholders only</span></div></div></header>
<nav class="report-nav" aria-label="API handbook navigation"><div class="report-nav-inner"><a href="../index.html">Report home</a><a href="#auth">Auth</a><a href="#projects">Projects</a><a href="#definitions">Definitions</a><a href="#executions">Executions</a><a href="#dashboard">Dashboard</a><a href="../guides/testops-user-manual.html">User manual</a></div></nav>
<main class="report-main"><section class="panel"><h2>How to read an endpoint</h2><p>Use an access JWT in the <code>Authorization</code> header for bearer-protected routes. The refresh token is an HttpOnly cookie and must never be copied into JavaScript or a report. A project permission is evaluated on the server for every nested resource. Validation, authorization, ancestry, duplicate, stale-version, and infrastructure failures are returned through the structured <code>ApiProblem</code> contract.</p><div class="callout warning"><strong>Safe examples:</strong> the examples intentionally use placeholders such as <code>&lt;project-id&gt;</code> and <code>&lt;access-token&gt;</code>. Replace them only in a local QA environment.</div><div class="toolbar"><label for="endpoint-search">Search endpoints</label><input id="endpoint-search" name="endpointSearch" type="search" data-search aria-label="Search endpoints" placeholder="Search path, feature, body, permission…"><label for="method-filter">HTTP method</label><select id="method-filter" name="method" data-method-filter aria-label="Filter by HTTP method"><option value="">All methods</option><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select><label for="permission-filter">Permission</label><select id="permission-filter" name="permission" data-permission-filter aria-label="Filter by permission"><option value="">All permissions</option><option>public</option><option>authenticated user</option><option>email verified</option><option>project member</option><option>DEFINITION_MANAGE</option><option>EXECUTION_START</option><option>USER_ADMINISTER</option><option>VARIABLE_VIEW</option><option>VARIABLE_MANAGE</option></select><span class="small muted" data-result-count></span></div></section>${groupsHtml}</main><footer class="report-footer"><p>Machine-readable source: <a href="api-catalog.json">api-catalog.json</a>. Architecture and business workflow context: <a href="../architecture/15-codebase-architecture.html">architecture</a> and <a href="../workflows/ui-to-execution-workflow.html">workflow guide</a>.</p></footer><button class="back-to-top" type="button" aria-label="Back to top">Top</button><script src="../assets/report.js"></script></body></html>`;

fs.writeFileSync(path.join(docs, 'reference', 'api-reference.html'), html, 'utf8');
console.log(`Generated ${catalog.groups.reduce((sum, group) => sum + group.endpoints.length, 0)} API entries.`);
