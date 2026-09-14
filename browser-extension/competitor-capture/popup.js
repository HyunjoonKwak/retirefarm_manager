// Popup controller: runs only after the user clicks the toolbar action (activeTab grant),
// injects the self-contained extractor on explicit button press, and exports the result
// through the clipboard or a file download. Nothing is stored or transmitted.
import { buildEnvelope, captureVisibleProduct, normalizeProductUrl } from "./capture.js";

const byId = (id) => document.getElementById(id);
const METHOD_LABELS = { selection: "드래그 선택 텍스트", "product-region": "총 금액 주변 영역(자동 범위)" };

const setStatus = (message, tone) => {
  const status = byId("status");
  status.textContent = message;
  status.className = tone ? `status ${tone}` : "status";
};

const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
};

const showPreview = (built) => {
  const { envelope, json } = built;
  byId("preview-title").textContent = envelope.title || "(제목 없음)";
  byId("preview-method").textContent = METHOD_LABELS[envelope.method];
  byId("preview-time").textContent = new Date(envelope.capturedAt).toLocaleString("ko-KR");
  byId("preview-size").textContent = `본문 ${envelope.text.length.toLocaleString()}자 · JSON ${json.length.toLocaleString()}자`;
  byId("preview-text").value = envelope.text;
  byId("preview").hidden = false;
  setStatus("캡처했습니다. 내용을 확인한 뒤 복사하거나 저장하세요.", "ok");
};

const fileNameFor = (envelope) => {
  const productId = envelope.productUrl.split("/products/")[1];
  const stamp = envelope.capturedAt.replace(/[:.]/g, "-");
  return `retirefarm-visible-product-${productId}-${stamp}.json`;
};

const bindExports = (built) => {
  const copy = byId("copy");
  const download = byId("download");
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(built.json);
      setStatus("JSON을 클립보드에 복사했습니다. Retirefarm 앱에 붙여넣으세요.", "ok");
    } catch (error) {
      setStatus(`복사에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  };
  download.onclick = () => {
    const url = URL.createObjectURL(new Blob([built.json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileNameFor(built.envelope);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("JSON 파일 저장을 시작했습니다.", "ok");
  };
};

const runCapture = async (tabId, productUrl) => {
  const button = byId("capture");
  button.disabled = true;
  byId("preview").hidden = true;
  setStatus("화면에 보이는 텍스트를 읽는 중…");
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: captureVisibleProduct, args: [productUrl] });
    const currentTab = await chrome.tabs.get(tabId);
    if (normalizeProductUrl(currentTab.url ?? "") !== productUrl) {
      setStatus("수집 중 상품 주소가 바뀌었습니다. 확장을 다시 열고 수집해 주세요.", "error");
      return;
    }
    const built = buildEnvelope({ capture: injection?.result, productUrl, capturedAt: new Date().toISOString() });
    if (!built.ok) {
      setStatus(built.message, "error");
      return;
    }
    bindExports(built);
    showPreview(built);
  } catch (error) {
    setStatus(`페이지에 접근할 수 없습니다: ${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    button.disabled = false;
  }
};

const init = async () => {
  const tab = await getActiveTab();
  const productUrl = tab?.url ? normalizeProductUrl(tab.url) : null;
  if (!tab || typeof tab.id !== "number" || !productUrl) {
    setStatus("네이버 스마트스토어·브랜드스토어 상품 페이지(https://smartstore.naver.com/<스토어>/products/<번호>)에서만 동작합니다.", "error");
    return;
  }
  const urlLine = byId("url");
  urlLine.textContent = productUrl;
  urlLine.hidden = false;
  setStatus("상품 페이지를 확인했습니다. 옵션을 선택한 뒤 캡처 버튼을 누르세요.", "ok");
  const button = byId("capture");
  button.disabled = false;
  button.addEventListener("click", () => runCapture(tab.id, productUrl));
};

init().catch((error) => setStatus(`초기화에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`, "error"));
