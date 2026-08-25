/**
 * MHT / MHTML Judicial Document Parser & Cleaner
 * 专门解析珠三角及全国法院公开裁判文书网页保存的 .mht / .mhtml (MIME RFC 822 multipart) 文件
 * 支持 Android Chrome、桌面浏览器及 Node.js 环境，无需安装原生 C++ 或桌面依赖。
 */

export interface MHTParseResult {
  success: boolean;
  courtName?: string;
  caseNumber?: string;
  sourceUrl?: string;
  subject?: string;
  rawHtml?: string;
  cleanedText: string;
  charsetName?: string;
  tags: string[];
  error?: string;
}

export interface MIMEPart {
  headers: Record<string, string>;
  contentType: string;
  charset: string;
  encoding: string;
  contentLocation: string;
  bodyBytes: Uint8Array;
  bodyText?: string;
}

/**
 * 标签自动生成规则
 * 地区：广州、深圳、东莞、佛山、惠州、中山、珠海
 * 争议类型：违法解除、加班工资、调岗、竞业限制、经济补偿、劳动合同、工伤、绩效
 */
export function generateCaseTags(data: {
  city?: string;
  court?: string;
  disputeType?: string;
  facts?: string;
  courtReasoning?: string;
  fullText?: string;
}): string[] {
  const tags: Set<string> = new Set();
  const textCorpus = [
    data.city || '',
    data.court || '',
    data.disputeType || '',
    data.facts || '',
    data.courtReasoning || '',
    data.fullText || '',
  ].join(' ');

  // 1. 地区标签匹配
  const targetCities = ['东莞', '深圳', '广州', '佛山', '惠州', '中山', '珠海'];
  for (const c of targetCities) {
    if (textCorpus.includes(c)) {
      tags.add(c);
    }
  }

  // 2. 争议类型标签匹配
  const disputeMapping: Array<{ tag: string; keywords: string[] }> = [
    { tag: '违法解除', keywords: ['违法解除', '旷工', '严重违纪', '违纪解除', '单方解除', '辞退', '开除', '第39条', '第三十九条', '第八十七条', '87条'] },
    { tag: '加班工资', keywords: ['加班费', '加班工资', '延时工作', '法定节假日加班', '休息日加班', '计件加班', '工时', '考勤打卡'] },
    { tag: '调岗', keywords: ['调岗', '降薪', '调整工作岗位', '工作地点变更', '变动工作地点', '职务调整'] },
    { tag: '竞业限制', keywords: ['竞业限制', '商业秘密', '保密协议', '竞业补偿金', '竞业违约金'] },
    { tag: '经济补偿', keywords: ['经济补偿', '经济补偿金', '解除劳动合同经济补偿', '裁员补偿', '第四十六条', '第四十七条', '46条', '47条', '赔偿金'] },
    { tag: '劳动合同', keywords: ['未签书面劳动合同', '未签订劳动合同', '二倍工资', '双倍工资', '事实劳动关系', '劳动合同确认'] },
    { tag: '工伤', keywords: ['工伤', '工伤待遇', '工伤保险', '伤残补助金', '医疗费', '停工留薪', '职业病'] },
    { tag: '绩效', keywords: ['绩效', '年终奖', '提成', '奖金', '考核', 'KPI', '绩效工资'] },
  ];

  for (const item of disputeMapping) {
    if (item.keywords.some((kw) => textCorpus.includes(kw))) {
      tags.add(item.tag);
    }
  }

  // 默认兜底标签
  if (tags.size === 0) {
    tags.add('劳动争议');
  }

  return Array.from(tags);
}

