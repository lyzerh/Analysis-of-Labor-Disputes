export interface CityResolveResult {
  province: string | null;
  city: string | null;
  district: string | null;
  confidence: number;
  source: 'court' | 'caseNumber' | 'text' | 'unknown';
}

export class CityResolver {
  public static resolveCity(params: {
    province?: string;
    court?: string;
    courtNm?: string;
    caseNumber?: string;
    rawText?: string;
  }): CityResolveResult {
    let result: CityResolveResult = {
      province: null,
      city: null,
      district: null,
      confidence: 0,
      source: 'unknown',
    };

    const courtName = params.court || params.courtNm || '';
    if (courtName) {
      const match = this.parseFromCourtName(courtName);
      if (match.city || match.province) {
        return { ...result, ...match, source: 'court', confidence: 0.9 };
      }
    }

    if (params.caseNumber) {
      const match = this.parseFromCaseNumber(params.caseNumber);
      if (match.city || match.province) {
        return { ...result, ...match, source: 'caseNumber', confidence: 0.7 };
      }
    }

    // Direct search in rawText near the beginning
    if (params.rawText) {
      const headText = params.rawText.substring(0, 300);
      const courtMatch = headText.match(/([\u4e00-\u9fa5]{2,12}(?:高级|中级|基层)?人民法院|[\u4e00-\u9fa5]{2,12}劳动(?:人事)?争议仲裁委员会)/);
      if (courtMatch) {
         const match = this.parseFromCourtName(courtMatch[1]);
         if (match.city || match.province) {
           return { ...result, ...match, source: 'text', confidence: 0.5 };
         }
      }
    }

    if (params.province) {
        result.province = params.province;
    }

    return result;
  }

  private static parseFromCourtName(name: string): { province: string | null, city: string | null, district: string | null } {
    let province = null;
    let city = null;
    let district = null;

    // e.g., 广东省广州市中级人民法院, 江门市新会区人民法院, 浙江省余姚市人民法院
    const provMatch = name.match(/^([\u4e00-\u9fa5]{2,4}?(?:省|自治区|特别行政区))/);
    if (provMatch) {
      province = provMatch[1];
    }
    
    // Direct matches for four direct-controlled municipalities
    const directMunicipalities = ['北京市', '上海市', '天津市', '重庆市'];
    for (const dm of directMunicipalities) {
      if (name.includes(dm)) {
         province = dm;
         city = dm.replace('市', '');
      } else if (name.startsWith(dm.replace('市', ''))) { // e.g. "北京第一中级"
         province = dm;
         city = dm.replace('市', '');
      }
    }

    if (province && !city) {
      const withoutProv = name.replace(province, '');
      const cityMatch = withoutProv.match(/^([\u4e00-\u9fa5]{2,6}?市)/);
      if (cityMatch) {
        city = cityMatch[1].replace('市', '');
      } else {
        // e.g., 广东省东莞市
        const fallbackCityMatch = name.match(/([\u4e00-\u9fa5]{2,6}市)/);
        if (fallbackCityMatch) {
            city = fallbackCityMatch[1].replace('市', '');
        }
      }
    } else if (!province && !city) {
       const cityMatch = name.match(/^([\u4e00-\u9fa5]{2,6}?市)/);
       if (cityMatch) {
           city = cityMatch[1].replace('市', '');
       }
    }

    // Extract district if present (e.g. 广州市天河区人民法院)
    const districtMatch = name.match(/市([\u4e00-\u9fa5]{2,6}?[区县市])/);
    if (districtMatch) {
      district = districtMatch[1];
      // Note: Some county-level cities might be caught here, like "余姚市" in "浙江省余姚市人民法院" -> actually provMatch='浙江省', withoutProv='余姚市人民法院'
    }

    // Handle county-level cities directly appended to province (e.g., 浙江省余姚市)
    if (!city && name.includes('省') && name.includes('市')) {
       const countyCityMatch = name.match(/省([\u4e00-\u9fa5]{2,6}?市)/);
       if (countyCityMatch) {
           city = countyCityMatch[1].replace('市', '');
       }
    }

    // Clean up city
    if (city) {
        city = city.replace(/中级|基层|高级/, '');
    }

    return { province, city, district };
  }

  private static parseFromCaseNumber(caseNumber: string): { province: string | null, city: string | null, district: string | null } {
    const match = caseNumber.match(/[（(〔\[]\s*\d{4}\s*[)）〕\]]\s*([\u4e00-\u9fa5]{1,4})\s*\d+\s*[初终再申异执字第]/);
    if (match) {
        const courtCode = match[1];
        // Can map court code like "粤01" to Guangzhou, but it's complex without a mapping table.
        // For now, if we match things like "粤03" (Shenzhen), "粤19" (Dongguan).
        const mapping: Record<string, string> = {
            '粤01': '广州', '粤02': '韶关', '粤03': '深圳', '粤04': '珠海', '粤05': '汕头',
            '粤06': '佛山', '粤07': '江门', '粤08': '湛江', '粤09': '茂名', '粤12': '肇庆',
            '粤13': '惠州', '粤14': '梅州', '粤15': '汕尾', '粤16': '河源', '粤17': '阳江',
            '粤18': '清远', '粤19': '东莞', '粤20': '中山', '粤71': '广州', // 广铁
            '京': '北京', '沪': '上海', '津': '天津', '渝': '重庆',
            '浙01': '杭州', '浙02': '宁波',
            '苏01': '南京', '苏05': '苏州',
        };
        for (const [code, c] of Object.entries(mapping)) {
            if (courtCode.startsWith(code)) {
                return { province: null, city: c, district: null };
            }
        }
    }
    return { province: null, city: null, district: null };
  }
}
