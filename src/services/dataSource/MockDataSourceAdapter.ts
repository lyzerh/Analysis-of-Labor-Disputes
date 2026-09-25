import { DataSourceAdapter } from './DataSourceAdapter';
import { PageInfo, DocumentLink, RawDocument } from '../../types';
import { ParserUtils } from '../parser/ParserUtils';

export class MockDataSourceAdapter implements DataSourceAdapter {
  readonly id = 'mock_shenzhen_hrss';
  readonly name = '合成演示数据（Synthetic Demo Fixture）';
  readonly baseUrl = 'synthetic://lawlens/demo/';

  private mockDocsData = [
    {
      title: '张某与深圳市某精密制造有限公司劳动人事争议仲裁裁决书',
      url: 'synthetic://lawlens/demo/case-001',
      caseNumber: 'DEMO-LABOR-001',
      publishedAt: '2024-03-15',
      committee: '深圳市劳动人事争议仲裁委员会',
      rawText: `[Synthetic Demo Fixture] 仅用于界面与流程演示，不作为研究分析数据。
深圳市劳动人事争议仲裁委员会
仲 裁 裁 决 书
深劳人仲案[2024]1208号

申请人：张某，男，汉族，住广东省深圳市南山区。
被申请人：深圳市某精密制造有限公司，住所地：深圳市宝安区福海街道某工业园。
法定代表人：李某，职务：总经理。

申请人张某与被申请人深圳市某精密制造有限公司因违法解除劳动合同赔偿金、加班工资等争议一案，本委依法受理并公开开庭进行了审理。申请人张某及被申请人之委托代理人王某到庭参加仲裁活动。本案现已审理终结。

申请人诉称：
申请人于2021年4月1日入职被申请人处担任高级机械工程师，月薪22000元。2024年1月10日，被申请人以申请人“连续旷工3日，严重违反公司规章制度”为由单方解除劳动合同。实际上申请人因突发急性肠胃炎已通过微信向直属主管请假并补交了三甲医院急诊病历，主管当时回复“收到”。被申请人解除劳动合同并未听取申请人申辩，且未依法事先通知工会。申请人向本委提出如下仲裁请求：
1、裁决被申请人支付违法解除劳动合同赔偿金132000元（22000元×3年×2倍）；
2、裁决被申请人支付2023年延时及周末加班工资差额36000元。

被申请人辩称：
申请人自2024年1月6日至1月8日未出勤，且未在公司钉钉考勤系统中履行正式请假审批流程，属于旷工。根据经员工民主公示的《员工手册》第35条第2款规定，累计旷工3日以上属于严重违反公司规章制度，公司有权立即解除劳动合同且不支付任何补偿。此外，公司实行综合工时制，不存在未付加班费情形。

经本委审理查明：
一、申请人入职时间为2021年4月1日，双方签订了至2024年3月31日止的固定期限劳动合同，约定月基本工资为22000元。
二、2024年1月6日至8日，申请人因病在深圳市第六人民医院急诊就诊，医嘱建议全休3天。申请人已于1月6日早晨通过微信向主管发送就诊凭证并说明请假事宜。
三、被申请人未能举证证明其设立了工会组织并向工会通知了解除事由，亦未能证明在无工会情形下向用人单位所在地基层工会征求意见或依法进行了解除前申辩程序。
四、关于加班费，被申请人提交了经申请人电子签名的每月工资明细表，显示被申请人已按月足额发放加班津贴。

本委认为：
用人单位单方解除劳动合同应当具备法定事由并遵循法定程序。根据《中华人民共和国劳动合同法》第四十三条之规定，用人单位单方解除劳动合同，应当事先将理由通知工会；用人单位尚未建立工会的，应通知所在地工会。本案中，申请人提交的急诊病历及微信沟通记录足以证明其请假具备正当事由，且被申请人单方解除劳动合同未依法通知工会，构成违法解除。对申请人主张的赔偿金予以支持，计算年限为2.5年，金额为110000元。申请人关于加班费的主张因证据不足，不予支持。

依照《中华人民共和国劳动合同法》第四十三条、第四十七条、第四十八条、第八十七条，《中华人民共和国劳动争议调解仲裁法》第六条、第四十七条之规定，裁决如下：
一、被申请人自本裁决书生效之日起五日内一次性支付申请人违法解除劳动合同赔偿金110000元；
二、驳回申请人的其他仲裁请求。
本裁决为非终局裁决。

仲裁员：陈某某
二〇二四年三月十五日
书记员：林某`,
    },
    {
      title: '刘某与深圳市某智能科技有限公司劳动人事争议仲裁裁决书',
      url: 'synthetic://lawlens/demo/case-002',
      caseNumber: 'DEMO-LABOR-002',
      publishedAt: '2024-05-20',
      committee: '深圳市南山区劳动人事争议仲裁委员会',
      rawText: `[Synthetic Demo Fixture] 仅用于界面与流程演示，不作为研究分析数据。
深圳市南山区劳动人事争议仲裁委员会
仲 裁 裁 决 书
深南劳人仲案[2024]3042号

申请人：刘某，女，住深圳市南山区粤海街道。
被申请人：深圳市某智能科技有限公司，住所地：深圳市南山区高新南道某大厦。
法定代表人：赵某。

申请人向本委提出仲裁请求：
1、裁决被申请人支付2023年度年终绩效奖金差额85000元；
2、裁决被申请人支付未签2024年度无固定期限劳动合同二倍工资差额40000元。

被申请人答辩称：
根据公司《薪酬与绩效考核管理制度》，年终奖金属于用人单位自主经营权范畴，公司2023年度整体业绩下滑，对部门考核为C级，未达发放标准。申请人第二次固定期限劳动合同期满前，公司已按时发出续签通知，系申请人个人拒绝签署。

经本委审理查明：
双方签订的《聘用协议》明确约定“年终奖基数为3个月工资，根据个人年度KPI评分发放，年终在职即享有”。申请人2023年度个人绩效考评结果为A级（优秀）。被申请人主张公司整体业绩下滑但未能提供经职工代表大会民主审议的减发年终奖专项决议。

本委认为：
用人单位自主行使用工管理权应当以劳动合同约定及依法制定的规章制度为基础。双方在聘用协议中已对年终奖构成及发放条件作出了明确约定，且申请人考评达标。被申请人抗辩理由不成立。

依照《中华人民共和国劳动合同法》第十八条、第三十条，《深圳市员工工资支付条例》第十四条之规定，裁决如下：
一、被申请人自本裁决书生效之日起七日内支付申请人2023年度年终绩效奖金85000元；
二、驳回申请人的第二项仲裁请求。

二〇二四年五月二十日
仲裁员：黄某`,
    },
    {
      title: '周某与深圳市某物流供应链有限公司劳动人事争议仲裁裁决书',
      url: 'synthetic://lawlens/demo/case-003',
      caseNumber: 'DEMO-LABOR-003',
      publishedAt: '2023-11-08',
      committee: '深圳市宝安区劳动人事争议仲裁委员会',
      rawText: `[Synthetic Demo Fixture] 仅用于界面与流程演示，不作为研究分析数据。
深圳市宝安区劳动人事争议仲裁委员会
仲 裁 裁 决 书
深宝劳人仲案[2023]5188号

申请人：周某。
被申请人：深圳市某物流供应链有限公司。

申请人诉称：
申请人担任调度主管，工作期间长期存在周末及节假日超时加班，被申请人仅发放基本工资，未足额支付加班费。申请人要求被申请人支付2022年11月至2023年10月期间延时工作加班费42000元、休息日加班费28000元。

被申请人辩称：
被申请人已向当地人社部门申请并获批不定时工作制，申请人岗位属于不定时工时审批范围，不适用延时及休息日加班费规定。

经审理查明：
被申请人提交了宝安区人力资源局出具的《准予实行特殊工时制决定书》，有效期限覆盖申请人主张的期间，且岗位明确包括“调度主管”。申请人未能提供法定节假日出勤且未调休的有效举证。

本委认为：
经人力资源行政部门批准实行不定时工作制的劳动者，不适用《中华人民共和国劳动法》第四十四条关于延时和休息日加班工资的规定。申请人关于加班费的仲裁请求缺乏事实和法律依据。

依照《中华人民共和国劳动法》第三十九条、第四十四条，《深圳市员工工资支付条例》第二十条、第三十六条之规定，裁决如下：
驳回申请人的全部仲裁请求。

仲裁员：郑某
二〇二三年十一月八日`,
    },
    {
      title: '孙某与深圳市某电子技术有限公司劳动争议仲裁裁决书',
      url: 'synthetic://lawlens/demo/case-004',
      caseNumber: 'DEMO-LABOR-004',
      publishedAt: '2024-01-18',
      committee: '深圳市龙华区劳动人事争议仲裁委员会',
      rawText: `[Synthetic Demo Fixture] 仅用于界面与流程演示，不作为研究分析数据。
深圳市龙华区劳动人事争议仲裁委员会
仲 裁 裁 决 书
深华劳人仲案[2024]1890号

申请人：孙某。
被申请人：深圳市某电子技术有限公司。

申请人向本委提出仲裁请求：
裁决被申请人支付2023年3月15日至2023年12月31日期间未签订书面劳动合同二倍工资差额76500元。

被申请人辩称：
公司在入职当日已向申请人发送电子劳动合同签约链接，系申请人拖延未签署，责任不在用人单位。

经本委审理查明：
被申请人仅能提供向申请人微信发送通知的截屏，未能证明其使用的第三方电子签约平台符合《电子签名法》规定的可靠电子签名条件，且在超过一个月未签合同后未依法向劳动者发出书面终止劳动关系通知。

本委认为：
建立劳动关系应当自用工之日起一个月内订立书面劳动合同。用人单位负有订立书面劳动合同的法定义务。

依照《中华人民共和国劳动合同法》第十条、第八十二条，《中华人民共和国劳动合同法实施条例》第六条之规定，裁决如下：
一、被申请人一次性支付申请人未签订书面劳动合同二倍工资差额76500元。

二〇二四年一月十八日`,
    },
    {
      title: '何某与深圳市某半导体器件有限公司劳动争议仲裁裁决书',
      url: 'synthetic://lawlens/demo/case-005',
      caseNumber: 'DEMO-LABOR-005',
      publishedAt: '2023-09-12',
      committee: '深圳市劳动人事争议仲裁委员会',
      rawText: `[Synthetic Demo Fixture] 仅用于界面与流程演示，不作为研究分析数据。
深圳市劳动人事争议仲裁委员会
仲 裁 裁 决 书
深劳人仲案[2023]4301号

申请人：何某。
被申请人：深圳市某半导体器件有限公司。

申请人诉称：
申请人原在南山区研发中心工作，被申请人单方发出调令将申请人调至惠州生产基地，降薪30%，申请人拒绝后被申请人按旷工解除。申请人要求确认解除违法并支付赔偿金180000元。

被申请人辩称：
劳动合同约定“工作地点包括深圳及周边大湾区城市”，公司因业务结构调整调岗属于用工自主权。

经查明：
调岗后工作地点跨市变动，通勤时间增加3小时以上，被申请人未提供合理交通补贴或宿舍安置方案，且单方降低了岗位薪资标准。

本委认为：
用人单位调整劳动者工作岗位和地点应当具有合理性，不得具有侮辱性或变相降薪。被申请人调岗不具备合理性，以旷工为由解除构成违法解除。

依照《中华人民共和国劳动合同法》第三十五条、第四十条、第八十七条之规定，裁决如下：
一、被申请人支付申请人违法解除劳动合同赔偿金180000元。

二〇二三年九月十二日`,
    },
  ];

