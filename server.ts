import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { GeminiSemanticResolver } from "./src/services/semantic/GeminiSemanticResolver";
import { DEFAULT_SEMANTIC_MODEL } from "./src/services/semantic/SemanticPrompt";
import { parseSemanticResolutionInput, SemanticSchemaError } from "./src/services/semantic/SemanticResolutionSchema";
import { resolveAndValidateSemanticReferences } from "./src/services/semantic/SemanticResolver";
import { SemanticResolverError } from "./src/services/semantic/SemanticResolverError";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Server-side Gemini initialization
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set. Requests will fail if key is required.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

let semanticResolver: GeminiSemanticResolver | null = null;
function getSemanticResolver(): GeminiSemanticResolver {
  if (!semanticResolver) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new SemanticResolverError('provider_error', 'Gemini semantic resolver is not configured');
    }
    semanticResolver = new GeminiSemanticResolver({
      apiKey,
      modelName: process.env.GEMINI_SEMANTIC_MODEL || DEFAULT_SEMANTIC_MODEL,
    });
  }
  return semanticResolver;
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/semantic/resolve", async (req, res) => {
  const startedAt = Date.now();
  let caseId = 'unknown';
  let fragmentCount = 0;
  try {
    const input = parseSemanticResolutionInput(req.body);
    caseId = input.caseId;
    fragmentCount = input.unresolvedFragments.length;
    const result = await resolveAndValidateSemanticReferences(getSemanticResolver(), input);
    console.info('[SemanticResolver]', {
      caseId,
      fragmentCount,
      provider: 'gemini',
      model: process.env.GEMINI_SEMANTIC_MODEL || DEFAULT_SEMANTIC_MODEL,
      latencyMs: Date.now() - startedAt,
      accepted: result.accepted.length,
      humanReview: result.humanReview.length,
      rejected: result.rejected.length,
      errorCode: result.errorCode,
    });
    return res.json(result);
  } catch (error) {
    const isSchema = error instanceof SemanticSchemaError;
    const code = isSchema ? 'schema_invalid' : (error as { code?: string })?.code || 'provider_error';
    console.warn('[SemanticResolver]', {
      caseId,
      fragmentCount,
      provider: 'gemini',
      latencyMs: Date.now() - startedAt,
      errorCode: code,
    });
    return res.status(isSchema ? 400 : 503).json({
      error: { code, message: isSchema ? 'Invalid semantic resolution input' : 'Semantic resolver unavailable' },
    });
  }
});

// Helper function to validate allowed target domain (strictly restricted to hrss.sz.gov.cn)
function isAllowedDomain(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return host === "hrss.sz.gov.cn" || host.endsWith(".hrss.sz.gov.cn");
  } catch {
    return false;
  }
}

