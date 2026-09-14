// Popup controller: runs only after the user clicks the toolbar action (activeTab grant),
// injects the self-contained extractor on explicit button press, and exports the result
// through the clipboard or a file download. Nothing is stored or transmitted.
import { buildEnvelope, captureVisibleProduct, normalizeProductUrl } from "./capture.js";
import { captureVisibleSearch, normalizeSearchUrl } from "./search-capture.js";

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
  if (envelope.schemaVersion === "retirefarm-visible-search-v1") return `retirefarm-visible-search-${envelope.capturedAt.replace(/[:.]/g, "-")}.json`;
  const productId = envelope.productUrl.split("/products/")[1];
  const stamp = envelope.capturedAt.replace(/[:.]/g, "-");
  return `retirefarm-visible-product-${productId}-${stamp}.json`;
};

const runSearchCapture = async (tabId, sourceUrl) => {
  const button = byId("capture");
  button.disabled = true; byId("preview").hidden = true;
  setStatus("현재 검색 화면의 상품 목록을 읽는 중…");
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: captureVisibleSearch, args: [sourceUrl] });
    if (normalizeSearchUrl((await chrome.tabs.get(tabId)).url || "") !== sourceUrl) throw new Error("수집 중 검색 주소가 바뀌었습니다.");
    const result = injection?.result;
    if (!result?.ok) throw new Error(result?.message || "검색 목록을 읽지 못했습니다.");
    const envelope = result.envelope, json = JSON.stringify(envelope, null, 2);
    if (json.length > 60000) throw new Error("검색 결과가 너무 큽니다.");
    byId("preview-title").textContent = `${envelope.query} · ${envelope.items.length}개 상품`;
    byId("preview-method").textContent = `검색 화면 · ${envelope.searchSort}`;
    byId("preview-time").textContent = new Date(envelope.capturedAt).toLocaleString("ko-KR");
    byId("preview-size").textContent = "주소·광고·품목 확인 후 후보로 가져오기";
    byId("preview-text").value = envelope.items.map(i => `${i.position}. ${i.storeName} / ${i.title}\n${i.adStatus === "AD" ? "광고" : "광고 여부 미확인"} · ${i.urlStatus}\n${i.productUrl || "실제 상품 주소 확인 필요"}`).join("\n\n");
    byId("preview").hidden = false;
    bindExports({ envelope, json }); setStatus(result.message, "ok");
  } catch (error) { setStatus(error instanceof Error ? error.message : "검색 수집에 실패했습니다.", "error"); }
  finally { button.disabled = false; }
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
  const searchUrl = tab?.url ? normalizeSearchUrl(tab.url) : null;
  if (tab && typeof tab.id === "number" && searchUrl) {
    byId("url").textContent = searchUrl; byId("url").hidden = false;
    document.querySelector(".hint").textContent = "네이버플러스 검색의 현재 상품 목록에서 최대 20개 후보를 읽습니다. 파일을 앱의 ‘검색 후보 JSON 파일 가져오기’에서 검토하세요.";
    setStatus("검색 화면을 확인했습니다. 원하는 검색어·정렬을 선택한 뒤 수집하세요.", "ok");
    byId("capture").disabled = false;
    byId("capture").addEventListener("click", () => runSearchCapture(tab.id, searchUrl));
    return;
  }
  const productUrl = tab?.url ? normalizeProductUrl(tab.url) : null;
  if (!tab || typeof tab.id !== "number" || !productUrl) {
    setStatus("검색어가 있는 네이버플러스 검색 화면 또는 스마트스토어·브랜드스토어 상품 페이지에서 열어 주세요.", "error");
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