  public async discoverPages(): Promise<PageInfo[]> {
    return [
      { pageNumber: 1, url: `${this.baseUrl}index.html`, totalItems: this.mockDocsData.length },
    ];
  }

  public async discoverDocuments(_pageUrl: string): Promise<DocumentLink[]> {
    return this.mockDocsData.map((d) => ({
      title: d.title,
      url: d.url,
      date: d.publishedAt,
      caseNumber: d.caseNumber,
      source: this.name,
    }));
  }

  public async fetchDocument(url: string, linkMeta?: DocumentLink): Promise<RawDocument> {
    const found = this.mockDocsData.find((d) => d.url === url) || this.mockDocsData[0];
    const rawText = found.rawText;
    const contentHash = await ParserUtils.calculateContentHash(rawText);

    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: this.name,
      sourceUrl: url,
      title: linkMeta?.title || found.title,
      publishedAt: linkMeta?.date || found.publishedAt,
      contentType: 'txt',
      rawText,
      rawHtml: `<div class="TRS_Editor"><pre>${rawText}</pre></div>`,
      contentHash,
      duplicateOf: null,
      fileSize: rawText.length,
      fetchedAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
    };
  }

  /**
   * 获取所有测试文书供直接导入
   */
  public async getAllSampleRawDocuments(): Promise<RawDocument[]> {
    const results: RawDocument[] = [];
    for (let i = 0; i < this.mockDocsData.length; i++) {
      const d = this.mockDocsData[i];
      const contentHash = await ParserUtils.calculateContentHash(d.rawText);
      results.push({
        id: `sample_sz_${i + 1}`,
        source: '合成演示数据（Synthetic Demo Fixture）',
        sourceUrl: d.url,
        title: d.title,
        publishedAt: d.publishedAt,
        contentType: 'txt',
        rawText: d.rawText,
        rawHtml: `<div class="TRS_Editor"><pre>${d.rawText}</pre></div>`,
        contentHash,
        duplicateOf: null,
        fileSize: d.rawText.length,
        fileName: `${d.caseNumber}.txt`,
        fetchedAt: new Date().toISOString(),
        importedAt: new Date().toISOString(),
      });
    }
    return results;
  }
}
