const TEXT_MAP: Record<string, string> = {
  "Drop into shared spaces, make a quiet corner your own, and stay on task together.":
    "เข้าสู่พื้นที่การเรียนรู้ร่วมกัน เลือกมุมของคุณ และเรียนรู้ไปพร้อมกับเพื่อน",
  "Choose a shared space, meet your crew, and make this session count.":
    "เลือกพื้นที่การเรียนรู้ พบเพื่อนร่วมชั้น และใช้เวลาเรียนรู้ให้คุ้มค่า",
  "Could not delete the room": "ไม่สามารถลบห้องได้",
  "Copied": "คัดลอกแล้ว",
  "Copy room code": "คัดลอกรหัสห้อง",
  "COPIED": "คัดลอกแล้ว",
  "your avatar": "ตัวละครของคุณ",
  "Saving...": "กำลังบันทึก...",
  "🎲 Randomize": "🎲 สุ่มตัวละคร",
  "Muted": "ปิดเสียง",
  "Music": "เพลง",
  "tagged": "ถูกแตะแล้ว",
  "(you)": "(คุณ)",
  "Presentation room · only people in here can hear you":
    "ห้องนำเสนอ · เฉพาะคนในห้องนี้เท่านั้นที่ได้ยินคุณ",
  "Share your screen": "แชร์หน้าจอ",
  "Stop sharing": "หยุดแชร์",
  "Watch": "รับชม",
};

function translateText(text: string): string {
  let next = text;
  const exact = TEXT_MAP[next.trim()];
  if (exact) {
    const leading = next.match(/^\s*/)?.[0] ?? "";
    const trailing = next.match(/\s*$/)?.[0] ?? "";
    return leading + exact + trailing;
  }

  next = next.replace(/\bonline\b/g, "ออนไลน์");
  next = next.replace(/\bavailable\b/g, "พร้อมใช้งาน");
  next = next.replace(/\bStop\s*·/g, "หยุด ·");
  return next;
}

function translateNode(node: Node) {
  if (node.nodeType !== Node.TEXT_NODE) return;
  const parent = node.parentElement;
  if (!parent) return;
  if (parent.closest("script,style,textarea,input,[data-thai-ui-ignore]")) return;

  const before = node.nodeValue ?? "";
  const after = translateText(before);
  if (after !== before) node.nodeValue = after;
}

function translateAttributes(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("[title], [aria-label], [placeholder]").forEach((el) => {
    for (const attr of ["title", "aria-label", "placeholder"] as const) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const translated = translateText(value);
      if (translated !== value) el.setAttribute(attr, translated);
    }
  });
}

function translateRoot(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Node[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    nodes.push(current);
    current = walker.nextNode();
  }
  nodes.forEach(translateNode);
  translateAttributes(root);
}

let installed = false;

export function installThaiUiTranslation() {
  if (installed) return;
  installed = true;

  const start = () => {
    translateRoot(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) translateNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) translateRoot(node as Element);
        });
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          translateAttributes(mutation.target.parentElement ?? mutation.target);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder"],
    });
  };

  if (document.body) start();
  else window.addEventListener("DOMContentLoaded", start, { once: true });
}