export class MHTParser {
  /**
   * 解析 MHT/MHTML 文件并提取裁判文书清洗后纯文本
   */
  public static async parse(fileOrBuffer: File | ArrayBuffer | string): Promise<MHTParseResult> {
    try {
      let rawBytes: Uint8Array;

      if (typeof fileOrBuffer === 'string') {
        rawBytes = new TextEncoder().encode(fileOrBuffer);
      } else if (fileOrBuffer instanceof File) {
        const buf = await fileOrBuffer.arrayBuffer();
        rawBytes = new Uint8Array(buf);
      } else if (fileOrBuffer instanceof ArrayBuffer) {
        rawBytes = new Uint8Array(fileOrBuffer);
      } else {
        throw new Error('文件解析失败，请尝试上传HTML或TXT版本。');
      }

      if (rawBytes.length === 0) {
        throw new Error('文件内容为空');
      }

      // 1. 初步转为 ASCII/Latin1 字符串用于解析 MIME 头部与 Boundary
      const asciiHeaderStr = MHTParser.bytesToLatin1(rawBytes.slice(0, Math.min(rawBytes.length, 65536)));

      // 2. 提取顶级 MIME 头
      const sourceUrl =
        MHTParser.extractHeaderValue(asciiHeaderStr, 'Snapshot-Content-Location') ||
        MHTParser.extractHeaderValue(asciiHeaderStr, 'Content-Location') ||
        '';
      const subject = MHTParser.decodeMimeWord(
        MHTParser.extractHeaderValue(asciiHeaderStr, 'Subject') || ''
      );

      // 3. 提取 Boundary 分隔符
      const boundary = MHTParser.extractBoundary(asciiHeaderStr);

      let primaryHtml = '';
      let usedCharset = 'utf-8';

      if (boundary) {
        // 多部件 MHTML
        const parts = MHTParser.splitMimeParts(rawBytes, boundary);
        const htmlPart = MHTParser.findPrimaryHtmlPart(parts);

        if (htmlPart) {
          primaryHtml = MHTParser.decodePartContent(htmlPart);
          usedCharset = htmlPart.charset || 'utf-8';
        } else {
          // 找不到 HTML 部分，尝试全文解码
          primaryHtml = MHTParser.tryDecodeText(rawBytes);
        }
      } else {
        // 无 boundary，尝试作为单一 MIME 或纯 HTML 解析
        primaryHtml = MHTParser.tryDecodeText(rawBytes);
      }

      if (!primaryHtml || primaryHtml.trim().length === 0) {
        throw new Error('未在文书中找到有效的裁判文书网页内容');
      }

      // 4. 清洗 HTML 得到结构化纯文本
      const cleanedText = MHTParser.cleanCourtDocumentHtml(primaryHtml);

      if (!cleanedText || cleanedText.trim().length < 20) {
        throw new Error('清洗后文书正文为空或过短，无法提取有效裁判内容');
      }

      // 5. 自动提取案号与法院名称元数据（预提取）
      const courtName = MHTParser.extractCourtFromText(cleanedText);
      const caseNumber = MHTParser.extractCaseNumberFromText(cleanedText);

      // 6. 自动生成标签
      const tags = generateCaseTags({
        court: courtName,
        fullText: cleanedText,
      });

      return {
        success: true,
        courtName,
        caseNumber,
        sourceUrl,
        subject,
        rawHtml: primaryHtml,
        cleanedText,
        charsetName: usedCharset,
        tags,
      };
    } catch (error: any) {
      console.error('MHTParser error details:', error);
      return {
        success: false,
        cleanedText: '',
        tags: [],
        error: error?.message || '文件解析失败，请尝试上传HTML或TXT版本。',
      };
    }
  }