// Server-side document fetch endpoint for Shenzhen HRSS public records
app.all("/api/fetch-document", async (req, res) => {
  const requestStartTime = new Date().toISOString();
  const startMs = Date.now();
  const targetUrl = (req.body?.url || req.query?.url) as string;

  if (!targetUrl || typeof targetUrl !== "string") {
    console.warn(`[ServerFetch] [${requestStartTime}] 缺少目标URL参数`);
    return res.status(400).json({
      success: false,
      errorType: "INVALID_REQUEST",
      message: "缺少目标 URL 参数 (url)",
      detail: "请求 Body 或 Query 中未包含有效的 url 字段",
    });
  }

  if (!isAllowedDomain(targetUrl)) {
    console.warn(`[ServerFetch] [${requestStartTime}] 非法目标域名拦截: ${targetUrl}`);
    return res.status(403).json({
      success: false,
      errorType: "DOMAIN_NOT_ALLOWED",
      message: "目标域名不在允许名单内",
      detail: `仅允许访问 hrss.sz.gov.cn 官方站点，当前请求: ${targetUrl}`,
    });
  }

  const controller = new AbortController();
  const timeoutMs = 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let upstreamResponse: Response | null = null;

  try {
    upstreamResponse = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startMs;

    // Collect response headers
    const responseHeaders: Record<string, string> = {};
    upstreamResponse.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    console.log(`[ServerFetch] ----------------------------------------`);
    console.log(`[ServerFetch] 请求URL: ${targetUrl}`);
    console.log(`[ServerFetch] 请求时间: ${requestStartTime} (耗时: ${durationMs}ms)`);
    console.log(`[ServerFetch] 响应状态: HTTP ${upstreamResponse.status} ${upstreamResponse.statusText}`);
    console.log(`[ServerFetch] 响应Headers:`, JSON.stringify(responseHeaders));
    console.log(`[ServerFetch] DNS解析错误: 无`);
    console.log(`[ServerFetch] TLS错误: 无`);
    console.log(`[ServerFetch] 连接超时: 无`);
    console.log(`[ServerFetch] ----------------------------------------`);

    if (upstreamResponse.status === 429) {
      return res.status(429).json({
        success: false,
        errorType: "RATE_LIMITED",
        message: "目标政务网站返回访问频率限制 (HTTP 429 Too Many Requests)",
        detail: "触发政务网站防爬或高频访问控制，建议增加采集延时或稍后重试",
        status: 429,
        responseHeaders,
      });
    }

    if (upstreamResponse.status === 403) {
      return res.status(403).json({
        success: false,
        errorType: "ACCESS_FORBIDDEN",
        message: "目标政务网站拒绝访问 (HTTP 403 Forbidden / WAF拦截)",
        detail: "目标服务器 WAF 策略拒绝了本次请求，请检查政务网访问策略",
        status: 403,
        responseHeaders,
      });
    }

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status >= 400 && upstreamResponse.status < 600 ? upstreamResponse.status : 502).json({
        success: false,
        errorType: "HTTP_STATUS_ERROR",
        message: `目标政务网站响应异常: HTTP ${upstreamResponse.status}`,
        detail: `政务服务器返回状态码 ${upstreamResponse.status} ${upstreamResponse.statusText}`,
        status: upstreamResponse.status,
        responseHeaders,
      });
    }

    const buffer = await upstreamResponse.arrayBuffer();
    const contentType = upstreamResponse.headers.get("content-type") || "";

    let html = "";
    // Detect GBK / GB2312 vs UTF-8
    if (/charset=(gbk|gb2312)/i.test(contentType)) {
      try {
        const decoder = new TextDecoder("gbk");
        html = decoder.decode(buffer);
      } catch (_) {
        const decoder = new TextDecoder("utf-8");
        html = decoder.decode(buffer);
      }
    } else {
      const utfDecoder = new TextDecoder("utf-8");
      html = utfDecoder.decode(buffer);
      if (/<meta[^>]*charset=["']?(gbk|gb2312)/i.test(html)) {
        try {
          const gbkDecoder = new TextDecoder("gbk");
          html = gbkDecoder.decode(buffer);
        } catch (_) {}
      }
    }

    return res.json({
      success: true,
      url: targetUrl,
      status: upstreamResponse.status,
      contentType: contentType || "text/html",
      html,
      responseHeaders,
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startMs;

    const errName = error?.name || "Error";
    const errMessage = error?.message || "未知网络错误";
    const errCause = error?.cause;

    let causeDetail = "";
    let errorCode = "";
    let errorSyscall = "";
    let errorHost = "";

    if (errCause) {
      if (typeof errCause === "object") {
        errorCode = (errCause as any).code || "";
        errorSyscall = (errCause as any).syscall || "";
        errorHost = (errCause as any).hostname || (errCause as any).host || "";
        try {
          causeDetail = JSON.stringify(errCause, Object.getOwnPropertyNames(errCause));
        } catch {
          causeDetail = String(errCause);
        }
      } else {
        causeDetail = String(errCause);
      }
    }

    // Classify error type
    let errorType = "FETCH_FAILED";
    let isDnsError = "无";
    let isTlsError = "无";
    let isTimeout = "无";

    const fullErrStr = `${errName} ${errMessage} ${causeDetail} ${errorCode}`.toLowerCase();

    if (
      errorCode === "ENOTFOUND" ||
      errorCode === "EAI_AGAIN" ||
      fullErrStr.includes("getaddrinfo") ||
      fullErrStr.includes("dns")
    ) {
      errorType = "DNS_RESOLUTION_FAILED";
      isDnsError = `域名解析失败 (${errorCode || "ENOTFOUND"}: 无法解析 ${errorHost || targetUrl})`;
    } else if (
      errorCode.startsWith("ERR_TLS") ||
      errorCode.startsWith("CERT_") ||
      errorCode.startsWith("SSL_") ||
      fullErrStr.includes("certificate") ||
      fullErrStr.includes("tls") ||
      fullErrStr.includes("ssl") ||
      fullErrStr.includes("self-signed")
    ) {
      errorType = "TLS_HANDSHAKE_FAILED";
      isTlsError = `TLS/SSL 证书校验或握手失败 (${errorCode || errMessage})`;
    } else if (
      errName === "AbortError" ||
      errorCode === "ETIMEDOUT" ||
      errorCode === "UND_ERR_CONNECT_TIMEOUT" ||
      fullErrStr.includes("timeout") ||
      fullErrStr.includes("aborted")
    ) {
      errorType = "CONNECTION_TIMEOUT";
      isTimeout = `请求超时 (已等待 ${durationMs}ms / 上限 ${timeoutMs}ms)`;
    } else if (
      errorCode === "ECONNREFUSED" ||
      errorCode === "ECONNRESET" ||
      errorCode === "EHOSTUNREACH" ||
      errorCode === "ENETUNREACH" ||
      errorCode === "UND_ERR_SOCKET"
    ) {
      errorType = "CONNECTION_FAILED";
    }

    // Detailed server output log
    console.error(`[ServerFetch] ==================== FETCH ERROR ====================`);
    console.error(`[ServerFetch] 请求URL: ${targetUrl}`);
    console.error(`[ServerFetch] 请求时间: ${requestStartTime} (耗时: ${durationMs}ms)`);
    console.error(`[ServerFetch] 响应状态: ${upstreamResponse ? upstreamResponse.status : "未建立连接 (N/A)"}`);
    console.error(`[ServerFetch] DNS解析错误: ${isDnsError}`);
    console.error(`[ServerFetch] TLS错误: ${isTlsError}`);
    console.error(`[ServerFetch] 连接超时: ${isTimeout}`);
    console.error(`[ServerFetch] 异常分类: ${errorType}`);
    console.error(`[ServerFetch] error.name: ${errName}`);
    console.error(`[ServerFetch] error.message: ${errMessage}`);
    if (causeDetail) {
      console.error(`[ServerFetch] error.cause: ${causeDetail}`);
    }
    console.error(`[ServerFetch] =======================================================`);

    const clientDetail = [
      `error.name: ${errName}`,
      `error.message: ${errMessage}`,
      causeDetail ? `error.cause: ${causeDetail}` : null,
      errorCode ? `code: ${errorCode}` : null,
      errorSyscall ? `syscall: ${errorSyscall}` : null,
      isDnsError !== "无" ? `DNS: ${isDnsError}` : null,
      isTlsError !== "无" ? `TLS: ${isTlsError}` : null,
      isTimeout !== "无" ? `Timeout: ${isTimeout}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    return res.status(502).json({
      success: false,
      errorType,
      message:
        isDnsError !== "无"
          ? `目标政务网站 DNS 解析失败，无法找到服务器主机 (${errMessage})`
          : isTlsError !== "无"
          ? `目标政务网站 HTTPS 证书或 TLS 握手失败 (${errMessage})`
          : isTimeout !== "无"
          ? `连接目标政务网站超时 (${durationMs}ms)`
          : `服务端请求目标网站失败: ${errMessage}`,
      detail: clientDetail,
      requestUrl: targetUrl,
      timestamp: requestStartTime,
    });
  }
});

// 1. Structure Case from Raw Text / Document
app.post("/api/gemini/structure-case", async (req, res) => {
  try {
    const { rawText, fileName, fileType, sourceUrl, tags } = req.body;
    if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
      return res.status(400).json({ error: "请提供有效的裁判文书内容" });
    }

    const ai = getAIClient();
    const systemPrompt = `你是一位专门研究中国劳动法及广东珠三角地区（广州、深圳、东莞、佛山、惠州、中山、珠海、江门、肇庆等）劳动争议司法裁判规则的资深企业劳动法律专家。
请仔细阅读以下经清洗后的裁判文书正文，进行严谨客观的法律要素提取与结构化分析。

【严格规范与纪律】：
1. 严禁凭空捏造、杜撰虚假案号、事实或法律意见。
2. 严格忠于裁判文书原文。如果文书中没有相关信息，填写 null 或空数组 []。
3. 必须输出符合以下固定 JSON Schema 的结构：

{
  "court": "string (审理法院名称，如：广东省东莞市中级人民法院)",
  "case_number": "string (案号，如：(2023)粤19民终XXXX号)",
  "judgment_date": "string (裁判日期，如：2023-08-15)",
  "case_type": "string (案由/争议类型，如：劳动合同纠纷、旷工解除争议、加班工资纠纷、竞业限制纠纷等)",
  "city": "string (城市名称，如：东莞市、深圳市、广州市、佛山市、惠州市、中山市、珠海市、其他)",
  "employee_claims": ["string (劳动者诉求项目1)", "string (诉求2)"],
  "employer_defenses": ["string (用人单位/公司抗辩理由1)", "string (抗辩理由2)"],
  "dispute_focus": ["string (本案争议焦点1)", "string (争议焦点2)"],
  "key_evidence": [
    {
      "evidence": "string (关键证据名称，如：员工手册民主制定纪要/考勤打卡记录/工会通知函)",
      "court_view": "string (法院采信与否及具体认定理由)"
    }
  ],
  "court_reasoning": "string (法院裁判说理要点与法理剖析，提取裁判规则核心要旨)",
  "judgment_result": "string (判决主文结果，如：驳回劳动者诉求/判令公司支付赔偿金48000元)",
  "employer_win": true, // 用人单位是否胜诉 (全部胜诉为 true，完全败诉为 false，部分胜诉为 false 或根据主文判定)
  "loss_reasons": ["string (若公司败诉，列明败诉核心原因，如：规章制度未履行民主程序/未通知工会)"],
  "legal_rules": ["string (文书援引的核心法律法条，如：《劳动合同法》第39条、第43条)"],
  "important_paragraphs": ["string (直接摘录判决书中法院关于事实认定与裁判说理的关键原话，2-4段)"]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: `文件名: ${fileName || "未命名裁判文书"}\n\n裁判文书正文如下：\n${rawText.slice(0, 30000)}`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const text = response.text || "{}";
    const structuredData = JSON.parse(text);

    // 计算归一化的判决结果
    let normalizedResult: "公司胜诉" | "公司败诉" | "部分胜诉" = "部分胜诉";
    if (structuredData.employer_win === true) {
      normalizedResult = "公司胜诉";
    } else if (
      structuredData.employer_win === false &&
      (!structuredData.loss_reasons || structuredData.loss_reasons.length > 0)
    ) {
      if ((structuredData.judgment_result || "").includes("驳回") && !(structuredData.judgment_result || "").includes("支付")) {
        normalizedResult = "公司胜诉";
      } else {
        normalizedResult = "公司败诉";
      }
    }

    // 提取年份
    let year = new Date().getFullYear();
    if (structuredData.judgment_date) {
      const parsedYear = parseInt(structuredData.judgment_date.substring(0, 4), 10);
      if (!isNaN(parsedYear) && parsedYear > 2000 && parsedYear < 2035) {
        year = parsedYear;
      }
    } else if (structuredData.case_number) {
      const yearMatch = structuredData.case_number.match(/[（(](20\d\d)[）)]/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }
    }

    // 归一化城市
    let city = structuredData.city || "东莞市";
    if (!city.endsWith("市") && !["其他", "省高院"].includes(city)) {
      city += "市";
    }

    // 映射为标准 LaborCase 格式
    const mappedLaborCase = {
      caseNumber: structuredData.case_number || "未载明案号",
      court: structuredData.court || "珠三角某人民法院",
      city: city,
      province: "广东省",
      year: year,
      disputeType: structuredData.case_type || "劳动合同纠纷",
      industry: "制造业",
      parties: {
        plaintiff: "劳动者方/用人单位",
        defendant: "用人单位/劳动者方",
        companyRole: "用人单位",
      },
      facts: (structuredData.important_paragraphs && structuredData.important_paragraphs[0]) || (structuredData.dispute_focus ? `围绕 ${structuredData.dispute_focus.join("、")} 等展开争议` : "经审理查明用工事实"),
      disputeFocus: Array.isArray(structuredData.dispute_focus) ? structuredData.dispute_focus : [],
      companyArguments: Array.isArray(structuredData.employer_defenses) ? structuredData.employer_defenses.join("；") : (structuredData.employer_defenses || "依法行使企业用工管理权"),
      employeeArguments: Array.isArray(structuredData.employee_claims) ? structuredData.employee_claims.join("；") : (structuredData.employee_claims || "主张法定劳动权益及赔偿"),
      evidenceAnalysis: Array.isArray(structuredData.key_evidence)
        ? structuredData.key_evidence.map((ke: any) => ({
            evidenceName: ke.evidence || "关键证据",
            provider: "当事人",
            courtAdmitted: !(ke.court_view || "").includes("不予采信") && !(ke.court_view || "").includes("不予认定"),
            courtReason: ke.court_view || "法院予以核实",
          }))
        : [],
      courtReasoning: structuredData.court_reasoning || "法院裁判要旨未详细记载",
      judgmentResult: normalizedResult,
      judgmentDetails: structuredData.judgment_result || "判决结果详见文书主文",
      quoteExcerpts: Array.isArray(structuredData.important_paragraphs)
        ? structuredData.important_paragraphs.map((p: string, idx: number) => ({
            title: `裁判说理摘录 ${idx + 1}`,
            text: p,
          }))
        : [],
      manufacturingRiskTakeaways: Array.isArray(structuredData.loss_reasons) && structuredData.loss_reasons.length > 0
        ? `败诉主要原因及合规启示：${structuredData.loss_reasons.join("；")}`
        : "用人单位应健全规章制度民主公示程序，规范考勤记录及送达取证。",
      originalText: rawText,
      cleanedText: rawText,
      fileName: fileName || "未命名文书",
      fileType: fileType || "mht",
      sourceUrl: sourceUrl || "",
      rawAnalysisJson: structuredData,
      tags: tags || [],
      importedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    return res.json({
      success: true,
      data: mappedLaborCase,
    });
  } catch (error: any) {
    console.error("Structure case error:", error);
    return res.status(500).json({
      error: "结构化文书失败: " + (error?.message || "服务异常"),
    });
  }
});

// 2. Match Similar Cases with Comparative Matrix
app.post("/api/gemini/match-similar", async (req, res) => {
  try {
    const { scenarioText, targetDisputeType, candidateCases } = req.body;
    if (!scenarioText || typeof scenarioText !== "string") {
      return res.status(400).json({ error: "请输入需要比对的案件事实" });
    }

    const ai = getAIClient();
    const prompt = `你是一位精通珠三角制造型企业劳动争议审判实践的资深法务专家。
用户输入了本企业的拟发生或正在发生的劳动争议案件事实：
【本案案情及事实描述】：
${scenarioText}
${targetDisputeType ? `【重点关注争议类型】：${targetDisputeType}` : ""}

以下是从本地案例库筛选出的候选珠三角裁判案例集（包含案例案号、法院、案情、争议焦点、公司抗辩、法院观点与裁判结果）：
${JSON.stringify(
  (candidateCases || []).slice(0, 15).map((c: any) => ({
    id: c.id,
    caseNumber: c.caseNumber,
    court: c.court,
    city: c.city,
    year: c.year,
    disputeType: c.disputeType,
    facts: c.facts,
    disputeFocus: c.disputeFocus,
    companyArguments: c.companyArguments,
    courtReasoning: c.courtReasoning,
    judgmentResult: c.judgmentResult,
    judgmentDetails: c.judgmentDetails,
    keyQuotes: c.quoteExcerpts,
  })),
  null,
  2
)}

请进行严谨的类案同判与法律逻辑比对分析，按相似度和参考价值挑选出最相关的 3-6 个典型案例，并严格生成以下 JSON 结构：
{
  "summaryAnalysis": "string (本案法律定性与整体相似裁判倾向概述，指出珠三角法院对此类情形的核心裁判口径，200字左右)",
  "coreLegalIssues": ["string (识别出的本案核心争议焦点1)", "string (核心争议焦点2)"],
  "matchedCases": [
    {
      "caseId": "string (对应候选案例中的id)",
      "caseNumber": "string (案号)",
      "court": "string (审理法院)",
      "city": "string (城市)",
      "year": 2023,
      "disputeType": "string",
      "similarityScore": 92, // 相似度打分 60-100
      "similarityReason": "string (为什么与本案高度相似的简明理由)",
      "comparativeMatrix": {
        "caseFacts": "string (该案例的关键案件事实)",
        "disputeFocus": "string (该案例的争议焦点)",
        "companyArguments": "string (该案例中公司的抗辩)",
        "courtViews": "string (该案例中法院的核心裁判观点与法理依据)",
        "judgmentResult": "string (裁判结果，如 公司胜诉 / 公司败诉 / 判令支付X元)",
        "takeawayForOurCase": "string (对本案事实认定、证据组织或抗辩策略的具体启示与风险警示)",
        "sourceCitation": "string (精确引用的文书关键说理原话，严禁编造)"
      }
    }
  ],
  "precautionaryNotice": "本分析基于案例库真实裁判文书提炼，仅作为企业法务辅助研究参考，诉讼结果取决于个案具体证据及法官自由裁量。"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const text = response.text || "{}";
    return res.json({
      success: true,
      data: JSON.parse(text),
    });
  } catch (error: any) {
    console.error("Match similar error:", error);
    return res.status(500).json({
      error: "相似案例匹配分析失败: " + (error?.message || "服务异常"),
    });
  }
});

// 3. Deep Multi-case Analysis
app.post("/api/gemini/deep-analysis", async (req, res) => {
  try {
    const { selectedCases, filterDescription } = req.body;
    if (!selectedCases || !Array.isArray(selectedCases) || selectedCases.length === 0) {
      return res.status(400).json({ error: "请提供用于深度分析的案例数据集" });
    }

    const ai = getAIClient();
    const caseSummaries = selectedCases.slice(0, 30).map((c: any) => ({
      caseNumber: c.caseNumber,
      court: c.court,
      city: c.city,
      year: c.year,
      disputeType: c.disputeType,
      facts: c.facts,
      disputeFocus: c.disputeFocus,
      companyArguments: c.companyArguments,
      courtReasoning: c.courtReasoning,
      judgmentResult: c.judgmentResult,
      evidenceAnalysis: c.evidenceAnalysis,
      quotes: c.quoteExcerpts,
    }));

    const prompt = `你是一位专注于广东珠三角制造业劳动用工合规与劳动争议司法裁判规则研究的资深法学专家和企业总法律顾问。
用户提供了 ${selectedCases.length} 份近五年珠三角地区法院劳动争议真实裁判案例数据（${filterDescription || "全库综合分析"}）。

以下是案例数据摘要：
${JSON.stringify(caseSummaries, null, 2)}

请对上述真实案例进行多维度深度实证分析，严禁空泛套话，每项结论必须有案例支撑并保持务实中肯，生成如下结构的 JSON：
{
  "overview": {
    "totalAnalyzed": ${selectedCases.length},
    "dateRange": "2020-2025",
    "coreObservation": "string (综合研判核心结论，150字左右)"
  },
  "judicialTrends": [
    {
      "trendTitle": "string (裁判趋势1，例如：对制造企业规章制度民主公示程序的实质审查趋严)",
      "description": "string (详细趋势分析及司法态度演进)",
      "supportingCases": ["string (案号1)", "string (案号2)"]
    },
    {
      "trendTitle": "string (裁判趋势2，例如：电子证据与考勤打卡记录采信标准的精细化)",
      "description": "string (详细分析)",
      "supportingCases": ["string (案号)"]
    },
    {
      "trendTitle": "string (裁判趋势3)",
      "description": "string",
      "supportingCases": ["string"]
    }
  ],
  "frequentDisputeFoci": [
    {
      "focus": "string (高频争议焦点名称)",
      "frequencyPercent": 65,
      "courtTendency": "string (法院主流倾向)",
      "representativeCase": "string (案号)"
    }
  ],
  "keyEvidenceAdmissibility": {
    "admittedEvidence": [
      {
        "evidenceType": "string (法院普遍采信的关键证据，如 员工书面签字确认的规章手册签收单/经OA系统公示并具有修改痕迹记录)",
        "admissibilityCriteria": "string (法院采信标准与要件)",
        "exampleCase": "string (案号)"
      }
    ],
    "rejectedEvidence": [
      {
        "evidenceType": "string (用人单位常提交但法院不予采信的瑕疵证据，如 未经员工确认的单方内部Excel考勤表/无明确送达回执的催告函)",
        "rejectionReason": "string (法院不采信的主因)",
        "exampleCase": "string (案号)"
      }
    ]
  },
  "employerLossReasons": [
    {
      "reason": "string (公司败诉核心原因，如 民主程序缺失导致规章制度不具约束力)",
      "frequency": "高频 / 中频",
      "preventiveKey": "string (法务防控关键点)",
      "citedCase": "string (案号与裁判观点摘要)"
    }
  ],
  "employeeWinReasons": [
    {
      "reason": "string (劳动者胜诉主因)",
      "legalBasis": "string (相关法律条款与法理依据)"
    }
  ],
  "cityCourtDifferences": [
    {
      "city": "东莞市",
      "characteristics": "string (东莞两级法院对制造企业用工裁判的特色，如重视考勤规范、对制造业流水线纪律管理适度兼顾生产秩序但严抓民主程序)",
      "notablePoint": "string (特殊裁判口径注意事项)"
    },
    {
      "city": "深圳市",
      "characteristics": "string (深圳法院裁判特色，如对竞业限制、高管与技术人员合规、电子证据采信相对前沿严格)",
      "notablePoint": "string"
    },
    {
      "city": "广州市",
      "characteristics": "string (广州法院裁判特色，如法理说理充分、对解除程序的法定性审查严谨)",
      "notablePoint": "string"
    },
    {
      "city": "佛山/惠州/中山等",
      "characteristics": "string (其他珠三角工业重镇法院裁判侧重)",
      "notablePoint": "string"
    }
  ],
  "yearOverYearEvolution": [
    {
      "period": "2020-2022年",
      "focusShift": "string (疫情期用工弹性与合规诉求)"
    },
    {
      "period": "2023-2025年",
      "focusShift": "string (常态化高质量合规、灵活用工与民主程序精细审查)"
    }
  ],
  "complianceRecommendationsForManufacturing": [
    {
      "domain": "string (领域，如 规章制度与员工手册 / 考勤打卡与工时工薪 / 解除与违纪取证 / 调岗调薪)",
      "priority": "极高 / 高 / 中",
      "actionableAdvice": "string (制造企业法务与HR具体实操合规建议)"
    }
  ],
  "disclaimer": "本报告为基于珠三角法院公开裁判文书的大数据与人工智能辅助法理研究成果，不作为个案保证性法律意见。"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const text = response.text || "{}";
    return res.json({
      success: true,
      data: JSON.parse(text),
    });
  } catch (error: any) {
    console.error("Deep analysis error:", error);
    return res.status(500).json({
      error: "深度多案例分析失败: " + (error?.message || "服务异常"),
    });
  }
});

// 4. Current Case Assessment & Defense Strategy
app.post("/api/gemini/assess-case", async (req, res) => {
  try {
    const { caseFacts, companyEvidences, employeeClaims, candidateCases } = req.body;
    if (!caseFacts || typeof caseFacts !== "string") {
      return res.status(400).json({ error: "请输入本案案情事实描述" });
    }

    const ai = getAIClient();
    const casePool = (candidateCases || []).slice(0, 15).map((c: any) => ({
      caseNumber: c.caseNumber,
      court: c.court,
      city: c.city,
      year: c.year,
      disputeType: c.disputeType,
      facts: c.facts,
      courtReasoning: c.courtReasoning,
      judgmentResult: c.judgmentResult,
      keyQuotes: c.quoteExcerpts,
    }));

    const prompt = `你是一位深谙珠三角制造业劳动争议裁判尺度的资深企业法务诉讼总监。
正在处理本公司的一起真实劳动争议案件，需要你进行客观、审慎、可溯源的风险诊断与应诉策略制定。

【本案案情事实】：
${caseFacts}

【公司当前掌握的证据情况】：
${companyEvidences || "未详细列明，需根据案情全面评估"}

【劳动者主张与诉求】：
${employeeClaims || "未详细列明"}

【珠三角本地裁判案例库参考集】：
${JSON.stringify(casePool, null, 2)}

请严格基于上述案件事实及案例库裁判规则进行剖析，生成如下 JSON：
注意：严禁出现“保证胜诉”、“100%打赢”等绝对化词汇，保持专业法务的严谨和风险警示，所有支持案例必须严格关联案例库案号与说理！
{
  "disputeFocalPoints": [
    {
      "issueTitle": "string (争议焦点1)",
      "legalBasis": "string (涉及的核心法律法规及司法解释条款)",
      "courtStandard": "string (珠三角法院对该焦点的核心审查标准)"
    }
  ],
  "proCompanyPrecedents": [
    {
      "caseNumber": "string (支持公司抗辩的案例案号)",
      "court": "string (审理法院)",
      "city": "string (城市)",
      "favorableReasoning": "string (该案例中法院支持用人单位的核心裁判法理与采信逻辑)",
      "exactQuote": "string (该案例判决书中对本案抗辩极具参考价值的原文说理片段)"
    }
  ],
  "proEmployeePrecedents": [
    {
      "caseNumber": "string (支持劳动者主张或公司败诉的警示案例案号)",
      "court": "string (审理法院)",
      "city": "string (城市)",
      "riskReasoning": "string (该案例中公司败诉的致命痛点，揭示本案潜在合规缺陷)",
      "exactQuote": "string (该案例判决书中的法院严厉说理原文摘录)"
    }
  ],
  "evidenceGaps": [
    {
      "gapItem": "string (公司当前证据薄弱环节或证据链漏洞)",
      "vulnerabilityImpact": "string (若无法弥补可能导致的直接法律不利后果)",
      "suggestedRemedy": "string (建议立即补强、固定或调取的证据材料及获取途径)"
    }
  ],
  "potentialLossRisks": [
    {
      "claimItem": "string (诉求项目，如 违法解除赔偿金 / 延时加班费 / 未休年假工资)",
      "riskLevel": "高风险 / 中风险 / 低风险",
      "riskRationale": "string (风险成因客观评估)"
    }
  ],
  "recommendedDefenseStrategies": [
    {
      "strategyTitle": "string (建议重点抗辩方向1)",
      "detailedArguments": "string (庭审/仲裁答辩的核心法理要点与事实陈述技巧)",
      "evidentiarySupport": "string (需配合举证的材料)"
    },
    {
      "strategyTitle": "string (建议重点抗辩方向2)",
      "detailedArguments": "string",
      "evidentiarySupport": "string"
    }
  ],
  "practicalTakeawaysForManufacturing": "string (针对制造企业生产管理特性的综合应对总结，100-200字)",
  "auxiliaryDisclaimer": "本评估系基于珠三角司法案例库的大数据辅助法律研究，旨在揭示诉讼风险与补强证据链，不代表最终裁判结果。"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const text = response.text || "{}";
    return res.json({
      success: true,
      data: JSON.parse(text),
    });
  } catch (error: any) {
    console.error("Assess case error:", error);
    return res.status(500).json({
      error: "本案分析评估失败: " + (error?.message || "服务异常"),
    });
  }
});

// Vite middleware & Static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`珠三角劳动争议裁判分析助手服务已启动: http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Server start error:", err);
});
