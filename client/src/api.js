// 统一 API 封装:所有请求错误都会抛出带信息的异常,由页面显示,不静默失败
async function handle(res) {
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON 响应 */ }
  if (!res.ok) {
    throw new Error(body?.error || body?.message || `请求失败 (HTTP ${res.status})`);
  }
  return body;
}

export const api = {
  get: (url) => fetch(url).then(handle),
  post: (url, data) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handle),
  put: (url, data) =>
    fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handle),
  del: (url) => fetch(url, { method: 'DELETE' }).then(handle),
  upload: (url, file, field = 'file') => {
    const fd = new FormData();
    fd.append(field, file);
    return fetch(url, { method: 'POST', body: fd }).then(handle);
  },
};

// 导出下载(POST 返回文件流)
export async function downloadExport(url, data, fallbackName = 'export.xlsx') {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }
    throw new Error(body?.error || `导出失败 (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="?([^";]+)"?/);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