  /**
   * 将二进制流转换为 Latin1 (用于安全匹配 MIME boundary)
   */
  private static bytesToLatin1(bytes: Uint8Array): string {
    let str = '';
    const len = bytes.length;
    for (let i = 0; i < len; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  }

  /**
   * 从头部提取 Boundary
   */
  private static extractBoundary(headerText: string): string | null {
    // 匹配 boundary="----=_NextPart_..." 或 boundary=----=_NextPart_...
    const match = headerText.match(/boundary=["']?([^"';\r\n]+)["']?/i);
    return match ? match[1].trim() : null;
  }

  /**
   * 提取 Header 键值
   */
  private static extractHeaderValue(text: string, headerName: string): string | null {
    const regex = new RegExp(`^${headerName}:\\s*([^\\r\\n]+(?:\\r?\\n[ \\t]+[^\\r\\n]+)*)`, 'im');
    const match = text.match(regex);
    if (!match) return null;
    return match[1].replace(/\r?\n[ \t]+/g, ' ').trim();
  }

  /**
   * 解码 MIME 编码字（如 =?UTF-8?B?...?= 或 =?GBK?Q?...?=）
   */
  private static decodeMimeWord(text: string): string {
    if (!text.includes('=?')) return text;
    return text.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_, charset, encoding, data) => {
      try {
        const isBase64 = encoding.toUpperCase() === 'B';
        const isQP = encoding.toUpperCase() === 'Q';
        const charSetLower = charset.toLowerCase();

        if (isBase64) {
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          return MHTParser.decodeWithCharset(bytes, charSetLower);
        } else if (isQP) {
          const qpStr = data.replace(/_/g, ' ');
          const bytes = MHTParser.decodeQuotedPrintableBytes(qpStr);
          return MHTParser.decodeWithCharset(bytes, charSetLower);
        }
      } catch (e) {
        console.warn('decodeMimeWord failed:', e);
      }
      return text;
    });
  }

  /**
   * 将二进制数据依据 Boundary 切割为各个 MIME Part
   */
  private static splitMimeParts(rawBytes: Uint8Array, boundary: string): MIMEPart[] {
    const parts: MIMEPart[] = [];
    const boundaryBytes = new TextEncoder().encode('--' + boundary);
    const endBoundaryBytes = new TextEncoder().encode('--' + boundary + '--');

    // 寻找 boundary 的位置索引
    const indices: number[] = [];
    const rawLen = rawBytes.length;
    const bLen = boundaryBytes.length;

    for (let i = 0; i <= rawLen - bLen; i++) {
      let match = true;
      for (let j = 0; j < bLen; j++) {
        if (rawBytes[i + j] !== boundaryBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        indices.push(i);
        i += bLen - 1;
      }
    }

    if (indices.length < 2) {
      return parts;
    }

    for (let k = 0; k < indices.length - 1; k++) {
      const partStart = indices[k] + bLen;
      const partEnd = indices[k + 1];
      const partSlice = rawBytes.slice(partStart, partEnd);

      // 解析 Part Header 与 Part Body
      const part = MHTParser.parseSinglePart(partSlice);
      if (part) {
        parts.push(part);
      }
    }

    return parts;
  }

  /**
   * 解析单个 MIME Part 的 Headers 与 Body 二进制
   */
  private static parseSinglePart(partBytes: Uint8Array): MIMEPart | null {
    // 找到 Header 与 Body 的分隔空行 (\r\n\r\n 或 \n\n)
    let headerEndIndex = -1;
    let separatorLength = 0;

    for (let i = 0; i < Math.min(partBytes.length, 4096); i++) {
      if (
        partBytes[i] === 0x0d &&
        partBytes[i + 1] === 0x0a &&
        partBytes[i + 2] === 0x0d &&
        partBytes[i + 3] === 0x0a
      ) {
        headerEndIndex = i;
        separatorLength = 4;
        break;
      }
      if (partBytes[i] === 0x0a && partBytes[i + 1] === 0x0a) {
        headerEndIndex = i;
        separatorLength = 2;
        break;
      }
    }

    if (headerEndIndex === -1) {
      return null;
    }

    const headerBytes = partBytes.slice(0, headerEndIndex);
    const bodyBytes = partBytes.slice(headerEndIndex + separatorLength);

    const headerStr = MHTParser.bytesToLatin1(headerBytes);
    const headers: Record<string, string> = {};

    const headerLines = headerStr.split(/\r?\n/);
    let currentKey = '';
    for (const line of headerLines) {
      if (/^[ \t]/.test(line) && currentKey) {
        headers[currentKey] += ' ' + line.trim();
      } else {
        const colonIdx = line.indexOf(':');
        if (colonIdx > -1) {
          currentKey = line.substring(0, colonIdx).trim().toLowerCase();
          headers[currentKey] = line.substring(colonIdx + 1).trim();
        }
      }
    }

    const contentType = headers['content-type'] || 'text/plain';
    const encoding = (headers['content-transfer-encoding'] || '7bit').toLowerCase().trim();
    const contentLocation = headers['content-location'] || '';

    // 提取 charset
    const charsetMatch = contentType.match(/charset=["']?([^"';\r\n]+)["']?/i);
    let charset = charsetMatch ? charsetMatch[1].toLowerCase().trim() : 'utf-8';
    if (charset === 'gb2312' || charset === 'gb_2312' || charset === 'gb18030') {
      charset = 'gbk';
    }

    return {
      headers,
      contentType,
      charset,
      encoding,
      contentLocation,
      bodyBytes,
    };
  }

  /**
   * 在各个 MIME 部件中挑选主要的裁判文书 HTML 部件
   */
  private static findPrimaryHtmlPart(parts: MIMEPart[]): MIMEPart | null {
    // 1. 优先找 contentType 包含 text/html 的
    const htmlParts = parts.filter((p) => p.contentType.toLowerCase().includes('text/html'));
    if (htmlParts.length === 1) {
      return htmlParts[0];
    }
    if (htmlParts.length > 1) {
      // 优先选体积最大的或者没有大量附件标记的 HTML
      return htmlParts.sort((a, b) => b.bodyBytes.length - a.bodyBytes.length)[0];
    }

    // 2. 找不到显式 text/html，找包含 <!DOCTYPE 或 <html 的部分
    for (const part of parts) {
      const sample = MHTParser.bytesToLatin1(part.bodyBytes.slice(0, 1024)).toLowerCase();
      if (sample.includes('<html') || sample.includes('<!doctype html') || sample.includes('<body')) {
        return part;
      }
    }

    return parts[0] || null;
  }

  /**
   * 解码单个 MIME Part 的内容为可读 HTML 文本
   */
  private static decodePartContent(part: MIMEPart): string {
    const { encoding, charset, bodyBytes } = part;

    if (encoding === 'quoted-printable' || encoding === 'qp') {
      // QP 解码为原始字节流，再用指定的 charset 解码
      const latinStr = MHTParser.bytesToLatin1(bodyBytes);
      const decodedBytes = MHTParser.decodeQuotedPrintableBytes(latinStr);
      return MHTParser.decodeWithCharset(decodedBytes, charset);
    }

    if (encoding === 'base64') {
      const latinStr = MHTParser.bytesToLatin1(bodyBytes).replace(/[^A-Za-z0-9+/=]/g, '');
      try {
        const binary = atob(latinStr);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return MHTParser.decodeWithCharset(bytes, charset);
      } catch (e) {
        console.warn('Base64 decode failed, fallback text:', e);
      }
    }

    // 8bit, 7bit, binary
    return MHTParser.decodeWithCharset(bodyBytes, charset);
  }

  /**
   * Quoted-Printable 字节解码器
   * 自动剥离软回车 (=\r\n, =\n) 并还原 =XX 为对应单字节
   */
  private static decodeQuotedPrintableBytes(qpStr: string): Uint8Array {
    // 1. 去除软换行
    const unsoft = qpStr.replace(/=\r?\n/g, '');
    const out: number[] = [];
    const len = unsoft.length;

    for (let i = 0; i < len; i++) {
      const c = unsoft[i];
      if (c === '=' && i + 2 < len) {
        const hex = unsoft.substring(i + 1, i + 3);
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
          out.push(parseInt(hex, 16));
          i += 2;
          continue;
        }
      }
      out.push(c.charCodeAt(0) & 0xff);
    }

    return new Uint8Array(out);
  }

  /**
   * 多字符集智能解码（UTF-8, GBK, GB2312, GB18030, windows-1252）
   */
  private static decodeWithCharset(bytes: Uint8Array, charset = 'utf-8'): string {
    let normalized = charset.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (normalized === 'gb2312' || normalized === 'gb18030' || normalized === 'gb_2312') {
      normalized = 'gbk';
    }

    // 1. 尝试首选编码
    try {
      const decoder = new TextDecoder(normalized, { fatal: false });
      const text = decoder.decode(bytes);

      // 检查是否包含 HTML meta 字符集声明覆盖
      const metaCharset = MHTParser.sniffMetaCharset(text);
      if (metaCharset && metaCharset !== normalized) {
        try {
          const metaDecoder = new TextDecoder(metaCharset, { fatal: false });
          const reDecoded = metaDecoder.decode(bytes);
          if (MHTParser.hasValidChineseCharacters(reDecoded)) {
            return reDecoded;
          }
        } catch (_) {}
      }

      // 如果首选编码解码出的中文正常，直接返回
      if (MHTParser.hasValidChineseCharacters(text)) {
        return text;
      }
    } catch (_) {}

    // 2. 如果是乱码或未知，尝试 UTF-8 和 GBK 交叉验证
    const candidates = ['utf-8', 'gbk', 'gb18030', 'windows-1252'];
    for (const c of candidates) {
      try {
        const decoder = new TextDecoder(c, { fatal: false });
        const res = decoder.decode(bytes);
        if (MHTParser.hasValidChineseCharacters(res)) {
          return res;
        }
      } catch (_) {}
    }

    // 兜底返回 UTF-8 解码
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }

  /**
   * 从 HTML meta 标签中嗅探 charset
   */
  private static sniffMetaCharset(html: string): string | null {
    const metaMatch =
      html.match(/<meta[^>]+charset=["']?([^"'>\s/]+)/i) ||
      html.match(/<meta[^>]+http-equiv=["']?Content-Type["']?[^>]+content=["'][^"']*charset=([^"'>\s/]+)/i);
    if (metaMatch) {
      const cs = metaMatch[1].toLowerCase().trim();
      if (cs === 'gb2312' || cs === 'gb18030') return 'gbk';
      return cs;
    }
    return null;
  }

  /**
   * 检查文本是否包含合法的常见中文字符
   */
  private static hasValidChineseCharacters(text: string): boolean {
    const chineseKeywords = ['判决', '法院', '劳动', '争议', '被告', '原告', '本院认为', '审理查明', '案号'];
    let matched = 0;
    for (const kw of chineseKeywords) {
      if (text.includes(kw)) {
        matched++;
      }
    }
    return matched >= 2;
  }

  /**
   * 直接尝试从字节流解码文本
   */
  private static tryDecodeText(bytes: Uint8Array): string {
    const testUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (MHTParser.hasValidChineseCharacters(testUtf8)) {
      return testUtf8;
    }
    try {
      const testGbk = new TextDecoder('gbk', { fatal: false }).decode(bytes);
      if (MHTParser.hasValidChineseCharacters(testGbk)) {
        return testGbk;
      }
    } catch (_) {}
    return testUtf8;
  }

  /**
   * 正文清洗与结构化纯文本提取
   * 1. 过滤：CSS, JS, 页面导航, 页眉页脚, 广告, 菜单, 按钮, 无关图片
   * 2. 保留：法院名称, 案号, 裁判日期, 案由, 当事人信息, 审理法院, 审判程序, 事实与理由, 争议焦点, 法院认为, 判决结果
   * 3. 规范段落换行与层级
   */
  public static cleanCourtDocumentHtml(html: string): string {
    if (!html) return '';

    // 如果在浏览器环境，使用 DOMParser
    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 1. 移除脚本、样式、元数据和非内容标签
        const tagsToRemove = [
          'script',
          'style',
          'noscript',
          'svg',
          'iframe',
          'canvas',
          'object',
          'embed',
          'link',
          'meta',
          'header',
          'footer',
          'nav',
          'aside',
          'menu',
          'button',
          'input',
          'select',
          'form',
          'audio',
          'video',
        ];
        tagsToRemove.forEach((tag) => {
          doc.querySelectorAll(tag).forEach((el) => el.remove());
        });

        // 2. 移除常见的法院网站菜单、导航条、分享、打印、广告等干扰元素
        const clutterSelectors = [
          '.header',
          '.footer',
          '.nav',
          '.navbar',
          '.navigation',
          '.sidebar',
          '.menu',
          '.top-bar',
          '.bottom-bar',
          '.share',
          '.print',
          '.toolbar',
          '.breadcrumb',
          '.ad',
          '.advertisement',
          '.qr-code',
          '.copyright',
          '#header',
          '#footer',
          '#nav',
          '#navigation',
          '#sidebar',
          '#menu',
          '#tools',
          '.tools',
          '.btn',
          '.button',
          '.login-bar',
          '.search-box',
          '.court-top',
          '.court-footer',
          '.relate-case',
          '.suggest-case',
        ];

        clutterSelectors.forEach((sel) => {
          try {
            doc.querySelectorAll(sel).forEach((el) => {
              // 确保不误删核心判决书容器
              const text = (el.textContent || '').trim();
              const isMainContent =
                text.includes('判决书') ||
                text.includes('裁定书') ||
                text.includes('民事判决') ||
                text.includes('本院认为') ||
                text.includes('审理查明');
              if (!isMainContent) {
                el.remove();
              }
            });
          } catch (_) {}
        });

        // 3. 针对块级元素添加结构化换行
        const blockElements = doc.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, tr, li, dt, dd, section, article');
        blockElements.forEach((el) => {
          el.insertAdjacentText('afterend', '\n\n');
        });

        const brElements = doc.querySelectorAll('br');
        brElements.forEach((el) => {
          el.insertAdjacentText('afterend', '\n');
        });

        // 4. 提取纯文本
        let text = doc.body ? (doc.body.innerText || doc.body.textContent || '') : '';

        return MHTParser.formatAndSanitizePlainText(text);
      } catch (domErr) {
        console.warn('DOMParser cleanup warning, fallback to regex cleanup:', domErr);
      }
    }

    // 正则清洗降级方案 (如在非 DOM 环境)
    return MHTParser.cleanHtmlWithRegex(html);
  }

  /**
   * 正则表达式降级清理 HTML
   */
  private static cleanHtmlWithRegex(html: string): string {
    let text = html
      // 移除 script 与 style
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // 换行标签
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|tr|li|section|article)>/gi, '\n\n')
      // 移除所有 HTML 标签
      .replace(/<[^>]+>/g, ' ');

    return MHTParser.formatAndSanitizePlainText(text);
  }

  /**
   * 格式化、去噪、消除乱码并标准化段落
   */
  private static formatAndSanitizePlainText(text: string): string {
    // 1. 解码常见 HTML 实体
    text = text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&ldquo;|&rdquo;/gi, '"')
      .replace(/&lsquo;|&rsquo;/gi, "'")
      .replace(/&mdash;/gi, '—')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    // 2. 移除不可见控制字符 (保留 \n 与 \r)
    text = text.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 3. 去除网页中常见的无用提示行（如二维码、打印本页、关闭窗口等）
    const uselessLinePatterns = [
      /微信扫一扫/i,
      /分享到朋友圈/i,
      /打印本页/i,
      /关闭窗口/i,
      /字体：【大 中 小】/i,
      /发布日期：/i,
      /浏览次数：/i,
      /Copyright\s+©/i,
      /版权所有：/i,
      /最高人民法院\s+主办/i,
      /广东省高级人民法院\s+主办/i,
      /技术支持：/i,
      /粤ICP备/i,
    ];

    const lines = text.split(/\r?\n/);
    const cleanedLines: string[] = [];
    let lastLine = '';

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // 检查是否为无关干扰行
      if (uselessLinePatterns.some((pattern) => pattern.test(line))) {
        continue;
      }

      // 去重连续完全相同行
      if (line === lastLine && line.length > 5) {
        continue;
      }

      cleanedLines.push(line);
      lastLine = line;
    }

    // 4. 重建裁判文书经典段落层级
    return cleanedLines.join('\n\n');
  }

  /**
   * 自动从文本中提取法院名称
   */
  private static extractCourtFromText(text: string): string | undefined {
    const match = text.match(/(广东省?(?:广州|深圳|东莞|佛山|惠州|中山|珠海|江门|肇庆)?(?:市|区|第一|第二|第三)?(?:中级)?人民法院)/);
    return match ? match[1] : undefined;
  }

  /**
   * 自动从文本中提取案号
   */
  private static extractCaseNumberFromText(text: string): string | undefined {
    const match = text.match(/(\([12][09]\d\d\)\s*粤\s*\d{2,4}\s*民[初终再申]字?\s*\d+\s*号)/) ||
      text.match(/（([12][09]\d\d)）\s*粤\s*\d{2,4}\s*民[初终再申]字?\s*\d+\s*号/);
    return match ? match[0] : undefined;
  }
}
